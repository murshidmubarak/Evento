import { EventRepository } from '../repository/event.repository.js';
import { ServiceRepository } from '../../services/repository/service.repository.js';
import { ApiError } from '../../../utils/ApiError.js';
import type { IEvent } from '../model/event.model.js';

export class EventService {
  private eventRepository: EventRepository;
  private serviceRepository: ServiceRepository;

  constructor() {
    this.eventRepository = new EventRepository();
    this.serviceRepository = new ServiceRepository();
  }

  async createEvent(clientId: string, data: any): Promise<IEvent> {
    // Validate that all selected services exist and are active
    if (data.selectedServices && Array.isArray(data.selectedServices)) {
      for (const serviceId of data.selectedServices) {
        const service = await this.serviceRepository.findById(serviceId);
        if (!service) {
          throw ApiError.badRequest(`Service with ID ${serviceId} not found`);
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
      date: new Date(data.date),
      startTime: data.startTime,
      endTime: data.endTime,
      notes: data.notes,
      location: data.location,
      guestCount: data.guestCount,
      budget: data.budget,
      selectedServices: data.selectedServices || [],
      status: 'requested',
    };

    return this.eventRepository.create(eventData);
  }

  async getClientEvents(clientId: string): Promise<IEvent[]> {
    return this.eventRepository.findByClientId(clientId);
  }

  async getClientEventById(clientId: string, eventId: string): Promise<IEvent> {
    const event = await this.eventRepository.findById(eventId);
    if (!event) {
      throw ApiError.notFound('Event not found');
    }

    if (event.clientId.toString() !== clientId) {
      throw ApiError.forbidden('You do not have permission to access this event');
    }

    return event;
  }
}
