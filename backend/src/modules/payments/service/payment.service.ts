import Razorpay from 'razorpay';
import { Types } from 'mongoose';
import crypto from 'node:crypto';
import { PaymentRepository } from '../repository/payment.repository.js';
import { EventRepository } from '../../events/repository/event.repository.js';
import { QuotationRepository } from '../../quotations/repository/quotation.repository.js';
import { ApiError } from '../../../utils/ApiError.js';
import { env } from '../../../config/env.js';
import { round2 } from '../../../utils/money.js';
import { emailService } from '../../email/service/email.service.js';
import { User } from '../../auth/model/user.model.js';
import { Payment } from '../model/payment.model.js';

export class PaymentService {
  private paymentRepository: PaymentRepository;
  private eventRepository: EventRepository;
  private quotationRepository: QuotationRepository;
  private razorpay: Razorpay;

  constructor() {
    this.paymentRepository = new PaymentRepository();
    this.eventRepository = new EventRepository();
    this.quotationRepository = new QuotationRepository();

    // Only initialize if we have keys (allows mocking or avoiding crashes if not configured)
    if (env.razorpayKeyId && env.razorpayKeySecret) {
      this.razorpay = new Razorpay({
        key_id: env.razorpayKeyId,
        key_secret: env.razorpayKeySecret,
      });
    } else {
      this.razorpay = {} as Razorpay;
    }
  }

  /**
   * Validates that the sum of scheduled installments in the quotation's paymentPlan
   * exactly reconciles with the quotation's finalAmount.
   */
  validatePaymentScheduleConsistency(quotation: any): void {
    const plan = quotation.paymentPlan || [];
    if (plan.length === 0) return;
    const scheduledTotal = round2(plan.reduce((sum: number, inst: any) => sum + (inst.amount || 0), 0));
    const finalAmount = round2(quotation.finalAmount);
    if (Math.abs(scheduledTotal - finalAmount) > 0.01) {
      throw ApiError.badRequest(
        `Payment schedule is inconsistent: sum of scheduled installments (₹${scheduledTotal.toLocaleString('en-IN')}) does not match quotation final amount (₹${finalAmount.toLocaleString('en-IN')}). Please correct the payment schedule before proceeding.`
      );
    }
  }

  /**
   * Authoritatively computes verified paid amount for an installment,
   * taking into account multi-installment allocation records as well as legacy single-installment payments.
   */
  getVerifiedPaidForInstallment(verifiedPayments: any[], installmentIndex: number): number {
    let total = 0;
    for (const p of verifiedPayments) {
      total += this.getPaymentAllocationForInstallment(p, installmentIndex);
    }
    return round2(total);
  }

  /**
   * Retrieves the amount allocated to a specific installment by a single payment record.
   */
  getPaymentAllocationForInstallment(p: any, installmentIndex: number): number {
    if (p.allocations && p.allocations.length > 0) {
      const match = p.allocations.find((a: any) => a.installmentIndex === installmentIndex);
      return match ? round2(match.allocatedAmount) : 0;
    }
    // Legacy fallback
    if (installmentIndex === 0 && (p.paymentType === 'advance' || p.installmentIndex === 0 || p.installmentIndex === undefined)) {
      return round2(p.amount);
    } else if (p.installmentIndex === installmentIndex) {
      return round2(p.amount);
    }
    return 0;
  }

  /**
   * Computes how a payment amount will be allocated across the quotation's payment plan in configured order.
   */
  computeAllocation(quotation: any, verifiedPayments: any[], targetAmount: number, startingIndex: number = 0): {
    allocations: Array<{ installmentIndex: number; installmentId?: string; installmentTitle: string; allocatedAmount: number }>;
    resultingBalances: Array<{ installmentIndex: number; title: string; scheduledAmount: number; previousPaid: number; allocatedAmount: number; resultingPaid: number; resultingOutstanding: number; resultingStatus: string }>;
  } {
    let remaining = round2(targetAmount);
    const allocations: Array<{ installmentIndex: number; installmentId?: string; installmentTitle: string; allocatedAmount: number }> = [];
    const resultingBalances: any[] = [];

    const plan = quotation.paymentPlan || [];
    for (let i = 0; i < plan.length; i++) {
      const inst = plan[i];
      const prevPaid = this.getVerifiedPaidForInstallment(verifiedPayments, i);
      const scheduled = round2(inst.amount);
      const currentOutstanding = Math.max(0, round2(scheduled - prevPaid));

      let allocatedForThis = 0;
      if (currentOutstanding > 0 && remaining > 0 && i >= startingIndex) {
        allocatedForThis = Math.min(remaining, currentOutstanding);
        allocatedForThis = round2(allocatedForThis);
        remaining = round2(remaining - allocatedForThis);
        allocations.push({
          installmentIndex: i,
          installmentId: inst.installmentId || inst._id?.toString() || `inst_${i}`,
          installmentTitle: inst.title,
          allocatedAmount: allocatedForThis,
        });
      }

      const resPaid = round2(prevPaid + allocatedForThis);
      const resOutstanding = Math.max(0, round2(scheduled - resPaid));
      const resStatus = resOutstanding <= 0 ? 'Paid' : resPaid > 0 ? 'Partially Paid' : 'Pending';

      resultingBalances.push({
        installmentIndex: i,
        title: inst.title,
        scheduledAmount: scheduled,
        previousPaid: prevPaid,
        allocatedAmount: allocatedForThis,
        resultingPaid: resPaid,
        resultingOutstanding: resOutstanding,
        resultingStatus: resStatus,
      });
    }

    return { allocations, resultingBalances };
  }

  async createAdvanceOrder(
    user: { id: string; role: string },
    eventId: string,
    customAmount?: number,
    options?: { isFullPayment?: boolean; paymentOption?: string; allowExcess?: boolean }
  ) {
    if (user.role !== 'client') {
      throw ApiError.forbidden('Only clients can create payment orders.');
    }

    const event = await this.eventRepository.findById(eventId);
    if (!event) {
      throw ApiError.notFound('Event not found.');
    }

    // Verify ownership
    if (event.clientId.toString() !== user.id) {
      throw ApiError.forbidden('You do not have permission to pay for this event.');
    }

    if (event.status !== 'awaiting_payment') {
      throw ApiError.badRequest('Event is not in awaiting_payment state.');
    }

    // Find the accepted quotation
    const quotations = await this.quotationRepository.findByEventId(eventId);
    const acceptedQuotation = quotations.find((q) => q.status === 'accepted');

    if (!acceptedQuotation) {
      throw ApiError.badRequest('No accepted quotation found for this event.');
    }

    if (!acceptedQuotation.advanceAmount || acceptedQuotation.advanceAmount <= 0) {
      throw ApiError.badRequest('Invalid advance amount in quotation.');
    }

    if (acceptedQuotation.advanceAmount > acceptedQuotation.finalAmount) {
      throw ApiError.badRequest('Advance amount cannot exceed final amount.');
    }

    // Check advance payment link expiry
    const advanceInst = acceptedQuotation.paymentPlan?.[0];
    if (advanceInst?.expiryDate && new Date() > new Date(advanceInst.expiryDate)) {
      const expiryStr = new Date(advanceInst.expiryDate).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
      throw ApiError.badRequest(`This payment link expired on ${expiryStr}. Please contact the Admin for further assistance.`);
    }

    // Calculate verified advance paid and total quotation balances authoritatively
    const allVerified = await this.paymentRepository.findAllVerifiedPayments(eventId, acceptedQuotation.id);
    const advancePaidAmount = this.getVerifiedPaidForInstallment(allVerified, 0);
    const requiredAdvance = round2(acceptedQuotation.advanceAmount);
    const outstandingAdvance = Math.max(0, round2(requiredAdvance - advancePaidAmount));

    const totalVerifiedPaid = round2(allVerified.reduce((acc: number, p: any) => acc + p.amount, 0));
    const finalAmount = round2(acceptedQuotation.finalAmount);
    const totalOutstanding = Math.max(0, round2(finalAmount - totalVerifiedPaid));

    if (totalOutstanding <= 0) {
      throw ApiError.badRequest('Quotation is already fully paid.');
    }

    // Determine target amount
    let targetAmount: number;
    if (options?.isFullPayment || options?.paymentOption === 'full_balance') {
      this.validatePaymentScheduleConsistency(acceptedQuotation);
      targetAmount = totalOutstanding;
    } else if (options?.paymentOption === 'current_installment') {
      if (outstandingAdvance <= 0) {
        throw ApiError.badRequest('Required advance payment is already fully paid.');
      }
      // Option A: Pay Advance / Current Installment
      // When customer previously paid part of advance (e.g. ₹1,00,000 of ₹2,00,000),
      // Option A automatically deducts already paid amount to charge the remaining advance balance (₹1,00,000).
      if (customAmount !== undefined && customAmount !== null) {
        const requested = round2(customAmount);
        if (requested <= 0) {
          throw ApiError.badRequest('Payment amount must be greater than zero.');
        }
        if (requested === requiredAdvance && advancePaidAmount > 0) {
          // Client or caller supplied the original scheduled amount without deduction -> deduct in backend
          targetAmount = outstandingAdvance;
        } else if (requested <= outstandingAdvance) {
          targetAmount = requested;
        } else {
          throw ApiError.badRequest(
            `Payment amount (₹${requested.toLocaleString('en-IN')}) cannot exceed the outstanding advance balance of ₹${outstandingAdvance.toLocaleString('en-IN')}. (Required: ₹${requiredAdvance.toLocaleString('en-IN')}, Previously Paid: ₹${advancePaidAmount.toLocaleString('en-IN')}).`
          );
        }
      } else {
        targetAmount = outstandingAdvance;
      }
    } else if (customAmount !== undefined && customAmount !== null) {
      const requested = round2(customAmount);
      if (requested <= 0) {
        throw ApiError.badRequest('Payment amount must be greater than zero.');
      }
      if (requested > totalOutstanding) {
        throw ApiError.badRequest(`Payment amount cannot exceed the total outstanding balance of ₹${totalOutstanding.toLocaleString('en-IN')}.`);
      }
      if (requested > outstandingAdvance) {
        const isExcessAllowed = Boolean(
          options?.allowExcess === true ||
          options?.paymentOption === 'custom' ||
          options?.paymentOption === 'full_balance' ||
          options?.isFullPayment
        );
        if (!isExcessAllowed) {
          throw ApiError.badRequest(`Payment amount (${requested}) cannot exceed outstanding advance amount (${outstandingAdvance}).`);
        }
        // Excess payment allocating across subsequent installments
        this.validatePaymentScheduleConsistency(acceptedQuotation);
      }
      targetAmount = requested;
    } else {
      if (outstandingAdvance <= 0) {
        throw ApiError.badRequest('Required advance payment is already fully paid.');
      }
      targetAmount = outstandingAdvance;
    }

    // Compute planned allocations across paymentPlan
    const { allocations } = this.computeAllocation(acceptedQuotation, allVerified, targetAmount, 0);

    // Idempotency: Check if we already have a pending advance payment for this event + quotation with exact same amount
    let payment = await this.paymentRepository.findPendingAdvancePayment(eventId, acceptedQuotation.id, targetAmount);

    if (payment && payment.razorpayOrderId) {
      return {
        paymentId: payment.id,
        razorpayOrderId: payment.razorpayOrderId,
        amount: payment.amount,
        currency: payment.currency,
        keyId: env.razorpayKeyId,
        requiredAdvance,
        advancePaidAmount,
        outstandingAdvance,
        totalOutstanding,
        allocations: payment.allocations,
        isFullPayment: payment.isFullPayment,
      };
    }

    // If there are other pending orders with different amounts, cancel them to avoid conflicts
    await this.paymentRepository.cancelPendingAdvancePayments(eventId, acceptedQuotation.id);

    // Generate unique receipt reference
    const receiptReference = `rcpt_${event.id}_${crypto.randomBytes(4).toString('hex')}`;
    const amountInPaise = Math.round(targetAmount * 100);

    // Create local payment record first (in created state)
    payment = await this.paymentRepository.create({
      eventId: new Types.ObjectId(event.id),
      quotationId: new Types.ObjectId(acceptedQuotation.id),
      clientId: new Types.ObjectId(user.id),
      paymentType: 'advance',
      installmentIndex: 0,
      installmentTitle: advanceInst?.title || 'Booking Advance',
      allocations,
      isFullPayment: Boolean(options?.isFullPayment || options?.paymentOption === 'full_balance' || targetAmount === totalOutstanding),
      amount: targetAmount,
      currency: 'INR',
      status: 'created',
      receiptReference,
    } as any);

    try {
      let orderId = `order_${crypto.randomBytes(8).toString('hex')}`;

      const isTestOrDev = env.nodeEnv === 'test' || env.nodeEnv === 'development';
      const isDummyKey = env.razorpayKeyId === 'rzp_test_dummy_key_id';
      const shouldBypass = isTestOrDev && isDummyKey;

      if (!shouldBypass) {
        const order = await this.razorpay.orders.create({
          amount: amountInPaise,
          currency: 'INR',
          receipt: receiptReference,
        });
        orderId = order.id;
      }

      payment.razorpayOrderId = orderId;
      payment.status = 'pending';
      await payment.save();

      return {
        paymentId: payment.id,
        razorpayOrderId: orderId,
        amount: payment.amount,
        currency: payment.currency,
        keyId: env.razorpayKeyId,
        requiredAdvance,
        advancePaidAmount,
        outstandingAdvance,
        totalOutstanding,
        allocations: payment.allocations,
        isFullPayment: payment.isFullPayment,
      };
    } catch (error: any) {
      payment.status = 'failed';
      await payment.save();
      throw ApiError.internal('Failed to create Razorpay order.');
    }
  }

  async createInstallmentOrder(
    user: { id: string; role: string },
    eventId: string,
    installmentIndex: number,
    customAmount?: number,
    options?: { isFullPayment?: boolean; paymentOption?: string; allowExcess?: boolean }
  ) {
    if (user.role !== 'client') {
      throw ApiError.forbidden('Only clients can create payment orders.');
    }

    const event = await this.eventRepository.findById(eventId);
    if (!event) {
      throw ApiError.notFound('Event not found.');
    }

    // Verify ownership
    if (event.clientId.toString() !== user.id) {
      throw ApiError.forbidden('You do not have permission to pay for this event.');
    }

    // Find the accepted quotation
    const quotations = await this.quotationRepository.findByEventId(eventId);
    const acceptedQuotation = quotations.find((q) => q.status === 'accepted');

    if (!acceptedQuotation) {
      throw ApiError.badRequest('No accepted quotation found for this event.');
    }

    if (!acceptedQuotation.paymentPlan || acceptedQuotation.paymentPlan.length === 0) {
      throw ApiError.badRequest('Quotation does not contain a payment plan.');
    }

    if (installmentIndex < 0 || installmentIndex >= acceptedQuotation.paymentPlan.length) {
      throw ApiError.badRequest(`Invalid installment index (${installmentIndex}).`);
    }

    // If installmentIndex is 0 (or labeled Advance), delegate to createAdvanceOrder
    if (installmentIndex === 0) {
      return this.createAdvanceOrder(user, eventId, customAmount, options);
    }

    // Subsequent installment prerequisite: full advance must be verified and settled first
    const allVerified = await this.paymentRepository.findAllVerifiedPayments(eventId, acceptedQuotation.id);
    const advancePaidAmount = this.getVerifiedPaidForInstallment(allVerified, 0);
    const requiredAdvance = round2(acceptedQuotation.advanceAmount);
    const outstandingAdvance = Math.max(0, round2(requiredAdvance - advancePaidAmount));

    if (outstandingAdvance > 0) {
      throw ApiError.badRequest('Initial advance payment must be fully paid and event confirmed before paying subsequent installments.');
    }

    if (event.status !== 'confirmed' && event.status !== 'in_progress') {
      throw ApiError.badRequest('Initial advance payment must be fully paid and event confirmed before paying subsequent installments.');
    }

    const totalVerifiedPaid = round2(allVerified.reduce((acc: number, p: any) => acc + p.amount, 0));
    const finalAmount = round2(acceptedQuotation.finalAmount);
    const totalOutstanding = Math.max(0, round2(finalAmount - totalVerifiedPaid));

    if (totalOutstanding <= 0) {
      throw ApiError.badRequest('Quotation is already fully paid.');
    }

    const targetInstallment = acceptedQuotation.paymentPlan[installmentIndex];
    const scheduledAmount = round2(targetInstallment.amount);

    if (scheduledAmount <= 0) {
      throw ApiError.badRequest('Scheduled installment amount must be greater than zero.');
    }

    // Calculate verified payments for this installment
    const verifiedPaidAmount = this.getVerifiedPaidForInstallment(allVerified, installmentIndex);
    const outstandingAmount = Math.max(0, round2(scheduledAmount - verifiedPaidAmount));

    // Check payment link expiry
    if (targetInstallment.expiryDate && new Date() > new Date(targetInstallment.expiryDate)) {
      const expiryStr = new Date(targetInstallment.expiryDate).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
      throw ApiError.badRequest(`This payment link expired on ${expiryStr}. Please contact the Admin for further assistance.`);
    }

    // Determine target payable amount
    let targetAmount: number;
    if (options?.isFullPayment || options?.paymentOption === 'full_balance') {
      this.validatePaymentScheduleConsistency(acceptedQuotation);
      targetAmount = totalOutstanding;
    } else if (options?.paymentOption === 'current_installment') {
      if (outstandingAmount <= 0) {
        throw ApiError.badRequest('This installment is already fully paid.');
      }
      // Option A for subsequent installment:
      // If customer previously paid part of this installment,
      // Option A automatically deducts already paid amount to charge the remaining installment balance.
      if (customAmount !== undefined && customAmount !== null) {
        const requested = round2(customAmount);
        if (requested <= 0) {
          throw ApiError.badRequest('Payment amount must be greater than zero.');
        }
        if (requested === scheduledAmount && verifiedPaidAmount > 0) {
          // Client or caller supplied the original scheduled amount without deduction -> deduct in backend
          targetAmount = outstandingAmount;
        } else if (requested <= outstandingAmount) {
          targetAmount = requested;
        } else {
          throw ApiError.badRequest(
            `Payment amount (₹${requested.toLocaleString('en-IN')}) cannot exceed the outstanding installment balance of ₹${outstandingAmount.toLocaleString('en-IN')}. (Scheduled: ₹${scheduledAmount.toLocaleString('en-IN')}, Previously Paid: ₹${verifiedPaidAmount.toLocaleString('en-IN')}).`
          );
        }
      } else {
        targetAmount = outstandingAmount;
      }
    } else if (customAmount !== undefined && customAmount !== null) {
      const requested = round2(customAmount);
      if (requested <= 0) {
        throw ApiError.badRequest('Payment amount must be greater than zero.');
      }
      if (requested > totalOutstanding) {
        throw ApiError.badRequest(`Payment amount cannot exceed the total outstanding balance of ₹${totalOutstanding.toLocaleString('en-IN')}.`);
      }
      const isExcessAllowed = Boolean(
        options?.allowExcess === true ||
        options?.paymentOption === 'custom' ||
        options?.paymentOption === 'full_balance' ||
        options?.isFullPayment
      );
      if (requested > outstandingAmount) {
        if (!isExcessAllowed) {
          throw ApiError.badRequest(`Payment amount (${requested}) cannot exceed outstanding installment balance (${outstandingAmount}).`);
        }
        // Excess payment allocating across subsequent installments
        this.validatePaymentScheduleConsistency(acceptedQuotation);
      }
      targetAmount = requested;
    } else {
      if (outstandingAmount <= 0) {
        throw ApiError.badRequest('This installment is already fully paid.');
      }
      targetAmount = outstandingAmount;
    }

    // Compute planned allocations across paymentPlan
    const { allocations } = this.computeAllocation(acceptedQuotation, allVerified, targetAmount, installmentIndex);

    // Idempotency: check if pending installment payment with exact same amount exists
    let payment = await this.paymentRepository.findPendingInstallmentPayment(eventId, acceptedQuotation.id, installmentIndex, targetAmount);

    if (payment && payment.razorpayOrderId) {
      return {
        paymentId: payment.id,
        razorpayOrderId: payment.razorpayOrderId,
        amount: payment.amount,
        currency: payment.currency,
        keyId: env.razorpayKeyId,
        installmentIndex,
        installmentTitle: targetInstallment.title,
        scheduledAmount,
        verifiedPaidAmount,
        outstandingAmount,
        totalOutstanding,
        allocations: payment.allocations,
        isFullPayment: payment.isFullPayment,
      };
    }

    // Cancel other pending installment orders for this specific installment
    await this.paymentRepository.cancelPendingInstallmentPayments(eventId, acceptedQuotation.id, installmentIndex);

    // Generate unique receipt reference
    const receiptReference = `rcpt_inst_${event.id}_${installmentIndex}_${crypto.randomBytes(4).toString('hex')}`;
    const amountInPaise = Math.round(targetAmount * 100);

    // Create local payment record in 'created' status
    payment = await this.paymentRepository.create({
      eventId: new Types.ObjectId(event.id),
      quotationId: new Types.ObjectId(acceptedQuotation.id),
      clientId: new Types.ObjectId(user.id),
      paymentType: 'installment',
      installmentIndex,
      installmentTitle: targetInstallment.title,
      allocations,
      isFullPayment: Boolean(options?.isFullPayment || options?.paymentOption === 'full_balance' || targetAmount === totalOutstanding),
      amount: targetAmount,
      currency: 'INR',
      status: 'created',
      receiptReference,
    } as any);

    try {
      let orderId = `order_${crypto.randomBytes(8).toString('hex')}`;

      const isTestOrDev = env.nodeEnv === 'test' || env.nodeEnv === 'development';
      const isDummyKey = env.razorpayKeyId === 'rzp_test_dummy_key_id';
      const shouldBypass = isTestOrDev && isDummyKey;

      if (!shouldBypass) {
        const order = await this.razorpay.orders.create({
          amount: amountInPaise,
          currency: 'INR',
          receipt: receiptReference,
        });
        orderId = order.id;
      }

      payment.razorpayOrderId = orderId;
      payment.status = 'pending';
      await payment.save();

      return {
        paymentId: payment.id,
        razorpayOrderId: orderId,
        amount: payment.amount,
        currency: payment.currency,
        keyId: env.razorpayKeyId,
        installmentIndex,
        installmentTitle: targetInstallment.title,
        scheduledAmount,
        verifiedPaidAmount,
        outstandingAmount,
        totalOutstanding,
        allocations: payment.allocations,
        isFullPayment: payment.isFullPayment,
      };
    } catch (error: any) {
      payment.status = 'failed';
      await payment.save();
      throw ApiError.internal('Failed to create Razorpay order.');
    }
  }

  async verifyPayment(user: { id: string; role: string }, payload: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) {
    if (user.role !== 'client') {
      throw ApiError.forbidden('Only clients can verify payments.');
    }

    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = payload;

    // Lookup the local payment record by Razorpay order ID
    const payment = await this.paymentRepository.findByRazorpayOrderId(razorpay_order_id);
    if (!payment) {
      throw ApiError.notFound('Payment order not found.');
    }

    // Verify the calling client owns this payment record
    if (payment.clientId.toString() !== user.id) {
      throw ApiError.forbidden('You do not have permission to verify this payment.');
    }

    // Lookup quotations to resolve current accepted revision
    const quotations = await this.quotationRepository.findByEventId(payment.eventId.toString());
    const acceptedQuotation = quotations.find((q) => q.status === 'accepted');

    // Idempotency: if already paid, return success without re-processing
    if (payment.status === 'paid') {
      const event = await this.eventRepository.findById(payment.eventId.toString());
      const allVerifiedPayments = await this.paymentRepository.findAllVerifiedPayments(
        payment.eventId.toString(),
        payment.quotationId.toString()
      );

      const totalVerifiedPaid = round2(allVerifiedPayments.reduce((acc: number, p: any) => acc + p.amount, 0));
      const finalAmount = acceptedQuotation ? round2(acceptedQuotation.finalAmount) : payment.amount;
      const totalOutstanding = Math.max(0, round2(finalAmount - totalVerifiedPaid));
      const isQuotationFullyPaid = totalOutstanding <= 0;

      const advancePaid = this.getVerifiedPaidForInstallment(allVerifiedPayments, 0);
      const reqAdv = acceptedQuotation ? round2(acceptedQuotation.advanceAmount) : payment.amount;
      const outAdv = Math.max(0, round2(reqAdv - advancePaid));
      const isAdvanceFullyPaid = outAdv <= 0;

      const instIndex = payment.installmentIndex !== undefined ? payment.installmentIndex : 0;
      const paidForTargetInst = this.getVerifiedPaidForInstallment(allVerifiedPayments, instIndex);
      const targetInst = acceptedQuotation?.paymentPlan?.[instIndex];
      const scheduledForTargetInst = targetInst ? round2(targetInst.amount) : payment.amount;
      const outTargetInst = Math.max(0, round2(scheduledForTargetInst - paidForTargetInst));

      return {
        paymentId: payment.id,
        status: payment.status,
        amountPaid: payment.amount,
        paymentType: payment.paymentType,
        installmentIndex: payment.installmentIndex,
        installmentStatus: targetInst?.status || (outTargetInst <= 0 ? 'Paid' : 'Partially Paid'),
        totalPaidForInstallment: paidForTargetInst,
        scheduledAmount: scheduledForTargetInst,
        outstandingAmount: outTargetInst,
        isFullyPaid: payment.paymentType === 'installment' ? outTargetInst <= 0 : isAdvanceFullyPaid,
        totalAdvancePaid: advancePaid,
        requiredAdvance: reqAdv,
        outstandingAdvance: outAdv,
        allocations: payment.allocations,
        isFullPayment: payment.isFullPayment,
        totalQuotationAmount: finalAmount,
        totalPaidAmount: totalVerifiedPaid,
        totalOutstandingAmount: totalOutstanding,
        isQuotationFullyPaid,
        quotationNumber: acceptedQuotation?.quotationNumber,
        quotationRevision: acceptedQuotation?.revision,
        eventStatus: event?.status || 'confirmed',
        quotationStatus: acceptedQuotation?.status || 'accepted',
      };
    }

    // Cross-check: verify payment.quotationId matches the current accepted quotation
    if (!acceptedQuotation) {
      payment.status = 'failed';
      await payment.save();
      throw ApiError.badRequest('No accepted quotation found for this event.');
    }
    if (acceptedQuotation.id.toString() !== payment.quotationId.toString()) {
      payment.status = 'failed';
      await payment.save();
      throw ApiError.badRequest('Payment quotation mismatch: payment references a superseded quotation revision.');
    }

    // Verify Razorpay signature via HMAC-SHA256
    const expectedSignature = crypto
      .createHmac('sha256', env.razorpayKeySecret)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    if (expectedSignature !== razorpay_signature) {
      payment.status = 'failed';
      await payment.save();
      throw ApiError.badRequest('Invalid payment signature.');
    }

    // In production, fetch gateway payment details to cross-check amount and currency
    const isTestOrDev = env.nodeEnv === 'test' || env.nodeEnv === 'development';
    const isDummyKey = env.razorpayKeyId === 'rzp_test_dummy_key_id';
    const shouldBypass = isTestOrDev && isDummyKey;

    if (!shouldBypass) {
      try {
        const gatewayPayment = await (this.razorpay.payments as any).fetch(razorpay_payment_id);
        const expectedAmountPaise = Math.round(payment.amount * 100);
        if (gatewayPayment.amount !== expectedAmountPaise) {
          payment.status = 'failed';
          await payment.save();
          throw ApiError.badRequest('Payment amount mismatch: gateway amount does not match authoritative order amount.');
        }
        if (gatewayPayment.currency !== payment.currency) {
          payment.status = 'failed';
          await payment.save();
          throw ApiError.badRequest('Payment currency mismatch.');
        }
      } catch (err: any) {
        if (err.statusCode) throw err;
        payment.status = 'failed';
        await payment.save();
        throw ApiError.internal('Failed to fetch payment details from Razorpay.');
      }
    }

    // Persist payment verification
    payment.razorpayPaymentId = razorpay_payment_id;
    payment.status = 'paid';
    await payment.save();

    const event = (await this.eventRepository.findById(payment.eventId.toString())) as any;
    if (!event) {
      throw ApiError.notFound('Event not found.');
    }

    // Refresh all verified payments including this newly verified one
    const allVerifiedPayments = await this.paymentRepository.findAllVerifiedPayments(
      payment.eventId.toString(),
      acceptedQuotation.id
    );

    // Update installments in paymentPlan
    if (acceptedQuotation.paymentPlan && acceptedQuotation.paymentPlan.length > 0) {
      if (payment.allocations && payment.allocations.length > 0) {
        for (const alloc of payment.allocations) {
          const inst = acceptedQuotation.paymentPlan[alloc.installmentIndex];
          if (inst) {
            const paidForInst = this.getVerifiedPaidForInstallment(allVerifiedPayments, alloc.installmentIndex);
            const scheduled = round2(inst.amount);
            const outInst = Math.max(0, round2(scheduled - paidForInst));
            inst.status = outInst <= 0 ? 'Paid' : paidForInst > 0 ? 'Partially Paid' : 'Pending';

            if (outInst <= 0) {
              const activeLink = await this.paymentRepository.findActiveLinkForInstallment(
                payment.eventId.toString(),
                acceptedQuotation.id,
                alloc.installmentIndex
              );
              if (activeLink) {
                activeLink.linkStatus = 'paid';
                await activeLink.save();
              }
            }
          }
        }
      } else {
        // Fallback for payments without explicit allocations array
        if (payment.paymentType === 'installment' && payment.installmentIndex !== undefined) {
          const inst = acceptedQuotation.paymentPlan[payment.installmentIndex];
          if (inst) {
            const paidForInst = this.getVerifiedPaidForInstallment(allVerifiedPayments, payment.installmentIndex);
            const scheduled = round2(inst.amount);
            const outInst = Math.max(0, round2(scheduled - paidForInst));
            inst.status = outInst <= 0 ? 'Paid' : paidForInst > 0 ? 'Partially Paid' : 'Pending';

            if (outInst <= 0) {
              const activeLink = await this.paymentRepository.findActiveLinkForInstallment(
                payment.eventId.toString(),
                acceptedQuotation.id,
                payment.installmentIndex
              );
              if (activeLink) {
                activeLink.linkStatus = 'paid';
                await activeLink.save();
              }
            }
          }
        } else {
          // Advance payment
          const advanceIdx = acceptedQuotation.paymentPlan.findIndex((p) => p.title.toLowerCase().includes('advance'));
          const targetIdx = advanceIdx >= 0 ? advanceIdx : 0;
          const paidForInst = this.getVerifiedPaidForInstallment(allVerifiedPayments, targetIdx);
          const scheduled = round2(acceptedQuotation.paymentPlan[targetIdx].amount);
          const outInst = Math.max(0, round2(scheduled - paidForInst));
          acceptedQuotation.paymentPlan[targetIdx].status = outInst <= 0 ? 'Paid' : paidForInst > 0 ? 'Partially Paid' : 'Pending';
        }
      }
      await acceptedQuotation.save();
    }

    // Check Event Confirmation Rule:
    // Event transitions to 'confirmed' if and only if the full required advance has been received and verified
    const advancePaid = this.getVerifiedPaidForInstallment(allVerifiedPayments, 0);
    const reqAdv = round2(acceptedQuotation.advanceAmount);
    const isAdvanceFullyPaid = advancePaid >= reqAdv;

    if (isAdvanceFullyPaid && event.status === 'awaiting_payment') {
      event.status = 'confirmed';
      await event.save();
    }

    // Overall quotation balances
    const totalVerifiedPaid = round2(allVerifiedPayments.reduce((acc, p) => acc + p.amount, 0));
    const finalAmount = round2(acceptedQuotation.finalAmount);
    const totalOutstanding = Math.max(0, round2(finalAmount - totalVerifiedPaid));
    const isQuotationFullyPaid = totalOutstanding <= 0;

    const instIndex = payment.installmentIndex !== undefined ? payment.installmentIndex : 0;
    const paidForTargetInst = this.getVerifiedPaidForInstallment(allVerifiedPayments, instIndex);
    const targetInst = acceptedQuotation.paymentPlan?.[instIndex];
    const scheduledForTargetInst = targetInst ? round2(targetInst.amount) : payment.amount;
    const outTargetInst = Math.max(0, round2(scheduledForTargetInst - paidForTargetInst));

    return {
      paymentId: payment.id,
      status: payment.status,
      amountPaid: payment.amount,
      paymentType: payment.paymentType,
      installmentIndex: payment.installmentIndex,
      installmentStatus: targetInst?.status || (outTargetInst <= 0 ? 'Paid' : 'Partially Paid'),
      totalPaidForInstallment: paidForTargetInst,
      scheduledAmount: scheduledForTargetInst,
      outstandingAmount: outTargetInst,
      isFullyPaid: payment.paymentType === 'installment' ? outTargetInst <= 0 : isAdvanceFullyPaid,
      totalAdvancePaid: advancePaid,
      requiredAdvance: reqAdv,
      outstandingAdvance: Math.max(0, round2(reqAdv - advancePaid)),
      allocations: payment.allocations,
      isFullPayment: payment.isFullPayment,
      totalQuotationAmount: finalAmount,
      totalPaidAmount: totalVerifiedPaid,
      totalOutstandingAmount: totalOutstanding,
      isQuotationFullyPaid,
      quotationNumber: acceptedQuotation.quotationNumber,
      quotationRevision: acceptedQuotation.revision,
      eventStatus: event.status,
      quotationStatus: acceptedQuotation.status,
    };
  }

  async getPaymentScheduleSummary(user: { id: string; role: string }, eventId: string) {
    const event = await this.eventRepository.findById(eventId);
    if (!event) {
      throw ApiError.notFound('Event not found.');
    }

    if (user.role === 'client' && event.clientId.toString() !== user.id) {
      throw ApiError.forbidden('You do not have permission to view payment summary for this event.');
    }

    const quotations = await this.quotationRepository.findByEventId(eventId);
    const acceptedQuotation = quotations.find((q) => q.status === 'accepted');

    if (!acceptedQuotation) {
      return {
        eventId: event.id,
        eventTitle: event.title,
        eventStatus: event.status,
        hasAcceptedQuotation: false,
        totalQuotationAmount: 0,
        requiredAdvance: 0,
        advancePaidAmount: 0,
        outstandingAdvance: 0,
        isAdvanceFullyPaid: false,
        installments: [],
        payments: [],
      };
    }

    // All payments for event
    const allPayments = await this.paymentRepository.findByEventId(eventId);
    const verifiedPaymentsAll = allPayments.filter((p) => p.status === 'paid');

    // Advance calculations
    const advancePaidAmount = this.getVerifiedPaidForInstallment(verifiedPaymentsAll, 0);
    const requiredAdvance = round2(acceptedQuotation.advanceAmount);
    const outstandingAdvance = Math.max(0, round2(requiredAdvance - advancePaidAmount));
    const isAdvanceFullyPaid = outstandingAdvance <= 0;

    const rawPlan = acceptedQuotation.paymentPlan || [];
    const now = Date.now();

    const installments = await Promise.all(
      rawPlan.map(async (inst, idx) => {
        const isAdvance = idx === 0 || inst.title.toLowerCase().includes('advance');
        const scheduledAmount = isAdvance ? round2(acceptedQuotation.advanceAmount || inst.amount) : round2(inst.amount);
        const verifiedPaidAmount = this.getVerifiedPaidForInstallment(verifiedPaymentsAll, idx);
        const instPayments = verifiedPaymentsAll.filter((p) => this.getPaymentAllocationForInstallment(p, idx) > 0);

        const outstandingAmount = isAdvance ? outstandingAdvance : Math.max(0, round2(scheduledAmount - verifiedPaidAmount));
        const isFullyPaid = outstandingAmount <= 0;

        // Due date and Overdue handling
        const isOverdue = Boolean(inst.dueDate && new Date(inst.dueDate).getTime() < now && outstandingAmount > 0);

        // Payment link expiry handling
        const isExpired = Boolean(inst.expiryDate && new Date(inst.expiryDate).getTime() < now && outstandingAmount > 0);

        // Active link & Link history
        const activeLink = await this.paymentRepository.findActiveLinkForInstallment(eventId, acceptedQuotation.id, idx);
        const linkHistory = await this.paymentRepository.findLinkHistoryForInstallment(eventId, acceptedQuotation.id, idx);

        // Payment eligibility:
        // - Advance: event awaiting_payment & outstandingAdvance > 0 & not expired
        // - Subsequent: full advance settled & event confirmed & outstanding > 0 & not expired
        let isEligibleForPayment = false;
        if (isAdvance) {
          isEligibleForPayment = event.status === 'awaiting_payment' && !isFullyPaid && !isExpired;
        } else {
          const advancePrereqSatisfied = isAdvanceFullyPaid && (event.status === 'confirmed' || event.status === 'in_progress');
          isEligibleForPayment = Boolean(advancePrereqSatisfied && !isFullyPaid && !isExpired);
        }

        // Renewal eligibility for Admin:
        // Installment has expired, has outstanding balance, not fully paid
        const isEligibleForRenewal = Boolean(isExpired && outstandingAmount > 0 && !isFullyPaid);

        // Display status
        let displayStatus = inst.status || 'Pending';
        if (isFullyPaid) {
          displayStatus = 'Paid';
        } else if (isOverdue) {
          displayStatus = 'Overdue';
        } else if (isExpired) {
          displayStatus = 'Expired';
        } else if (verifiedPaidAmount > 0) {
          displayStatus = 'Partially Paid';
        } else {
          displayStatus = 'Pending';
        }

        return {
          installmentId: inst.installmentId || `inst_${idx}`,
          installmentIndex: idx,
          title: inst.title,
          isAdvance,
          scheduledAmount,
          percentage: inst.percentage,
          paidAmount: verifiedPaidAmount,
          verifiedPaidAmount,
          outstandingAmount,
          dueDate: inst.dueDate,
          dueDateDescription: inst.dueDateDescription,
          expiryDate: inst.expiryDate,
          status: displayStatus,
          baseStatus: isFullyPaid ? 'Paid' : verifiedPaidAmount > 0 ? 'Partially Paid' : 'Pending',
          isOverdue,
          isExpired,
          isEligibleForPayment,
          isEligibleForRenewal,
          activeLink: activeLink
            ? {
                linkId: activeLink.razorpayPaymentLinkId,
                shortUrl: activeLink.paymentLinkUrl,
                amount: activeLink.amount,
                status: activeLink.linkStatus,
                linkStatus: activeLink.linkStatus,
                expiresAt: activeLink.linkExpiresAt,
                createdAt: activeLink.createdAt,
              }
            : null,
          currentPaymentLink: activeLink
            ? {
                linkId: activeLink.razorpayPaymentLinkId,
                shortUrl: activeLink.paymentLinkUrl,
                amount: activeLink.amount,
                status: activeLink.linkStatus,
                linkStatus: activeLink.linkStatus,
                expiresAt: activeLink.linkExpiresAt,
                createdAt: activeLink.createdAt,
              }
            : null,
          linkHistory: linkHistory.map((lh) => ({
            id: lh.id,
            linkId: lh.razorpayPaymentLinkId,
            shortUrl: lh.paymentLinkUrl,
            amount: lh.amount,
            status: lh.linkStatus,
            linkStatus: lh.linkStatus,
            expiresAt: lh.linkExpiresAt,
            createdAt: lh.createdAt,
            renewedAt: lh.renewedAt,
            renewedBy: (lh.renewedBy as any)?.name || undefined,
          })),
          payments: instPayments.map((p) => ({
            id: p.id,
            amount: p.amount,
            currency: p.currency,
            status: p.status,
            razorpayPaymentId: p.razorpayPaymentId,
            receiptReference: p.receiptReference,
            allocations: p.allocations,
            isFullPayment: p.isFullPayment,
            createdAt: p.createdAt,
          })),
        };
      })
    );

    const finalAmount = round2(acceptedQuotation.finalAmount);
    const totalPaidAmount = round2(verifiedPaymentsAll.reduce((acc, p) => acc + p.amount, 0));
    const totalOutstandingAmount = Math.max(0, round2(finalAmount - totalPaidAmount));
    const isQuotationFullyPaid = totalOutstandingAmount <= 0;

    const scheduleSum = round2(rawPlan.reduce((acc, i) => acc + (i.amount || 0), 0));
    const isScheduleConsistent = Math.abs(scheduleSum - finalAmount) <= 0.01;
    let scheduleMismatchMessage: string | undefined;
    if (!isScheduleConsistent) {
      scheduleMismatchMessage = `Payment schedule total (₹${scheduleSum.toLocaleString('en-IN')}) does not reconcile with final quotation amount (₹${finalAmount.toLocaleString('en-IN')}).`;
    }

    return {
      eventId: event.id,
      eventTitle: event.title,
      eventStatus: event.status,
      hasAcceptedQuotation: true,
      quotationId: acceptedQuotation.id,
      quotationNumber: acceptedQuotation.quotationNumber,
      quotationRevision: acceptedQuotation.revision,
      quotationStatus: acceptedQuotation.status,
      finalAmount: acceptedQuotation.finalAmount,
      totalQuotationAmount: acceptedQuotation.finalAmount,
      totalPaidAmount,
      totalOutstandingAmount,
      requiredAdvance,
      advancePaidAmount,
      outstandingAdvance,
      isAdvanceFullyPaid,
      isAdvanceSettled: isAdvanceFullyPaid,
      isQuotationFullyPaid,
      canPayFullBalance: totalOutstandingAmount > 0 && isScheduleConsistent,
      isScheduleConsistent,
      scheduleMismatchMessage,
      installments,
      payments: verifiedPaymentsAll.map((p) => ({
        id: p.id,
        amount: p.amount,
        currency: p.currency,
        status: p.status,
        paymentType: p.paymentType,
        installmentIndex: p.installmentIndex,
        razorpayPaymentId: p.razorpayPaymentId,
        receiptReference: p.receiptReference,
        allocations: p.allocations,
        isFullPayment: p.isFullPayment,
        createdAt: p.createdAt,
      })),
    };
  }

  async previewAllocation(
    user: { id: string; role: string },
    eventId: string,
    amount?: number,
    options?: { isFullPayment?: boolean; paymentOption?: string; installmentIndex?: number }
  ) {
    if (user.role !== 'client') {
      throw ApiError.forbidden('Only clients can preview payment allocations.');
    }

    const event = await this.eventRepository.findById(eventId);
    if (!event) {
      throw ApiError.notFound('Event not found.');
    }

    if (event.clientId.toString() !== user.id) {
      throw ApiError.forbidden('You do not have permission to view payment details for this event.');
    }

    const quotations = await this.quotationRepository.findByEventId(eventId);
    const acceptedQuotation = quotations.find((q) => q.status === 'accepted');

    if (!acceptedQuotation) {
      throw ApiError.badRequest('No accepted quotation found for this event.');
    }

    const allVerified = await this.paymentRepository.findAllVerifiedPayments(eventId, acceptedQuotation.id);
    const totalVerifiedPaid = round2(allVerified.reduce((acc: number, p: any) => acc + p.amount, 0));
    const finalAmount = round2(acceptedQuotation.finalAmount);
    const totalOutstanding = Math.max(0, round2(finalAmount - totalVerifiedPaid));

    if (totalOutstanding <= 0) {
      throw ApiError.badRequest('Quotation is already fully paid.');
    }

    // Schedule consistency check
    this.validatePaymentScheduleConsistency(acceptedQuotation);

    const isFull = Boolean(options?.isFullPayment || options?.paymentOption === 'full_balance');
    let targetAmount: number;

    if (isFull) {
      targetAmount = totalOutstanding;
    } else if (options?.paymentOption === 'current_installment') {
      const startIdx = options?.installmentIndex !== undefined && options.installmentIndex >= 0 ? options.installmentIndex : 0;
      if (startIdx === 0) {
        const advPaid = this.getVerifiedPaidForInstallment(allVerified, 0);
        const reqAdv = round2(acceptedQuotation.advanceAmount);
        targetAmount = Math.max(0, round2(reqAdv - advPaid));
      } else {
        const scheduled = round2(acceptedQuotation.paymentPlan?.[startIdx]?.amount || 0);
        const paid = this.getVerifiedPaidForInstallment(allVerified, startIdx);
        targetAmount = Math.max(0, round2(scheduled - paid));
      }
      if (targetAmount <= 0) {
        targetAmount = totalOutstanding;
      }
    } else if (amount !== undefined && amount !== null) {
      const requested = round2(amount);
      if (requested <= 0) {
        throw ApiError.badRequest('Payment amount must be greater than zero.');
      }
      if (requested > totalOutstanding) {
        throw ApiError.badRequest(`Payment amount cannot exceed the total outstanding balance of ₹${totalOutstanding.toLocaleString('en-IN')}.`);
      }
      targetAmount = requested;
    } else {
      const startIdx = options?.installmentIndex || 0;
      const scheduled = round2(acceptedQuotation.paymentPlan?.[startIdx]?.amount || 0);
      const paid = this.getVerifiedPaidForInstallment(allVerified, startIdx);
      targetAmount = Math.max(0, round2(scheduled - paid));
      if (targetAmount <= 0) {
        targetAmount = totalOutstanding;
      }
    }

    const startingIdx = options?.installmentIndex !== undefined && options.installmentIndex >= 0 ? options.installmentIndex : 0;
    const { allocations, resultingBalances } = this.computeAllocation(
      acceptedQuotation,
      allVerified,
      targetAmount,
      startingIdx
    );

    const advanceBal = resultingBalances.find((r) => r.installmentIndex === 0);
    const advancePaidAfter = advanceBal ? advanceBal.resultingPaid : 0;
    const willConfirmEvent = event.status === 'awaiting_payment' && advancePaidAfter >= round2(acceptedQuotation.advanceAmount);

    return {
      eventId: event.id,
      quotationId: acceptedQuotation.id,
      quotationNumber: acceptedQuotation.quotationNumber,
      quotationRevision: acceptedQuotation.revision,
      totalQuotationAmount: finalAmount,
      totalVerifiedPaid,
      totalOutstanding,
      targetAmount,
      isFullPayment: targetAmount === totalOutstanding,
      willConfirmEvent,
      allocations,
      resultingBalances,
    };
  }

  async getAdvanceSummary(user: { id: string; role: string }, eventId: string) {
    const scheduleSummary = await this.getPaymentScheduleSummary(user, eventId);

    if (!scheduleSummary.hasAcceptedQuotation) {
      return {
        ...scheduleSummary,
        isEligibleForPayment: false,
        isFullyPaid: false,
        advanceInstallment: null,
      };
    }

    const advanceInst = scheduleSummary.installments[0] || null;

    return {
      ...scheduleSummary,
      isFullyPaid: scheduleSummary.isAdvanceFullyPaid,
      isEligibleForPayment: advanceInst ? advanceInst.isEligibleForPayment : false,
      advanceInstallment: advanceInst,
    };
  }

  async renewPaymentLink(adminUser: { id: string; role: string }, payload: { eventId: string; installmentIndex: number; newExpiryDate?: string | Date }) {
    if (adminUser.role !== 'admin') {
      throw ApiError.forbidden('Only administrators are authorized to renew payment links.');
    }

    const { eventId, installmentIndex, newExpiryDate } = payload;

    const event = await this.eventRepository.findById(eventId);
    if (!event) {
      throw ApiError.notFound('Event not found.');
    }

    const quotations = await this.quotationRepository.findByEventId(eventId);
    const acceptedQuotation = quotations.find((q) => q.status === 'accepted');

    if (!acceptedQuotation) {
      throw ApiError.badRequest('No accepted quotation found for this event.');
    }

    if (!acceptedQuotation.paymentPlan || acceptedQuotation.paymentPlan.length === 0) {
      throw ApiError.badRequest('Quotation does not contain a payment plan.');
    }

    if (installmentIndex < 0 || installmentIndex >= acceptedQuotation.paymentPlan.length) {
      throw ApiError.badRequest(`Invalid installment index (${installmentIndex}).`);
    }

    // Prerequisite: if renewing a subsequent installment, advance must already be fully paid
    if (installmentIndex > 0) {
      const verifiedAdv = await this.paymentRepository.findVerifiedAdvancePayments(eventId, acceptedQuotation.id);
      const advPaid = round2(verifiedAdv.reduce((acc, p) => acc + p.amount, 0));
      const reqAdv = round2(acceptedQuotation.advanceAmount);
      if (advPaid < reqAdv) {
        throw ApiError.badRequest('Cannot renew subsequent installment before the required advance is fully paid.');
      }
    }

    const targetInstallment = acceptedQuotation.paymentPlan[installmentIndex];
    const scheduledAmount = round2(targetInstallment.amount);

    // Calculate current verified paid amount authoritatively
    let verifiedPayments: any[] = [];
    if (installmentIndex === 0) {
      verifiedPayments = await this.paymentRepository.findVerifiedAdvancePayments(eventId, acceptedQuotation.id);
    } else {
      verifiedPayments = await this.paymentRepository.findVerifiedInstallmentPayments(eventId, acceptedQuotation.id, installmentIndex);
    }

    const verifiedPaidAmount = round2(verifiedPayments.reduce((acc, p) => acc + p.amount, 0));
    const outstandingAmount = Math.max(0, round2(scheduledAmount - verifiedPaidAmount));

    if (outstandingAmount <= 0) {
      throw ApiError.badRequest('Installment is already fully paid. Renewal is not permitted.');
    }

    // Determine new expiry date (must be in future)
    let expiryDateObj: Date;
    if (newExpiryDate) {
      expiryDateObj = new Date(newExpiryDate);
    } else {
      expiryDateObj = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days from now
    }

    if (isNaN(expiryDateObj.getTime()) || expiryDateObj.getTime() <= Date.now()) {
      throw ApiError.badRequest('New expiry date must be a valid future date.');
    }

    // Duplicate renewal guard: check for existing active link
    const existingActiveLink = await this.paymentRepository.findActiveLinkForInstallment(eventId, acceptedQuotation.id, installmentIndex);
    if (existingActiveLink && existingActiveLink.amount === outstandingAmount) {
      if (existingActiveLink.linkExpiresAt && existingActiveLink.linkExpiresAt > new Date()) {
        throw ApiError.badRequest('This installment already has an active, valid payment link.');
      }
    }

    // Retrieve Client details for email
    const client = await User.findById(event.clientId);

    // Archive / replace previous active link
    const prevLinks = await this.paymentRepository.findLinkHistoryForInstallment(eventId, acceptedQuotation.id, installmentIndex);
    for (const pl of prevLinks) {
      if (pl.linkStatus === 'active') {
        pl.linkStatus = 'replaced';
        await pl.save();
      }
    }
    const lastPreviousLink = prevLinks[0];

    // Generate replacement payment link for the EXACT outstanding balance only
    const receiptReference = `link_${event.id}_${installmentIndex}_${crypto.randomBytes(4).toString('hex')}`;
    let linkId = `plink_${crypto.randomBytes(8).toString('hex')}`;
    let paymentLinkUrl = `https://rzp.io/i/${crypto.randomBytes(4).toString('hex')}`;

    const isTestOrDev = env.nodeEnv === 'test' || env.nodeEnv === 'development';
    const isDummyKey = env.razorpayKeyId === 'rzp_test_dummy_key_id';
    const shouldBypass = isTestOrDev && isDummyKey;

    if (!shouldBypass) {
      try {
        const plink = await (this.razorpay.paymentLink as any).create({
          amount: Math.round(outstandingAmount * 100),
          currency: 'INR',
          accept_partial: false,
          expire_by: Math.floor(expiryDateObj.getTime() / 1000),
          reference_id: receiptReference,
          description: `Payment for ${targetInstallment.title} - ${acceptedQuotation.quotationNumber}`,
          customer: {
            name: client?.name || 'Client',
            email: client?.email || '',
            contact: client?.phone || '',
          },
          notify: { sms: false, email: false },
        });
        linkId = plink.id;
        paymentLinkUrl = plink.short_url;
      } catch (err: any) {
        console.error('Razorpay payment link creation failed:', err);
        throw ApiError.internal('Failed to generate replacement payment link via Razorpay.');
      }
    }

    // Persist new replacement link record in Payment collection
    const newPaymentRecord = await this.paymentRepository.create({
      eventId: new Types.ObjectId(event.id),
      quotationId: new Types.ObjectId(acceptedQuotation.id),
      clientId: new Types.ObjectId(event.clientId.toString()),
      paymentType: installmentIndex === 0 ? 'advance' : 'installment',
      installmentIndex,
      installmentTitle: targetInstallment.title,
      amount: outstandingAmount, // Must request only the outstanding balance!
      currency: 'INR',
      status: 'created',
      receiptReference,
      razorpayPaymentLinkId: linkId,
      paymentLinkUrl,
      linkExpiresAt: expiryDateObj,
      linkStatus: 'active',
      previousPaymentId: lastPreviousLink ? (lastPreviousLink._id as Types.ObjectId) : undefined,
      renewedAt: new Date(),
      renewedBy: new Types.ObjectId(adminUser.id),
    } as any);

    // Update expiry date on the quotation's paymentPlan installment (preserving original dueDate)
    targetInstallment.expiryDate = expiryDateObj;
    await acceptedQuotation.save();

    // Send renewal notification email to client
    if (client?.email) {
      try {
        await emailService.sendPaymentLinkRenewalEmail({
          to: client.email,
          clientName: client.name,
          eventName: event.title,
          quotationNumber: acceptedQuotation.quotationNumber,
          quotationRevision: acceptedQuotation.revision,
          installmentTitle: targetInstallment.title,
          scheduledAmount,
          verifiedPaidAmount,
          outstandingAmount,
          dueDate: targetInstallment.dueDate,
          newExpiryDate: expiryDateObj,
          paymentLinkUrl,
        });
      } catch (emailErr) {
        console.error('[PaymentService] Renewal email notification failed:', emailErr);
        // Do not rollback link creation on email failure
      }
    }

    return {
      success: true,
      paymentId: newPaymentRecord.id,
      razorpayPaymentLinkId: linkId,
      paymentLinkUrl,
      installmentIndex,
      installmentTitle: targetInstallment.title,
      scheduledAmount,
      verifiedPaidAmount,
      outstandingAmount,
      newExpiryDate: expiryDateObj,
      dueDate: targetInstallment.dueDate,
      previousLinkId: lastPreviousLink?.razorpayPaymentLinkId,
    };
  }

  async getAdminPayments(user: { id: string; role: string }, eventId?: string) {
    if (user.role !== 'admin' && user.role !== 'event_manager') {
      throw ApiError.forbidden('Only administrators or event managers can access payment records.');
    }

    if (eventId) {
      return this.paymentRepository.findByEventId(eventId);
    }
    return this.paymentRepository.findAll();
  }
}
