import { ApiError } from '../../../utils/ApiError.js';
import { EventRepository } from '../repository/event.repository.js';
import { UserRepository } from '../../auth/repository/user.repository.js';
import type { IEvent } from '../model/event.model.js';
import type { IUser } from '../../auth/model/user.model.js';

export class AdminEventService {
  private eventRepository: EventRepository;
  private userRepository: UserRepository;

  constructor() {
    this.eventRepository = new EventRepository();
    this.userRepository = new UserRepository();
  }

  /**
   * Helper to determine if two time ranges overlap.
   * Assumes time strings are in 'HH:mm' format and fall on the same day.
   */
  private isOverlapping(start1: string, end1: string, start2: string, end2: string): boolean {
    return start1 < end2 && end1 > start2;
  }

  /**
   * Get eligible Event Managers for a given event.
   */
  async getAvailableManagers(eventId: string): Promise<IUser[]> {
    const event = await this.eventRepository.findById(eventId);
    if (!event) {
      throw ApiError.notFound('Event not found');
    }

    // 1. Determine the start and end of the event's day to query conflicting events
    const eventDate = new Date(event.date);
    const startOfDay = new Date(eventDate);
    startOfDay.setUTCHours(0, 0, 0, 0);

    const endOfDay = new Date(eventDate);
    endOfDay.setUTCHours(23, 59, 59, 999);

    // 2. Fetch all active events with a manager assigned on this day
    const sameDayEvents = await this.eventRepository.findActiveAssignedEventsForDateRange(startOfDay, endOfDay);

    // 3. Filter overlapping events and collect busy manager IDs
    const busyManagerIds = new Set<string>();

    for (const otherEvent of sameDayEvents) {
      // Don't conflict with itself if we are checking reassignment
      if (otherEvent.id === event.id) continue;

      if (this.isOverlapping(event.startTime, event.endTime, otherEvent.startTime, otherEvent.endTime)) {
        if (otherEvent.eventManagerId) {
          busyManagerIds.add(otherEvent.eventManagerId.toString());
        }
      }
    }

    // 4. Query active Event Managers excluding the busy ones
    const availableManagers = await this.userRepository.findActiveEventManagers(Array.from(busyManagerIds));

    return availableManagers;
  }

  /**
   * Assign an Event Manager to a confirmed Event.
   */
  async assignManager(eventId: string, eventManagerId: string): Promise<IEvent> {
    const event = await this.eventRepository.findById(eventId);
    if (!event) {
      throw ApiError.notFound('Event not found');
    }

    // Only confirmed events can have a manager assigned (or events further along if reassignment)
    if (event.status === 'requested' || event.status === 'quoted' || event.status === 'awaiting_payment') {
      throw ApiError.badRequest('Event must be confirmed before assigning a manager');
    }
    
    if (event.status === 'completed' || event.status === 'cancelled') {
      throw ApiError.badRequest(`Cannot assign manager to a ${event.status} event`);
    }

    // Validate the target manager
    const targetManager = await this.userRepository.findById(eventManagerId);
    if (!targetManager) {
      throw ApiError.notFound('Event Manager not found');
    }
    if (targetManager.role !== 'event_manager') {
      throw ApiError.forbidden('User is not an Event Manager');
    }
    if (!targetManager.isActive) {
      throw ApiError.badRequest('Event Manager is inactive');
    }

    // Same-event protection / idempotent check
    if (event.eventManagerId?.toString() === eventManagerId) {
      return event;
    }

    // Check availability at the time of assignment
    const eventDate = new Date(event.date);
    const startOfDay = new Date(eventDate);
    startOfDay.setUTCHours(0, 0, 0, 0);

    const endOfDay = new Date(eventDate);
    endOfDay.setUTCHours(23, 59, 59, 999);

    const sameDayEvents = await this.eventRepository.findActiveAssignedEventsForDateRange(startOfDay, endOfDay);

    for (const otherEvent of sameDayEvents) {
      if (otherEvent.id === event.id) continue;

      if (otherEvent.eventManagerId?.toString() === eventManagerId) {
        if (this.isOverlapping(event.startTime, event.endTime, otherEvent.startTime, otherEvent.endTime)) {
          throw ApiError.badRequest('Event Manager is busy during this event time');
        }
      }
    }

    // Assign the manager
    event.eventManagerId = targetManager._id;
    return await event.save() as unknown as Promise<IEvent>;
  }
}
