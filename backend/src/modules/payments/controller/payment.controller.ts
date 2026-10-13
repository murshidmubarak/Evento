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
  const { eventId, amount, partialAmount, customAmount, isPartial, installmentIndex, isFullPayment, paymentOption, allowExcess } = req.body;

  const effectiveAmount = customAmount !== undefined ? customAmount : (partialAmount !== undefined ? partialAmount : (isPartial ? amount : undefined));
  const options = {
    isFullPayment: Boolean(isFullPayment || paymentOption === 'full_balance'),
    paymentOption: paymentOption as string | undefined,
    allowExcess: Boolean(
      paymentOption === 'current_installment'
        ? false
        : (allowExcess || paymentOption === 'custom' || paymentOption === 'full_balance' || isFullPayment)
    ),
  };

  let orderData;
  if (installmentIndex !== undefined && installmentIndex !== null && installmentIndex > 0) {
    orderData = await paymentService.createInstallmentOrder(user, eventId, installmentIndex, effectiveAmount, options);
  } else {
    orderData = await paymentService.createAdvanceOrder(user, eventId, effectiveAmount, options);
  }

  new ApiResponse(201, 'Payment order created successfully', orderData).send(res);
});

export const previewAllocation = catchAsync(async (req: Request, res: Response) => {
  const user = {
    id: req.user!.id,
    role: req.user!.role,
  };
  const { eventId, amount, customAmount, isFullPayment, paymentOption, installmentIndex } = req.body;

  const effectiveAmount = customAmount !== undefined ? customAmount : amount;
  const options = {
    isFullPayment: Boolean(isFullPayment),
    paymentOption: paymentOption as string | undefined,
    installmentIndex: installmentIndex !== undefined ? Number(installmentIndex) : undefined,
  };

  const preview = await paymentService.previewAllocation(user, eventId, effectiveAmount, options);

  new ApiResponse(200, 'Payment allocation preview generated successfully', preview).send(res);
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

export const getPaymentScheduleSummary = catchAsync(async (req: Request, res: Response) => {
  const user = {
    id: req.user!.id,
    role: req.user!.role,
  };
  const { eventId } = req.params;

  const summary = await paymentService.getPaymentScheduleSummary(user, eventId);

  new ApiResponse(200, 'Payment schedule summary retrieved successfully', summary).send(res);
});

export const renewPaymentLink = catchAsync(async (req: Request, res: Response) => {
  const user = {
    id: req.user!.id,
    role: req.user!.role,
  };

  const result = await paymentService.renewPaymentLink(user, req.body);

  new ApiResponse(200, 'Payment link renewed successfully', result).send(res);
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

