import type { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { ApiError } from '../../../utils/ApiError.js';

export const validateGetAvailableManagers = (req: Request, _res: Response, next: NextFunction): void => {
  const { id } = req.params;
  if (!id || !mongoose.Types.ObjectId.isValid(id)) {
    return next(ApiError.badRequest('Invalid event ID'));
  }
  next();
};

export const validateAssignManager = (req: Request, _res: Response, next: NextFunction): void => {
  const { id } = req.params;
  const { eventManagerId } = req.body;

  if (!id || !mongoose.Types.ObjectId.isValid(id)) {
    return next(ApiError.badRequest('Invalid event ID'));
  }

  if (!eventManagerId || typeof eventManagerId !== 'string' || !mongoose.Types.ObjectId.isValid(eventManagerId)) {
    return next(ApiError.badRequest('A valid eventManagerId is required'));
  }

  next();
};
