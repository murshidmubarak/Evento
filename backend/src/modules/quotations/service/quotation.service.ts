import { Types } from 'mongoose';
import { QuotationRepository } from '../repository/quotation.repository.js';
import { EventRepository } from '../../events/repository/event.repository.js';
import { ServiceRepository } from '../../services/repository/service.repository.js';
import { ApiError } from '../../../utils/ApiError.js';
import { authorizeResourceAccess } from '../../../utils/resourceAuthorization.js';
import { IQuotationItem, TaxType, GstTreatment, ITaxDetails } from '../model/quotation.model.js';
import { round2 } from '../../../utils/money.js';

export interface CreateQuotationTaxInput {
  taxType?: TaxType;
  taxRate?: number;
  gstTreatment?: GstTreatment;
  placeOfSupply?: string;
  customerGstin?: string;
}

export interface CreateQuotationInput {
  eventId: string;
  items: {
    serviceId: string;
    quantity: number;
    unitPrice: number;
    requirements?: string;
    scope?: string;
    detailedContent?: { sectionName: string; items: string[] }[];
  }[];
  discount?: number;
  advanceAmount?: number;
  tax?: CreateQuotationTaxInput;
  validUntil?: Date;
  notes?: string;
  terms?: string;
  structuredTerms?: { title: string; content: string }[];
  schedules?: { title: string; time: string }[];
  paymentPlan?: { title: string; percentage?: number; amount: number; dueDateDescription?: string; dueDate?: Date | string; expiryDate?: Date | string; purpose?: string[]; status?: string }[];
  conciergeNotes?: string;
}

const getDayEndTimestamp = (val: string | Date): number => {
  if (typeof val === 'string') {
    const match = val.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 23, 59, 59, 999).getTime();
    }
  }
  const d = new Date(val);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999).getTime();
};

const getDayStartTimestamp = (val: string | Date): number => {
  if (typeof val === 'string') {
    const match = val.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 0, 0, 0, 0).getTime();
    }
  }
  const d = new Date(val);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0).getTime();
};

const validateQuotationValidityDate = (validUntil: string | Date | undefined, eventDate?: Date | string | null): void => {
  if (!validUntil || (typeof validUntil === 'string' && validUntil.trim().length === 0)) {
    throw ApiError.badRequest('Quotation validity date (validUntil) is required and cannot be blank.');
  }

  const parsedDate = new Date(validUntil);
  if (isNaN(parsedDate.getTime())) {
    throw ApiError.badRequest('Quotation validity date (validUntil) must be a valid date.');
  }

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0).getTime();
  const validUntilEnd = getDayEndTimestamp(validUntil);

  if (validUntilEnd < todayStart) {
    throw ApiError.badRequest("Quotation validity date cannot be less than today's date.");
  }

  if (eventDate) {
    const eventDayEnd = getDayEndTimestamp(eventDate);
    const validUntilStart = getDayStartTimestamp(validUntil);
    if (validUntilStart > eventDayEnd) {
      throw ApiError.badRequest('Quotation validity date cannot be after the event date.');
    }
  }
};

export class QuotationService {
  private quotationRepository = new QuotationRepository();
  private eventRepository = new EventRepository();
  private serviceRepository = new ServiceRepository();

  async createQuotation(
    user: { id: string; role: string },
    input: CreateQuotationInput
  ) {
    // 1. Role Check
    if (user.role === 'client' || user.role === 'worker') {
      throw ApiError.forbidden('You do not have permission to create a quotation.');
    }

    // 2. Fetch Event
    const event = await this.eventRepository.findById(input.eventId);
    if (!event) {
      throw ApiError.notFound('Event not found.');
    }

    // 3. Resource Authorization
    authorizeResourceAccess(user, [event.eventManagerId?.toString()]);

    // 4. Validate and build items
    if (!input.items || input.items.length === 0) {
      throw ApiError.badRequest('At least one line item is required.');
    }

    const quotationItems: IQuotationItem[] = [];
    let subtotal = 0;

    for (const reqItem of input.items) {
      if (reqItem.quantity < 1) {
        throw ApiError.badRequest('Quantity must be at least 1.');
      }
      if (reqItem.unitPrice <= 0) {
        throw ApiError.badRequest('Unit price must be greater than 0.');
      }

      const service = await this.serviceRepository.findById(reqItem.serviceId);
      if (!service) {
        throw ApiError.badRequest(`Service with ID ${reqItem.serviceId} not found.`);
      }
      if (!service.isActive) {
        throw ApiError.badRequest(`Service ${service.name} is currently inactive and cannot be quoted.`);
      }

      const amount = round2(reqItem.quantity * reqItem.unitPrice);
      subtotal = round2(subtotal + amount);

      quotationItems.push({
        serviceId: service._id as Types.ObjectId,
        name: service.name,
        description: service.description,
        pricingType: service.pricingType,
        requirements: reqItem.requirements,
        scope: reqItem.scope,
        detailedContent: (reqItem.detailedContent || [])
          .filter((s) => s.sectionName?.trim() || s.items?.some((x) => x?.trim()))
          .map((s) => ({
            sectionName: (s.sectionName?.trim() || 'Details'),
            items: (s.items || []).filter((x) => typeof x === 'string' && x.trim().length > 0),
          })),
        quantity: reqItem.quantity,
        unitPrice: reqItem.unitPrice,
        amount,
      });
    }

    // 5. Financial validations & Tax-aware Commercial Calculation
    const discount = input.discount !== undefined && input.discount !== null ? round2(input.discount) : 0;
    if (discount < 0) {
      throw ApiError.badRequest('Discount cannot be negative.');
    }
    if (discount > subtotal) {
      throw ApiError.badRequest('Discount cannot exceed the subtotal.');
    }

    const taxableAmount = round2(subtotal - discount);

    // Tax processing
    const taxInput = input.tax || {};
    const taxType: TaxType = taxInput.taxType || 'none';
    const rawTaxRate = taxInput.taxRate !== undefined && taxInput.taxRate !== null ? Number(taxInput.taxRate) : 0;

    if (isNaN(rawTaxRate) || rawTaxRate < 0) {
      throw ApiError.badRequest('Tax rate must be a non-negative number.');
    }

    const allowedTaxTypes: TaxType[] = ['none', 'gst', 'vat', 'custom'];
    if (!allowedTaxTypes.includes(taxType)) {
      throw ApiError.badRequest(`Invalid tax type: ${taxType}. Allowed: ${allowedTaxTypes.join(', ')}`);
    }

    let gstTreatment: GstTreatment = taxInput.gstTreatment || 'none';
    let taxRate = rawTaxRate;
    let taxAmount = 0;
    let cgst = 0;
    let sgst = 0;
    let igst = 0;

    if (taxType === 'gst') {
      if (!taxInput.gstTreatment || taxInput.gstTreatment === 'none') {
        gstTreatment = 'intra_state';
      } else {
        gstTreatment = taxInput.gstTreatment;
      }

      const allowedGstTreatments: GstTreatment[] = ['intra_state', 'inter_state', 'exempt', 'none'];
      if (!allowedGstTreatments.includes(gstTreatment)) {
        throw ApiError.badRequest(`Invalid GST treatment: ${gstTreatment}. Allowed: ${allowedGstTreatments.join(', ')}`);
      }

      if (gstTreatment === 'exempt' || taxRate === 0) {
        taxAmount = 0;
        cgst = 0;
        sgst = 0;
        igst = 0;
      } else if (gstTreatment === 'intra_state') {
        taxAmount = round2(taxableAmount * (taxRate / 100));
        cgst = round2(taxAmount / 2);
        sgst = round2(taxAmount - cgst);
        igst = 0;
      } else if (gstTreatment === 'inter_state') {
        taxAmount = round2(taxableAmount * (taxRate / 100));
        cgst = 0;
        sgst = 0;
        igst = taxAmount;
      }
    } else if (taxType === 'vat' || taxType === 'custom') {
      gstTreatment = 'none';
      if (taxRate === 0) {
        taxAmount = 0;
      } else {
        taxAmount = round2(taxableAmount * (taxRate / 100));
      }
      cgst = 0;
      sgst = 0;
      igst = 0;
    } else {
      // 'none'
      taxRate = 0;
      gstTreatment = 'none';
      taxAmount = 0;
      cgst = 0;
      sgst = 0;
      igst = 0;
    }

    const taxDetails: ITaxDetails = {
      taxType,
      taxRate,
      gstTreatment,
      taxableAmount,
      taxAmount,
      cgst,
      sgst,
      igst,
      placeOfSupply: taxInput.placeOfSupply,
      customerGstin: taxInput.customerGstin,
    };

    const finalAmount = round2(taxableAmount + taxAmount);
    const advanceAmount = input.advanceAmount !== undefined && input.advanceAmount !== null ? round2(input.advanceAmount) : 0;

    if (advanceAmount < 0) {
      throw ApiError.badRequest('Advance amount cannot be negative.');
    }
    if (advanceAmount > finalAmount) {
      throw ApiError.badRequest('Advance amount cannot exceed the final amount.');
    }

    const remainingAmount = round2(finalAmount - advanceAmount);

    validateQuotationValidityDate(input.validUntil, event.date);

    if (!input.paymentPlan || input.paymentPlan.length === 0) {
      throw ApiError.badRequest('A payment plan with at least one installment is required.');
    }

    for (const [idx, p] of input.paymentPlan.entries()) {
      const title = (p.title || '').trim();
      if (!title) {
        throw ApiError.badRequest(`Payment installment #${idx + 1} must have a title.`);
      }
      if (typeof p.amount !== 'number' || isNaN(p.amount) || p.amount <= 0) {
        throw ApiError.badRequest(`Payment installment "${title || `#${idx + 1}`}" amount must be greater than 0.`);
      }
      if (!p.dueDate || (typeof p.dueDate === 'string' && p.dueDate.trim().length === 0) || isNaN(Date.parse(p.dueDate as any))) {
        throw ApiError.badRequest(`Payment installment "${title || `#${idx + 1}`}" requires a valid due date.`);
      }
      if (!p.expiryDate || (typeof p.expiryDate === 'string' && p.expiryDate.trim().length === 0) || isNaN(Date.parse(p.expiryDate as any))) {
        throw ApiError.badRequest(`Payment installment "${title || `#${idx + 1}`}" requires a valid expiry date.`);
      }
      if (new Date(p.expiryDate).getTime() <= new Date(p.dueDate).getTime()) {
        throw ApiError.badRequest(`Payment installment "${title || `#${idx + 1}`}" expiry date must be greater than its due date.`);
      }
    }

    // 6. Generate Quotation Number & Revision
    let quotationNumber: string;
    let revision: number;

    // One quotation thread per event: reuse the quotationNumber and atomically
    // increment the revision via the Sequence infrastructure to prevent duplicate
    // revisions under concurrent requests.
    const existingQuotations = await this.quotationRepository.findByEventId(event.id);

    if (existingQuotations.length > 0) {
      // Reuse the existing thread's quotationNumber
      quotationNumber = existingQuotations[0].quotationNumber;
      // Atomically get the next revision number (prevents concurrent duplicates)
      revision = await this.quotationRepository.getNextRevision(quotationNumber);
    } else {
      // First quotation for this event: allocate a new thread number
      quotationNumber = await this.quotationRepository.getNextQuotationNumber();
      revision = 1;
    }

    const client = await (await import('../../auth/repository/user.repository.js')).UserRepository.prototype.findById(event.clientId.toString());

    // 7. Save Quotation with full historical Tax Snapshot and Event Snapshot
    const quotation = await this.quotationRepository.create({
      quotationNumber,
      revision,
      eventId: event._id as Types.ObjectId,
      clientId: event.clientId,
      eventSnapshot: {
        title: event.title,
        eventType: event.eventType,
        date: event.date,
        startTime: event.startTime,
        endTime: event.endTime,
        location: event.location,
        guestCount: event.guestCount,
        clientName: client ? client.name : 'Unknown Client',
      },
      items: quotationItems,
      subtotal,
      discount,
      taxableAmount,
      tax: taxDetails,
      finalAmount,
      advanceAmount,
      remainingAmount,
      validUntil: input.validUntil,
      notes: input.notes,
      terms: input.terms,
      structuredTerms: (input.structuredTerms || [])
        .filter((t) => t.title?.trim() || t.content?.trim())
        .map((t) => ({
          title: (t.title || t.content || '').trim(),
          content: (t.content || '').trim(),
        })),
      schedules: (input.schedules || [])
        .filter((s) => s.title?.trim() || s.time?.trim())
        .map((s) => ({
          title: (s.title || 'Schedule').trim(),
          time: (s.time || '').trim(),
        })),
      paymentPlan: (input.paymentPlan || [])
        .filter((p) => p.title?.trim() || (p.amount !== undefined && p.amount > 0))
        .map((p) => ({
          title: (p.title || 'Installment').trim(),
          amount: Number(p.amount) || 0,
          dueDateDescription: (p.dueDateDescription || '').trim(),
          dueDate: p.dueDate && !isNaN(Date.parse(p.dueDate as any)) ? new Date(p.dueDate) : undefined,
          expiryDate: p.expiryDate && !isNaN(Date.parse(p.expiryDate as any)) ? new Date(p.expiryDate) : undefined,
          percentage: p.percentage,
          purpose: p.purpose || [],
          status: p.status || 'Pending',
        })),
      conciergeNotes: input.conciergeNotes,
      status: 'draft',
      createdBy: new Types.ObjectId(user.id),
    });

    return quotation;
  }

  async updateQuotation(
    user: { id: string; role: string },
    quotationId: string,
    input: CreateQuotationInput
  ) {
    if (user.role === 'client' || user.role === 'worker') {
      throw ApiError.forbidden('You do not have permission to update a quotation.');
    }

    const quotation = await this.quotationRepository.findById(quotationId);
    if (!quotation) {
      throw ApiError.notFound('Quotation not found.');
    }

    // Only draft quotations can be edited. Issued and historical quotations are immutable.
    if (quotation.status !== 'draft') {
      throw ApiError.badRequest('Only draft quotations can be edited. Issued and historical revisions are immutable.');
    }

    // Resource Auth
    if (user.role === 'event_manager') {
      const event = await this.eventRepository.findById(quotation.eventId.toString());
      if (!event || event.eventManagerId?.toString() !== user.id) {
        throw ApiError.forbidden('Insufficient permissions to update this quotation.');
      }
    }

    // Validate and build items
    if (!input.items || input.items.length === 0) {
      throw ApiError.badRequest('At least one line item is required.');
    }

    const quotationItems: IQuotationItem[] = [];
    let subtotal = 0;

    for (const reqItem of input.items) {
      if (reqItem.quantity < 1) {
        throw ApiError.badRequest('Quantity must be at least 1.');
      }
      if (reqItem.unitPrice <= 0) {
        throw ApiError.badRequest('Unit price must be greater than 0.');
      }

      const service = await this.serviceRepository.findById(reqItem.serviceId);
      if (!service) {
        throw ApiError.badRequest(`Service with ID ${reqItem.serviceId} not found.`);
      }
      if (!service.isActive) {
        throw ApiError.badRequest(`Service ${service.name} is currently inactive and cannot be quoted.`);
      }

      const amount = round2(reqItem.quantity * reqItem.unitPrice);
      subtotal = round2(subtotal + amount);

      quotationItems.push({
        serviceId: service._id as Types.ObjectId,
        name: service.name,
        description: service.description,
        pricingType: service.pricingType,
        requirements: reqItem.requirements,
        scope: reqItem.scope,
        detailedContent: (reqItem.detailedContent || [])
          .filter((s) => s.sectionName?.trim() || s.items?.some((x) => x?.trim()))
          .map((s) => ({
            sectionName: (s.sectionName?.trim() || 'Details'),
            items: (s.items || []).filter((x) => typeof x === 'string' && x.trim().length > 0),
          })),
        quantity: reqItem.quantity,
        unitPrice: reqItem.unitPrice,
        amount,
      });
    }

    // Financial validations & Tax calculations
    const discount = input.discount !== undefined && input.discount !== null ? round2(input.discount) : 0;
    if (discount < 0) {
      throw ApiError.badRequest('Discount cannot be negative.');
    }
    if (discount > subtotal) {
      throw ApiError.badRequest('Discount cannot exceed the subtotal.');
    }

    const taxableAmount = round2(subtotal - discount);

    const taxInput = input.tax || {};
    const taxType: TaxType = taxInput.taxType || 'none';
    const rawTaxRate = taxInput.taxRate !== undefined && taxInput.taxRate !== null ? Number(taxInput.taxRate) : 0;

    if (isNaN(rawTaxRate) || rawTaxRate < 0) {
      throw ApiError.badRequest('Tax rate must be a non-negative number.');
    }

    const allowedTaxTypes: TaxType[] = ['none', 'gst', 'vat', 'custom'];
    if (!allowedTaxTypes.includes(taxType)) {
      throw ApiError.badRequest(`Invalid tax type: ${taxType}. Allowed: ${allowedTaxTypes.join(', ')}`);
    }

    let gstTreatment: GstTreatment = taxInput.gstTreatment || 'none';
    let taxRate = rawTaxRate;
    let taxAmount = 0;
    let cgst = 0;
    let sgst = 0;
    let igst = 0;

    if (taxType === 'gst') {
      if (!taxInput.gstTreatment || taxInput.gstTreatment === 'none') {
        gstTreatment = 'intra_state';
      } else {
        gstTreatment = taxInput.gstTreatment;
      }

      const allowedGstTreatments: GstTreatment[] = ['intra_state', 'inter_state', 'exempt', 'none'];
      if (!allowedGstTreatments.includes(gstTreatment)) {
        throw ApiError.badRequest(`Invalid GST treatment: ${gstTreatment}. Allowed: ${allowedGstTreatments.join(', ')}`);
      }

      if (gstTreatment === 'exempt' || taxRate === 0) {
        taxAmount = 0;
        cgst = 0;
        sgst = 0;
        igst = 0;
      } else if (gstTreatment === 'intra_state') {
        taxAmount = round2(taxableAmount * (taxRate / 100));
        cgst = round2(taxAmount / 2);
        sgst = round2(taxAmount - cgst);
        igst = 0;
      } else if (gstTreatment === 'inter_state') {
        taxAmount = round2(taxableAmount * (taxRate / 100));
        cgst = 0;
        sgst = 0;
        igst = taxAmount;
      }
    } else if (taxType === 'vat' || taxType === 'custom') {
      gstTreatment = 'none';
      if (taxRate === 0) {
        taxAmount = 0;
      } else {
        taxAmount = round2(taxableAmount * (taxRate / 100));
      }
      cgst = 0;
      sgst = 0;
      igst = 0;
    } else {
      taxRate = 0;
      gstTreatment = 'none';
      taxAmount = 0;
      cgst = 0;
      sgst = 0;
      igst = 0;
    }

    const taxDetails: ITaxDetails = {
      taxType,
      taxRate,
      gstTreatment,
      taxableAmount,
      taxAmount,
      cgst,
      sgst,
      igst,
      placeOfSupply: taxInput.placeOfSupply,
      customerGstin: taxInput.customerGstin,
    };

    const finalAmount = round2(taxableAmount + taxAmount);
    const advanceAmount = input.advanceAmount !== undefined && input.advanceAmount !== null ? round2(input.advanceAmount) : 0;

    if (advanceAmount < 0) {
      throw ApiError.badRequest('Advance amount cannot be negative.');
    }
    if (advanceAmount > finalAmount) {
      throw ApiError.badRequest('Advance amount cannot exceed the final amount.');
    }

    const remainingAmount = round2(finalAmount - advanceAmount);

    quotation.items = quotationItems;
    quotation.subtotal = subtotal;
    quotation.discount = discount;
    quotation.taxableAmount = taxableAmount;
    quotation.tax = taxDetails;
    quotation.finalAmount = finalAmount;
    quotation.advanceAmount = advanceAmount;
    quotation.remainingAmount = remainingAmount;
    if (input.validUntil !== undefined) {
      const eventDate = quotation.eventSnapshot?.date || (await this.eventRepository.findById(quotation.eventId.toString()))?.date;
      validateQuotationValidityDate(input.validUntil, eventDate);
      quotation.validUntil = input.validUntil;
    }
    if (input.notes !== undefined) quotation.notes = input.notes;
    if (input.terms !== undefined) quotation.terms = input.terms;
    if (input.structuredTerms !== undefined) {
      quotation.structuredTerms = (input.structuredTerms || [])
        .filter((t) => t.title?.trim() || t.content?.trim())
        .map((t) => ({
          title: (t.title || t.content || '').trim(),
          content: (t.content || '').trim(),
        }));
    }
    if (input.schedules !== undefined) {
      quotation.schedules = (input.schedules || [])
        .filter((s) => s.title?.trim() || s.time?.trim())
        .map((s) => ({
          title: (s.title || 'Schedule').trim(),
          time: (s.time || '').trim(),
        }));
    }
    if (input.paymentPlan !== undefined) {
      if (!input.paymentPlan || input.paymentPlan.length === 0) {
        throw ApiError.badRequest('A payment plan with at least one installment is required.');
      }
      for (const [idx, p] of input.paymentPlan.entries()) {
        const title = (p.title || '').trim();
        if (!title) {
          throw ApiError.badRequest(`Payment installment #${idx + 1} must have a title.`);
        }
        if (typeof p.amount !== 'number' || isNaN(p.amount) || p.amount <= 0) {
          throw ApiError.badRequest(`Payment installment "${title || `#${idx + 1}`}" amount must be greater than 0.`);
        }
        if (!p.dueDate || (typeof p.dueDate === 'string' && p.dueDate.trim().length === 0) || isNaN(Date.parse(p.dueDate as any))) {
          throw ApiError.badRequest(`Payment installment "${title || `#${idx + 1}`}" requires a valid due date.`);
        }
        if (!p.expiryDate || (typeof p.expiryDate === 'string' && p.expiryDate.trim().length === 0) || isNaN(Date.parse(p.expiryDate as any))) {
          throw ApiError.badRequest(`Payment installment "${title || `#${idx + 1}`}" requires a valid expiry date.`);
        }
        if (new Date(p.expiryDate).getTime() <= new Date(p.dueDate).getTime()) {
          throw ApiError.badRequest(`Payment installment "${title || `#${idx + 1}`}" expiry date must be greater than its due date.`);
        }
      }
      quotation.paymentPlan = input.paymentPlan.map((p) => ({
        title: p.title.trim(),
        amount: Number(p.amount) || 0,
        dueDateDescription: (p.dueDateDescription || '').trim(),
        dueDate: p.dueDate && !isNaN(Date.parse(p.dueDate as any)) ? new Date(p.dueDate) : undefined,
        expiryDate: p.expiryDate && !isNaN(Date.parse(p.expiryDate as any)) ? new Date(p.expiryDate) : undefined,
        percentage: p.percentage,
        purpose: p.purpose || [],
        status: p.status || 'Pending',
      }));
    }
    if (input.conciergeNotes !== undefined) quotation.conciergeNotes = input.conciergeNotes;

    await quotation.save();
    return quotation;
  }

  async getAllQuotations(user: { id: string; role: string }) {
    if (user.role !== 'admin') {
      throw ApiError.forbidden('Only administrators can list all quotations.');
    }
    return this.quotationRepository.findAll();
  }

  async getQuotationsByEvent(user: { id: string; role: string }, eventId: string) {
    const event = await this.eventRepository.findById(eventId);
    if (!event) {
      throw ApiError.notFound('Event not found.');
    }

    if (user.role === 'worker') {
      throw ApiError.forbidden('Workers cannot access quotations.');
    }

    // Resource Auth
    authorizeResourceAccess(user, [
      event.clientId.toString(),
      event.eventManagerId?.toString(),
    ]);

    return this.quotationRepository.findByEventId(eventId);
  }

  async getQuotationsByClient(user: { id: string; role: string }) {
    if (user.role !== 'client') {
      throw ApiError.forbidden('Only clients can fetch their quotations.');
    }
    return this.quotationRepository.findByClientId(user.id);
  }

  async getQuotationById(user: { id: string; role: string }, quotationId: string) {
    const quotation = await this.quotationRepository.findById(quotationId);
    if (!quotation) {
      throw ApiError.notFound('Quotation not found.');
    }

    if (user.role === 'worker') {
      throw ApiError.forbidden('Workers cannot access quotations.');
    }

    authorizeResourceAccess(user, [
      quotation.clientId.toString(),
    ]);
    
    if (user.role === 'event_manager') {
      const event = await this.eventRepository.findById(quotation.eventId.toString());
      if (!event || event.eventManagerId?.toString() !== user.id) {
        throw ApiError.forbidden('Insufficient permissions to view this quotation.');
      }
    }

    return quotation;
  }

  async sendQuotation(user: { id: string; role: string }, quotationId: string) {
    if (user.role === 'client' || user.role === 'worker') {
      throw ApiError.forbidden('You do not have permission to send a quotation.');
    }

    const quotation = await this.quotationRepository.findById(quotationId);
    if (!quotation) {
      throw ApiError.notFound('Quotation not found.');
    }

    // Resource Auth
    if (user.role === 'event_manager') {
      const event = await this.eventRepository.findById(quotation.eventId.toString());
      if (!event || event.eventManagerId?.toString() !== user.id) {
        throw ApiError.forbidden('Insufficient permissions to send this quotation.');
      }
    }

    if (quotation.status !== 'draft') {
      throw ApiError.badRequest('Only draft quotations can be sent.');
    }

    // Validate all services have price > 0
    const zeroPriceItem = quotation.items.find((item) => !item.unitPrice || item.unitPrice <= 0 || !item.amount || item.amount <= 0);
    if (zeroPriceItem) {
      throw ApiError.badRequest(`Cannot issue quotation: Price for "${zeroPriceItem.name}" must be greater than 0.`);
    }

    // Validate quotation validity
    const eventDate = quotation.eventSnapshot?.date || (await this.eventRepository.findById(quotation.eventId.toString()))?.date;
    validateQuotationValidityDate(quotation.validUntil, eventDate);

    // Validate payment plan
    if (!quotation.paymentPlan || quotation.paymentPlan.length === 0) {
      throw ApiError.badRequest('Cannot issue quotation: A payment plan with at least one installment is required.');
    }
    const invalidInstallment = quotation.paymentPlan.find(
      (p) => !p.amount || p.amount <= 0 || !p.dueDate || !p.expiryDate || new Date(p.expiryDate).getTime() <= new Date(p.dueDate).getTime()
    );
    if (invalidInstallment) {
      if (!invalidInstallment.amount || invalidInstallment.amount <= 0) {
        throw ApiError.badRequest(`Cannot issue quotation: Payment installment "${invalidInstallment.title}" amount must be greater than 0.`);
      }
      if (!invalidInstallment.dueDate) {
        throw ApiError.badRequest(`Cannot issue quotation: Payment installment "${invalidInstallment.title}" requires a valid due date.`);
      }
      if (!invalidInstallment.expiryDate) {
        throw ApiError.badRequest(`Cannot issue quotation: Payment installment "${invalidInstallment.title}" requires a valid expiry date.`);
      }
      if (new Date(invalidInstallment.expiryDate).getTime() <= new Date(invalidInstallment.dueDate).getTime()) {
        throw ApiError.badRequest(`Cannot issue quotation: Payment installment "${invalidInstallment.title}" expiry date must be greater than its due date.`);
      }
    }

    quotation.status = 'sent';
    return quotation.save();
  }

  async acceptQuotation(user: { id: string; role: string }, quotationId: string) {
    if (user.role !== 'client') {
      throw ApiError.forbidden('Only the client can accept a quotation.');
    }

    const quotation = await this.quotationRepository.findById(quotationId);
    if (!quotation) {
      throw ApiError.notFound('Quotation not found.');
    }

    // Resource Auth
    if (quotation.clientId.toString() !== user.id) {
      throw ApiError.forbidden('You do not own this quotation.');
    }

    if (quotation.status !== 'sent' && quotation.status !== 'awaiting_approval') {
      throw ApiError.badRequest('Quotation is not in a reviewable state.');
    }

    if (quotation.validUntil && new Date() > new Date(quotation.validUntil)) {
      throw ApiError.badRequest('This quotation has expired.');
    }

    const latest = await this.quotationRepository.getLatestRevision(quotation.quotationNumber);
    if (latest && latest.revision !== quotation.revision) {
      throw ApiError.badRequest('Historical revisions cannot be accepted.');
    }

    quotation.status = 'accepted';
    await quotation.save();

    // Update Event status
    const event = await this.eventRepository.findById(quotation.eventId.toString());
    if (event) {
      event.status = 'awaiting_payment';
      await event.save();
    }

    return quotation;
  }

  async rejectQuotation(user: { id: string; role: string }, quotationId: string, reason?: string) {
    if (user.role !== 'client') {
      throw ApiError.forbidden('Only the client can reject a quotation.');
    }

    const quotation = await this.quotationRepository.findById(quotationId);
    if (!quotation) {
      throw ApiError.notFound('Quotation not found.');
    }

    if (quotation.clientId.toString() !== user.id) {
      throw ApiError.forbidden('You do not own this quotation.');
    }

    if (quotation.status !== 'sent' && quotation.status !== 'awaiting_approval') {
      throw ApiError.badRequest('Quotation is not in a reviewable state.');
    }

    const latest = await this.quotationRepository.getLatestRevision(quotation.quotationNumber);
    if (latest && latest.revision !== quotation.revision) {
      throw ApiError.badRequest('Historical revisions cannot be modified.');
    }

    quotation.status = 'rejected';
    if (reason && typeof reason === 'string') {
      quotation.rejectionReason = reason.trim();
    }
    return quotation.save();
  }

  async requestChangesQuotation(user: { id: string; role: string }, quotationId: string, reason?: string) {
    if (user.role !== 'client') {
      throw ApiError.forbidden('Only the client can request changes to a quotation.');
    }

    const quotation = await this.quotationRepository.findById(quotationId);
    if (!quotation) {
      throw ApiError.notFound('Quotation not found.');
    }

    if (quotation.clientId.toString() !== user.id) {
      throw ApiError.forbidden('You do not own this quotation.');
    }

    if (quotation.status !== 'sent' && quotation.status !== 'awaiting_approval') {
      throw ApiError.badRequest('Quotation is not in a reviewable state.');
    }

    if (quotation.validUntil && new Date() > new Date(quotation.validUntil)) {
      throw ApiError.badRequest('This quotation has expired and cannot be modified.');
    }

    const latest = await this.quotationRepository.getLatestRevision(quotation.quotationNumber);
    if (latest && latest.revision !== quotation.revision) {
      throw ApiError.badRequest('Historical revisions cannot be modified.');
    }

    quotation.status = 'changes_requested';
    if (reason && typeof reason === 'string') {
      quotation.clientNotes = reason.trim();
    }
    return quotation.save();
  }
}
