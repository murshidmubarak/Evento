import { Payment, IPayment } from '../model/payment.model.js';

export class PaymentRepository {
  async create(data: Partial<IPayment>): Promise<IPayment> {
    const payment = new Payment(data);
    return await payment.save();
  }

  async findPendingAdvancePayment(eventId: string, quotationId: string): Promise<IPayment | null> {
    return Payment.findOne({
      eventId,
      quotationId,
      paymentType: 'advance',
      status: { $in: ['created', 'pending'] }
    });
  }

  async findByRazorpayOrderId(razorpayOrderId: string): Promise<IPayment | null> {
    return Payment.findOne({ razorpayOrderId });
  }

  async findById(paymentId: string): Promise<IPayment | null> {
    return Payment.findById(paymentId);
  }
}
