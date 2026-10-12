import Razorpay from 'razorpay';
import { Types } from 'mongoose';
import crypto from 'node:crypto';
import { PaymentRepository } from '../repository/payment.repository.js';
import { EventRepository } from '../../events/repository/event.repository.js';
import { QuotationRepository } from '../../quotations/repository/quotation.repository.js';
import { ApiError } from '../../../utils/ApiError.js';
import { env } from '../../../config/env.js';
import { round2 } from '../../../utils/money.js';

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

  async createAdvanceOrder(user: { id: string; role: string }, eventId: string, customAmount?: number) {
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
    const acceptedQuotation = quotations.find(q => q.status === 'accepted');

    if (!acceptedQuotation) {
      throw ApiError.badRequest('No accepted quotation found for this event.');
    }

    if (!acceptedQuotation.advanceAmount || acceptedQuotation.advanceAmount <= 0) {
      throw ApiError.badRequest('Invalid advance amount in quotation.');
    }
    
    if (acceptedQuotation.advanceAmount > acceptedQuotation.finalAmount) {
      throw ApiError.badRequest('Advance amount cannot exceed final amount.');
    }

    // Calculate verified advance paid and outstanding advance authoritatively
    const verifiedPayments = await this.paymentRepository.findVerifiedAdvancePayments(eventId, acceptedQuotation.id);
    const advancePaidAmount = round2(verifiedPayments.reduce((acc, p) => acc + p.amount, 0));
    const requiredAdvance = round2(acceptedQuotation.advanceAmount);
    const outstandingAdvance = Math.max(0, round2(requiredAdvance - advancePaidAmount));

    if (outstandingAdvance <= 0) {
      throw ApiError.badRequest('Required advance payment is already fully paid.');
    }

    // Determine target amount
    let targetAmount: number;
    if (customAmount !== undefined && customAmount !== null) {
      const requested = round2(customAmount);
      if (requested <= 0) {
        throw ApiError.badRequest('Payment amount must be greater than zero.');
      }
      if (requested > outstandingAdvance) {
        throw ApiError.badRequest(`Payment amount (${requested}) cannot exceed outstanding advance amount (${outstandingAdvance}).`);
      }
      targetAmount = requested;
    } else {
      targetAmount = outstandingAdvance;
    }

    // Idempotency: Check if we already have a pending advance payment for this event + quotation with exact same amount
    let payment = await this.paymentRepository.findPendingAdvancePayment(eventId, acceptedQuotation.id, targetAmount);

    if (payment && payment.razorpayOrderId) {
      // Return existing order
      return {
        paymentId: payment.id,
        razorpayOrderId: payment.razorpayOrderId,
        amount: payment.amount,
        currency: payment.currency,
        keyId: env.razorpayKeyId,
        requiredAdvance,
        advancePaidAmount,
        outstandingAdvance,
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
      amount: targetAmount,
      currency: 'INR',
      status: 'created',
      receiptReference,
    } as any);

    try {
      let orderId = `order_${crypto.randomBytes(8).toString('hex')}`;
      
      const isTestOrDev = env.nodeEnv === 'test' || env.nodeEnv === 'development';
      const isDummyKey = env.razorpayKeyId === 'rzp_test_dummy_key_id';
      
      // ONLY bypass if it's a non-production environment AND using the dummy key.
      // Production will always attempt a real Razorpay call.
      const shouldBypass = isTestOrDev && isDummyKey;

      if (!shouldBypass) {
        const order = await this.razorpay.orders.create({
          amount: amountInPaise,
          currency: 'INR',
          receipt: receiptReference,
        });
        orderId = order.id;
      }

      // Update payment record with Razorpay Order ID and pending status
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
      };
    } catch (error: any) {
      // If Razorpay fails, mark local payment as failed to keep sync
      payment.status = 'failed';
      await payment.save();
      throw ApiError.internal('Failed to create Razorpay order.');
    }
  }

  async verifyPayment(user: { id: string; role: string }, payload: { razorpay_order_id: string, razorpay_payment_id: string, razorpay_signature: string }) {
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
    const acceptedQuotation = quotations.find(q => q.status === 'accepted');

    // Idempotency: if already paid, return success without re-processing
    if (payment.status === 'paid') {
      const verifiedPayments = await this.paymentRepository.findVerifiedAdvancePayments(payment.eventId.toString(), payment.quotationId.toString());
      const totalAdvancePaid = round2(verifiedPayments.reduce((acc, p) => acc + p.amount, 0));
      const reqAdv = acceptedQuotation ? round2(acceptedQuotation.advanceAmount) : payment.amount;
      const outAdv = Math.max(0, round2(reqAdv - totalAdvancePaid));
      const event = await this.eventRepository.findById(payment.eventId.toString());

      return {
        paymentId: payment.id,
        status: payment.status,
        amountPaid: payment.amount,
        totalAdvancePaid,
        requiredAdvance: reqAdv,
        outstandingAdvance: outAdv,
        isFullyPaid: outAdv <= 0,
        eventStatus: event?.status || 'awaiting_payment',
        quotationStatus: acceptedQuotation?.status || 'accepted',
      };
    }

    // Cross-check: verify payment.quotationId still matches the current accepted quotation
    // for this event. Guards against stale-revision payments if a newer accepted revision
    // superseded the one this payment was created against.
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

    // Verify Razorpay signature via HMAC-SHA256.
    const expectedSignature = crypto.createHmac('sha256', env.razorpayKeySecret)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    if (expectedSignature !== razorpay_signature) {
      payment.status = 'failed';
      await payment.save();
      throw ApiError.badRequest('Invalid payment signature.');
    }

    // In production (real Razorpay keys), fetch the actual payment from Razorpay
    // and verify the amount and currency match our authoritative local record.
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

    // All checks passed — persist razorpayPaymentId and mark as paid
    payment.razorpayPaymentId = razorpay_payment_id;
    payment.status = 'paid';
    await payment.save();

    // Re-calculate verified advance total authoritatively
    const verifiedPayments = await this.paymentRepository.findVerifiedAdvancePayments(payment.eventId.toString(), acceptedQuotation.id);
    const totalAdvancePaid = round2(verifiedPayments.reduce((acc, p) => acc + p.amount, 0));
    const reqAdv = round2(acceptedQuotation.advanceAmount);
    const outAdv = Math.max(0, round2(reqAdv - totalAdvancePaid));
    const isFullyPaid = outAdv <= 0;

    // Update advance installment status in quotation's paymentPlan if present
    if (acceptedQuotation.paymentPlan && acceptedQuotation.paymentPlan.length > 0) {
      const advanceIdx = acceptedQuotation.paymentPlan.findIndex(p =>
        p.title.toLowerCase().includes('advance')
      );
      const targetIdx = advanceIdx >= 0 ? advanceIdx : 0;
      acceptedQuotation.paymentPlan[targetIdx].status = isFullyPaid ? 'Paid' : 'Partially Paid';
      await acceptedQuotation.save();
    }

    // Transition event only when full required advance has been received and verified
    const event = (await this.eventRepository.findById(payment.eventId.toString())) as any;
    if (!event) {
      throw ApiError.notFound('Event not found.');
    }
    if (isFullyPaid) {
      if (event.status === 'awaiting_payment') {
        event.status = 'confirmed';
        await event.save();
      }
    }

    return {
      paymentId: payment.id,
      status: payment.status,
      amountPaid: payment.amount,
      totalAdvancePaid,
      requiredAdvance: reqAdv,
      outstandingAdvance: outAdv,
      isFullyPaid,
      eventStatus: event.status,
      quotationStatus: acceptedQuotation.status,
    };
  }

  async getAdvanceSummary(user: { id: string; role: string }, eventId: string) {
    const event = await this.eventRepository.findById(eventId);
    if (!event) {
      throw ApiError.notFound('Event not found.');
    }

    if (user.role === 'client' && event.clientId.toString() !== user.id) {
      throw ApiError.forbidden('You do not have permission to view payment summary for this event.');
    }

    const quotations = await this.quotationRepository.findByEventId(eventId);
    const acceptedQuotation = quotations.find(q => q.status === 'accepted');

    if (!acceptedQuotation) {
      return {
        eventId: event.id,
        eventTitle: event.title,
        eventStatus: event.status,
        hasAcceptedQuotation: false,
        isEligibleForPayment: false,
        totalQuotationAmount: 0,
        requiredAdvance: 0,
        advancePaidAmount: 0,
        outstandingAdvance: 0,
        isFullyPaid: false,
        payments: [],
      };
    }

    const verifiedPayments = await this.paymentRepository.findVerifiedAdvancePayments(eventId, acceptedQuotation.id);
    const advancePaidAmount = round2(verifiedPayments.reduce((acc, p) => acc + p.amount, 0));
    const requiredAdvance = round2(acceptedQuotation.advanceAmount);
    const outstandingAdvance = Math.max(0, round2(requiredAdvance - advancePaidAmount));
    const isFullyPaid = outstandingAdvance <= 0;
    const isEligibleForPayment = event.status === 'awaiting_payment' && !isFullyPaid;

    return {
      eventId: event.id,
      eventTitle: event.title,
      eventStatus: event.status,
      hasAcceptedQuotation: true,
      quotationId: acceptedQuotation.id,
      quotationNumber: acceptedQuotation.quotationNumber,
      quotationRevision: acceptedQuotation.revision,
      quotationStatus: acceptedQuotation.status,
      totalQuotationAmount: acceptedQuotation.finalAmount,
      requiredAdvance,
      advancePaidAmount,
      outstandingAdvance,
      isFullyPaid,
      isEligibleForPayment,
      advanceInstallment: acceptedQuotation.paymentPlan?.[0] || null,
      payments: verifiedPayments.map(p => ({
        id: p.id,
        amount: p.amount,
        currency: p.currency,
        status: p.status,
        razorpayPaymentId: p.razorpayPaymentId,
        receiptReference: p.receiptReference,
        createdAt: p.createdAt,
      })),
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

