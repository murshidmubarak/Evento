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
      if (typeof item.unitPrice !== 'number' || isNaN(item.unitPrice) || item.unitPrice <= 0) {
        errors.push(`items[${index}].unitPrice must be a number greater than 0`);
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

  if (!validUntil || (typeof validUntil !== 'string' && !(validUntil instanceof Date)) || isNaN(Date.parse(validUntil as any))) {
    errors.push('validUntil is required and must be a valid date');
  } else if (typeof validUntil === 'string' && validUntil.trim().length === 0) {
    errors.push('validUntil cannot be blank');
  } else {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0).getTime();
    let validEnd: number;
    if (typeof validUntil === 'string') {
      const match = validUntil.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (match) {
        validEnd = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 23, 59, 59, 999).getTime();
      } else {
        const d = new Date(validUntil);
        validEnd = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999).getTime();
      }
    } else {
      validEnd = new Date(validUntil.getFullYear(), validUntil.getMonth(), validUntil.getDate(), 23, 59, 59, 999).getTime();
    }
    if (validEnd < todayStart) {
      errors.push("validUntil cannot be less than today's date");
    }
  }

  if (notes !== undefined && notes !== null && typeof notes !== 'string') {
    errors.push('notes must be a string');
  }

  if (terms !== undefined && terms !== null && typeof terms !== 'string') {
    errors.push('terms must be a string');
  }

  const { structuredTerms, schedules, paymentPlan, conciergeNotes } = req.body;
  if (structuredTerms !== undefined && structuredTerms !== null && !Array.isArray(structuredTerms)) {
    errors.push('structuredTerms must be an array');
  }
  if (schedules !== undefined && schedules !== null && !Array.isArray(schedules)) {
    errors.push('schedules must be an array');
  }
  if (!paymentPlan || !Array.isArray(paymentPlan) || paymentPlan.length === 0) {
    errors.push('paymentPlan array with at least one installment is required');
  } else {
    for (const [index, p] of paymentPlan.entries()) {
      if (!p || typeof p !== 'object') {
        errors.push(`paymentPlan[${index}] must be an object`);
        continue;
      }
      if (!p.title || typeof p.title !== 'string' || p.title.trim().length === 0) {
        errors.push(`paymentPlan[${index}].title is required`);
      }
      if (typeof p.amount !== 'number' || isNaN(p.amount) || p.amount <= 0) {
        errors.push(`paymentPlan[${index}].amount must be a number greater than 0`);
      }
      if (p.dueDate !== undefined && p.dueDate !== null && p.dueDate !== '') {
        if ((typeof p.dueDate !== 'string' && !(p.dueDate instanceof Date)) || isNaN(Date.parse(p.dueDate))) {
          errors.push(`paymentPlan[${index}].dueDate must be a valid date`);
        }
      }
    }
  }
  if (conciergeNotes !== undefined && conciergeNotes !== null && typeof conciergeNotes !== 'string') {
    errors.push('conciergeNotes must be a string');
  }

  if (errors.length > 0) {
    return next(ApiError.badRequest('Validation failed', errors));
  }

  next();
};
