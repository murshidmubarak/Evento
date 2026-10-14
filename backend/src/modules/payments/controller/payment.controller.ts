import { Request, Response } from 'express';
import { PaymentService } from '../service/payment.service.js';
import { paymentReminderQueueService } from '../queues/payment-reminder.queue.js';
import { paymentReminderService } from '../service/payment-reminder.service.js';
import { catchAsync } from '../../../utils/catchAsync.js';
import { ApiResponse } from '../../../utils/ApiResponse.js';
import { ApiError } from '../../../utils/ApiError.js';

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

export const handleRazorpayWebhook = catchAsync(async (req: Request, res: Response) => {
  const rawBody = (req as any).rawBody || (Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body)));
  const result = await paymentService.handleRazorpayWebhook(req.headers, rawBody, req.body);
  res.status(200).json({ success: true, ...result });
});

export const reconcilePaymentLink = catchAsync(async (req: Request, res: Response) => {
  const user = {
    id: req.user!.id,
    role: req.user!.role,
  };
  const result = await paymentService.reconcilePaymentLink(user, req.body);
  new ApiResponse(200, 'Payment link reconciled successfully', result).send(res);
});

export const triggerReminders = catchAsync(async (req: Request, res: Response) => {
  if (req.user!.role !== 'admin') {
    throw ApiError.forbidden('Only administrators can manually trigger payment reminders.');
  }
  const { referenceDate, eventId } = req.body || {};
  const refDateObj = referenceDate ? new Date(referenceDate) : new Date();
  const result = await paymentReminderQueueService.enqueueReminderScan({
    referenceDate: refDateObj,
    eventId,
    isManual: true,
    triggeredBy: req.user!.id,
  });
  new ApiResponse(200, 'Payment reminder scan job enqueued successfully', result).send(res);
});

export const getEventReminders = catchAsync(async (req: Request, res: Response) => {
  const { eventId } = req.params;
  const installmentIndex = req.query.installmentIndex !== undefined ? parseInt(req.query.installmentIndex as string, 10) : undefined;
  const logs = await paymentReminderService.getReminderLogsForEvent(eventId, installmentIndex);
  new ApiResponse(200, 'Reminder logs retrieved successfully', logs).send(res);
});


