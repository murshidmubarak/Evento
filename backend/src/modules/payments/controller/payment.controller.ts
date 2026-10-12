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
  const { eventId, amount, partialAmount, isPartial } = req.body;

  const requestedPartial = partialAmount !== undefined ? partialAmount : (isPartial ? amount : undefined);

  const orderData = await paymentService.createAdvanceOrder(user, eventId, requestedPartial);

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

export const getAdvanceSummary = catchAsync(async (req: Request, res: Response) => {
  const user = {
    id: req.user!.id,
    role: req.user!.role,
  };
  const { eventId } = req.params;

  const summary = await paymentService.getAdvanceSummary(user, eventId);

  new ApiResponse(200, 'Advance payment summary retrieved successfully', summary).send(res);
});

export const getAdminPayments = catchAsync(async (req: Request, res: Response) => {
  const user = {
    id: req.user!.id,
    role: req.user!.role,
  };
  const eventId = req.query.eventId as string | undefined;

  const payments = await paymentService.getAdminPayments(user, eventId);

  new ApiResponse(200, 'Payments retrieved successfully', payments).send(res);
});

