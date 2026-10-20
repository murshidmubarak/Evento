import type { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { ApiError } from '../../../utils/ApiError.js';

export const VALID_WORKER_TYPES = [
  'Catering Boy',
  'Catering Supervisor',
  'Chef',
  'Cameraman / Photographer',
  'Videographer',
  'Decoration Worker',
  'Juice Worker',
  'Host',
] as const;

export const validateEventIdParam = (req: Request, _res: Response, next: NextFunction): void => {
  const { eventId } = req.params;
  if (!eventId || !mongoose.Types.ObjectId.isValid(eventId)) {
    return next(ApiError.badRequest('Invalid event ID format'));
  }
  next();
};

export const validateRequirementIdParam = (req: Request, _res: Response, next: NextFunction): void => {
  const { id } = req.params;
  if (!id || !mongoose.Types.ObjectId.isValid(id)) {
    return next(ApiError.badRequest('Invalid work requirement ID format'));
  }
  next();
};

export const isValidReportingTime = (time: unknown): { valid: boolean; error?: string } => {
  if (time === undefined || time === null) {
    return { valid: false, error: 'Reporting time is required' };
  }
  if (typeof time !== 'string') {
    return { valid: false, error: 'Reporting time must be a string' };
  }
  const trimmed = time.trim();
  if (trimmed.length === 0) {
    return { valid: false, error: 'Reporting time is required' };
  }
  const timeRegex = /^([0-1]?\d|2[0-3]):[0-5]\d(\s?[APap][Mm])?$/;
  const isoRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d{3})?Z?$/;
  if (!timeRegex.test(trimmed) && !isoRegex.test(trimmed)) {
    return { valid: false, error: "Reporting time must be a valid time format (e.g. '07:30' or '07:30 AM')" };
  }
  if (trimmed.length > 100) {
    return { valid: false, error: 'Reporting time must not exceed 100 characters' };
  }
  return { valid: true };
};

export const validateCreateWorkRequirement = (req: Request, _res: Response, next: NextFunction): void => {
  const { eventId } = req.params;
  const errors: string[] = [];

  if (!eventId || !mongoose.Types.ObjectId.isValid(eventId)) {
    errors.push('Invalid event ID format');
  }

  const { workerType, requiredCount, reportingTime, description } = req.body;

  // workerType validation
  if (!workerType || typeof workerType !== 'string' || workerType.trim().length === 0) {
    errors.push('Worker type is required');
  } else if (!VALID_WORKER_TYPES.includes(workerType as any)) {
    errors.push(`Invalid worker type: '${workerType}'. Must be one of: ${VALID_WORKER_TYPES.join(', ')}`);
  }

  // requiredCount validation
  if (requiredCount === undefined || requiredCount === null) {
    errors.push('Required count is required');
  } else if (typeof requiredCount !== 'number' || isNaN(requiredCount) || !isFinite(requiredCount)) {
    errors.push('Required count must be a valid number');
  } else if (!Number.isInteger(requiredCount)) {
    errors.push('Required count must be an integer');
  } else if (requiredCount < 1) {
    errors.push('Required count must be at least 1');
  }

  // reportingTime validation (required, proper time format)
  const timeValidation = isValidReportingTime(reportingTime);
  if (!timeValidation.valid) {
    errors.push(timeValidation.error!);
  }

  // description validation
  if (description !== undefined && description !== null) {
    if (typeof description !== 'string') {
      errors.push('Description must be a string');
    } else if (description.trim().length > 2000) {
      errors.push('Description must not exceed 2000 characters');
    }
  }

  if (errors.length > 0) {
    return next(ApiError.badRequest('Validation failed', errors));
  }

  next();
};

export const validateUpdateWorkRequirement = (req: Request, _res: Response, next: NextFunction): void => {
  const { id } = req.params;
  const errors: string[] = [];

  if (!id || !mongoose.Types.ObjectId.isValid(id)) {
    errors.push('Invalid work requirement ID format');
  }

  const { workerType, requiredCount, reportingTime, description, status } = req.body;

  if (workerType !== undefined) {
    if (typeof workerType !== 'string' || !VALID_WORKER_TYPES.includes(workerType as any)) {
      errors.push(`Invalid worker type: '${workerType}'. Must be one of: ${VALID_WORKER_TYPES.join(', ')}`);
    }
  }

  if (requiredCount !== undefined) {
    if (typeof requiredCount !== 'number' || isNaN(requiredCount) || !isFinite(requiredCount)) {
      errors.push('Required count must be a valid number');
    } else if (!Number.isInteger(requiredCount)) {
      errors.push('Required count must be an integer');
    } else if (requiredCount < 1) {
      errors.push('Required count must be at least 1');
    }
  }

  if (reportingTime !== undefined) {
    const timeValidation = isValidReportingTime(reportingTime);
    if (!timeValidation.valid) {
      errors.push(timeValidation.error!);
    }
  }

  if (description !== undefined && description !== null) {
    if (typeof description !== 'string') {
      errors.push('Description must be a string');
    } else if (description.trim().length > 2000) {
      errors.push('Description must not exceed 2000 characters');
    }
  }

  if (status !== undefined) {
    const allowedTransitions = ['draft', 'open', 'cancelled'];
    if (!allowedTransitions.includes(status)) {
      errors.push(`Unauthorized status transition to '${status}'. Direct transition to filled, selection_in_progress, or closed is prohibited.`);
    }
  }

  if (errors.length > 0) {
    return next(ApiError.badRequest('Validation failed', errors));
  }

  next();
};
