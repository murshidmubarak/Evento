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
  } else {
    const eventDate = new Date(date);
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    if (eventDate < today) {
      errors.push('Event date cannot be in the past');
    }
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
    const hasLat = location.lat !== undefined && location.lat !== null;
    const hasLng = location.lng !== undefined && location.lng !== null;

    if (hasLat && !hasLng) {
      errors.push('location.lng is required when location.lat is provided');
    }
    if (hasLng && !hasLat) {
      errors.push('location.lat is required when location.lng is provided');
    }

    if (hasLat && hasLng) {
      const lat = location.lat;
      const lng = location.lng;

      if (typeof lat !== 'number' || isNaN(lat) || !isFinite(lat)) {
        errors.push('location.lat must be a valid number');
      } else if (lat < -90 || lat > 90) {
        errors.push('location.lat must be between -90 and 90');
      }

      if (typeof lng !== 'number' || isNaN(lng) || !isFinite(lng)) {
        errors.push('location.lng must be a valid number');
      } else if (lng < -180 || lng > 180) {
        errors.push('location.lng must be between -180 and 180');
      }
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
      errors.push('selectedServices must be an array');
    } else {
      for (let i = 0; i < selectedServices.length; i++) {
        const item = selectedServices[i];
        if (typeof item === 'string') {
          if (item.trim().length !== 24) errors.push('selectedServices must contain valid MongoDB ObjectIds');
          selectedServices[i] = { serviceId: item }; // Normalize for downstream
        } else if (typeof item === 'object' && item !== null) {
          if (!item.serviceId || typeof item.serviceId !== 'string' || item.serviceId.trim().length !== 24) {
            errors.push('selectedServices item must contain a valid serviceId ObjectId');
          }
          if (item.preferences !== undefined && item.preferences !== null) {
            if (typeof item.preferences !== 'object' || Array.isArray(item.preferences)) {
              errors.push('preferences must be an object');
            } else {
              const forbiddenKeys = [
                'price', 'unitPrice', 'amount', 'basePrice', 'quotationAmount', 'discount', 'tax',
                'eventManagerId', 'status', 'clientId', '_id', 'id'
              ];
              for (const key of Object.keys(item.preferences)) {
                if (forbiddenKeys.includes(key)) {
                  errors.push(`preferences cannot contain protected or pricing field: ${key}`);
                }
              }
              if (Array.isArray(item.preferences.requirements)) {
                item.preferences.requirements = item.preferences.requirements
                  .map((r: any) => typeof r === 'object' && r !== null ? {
                    title: (r.title || '').trim(),
                    description: (r.description || '').trim()
                  } : r)
                  .filter((r: any) => typeof r === 'string' ? r.trim().length > 0 : Boolean(r && (r.title || r.description)));
              }
              if (Array.isArray(item.preferences.otherRequirements)) {
                item.preferences.otherRequirements = item.preferences.otherRequirements
                  .map((r: any) => typeof r === 'object' && r !== null ? {
                    title: (r.title || '').trim(),
                    description: (r.description || '').trim()
                  } : r)
                  .filter((r: any) => typeof r === 'string' ? r.trim().length > 0 : Boolean(r && (r.title || r.description)));
              }
            }
          }
        } else {
          errors.push('selectedServices must contain valid ObjectIds or objects with serviceId');
        }
      }
    }
  }

  // Validate optional clientInfo sub-document
  const { clientInfo } = req.body;
  if (clientInfo !== undefined && clientInfo !== null) {
    if (typeof clientInfo !== 'object' || Array.isArray(clientInfo)) {
      errors.push('clientInfo must be an object');
    } else {
      if (clientInfo.name !== undefined && typeof clientInfo.name !== 'string') {
        errors.push('clientInfo.name must be a string');
      }
      if (clientInfo.phone !== undefined && typeof clientInfo.phone !== 'string') {
        errors.push('clientInfo.phone must be a string');
      }
      if (clientInfo.email !== undefined && typeof clientInfo.email !== 'string') {
        errors.push('clientInfo.email must be a string');
      }
    }
  }

  if (errors.length > 0) {
    return next(ApiError.badRequest('Validation failed', errors));
  }

  next();
};
