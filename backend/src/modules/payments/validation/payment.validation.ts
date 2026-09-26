import { Request, Response, NextFunction } from 'express';

export const validateCreateOrder = (req: Request, res: Response, next: NextFunction): void => {
  const { eventId } = req.body;
  
  if (!eventId || typeof eventId !== 'string') {
    res.status(400).json({ success: false, message: 'Valid eventId is required' });
    return;
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
