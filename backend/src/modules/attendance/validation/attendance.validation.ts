import type { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { ApiError } from '../../../utils/ApiError.js';

/**
 * Validates and normalizes time strings across standard 24h, 12h (AM/PM), and ISO representations.
 * Matches existing WorkRequirement.reportingTime format tolerance.
 */
export const isValidTimeString = (
  time: unknown
): { valid: boolean; error?: string; normalized24h?: string } => {
  if (time === undefined || time === null) {
    return { valid: false, error: 'Time string is required' };
  }
  if (typeof time !== 'string') {
    return { valid: false, error: 'Time must be a string' };
  }
  const trimmed = time.trim();
  if (trimmed.length === 0) {
    return { valid: false, error: 'Time string cannot be empty' };
  }

  // 1. Check 24-hour format: "08:30", "19:45", "08:30:00"
  const match24 = trimmed.match(/^([0-1]?\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/);
  if (match24) {
    const hours = match24[1].padStart(2, '0');
    const minutes = match24[2];
    return { valid: true, normalized24h: `${hours}:${minutes}` };
  }

  // 2. Check 12-hour format with AM/PM: "07:30 AM", "08:45 PM", "08:30:00 AM"
  const match12 = trimmed.match(/^(0?[0-9]|1[0-2]):([0-5]\d)(?::[0-5]\d)?(\s?[APap][Mm])$/);
  if (match12) {
    let hours = parseInt(match12[1], 10);
    const minutes = match12[2];
    const ampm = match12[3].trim().toUpperCase();

    if (ampm === 'PM' && hours < 12) hours += 12;
    if (ampm === 'AM' && hours === 12) hours = 0;

    const normalized = `${String(hours).padStart(2, '0')}:${minutes}`;
    return { valid: true, normalized24h: normalized };
  }

  // 3. Check ISO datetime string: "2026-11-06T19:00:00.000Z"
  const isoRegex = /^\d{4}-\d{2}-\d{2}T(\d{2}):(\d{2})(?::\d{2})?(\.\d{3})?Z?$/;
  const matchIso = trimmed.match(isoRegex);
  if (matchIso) {
    return { valid: true, normalized24h: `${matchIso[1]}:${matchIso[2]}` };
  }

  return {
    valid: false,
    error: "Time must be a valid format (e.g. '08:30', '08:30 AM', or '19:00')",
  };
};

/**
 * Validates check-in finalization payload.
 */
export const validateCheckInFinalization = (req: Request, _res: Response, next: NextFunction): void => {
  const { eventId } = req.params;
  const errors: string[] = [];

  if (!eventId || !mongoose.Types.ObjectId.isValid(eventId)) {
    errors.push('Invalid event ID format');
  }

  const { lateExceptions, absentExceptions } = req.body;

  const lateWorkerIds = new Set<string>();
  const absentWorkerIds = new Set<string>();

  // Validate lateExceptions if present
  if (lateExceptions !== undefined && lateExceptions !== null) {
    if (!Array.isArray(lateExceptions)) {
      errors.push('lateExceptions must be an array');
    } else {
      lateExceptions.forEach((item, index) => {
        if (!item || typeof item !== 'object') {
          errors.push(`lateExceptions[${index}] must be an object`);
          return;
        }

        const { workerId, actualArrivalTime } = item;

        if (!workerId || !mongoose.Types.ObjectId.isValid(workerId)) {
          errors.push(`lateExceptions[${index}].workerId must be a valid ObjectId`);
        } else if (lateWorkerIds.has(workerId)) {
          errors.push(`Duplicate workerId '${workerId}' in lateExceptions`);
        } else {
          lateWorkerIds.add(workerId);
        }

        const timeCheck = isValidTimeString(actualArrivalTime);
        if (!timeCheck.valid) {
          errors.push(`lateExceptions[${index}].actualArrivalTime: ${timeCheck.error}`);
        }
      });
    }
  }

  // Validate absentExceptions if present
  if (absentExceptions !== undefined && absentExceptions !== null) {
    if (!Array.isArray(absentExceptions)) {
      errors.push('absentExceptions must be an array');
    } else {
      absentExceptions.forEach((workerId, index) => {
        if (!workerId || !mongoose.Types.ObjectId.isValid(workerId)) {
          errors.push(`absentExceptions[${index}] must be a valid worker ObjectId`);
        } else if (absentWorkerIds.has(workerId)) {
          errors.push(`Duplicate workerId '${workerId}' in absentExceptions`);
        } else {
          absentWorkerIds.add(workerId);
        }
      });
    }
  }

  // Check mutuality (no worker in both late and absent exceptions)
  for (const workerId of lateWorkerIds) {
    if (absentWorkerIds.has(workerId)) {
      errors.push(`Worker '${workerId}' cannot be marked both late and absent`);
    }
  }

  if (errors.length > 0) {
    return next(ApiError.badRequest('Validation failed', errors));
  }

  next();
};

/**
 * Validates checkout finalization payload.
 */
export const validateCheckOutFinalization = (req: Request, _res: Response, next: NextFunction): void => {
  const { eventId } = req.params;
  const errors: string[] = [];

  if (!eventId || !mongoose.Types.ObjectId.isValid(eventId)) {
    errors.push('Invalid event ID format');
  }

  const {
    actualNormalFinishTime,
    requirementFinishOverrides,
    earlyDepartureExceptions,
    overtimeExceptions,
  } = req.body;

  // actualNormalFinishTime is required
  const finishTimeCheck = isValidTimeString(actualNormalFinishTime);
  if (!finishTimeCheck.valid) {
    errors.push(`actualNormalFinishTime: ${finishTimeCheck.error}`);
  }

  // Validate optional requirementFinishOverrides
  if (requirementFinishOverrides !== undefined && requirementFinishOverrides !== null) {
    if (!Array.isArray(requirementFinishOverrides)) {
      errors.push('requirementFinishOverrides must be an array');
    } else {
      const seenRequirements = new Set<string>();
      requirementFinishOverrides.forEach((override, index) => {
        if (!override || typeof override !== 'object') {
          errors.push(`requirementFinishOverrides[${index}] must be an object`);
          return;
        }

        const { requirementId, normalFinishTime } = override;
        if (!requirementId || !mongoose.Types.ObjectId.isValid(requirementId)) {
          errors.push(`requirementFinishOverrides[${index}].requirementId must be a valid ObjectId`);
        } else if (seenRequirements.has(requirementId)) {
          errors.push(`Duplicate requirementId '${requirementId}' in requirementFinishOverrides`);
        } else {
          seenRequirements.add(requirementId);
        }

        const timeCheck = isValidTimeString(normalFinishTime);
        if (!timeCheck.valid) {
          errors.push(`requirementFinishOverrides[${index}].normalFinishTime: ${timeCheck.error}`);
        }
      });
    }
  }

  const earlyWorkerIds = new Set<string>();
  const overtimeWorkerIds = new Set<string>();

  // Validate earlyDepartureExceptions
  if (earlyDepartureExceptions !== undefined && earlyDepartureExceptions !== null) {
    if (!Array.isArray(earlyDepartureExceptions)) {
      errors.push('earlyDepartureExceptions must be an array');
    } else {
      earlyDepartureExceptions.forEach((item, index) => {
        if (!item || typeof item !== 'object') {
          errors.push(`earlyDepartureExceptions[${index}] must be an object`);
          return;
        }

        const { workerId, actualCheckoutTime } = item;
        if (!workerId || !mongoose.Types.ObjectId.isValid(workerId)) {
          errors.push(`earlyDepartureExceptions[${index}].workerId must be a valid ObjectId`);
        } else if (earlyWorkerIds.has(workerId)) {
          errors.push(`Duplicate workerId '${workerId}' in earlyDepartureExceptions`);
        } else {
          earlyWorkerIds.add(workerId);
        }

        const timeCheck = isValidTimeString(actualCheckoutTime);
        if (!timeCheck.valid) {
          errors.push(`earlyDepartureExceptions[${index}].actualCheckoutTime: ${timeCheck.error}`);
        }
      });
    }
  }

  // Validate overtimeExceptions
  if (overtimeExceptions !== undefined && overtimeExceptions !== null) {
    if (!Array.isArray(overtimeExceptions)) {
      errors.push('overtimeExceptions must be an array');
    } else {
      overtimeExceptions.forEach((item, index) => {
        if (!item || typeof item !== 'object') {
          errors.push(`overtimeExceptions[${index}] must be an object`);
          return;
        }

        const { workerId, actualCheckoutTime } = item;
        if (!workerId || !mongoose.Types.ObjectId.isValid(workerId)) {
          errors.push(`overtimeExceptions[${index}].workerId must be a valid ObjectId`);
        } else if (overtimeWorkerIds.has(workerId)) {
          errors.push(`Duplicate workerId '${workerId}' in overtimeExceptions`);
        } else {
          overtimeWorkerIds.add(workerId);
        }

        const timeCheck = isValidTimeString(actualCheckoutTime);
        if (!timeCheck.valid) {
          errors.push(`overtimeExceptions[${index}].actualCheckoutTime: ${timeCheck.error}`);
        }
      });
    }
  }

  // Check mutuality (no worker in both early departure and overtime exceptions)
  for (const workerId of earlyWorkerIds) {
    if (overtimeWorkerIds.has(workerId)) {
      errors.push(`Worker '${workerId}' cannot appear in both early departure and overtime exceptions`);
    }
  }

  if (errors.length > 0) {
    return next(ApiError.badRequest('Validation failed', errors));
  }

  next();
};

/**
 * Validates manual attendance correction payload.
 */
export const validateAttendanceCorrection = (req: Request, _res: Response, next: NextFunction): void => {
  const { id } = req.params;
  const errors: string[] = [];

  if (!id || !mongoose.Types.ObjectId.isValid(id)) {
    errors.push('Invalid attendance record ID format');
  }

  const { reason, status, actualArrivalTime, actualCheckoutTime } = req.body;

  // Reason is mandatory with minimum 5 characters
  if (!reason || typeof reason !== 'string' || reason.trim().length < 5) {
    errors.push('Correction reason is mandatory and must be at least 5 characters');
  }

  // Optional status transition validation
  if (status !== undefined && status !== null) {
    const validStatuses = ['not_started', 'checked_in', 'checked_out', 'absent'];
    if (!validStatuses.includes(status)) {
      errors.push(`Invalid status '${status}'. Must be one of: ${validStatuses.join(', ')}`);
    }
  }

  // Validate actualArrivalTime if supplied
  if (actualArrivalTime !== undefined && actualArrivalTime !== null) {
    const timeCheck = isValidTimeString(actualArrivalTime);
    if (!timeCheck.valid) {
      errors.push(`actualArrivalTime: ${timeCheck.error}`);
    }
  }

  // Validate actualCheckoutTime if supplied
  if (actualCheckoutTime !== undefined && actualCheckoutTime !== null) {
    const timeCheck = isValidTimeString(actualCheckoutTime);
    if (!timeCheck.valid) {
      errors.push(`actualCheckoutTime: ${timeCheck.error}`);
    }
  }

  if (errors.length > 0) {
    return next(ApiError.badRequest('Validation failed', errors));
  }

  next();
};

/**
 * Validates attendance verification (approval / rejection) payload.
 */
export const validateAttendanceVerification = (req: Request, _res: Response, next: NextFunction): void => {
  const { eventId } = req.params;
  const errors: string[] = [];

  if (!eventId || !mongoose.Types.ObjectId.isValid(eventId)) {
    errors.push('Invalid event ID format');
  }

  const { action, rejectionReason } = req.body;

  if (!action || !['approve', 'reject'].includes(action)) {
    errors.push("Action must be either 'approve' or 'reject'");
  }

  if (action === 'reject') {
    if (!rejectionReason || typeof rejectionReason !== 'string' || rejectionReason.trim().length < 5) {
      errors.push('Rejection reason is mandatory and must be at least 5 characters when rejecting');
    }
  }

  if (errors.length > 0) {
    return next(ApiError.badRequest('Validation failed', errors));
  }

  next();
};

