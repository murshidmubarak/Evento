import { EventRepository } from '../repository/event.repository.js';
import { ServiceRepository } from '../../services/repository/service.repository.js';
import { MediaRepository } from '../../media/repository/media.repository.js';
import { ApiError } from '../../../utils/ApiError.js';
import type { IEvent } from '../model/event.model.js';

export class EventService {
  private eventRepository: EventRepository;
  private serviceRepository: ServiceRepository;
  private mediaRepository: MediaRepository;

  constructor() {
    this.eventRepository = new EventRepository();
    this.serviceRepository = new ServiceRepository();
    this.mediaRepository = new MediaRepository();
  }

  async createEvent(clientId: string, data: any): Promise<IEvent> {
    // Validate that all selected services exist and are active
    if (data.selectedServices && Array.isArray(data.selectedServices)) {
      for (const item of data.selectedServices) {
        const serviceId = item.serviceId;
        let service = serviceId ? await this.serviceRepository.findById(serviceId) : null;
        if (!service && item.name) {
          service = await this.serviceRepository.findByName(item.name);
          if (service) {
            item.serviceId = service._id.toString();
          }
        }
        if (!service) {
          throw ApiError.badRequest(`Service with ID ${serviceId || item.name} not found`);
        }
        if (!service.isActive) {
          throw ApiError.badRequest(`Service '${service.name}' is currently inactive and cannot be selected`);
        }
      }
    }

    // Force ownership and initial status
    const eventData: Partial<IEvent> = {
      clientId: clientId as any, // Cast appropriately
      title: data.title,
      eventType: data.eventType,
      customEventType: data.eventType === 'Other' && data.customEventType ? String(data.customEventType).trim() : undefined,
      date: new Date(data.date),
      startTime: data.startTime,
      endTime: data.endTime,
      notes: data.notes,
      clientInfo: data.clientInfo,
      location: data.location,
      guestCount: data.guestCount,
      budget: data.budget,
      selectedServices: (data.selectedServices || []).map((s: any) => {
        const preferences = s.preferences ? { ...s.preferences } : {};
        if (Array.isArray(preferences.requirements)) {
          preferences.requirements = preferences.requirements
            .map((r: any) => typeof r === 'object' && r !== null ? {
              title: (r.title || '').trim(),
              description: (r.description || '').trim()
            } : r)
            .filter((r: any) => typeof r === 'string' ? r.trim().length > 0 : Boolean(r && (r.title || r.description)));
          if (preferences.requirements.length === 0) delete preferences.requirements;
        }
        if (Array.isArray(preferences.otherRequirements)) {
          preferences.otherRequirements = preferences.otherRequirements
            .map((r: any) => typeof r === 'object' && r !== null ? {
              title: (r.title || '').trim(),
              description: (r.description || '').trim()
            } : r)
            .filter((r: any) => typeof r === 'string' ? r.trim().length > 0 : Boolean(r && (r.title || r.description)));
          if (preferences.otherRequirements.length === 0) delete preferences.otherRequirements;
        }
        return {
          serviceId: s.serviceId,
          preferences
        };
      }),
      status: 'requested',
    };

    return this.eventRepository.create(eventData);
  }

  async getClientEvents(clientId: string): Promise<IEvent[]> {
    return this.eventRepository.findByClientId(clientId);
  }

  async getAllEvents(role: string, filters: any = {}): Promise<IEvent[]> {
    if (role !== 'admin') {
      throw ApiError.forbidden('Only admins can view all events');
    }
    return this.eventRepository.findAll(filters);
  }

  async getEventById(userId: string, role: string, eventId: string): Promise<IEvent> {
    const event = await this.eventRepository.findById(eventId);
    if (!event) {
      throw ApiError.notFound('Event not found');
    }

    if (role === 'client' && event.clientId.toString() !== userId) {
      throw ApiError.forbidden('You do not have permission to access this event');
    }

    if (role === 'event_manager' && event.eventManagerId?.toString() !== userId) {
      throw ApiError.forbidden('You do not have permission to access this event');
    }

    // Admins have full access to all events

    // Fetch media associated with this event
    const mediaRecords = await this.mediaRepository.findByEvent(eventId);

    // Enrich the selectedServices response
    const enrichedEvent = event.toObject ? event.toObject() : JSON.parse(JSON.stringify(event));

    if (enrichedEvent.selectedServices && Array.isArray(enrichedEvent.selectedServices)) {
      enrichedEvent.selectedServices = enrichedEvent.selectedServices.map((ss: any) => {
        // serviceId is populated by repository
        const srv = ss.serviceId || {};
        const serviceIdValue = srv._id ? srv._id.toString() : srv.toString();
        
        // Find reference images for this specific service
        const referenceImages = mediaRecords
          .filter(m => m.serviceId.toString() === serviceIdValue)
          .map(m => ({
            url: m.url,
            publicId: m.publicId,
            fileName: m.fileName,
            mimeType: m.mimeType
          }));

        return {
          serviceId: serviceIdValue,
          serviceName: srv.name,
          serviceDescription: srv.description,
          pricingType: srv.pricingType,
          basePrice: srv.basePrice,
          preferences: ss.preferences || {},
          referenceImages: referenceImages.length > 0 ? referenceImages : []
        };
      });
    }

    return enrichedEvent as any;
  }
}
