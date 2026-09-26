import Razorpay from 'razorpay';
import { Types } from 'mongoose';
import crypto from 'node:crypto';
import { PaymentRepository } from '../repository/payment.repository.js';
import { EventRepository } from '../../events/repository/event.repository.js';
import { QuotationRepository } from '../../quotations/repository/quotation.repository.js';
import { ApiError } from '../../../utils/ApiError.js';
import { env } from '../../../config/env.js';

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

  async createAdvanceOrder(user: { id: string; role: string }, eventId: string) {
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

    // Find the latest quotation to ensure we are paying the right amount
    // Assuming the accepted quotation is the most recent one or has status 'accepted'
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

    // Idempotency: Check if we already have a pending advance payment for this event + quotation
    let payment = await this.paymentRepository.findPendingAdvancePayment(eventId, acceptedQuotation.id);

    if (payment && payment.razorpayOrderId) {
      // Return existing order
      return {
        paymentId: payment.id,
        razorpayOrderId: payment.razorpayOrderId,
        amount: payment.amount,
        currency: payment.currency,
        keyId: env.razorpayKeyId
      };
    }

    // Generate unique receipt reference
    const receiptReference = `rcpt_${event.id}_${crypto.randomBytes(4).toString('hex')}`;
    const amountInPaise = Math.round(acceptedQuotation.advanceAmount * 100);

    // Create local payment record first (in created state)
    payment = await this.paymentRepository.create({
      eventId: new Types.ObjectId(event.id),
      quotationId: new Types.ObjectId(acceptedQuotation.id),
      clientId: new Types.ObjectId(user.id),
      paymentType: 'advance',
      amount: acceptedQuotation.advanceAmount,
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
        amount: payment.amount, // returning in standard unit, frontend might need standard unit depending on their display
        currency: payment.currency,
        keyId: env.razorpayKeyId
      };
    } catch (error: any) {
      // If Razorpay fails, mark local payment as failed to keep sync
      payment.status = 'failed';
      await payment.save();
      throw ApiError.internal('Failed to create Razorpay order.');
    }
  }
}
