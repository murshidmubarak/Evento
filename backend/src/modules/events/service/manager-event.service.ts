import { EventRepository } from '../repository/event.repository.js';
import type { IEvent } from '../model/event.model.js';
import { ApiError } from '../../../utils/ApiError.js';

export class ManagerEventService {
  private eventRepository: EventRepository;

  constructor() {
    this.eventRepository = new EventRepository();
  }

  async getManagerDashboardStats(managerId: string): Promise<any> {
    return this.eventRepository.getManagerDashboardStats(managerId);
  }

  async getManagerEvents(managerId: string, query: any): Promise<IEvent[]> {
    const filters: any = {};
    if (query.status) {
      filters.status = query.status;
    }
    if (query.date) {
      filters.date = query.date;
    }
    if (query.startDate) {
      filters.startDate = query.startDate;
    }
    if (query.endDate) {
      filters.endDate = query.endDate;
    }

    return this.eventRepository.findByManagerId(managerId, filters);
  }
  async getManagerEventById(managerId: string, eventId: string): Promise<IEvent> {
    const event = await this.eventRepository.findByIdWithDetails(eventId);
    if (!event) {
      throw ApiError.notFound('Event not found');
    }

    const assignedManagerId = (event.eventManagerId as any)?._id?.toString() || event.eventManagerId?.toString();
    if (assignedManagerId !== managerId) {
      throw ApiError.forbidden('You do not have permission to access this event');
    }

    return event;
  }
}
