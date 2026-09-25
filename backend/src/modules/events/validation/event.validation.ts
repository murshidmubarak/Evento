import type { Request, Response, NextFunction } from 'express';
import { ApiError } from '../../../utils/ApiError.js';

export const validateCreateEvent = (req: Request, _res: Response, next: NextFunction): void => {
  const { title, eventType, date, startTime, endTime, location, guestCount, budget, selectedServices } = req.body;
  const errors: string[] = [];

  if (!title || typeof title !== 'string' || title.trim().length === 0) {
    errors.push('Title is required and must be a string');
  }

  const validEventTypes = ['Nikah', 'Wedding', 'Reception', 'Engagement', 'Birthday', 'Corporate', 'Other'];
  if (!eventType || !validEventTypes.includes(eventType)) {
    errors.push('Event type must be one of: ' + validEventTypes.join(', '));
  }

  if (!date || isNaN(Date.parse(date))) {
    errors.push('A valid date is required');
  }

  if (!startTime || typeof startTime !== 'string' || startTime.trim().length === 0) {
    errors.push('startTime is required');
  }
  if (!endTime || typeof endTime !== 'string' || endTime.trim().length === 0) {
    errors.push('endTime is required');
  }

  if (startTime && endTime) {
    // Basic time format check (assuming HH:mm or similar comparable strings)
    // For simplicity, we just ensure endTime is theoretically after startTime if they are HH:mm strings
    if (startTime >= endTime) {
      errors.push('endTime must be after startTime');
    }
  }

  if (!location || !location.address || typeof location.address !== 'string' || location.address.trim().length === 0) {
    errors.push('location.address is required');
  } else {
    if (location.lat !== undefined && typeof location.lat !== 'number') {
      errors.push('location.lat must be a number');
    }
    if (location.lng !== undefined && typeof location.lng !== 'number') {
      errors.push('location.lng must be a number');
    }
  }

  if (guestCount === undefined || guestCount === null || typeof guestCount !== 'number' || guestCount <= 0 || !Number.isInteger(guestCount)) {
    errors.push('guestCount must be a positive integer');
  }

  if (budget !== undefined && budget !== null) {
    if (typeof budget !== 'number' || budget < 0) {
      errors.push('budget must be a non-negative number');
    }
  }

  if (selectedServices !== undefined && selectedServices !== null) {
    if (!Array.isArray(selectedServices)) {
      errors.push('selectedServices must be an array of service IDs');
    } else {
      for (const svcId of selectedServices) {
        if (typeof svcId !== 'string' || svcId.trim().length !== 24) { // Basic ObjectId length check
          errors.push('selectedServices must contain valid MongoDB ObjectIds');
          break;
        }
      }
    }
  }

  if (errors.length > 0) {
    return next(ApiError.badRequest('Validation failed', errors));
  }

  next();
};
