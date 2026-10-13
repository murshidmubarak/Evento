import { Payment, IPayment } from '../model/payment.model.js';

export class PaymentRepository {
  async create(data: Partial<IPayment>): Promise<IPayment> {
    const payment = new Payment(data);
    return await payment.save();
  }

  async findPendingAdvancePayment(eventId: string, quotationId: string, amount?: number): Promise<IPayment | null> {
    const filter: any = {
      eventId,
      quotationId,
      paymentType: 'advance',
      status: { $in: ['created', 'pending'] },
    };
    if (amount !== undefined) {
      filter.amount = amount;
    }
    return Payment.findOne(filter).sort({ createdAt: -1 });
  }

  async findVerifiedAdvancePayments(eventId: string, quotationId: string): Promise<IPayment[]> {
    return Payment.find({
      eventId,
      quotationId,
      paymentType: 'advance',
      status: 'paid',
    }).sort({ createdAt: 1 });
  }

  async findAllVerifiedPayments(eventId: string, quotationId: string): Promise<IPayment[]> {
    return Payment.find({
      eventId,
      quotationId,
      status: 'paid',
    }).sort({ createdAt: 1 });
  }

  async cancelAllPendingPaymentsForEvent(eventId: string, quotationId: string): Promise<void> {
    await Payment.updateMany(
      {
        eventId,
        quotationId,
        status: { $in: ['created', 'pending'] },
      },
      { status: 'failed' }
    );
  }

  async cancelPendingAdvancePayments(eventId: string, quotationId: string): Promise<void> {
    await Payment.updateMany(
      {
        eventId,
        quotationId,
        paymentType: 'advance',
        status: { $in: ['created', 'pending'] },
      },
      { status: 'failed' }
    );
  }

  async findPendingInstallmentPayment(eventId: string, quotationId: string, installmentIndex: number, amount?: number): Promise<IPayment | null> {
    const filter: any = {
      eventId,
      quotationId,
      paymentType: 'installment',
      installmentIndex,
      status: { $in: ['created', 'pending'] },
    };
    if (amount !== undefined) {
      filter.amount = amount;
    }
    return Payment.findOne(filter).sort({ createdAt: -1 });
  }

  async findVerifiedInstallmentPayments(eventId: string, quotationId: string, installmentIndex: number): Promise<IPayment[]> {
    return Payment.find({
      eventId,
      quotationId,
      paymentType: 'installment',
      installmentIndex,
      status: 'paid',
    }).sort({ createdAt: 1 });
  }

  async findAllPaymentsForInstallment(eventId: string, quotationId: string, installmentIndex: number): Promise<IPayment[]> {
    return Payment.find({
      eventId,
      quotationId,
      installmentIndex,
    }).sort({ createdAt: -1 });
  }

  async findActiveLinkForInstallment(eventId: string, quotationId: string, installmentIndex: number): Promise<IPayment | null> {
    return Payment.findOne({
      eventId,
      quotationId,
      installmentIndex,
      linkStatus: 'active',
      linkExpiresAt: { $gt: new Date() },
    }).sort({ createdAt: -1 });
  }

  async findLinkHistoryForInstallment(eventId: string, quotationId: string, installmentIndex: number): Promise<IPayment[]> {
    return Payment.find({
      eventId,
      quotationId,
      installmentIndex,
      paymentLinkUrl: { $exists: true, $ne: '' },
    })
      .populate('renewedBy', 'name email')
      .sort({ createdAt: -1 });
  }

  async cancelPendingInstallmentPayments(eventId: string, quotationId: string, installmentIndex: number): Promise<void> {
    await Payment.updateMany(
      {
        eventId,
        quotationId,
        paymentType: 'installment',
        installmentIndex,
        status: { $in: ['created', 'pending'] },
      },
      { status: 'failed' }
    );
  }

  async findByPaymentLinkId(paymentLinkId: string): Promise<IPayment | null> {
    return Payment.findOne({ razorpayPaymentLinkId: paymentLinkId });
  }

  async findByRazorpayOrderId(razorpayOrderId: string): Promise<IPayment | null> {
    return Payment.findOne({ razorpayOrderId });
  }

  async findById(paymentId: string): Promise<IPayment | null> {
    return Payment.findById(paymentId);
  }

  async findByEventId(eventId: string): Promise<IPayment[]> {
    return Payment.find({ eventId }).sort({ createdAt: -1 });
  }

  async findAll(): Promise<IPayment[]> {
    return Payment.find()
      .populate('eventId', 'title status clientInfo date')
      .populate('clientId', 'name email')
      .populate('quotationId', 'quotationNumber revision')
      .populate('renewedBy', 'name email')
      .sort({ createdAt: -1 });
  }
}

