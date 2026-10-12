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
      .sort({ createdAt: -1 });
  }
}

