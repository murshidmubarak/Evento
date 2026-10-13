import { Request, Response, NextFunction } from 'express';

export const validateCreateOrder = (req: Request, res: Response, next: NextFunction): void => {
  const { eventId, partialAmount, amount, customAmount, installmentIndex } = req.body;
  
  if (!eventId || typeof eventId !== 'string') {
    res.status(400).json({ success: false, message: 'Valid eventId is required' });
    return;
  }

  if (installmentIndex !== undefined && installmentIndex !== null) {
    if (typeof installmentIndex !== 'number' || isNaN(installmentIndex) || installmentIndex < 0 || !Number.isInteger(installmentIndex)) {
      res.status(400).json({ success: false, message: 'installmentIndex must be a non-negative integer' });
      return;
    }
  }

  const requestedAmount = customAmount !== undefined ? customAmount : (partialAmount !== undefined ? partialAmount : amount);
  if (requestedAmount !== undefined && requestedAmount !== null) {
    if (typeof requestedAmount !== 'number' || isNaN(requestedAmount) || requestedAmount <= 0) {
      res.status(400).json({ success: false, message: 'Payment amount must be a number greater than 0' });
      return;
    }
  }
  
  next();
};

export const validatePreviewAllocation = (req: Request, res: Response, next: NextFunction): void => {
  const { eventId, amount } = req.body;

  if (!eventId || typeof eventId !== 'string') {
    res.status(400).json({ success: false, message: 'Valid eventId is required' });
    return;
  }

  if (amount !== undefined && amount !== null) {
    if (typeof amount !== 'number' || isNaN(amount) || amount <= 0) {
      res.status(400).json({ success: false, message: 'Payment amount must be a number greater than 0' });
      return;
    }
  }

  next();
};

export const validateVerifyOrder = (req: Request, res: Response, next: NextFunction): void => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
  
  if (!razorpay_order_id || typeof razorpay_order_id !== 'string') {
    res.status(400).json({ success: false, message: 'Valid razorpay_order_id is required' });
    return;
  }
  
  if (!razorpay_payment_id || typeof razorpay_payment_id !== 'string') {
    res.status(400).json({ success: false, message: 'Valid razorpay_payment_id is required' });
    return;
  }

  if (!razorpay_signature || typeof razorpay_signature !== 'string') {
    res.status(400).json({ success: false, message: 'Valid razorpay_signature is required' });
    return;
  }

  next();
};

export const validateRenewPaymentLink = (req: Request, res: Response, next: NextFunction): void => {
  const { eventId, installmentIndex, newExpiryDate } = req.body;

  if (!eventId || typeof eventId !== 'string') {
    res.status(400).json({ success: false, message: 'Valid eventId is required' });
    return;
  }

  if (installmentIndex === undefined || installmentIndex === null || typeof installmentIndex !== 'number' || isNaN(installmentIndex) || installmentIndex < 0 || !Number.isInteger(installmentIndex)) {
    res.status(400).json({ success: false, message: 'Valid installmentIndex is required as a non-negative integer' });
    return;
  }

  if (newExpiryDate !== undefined && newExpiryDate !== null) {
    const d = new Date(newExpiryDate);
    if (isNaN(d.getTime())) {
      res.status(400).json({ success: false, message: 'newExpiryDate must be a valid date' });
      return;
    }
  }

  next();
};

export const validateReconcilePaymentLink = (req: Request, res: Response, next: NextFunction): void => {
  const { paymentLinkId } = req.body;

  if (!paymentLinkId || typeof paymentLinkId !== 'string') {
    res.status(400).json({ success: false, message: 'Valid paymentLinkId is required' });
    return;
  }

  next();
};
