import type { Request, Response, NextFunction } from 'express';
import { ApiError } from '../../../utils/ApiError.js';

export const validateCreateQuotation = (req: Request, _res: Response, next: NextFunction): void => {
  const { eventId, items, discount, advanceAmount, tax, validUntil, notes, terms } = req.body;
  const errors: string[] = [];

  if (!eventId || typeof eventId !== 'string' || eventId.trim().length === 0) {
    errors.push('eventId is required');
  }

  if (!Array.isArray(items) || items.length === 0) {
    errors.push('items array with at least one item is required');
  } else {
    for (const [index, item] of items.entries()) {
      if (!item.serviceId || typeof item.serviceId !== 'string') {
        errors.push(`items[${index}].serviceId is required`);
      }
      if (typeof item.quantity !== 'number' || item.quantity < 1 || !Number.isInteger(item.quantity)) {
        errors.push(`items[${index}].quantity must be a positive integer`);
      }
      if (typeof item.unitPrice !== 'number' || item.unitPrice < 0) {
        errors.push(`items[${index}].unitPrice must be a non-negative number`);
      }
      if (item.requirements !== undefined && item.requirements !== null && typeof item.requirements !== 'string') {
        errors.push(`items[${index}].requirements must be a string`);
      }
    }
  }

  if (discount !== undefined && discount !== null) {
    if (typeof discount !== 'number' || discount < 0) {
      errors.push('discount must be a non-negative number');
    }
  }

  if (advanceAmount !== undefined && advanceAmount !== null) {
    if (typeof advanceAmount !== 'number' || advanceAmount < 0) {
      errors.push('advanceAmount must be a non-negative number');
    }
  }

  if (tax !== undefined && tax !== null) {
    if (typeof tax !== 'object' || Array.isArray(tax)) {
      errors.push('tax must be an object');
    } else {
      const allowedTaxTypes = ['none', 'gst', 'vat', 'custom'];
      if (tax.taxType !== undefined && tax.taxType !== null) {
        if (typeof tax.taxType !== 'string' || !allowedTaxTypes.includes(tax.taxType)) {
          errors.push(`tax.taxType must be one of: ${allowedTaxTypes.join(', ')}`);
        }
      }

      if (tax.taxRate !== undefined && tax.taxRate !== null) {
        if (typeof tax.taxRate !== 'number' || isNaN(tax.taxRate) || tax.taxRate < 0) {
          errors.push('tax.taxRate must be a non-negative number');
        }
      }

      const allowedGstTreatments = ['intra_state', 'inter_state', 'exempt', 'none'];
      if (tax.gstTreatment !== undefined && tax.gstTreatment !== null) {
        if (typeof tax.gstTreatment !== 'string' || !allowedGstTreatments.includes(tax.gstTreatment)) {
          errors.push(`tax.gstTreatment must be one of: ${allowedGstTreatments.join(', ')}`);
        }
      }

      if (tax.placeOfSupply !== undefined && tax.placeOfSupply !== null && typeof tax.placeOfSupply !== 'string') {
        errors.push('tax.placeOfSupply must be a string');
      }

      if (tax.customerGstin !== undefined && tax.customerGstin !== null && typeof tax.customerGstin !== 'string') {
        errors.push('tax.customerGstin must be a string');
      }
    }
  }

  if (validUntil !== undefined && validUntil !== null) {
    if (typeof validUntil !== 'string' || isNaN(Date.parse(validUntil))) {
      errors.push('validUntil must be a valid date string');
    }
  }

  if (notes !== undefined && notes !== null && typeof notes !== 'string') {
    errors.push('notes must be a string');
  }

  if (terms !== undefined && terms !== null && typeof terms !== 'string') {
    errors.push('terms must be a string');
  }

  if (errors.length > 0) {
    return next(ApiError.badRequest('Validation failed', errors));
  }

  next();
};
