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
  }[];
  discount?: number;
  advanceAmount?: number;
  tax?: CreateQuotationTaxInput;
  validUntil?: Date;
  notes?: string;
  terms?: string;
}

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
      if (reqItem.unitPrice < 0) {
        throw ApiError.badRequest('Unit price cannot be negative.');
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

    // 7. Save Quotation with full historical Tax Snapshot
    const quotation = await this.quotationRepository.create({
      quotationNumber,
      revision,
      eventId: event._id as Types.ObjectId,
      clientId: event.clientId,
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
      status: 'draft',
      createdBy: new Types.ObjectId(user.id),
    });

    return quotation;
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

  async rejectQuotation(user: { id: string; role: string }, quotationId: string) {
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
    return quotation.save();
  }

  async requestChangesQuotation(user: { id: string; role: string }, quotationId: string) {
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
    return quotation.save();
  }
}
