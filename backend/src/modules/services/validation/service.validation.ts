import type { Request, Response, NextFunction } from 'express';
import { ApiError } from '../../../utils/ApiError.js';

export const validateCreateService = (req: Request, _res: Response, next: NextFunction): void => {
  const { name, description, pricingType } = req.body;
  const errors: string[] = [];

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    errors.push('Name is required and must be a non-empty string');
  }

  if (!description || typeof description !== 'string' || description.trim().length === 0) {
    errors.push('Description is required and must be a non-empty string');
  }

  const allowedPricingTypes = ['per_guest', 'per_event', 'package'];
  if (!pricingType || typeof pricingType !== 'string' || !allowedPricingTypes.includes(pricingType)) {
    errors.push('Pricing type must be one of: per_guest, per_event, package');
  }

  if (errors.length > 0) {
    return next(ApiError.badRequest('Validation failed', errors));
  }

  next();
};

export const validateUpdateService = (req: Request, _res: Response, next: NextFunction): void => {
  const { name, description, pricingType } = req.body;
  const errors: string[] = [];

  if (name !== undefined) {
    if (typeof name !== 'string' || name.trim().length === 0) {
      errors.push('Name must be a non-empty string');
    }
  }

  if (description !== undefined) {
    if (typeof description !== 'string' || description.trim().length === 0) {
      errors.push('Description must be a non-empty string');
    }
  }

  if (pricingType !== undefined) {
    const allowedPricingTypes = ['per_guest', 'per_event', 'package'];
    if (typeof pricingType !== 'string' || !allowedPricingTypes.includes(pricingType)) {
      errors.push('Pricing type must be one of: per_guest, per_event, package');
    }
  }

  if (errors.length > 0) {
    return next(ApiError.badRequest('Validation failed', errors));
  }

  next();
};

export const validateServiceStatusUpdate = (req: Request, _res: Response, next: NextFunction): void => {
  const { isActive } = req.body;
  const errors: string[] = [];

  if (isActive === undefined || isActive === null || typeof isActive !== 'boolean') {
    errors.push('isActive is required and must be a boolean');
  }

  if (errors.length > 0) {
    return next(ApiError.badRequest('Validation failed', errors));
  }

  next();
};
