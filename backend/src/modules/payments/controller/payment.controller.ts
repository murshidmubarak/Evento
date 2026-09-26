import { Request, Response } from 'express';
import { PaymentService } from '../service/payment.service.js';
import { catchAsync } from '../../../utils/catchAsync.js';
import { ApiResponse } from '../../../utils/ApiResponse.js';

const paymentService = new PaymentService();

export const createOrder = catchAsync(async (req: Request, res: Response) => {
  const user = {
    id: req.user!.id,
    role: req.user!.role,
  };
  const { eventId } = req.body;

  const orderData = await paymentService.createAdvanceOrder(user, eventId);

  new ApiResponse(201, 'Payment order created successfully', orderData).send(res);
});

export const verifyOrder = catchAsync(async (req: Request, res: Response) => {
  const user = {
    id: req.user!.id,
    role: req.user!.role,
  };
  
  const payload = req.body;

  const result = await paymentService.verifyPayment(user, payload);

  new ApiResponse(200, 'Payment verified successfully', result).send(res);
});
