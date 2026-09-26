import { Request, Response, NextFunction } from 'express';

export const validateCreateOrder = (req: Request, res: Response, next: NextFunction): void => {
  const { eventId } = req.body;
  
  if (!eventId || typeof eventId !== 'string') {
    res.status(400).json({ success: false, message: 'Valid eventId is required' });
    return;
  }
  
  next();
};
