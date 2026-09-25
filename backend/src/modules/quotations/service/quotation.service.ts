import { Types } from 'mongoose';
import { QuotationRepository } from '../repository/quotation.repository.js';
import { EventRepository } from '../../events/repository/event.repository.js';
import { ServiceRepository } from '../../services/repository/service.repository.js';
import { ApiError } from '../../../utils/ApiError.js';
import { authorizeResourceAccess } from '../../../utils/resourceAuthorization.js';
import { IQuotationItem } from '../model/quotation.model.js';

export interface CreateQuotationInput {
  eventId: string;
  items: {
    serviceId: string;
    quantity: number;
    unitPrice: number;
    requirements?: string;
  }[];
  discount: number;
  advanceAmount: number;
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

      const amount = reqItem.quantity * reqItem.unitPrice;
      subtotal += amount;

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

    // 5. Financial validations
    const discount = input.discount || 0;
    if (discount < 0) {
      throw ApiError.badRequest('Discount cannot be negative.');
    }
    if (discount > subtotal) {
      throw ApiError.badRequest('Discount cannot exceed the subtotal.');
    }

    const finalAmount = subtotal - discount;
    const advanceAmount = input.advanceAmount || 0;

    if (advanceAmount < 0) {
      throw ApiError.badRequest('Advance amount cannot be negative.');
    }
    if (advanceAmount > finalAmount) {
      throw ApiError.badRequest('Advance amount cannot exceed the final amount.');
    }

    const remainingAmount = finalAmount - advanceAmount;

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
      // Pre-seed the revision sequence at 1 so subsequent calls correctly start at 2
      // (getNextRevision uses startValue=2, so the first call after seeding returns 2)
    }

    // 7. Save Quotation
    const quotation = await this.quotationRepository.create({
      quotationNumber,
      revision,
      eventId: event._id as Types.ObjectId,
      clientId: event.clientId,
      items: quotationItems,
      subtotal,
      discount,
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
      // We also need eventManager check. Quotation doesn't have eventManagerId, so we get it via Event.
    ]);
    
    // Wait, the client is checked by clientId. But what about Event Manager?
    // If the user is an event manager, we need to verify they own the Event.
    if (user.role === 'event_manager') {
      const event = await this.eventRepository.findById(quotation.eventId.toString());
      if (!event || event.eventManagerId?.toString() !== user.id) {
        throw ApiError.forbidden('Insufficient permissions to view this quotation.');
      }
    }

    return quotation;
  }
}
