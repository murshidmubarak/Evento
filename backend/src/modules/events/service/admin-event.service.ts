import { ApiError } from '../../../utils/ApiError.js';
import { EventRepository } from '../repository/event.repository.js';
import { UserRepository } from '../../auth/repository/user.repository.js';
import { Event, type IEvent } from '../model/event.model.js';
import type { IUser } from '../../auth/model/user.model.js';

export interface ManagerSameDayAssignment {
  eventId: string;
  title: string;
  startTime: string;
  endTime: string;
  location?: string;
}

export interface ManagerAvailabilityDTO {
  _id: string;
  name: string;
  email: string;
  businessId?: string;
  isActive: boolean;
  status?: string;
  isOverlapping: boolean;
  hasWorkOnDay: boolean;
  sameDayAssignments: ManagerSameDayAssignment[];
}

export class AdminEventService {
  private eventRepository: EventRepository;
  private userRepository: UserRepository;

  constructor() {
    this.eventRepository = new EventRepository();
    this.userRepository = new UserRepository();
  }

  /**
   * Converts 'HH:mm' string to minutes from midnight.
   * Resilient to 24h ('14:30') or 12h ('2:30 PM') formats and extra spaces.
   */
  private toMinutes(timeStr: string): number {
    if (!timeStr) return 0;
    const clean = timeStr.trim().toLowerCase();
    const isPM = clean.includes('pm');
    const isAM = clean.includes('am');
    const stripped = clean.replace(/[^\d:]/g, '');
    const parts = stripped.split(':');
    let hours = parseInt(parts[0], 10) || 0;
    const minutes = parseInt(parts[1], 10) || 0;
    if (isPM && hours < 12) hours += 12;
    if (isAM && hours === 12) hours = 0;
    return hours * 60 + minutes;
  }

  /**
   * Helper to check if two dates fall on the same calendar day.
   */
  private isSameDay(d1: Date | string, d2: Date | string): boolean {
    const date1 = new Date(d1);
    const date2 = new Date(d2);
    // Compare YYYY-MM-DD in UTC
    const y1 = date1.getUTCFullYear();
    const m1 = date1.getUTCMonth();
    const day1 = date1.getUTCDate();

    const y2 = date2.getUTCFullYear();
    const m2 = date2.getUTCMonth();
    const day2 = date2.getUTCDate();

    if (y1 === y2 && m1 === m2 && day1 === day2) return true;

    // Also compare local day in case one was stored with local timezone offset
    return (
      date1.getFullYear() === date2.getFullYear() &&
      date1.getMonth() === date2.getMonth() &&
      date1.getDate() === date2.getDate()
    );
  }

  /**
   * Helper to determine if two time ranges overlap.
   * Assumes time strings are in 'HH:mm' format and fall on the same day.
   * Overlap occurs when: start1 < end2 && end1 > start2.
   */
  private isOverlapping(start1: string, end1: string, start2: string, end2: string): boolean {
    const s1 = this.toMinutes(start1);
    const e1 = this.toMinutes(end1);
    const s2 = this.toMinutes(start2);
    const e2 = this.toMinutes(end2);
    return s1 < e2 && e1 > s2;
  }

  /**
   * Get eligible Event Managers for a given event, including their same-day schedule.
   */
  async getAvailableManagers(eventId: string): Promise<ManagerAvailabilityDTO[]> {
    const event = await this.eventRepository.findById(eventId);
    if (!event) {
      throw ApiError.notFound('Event not found');
    }

    // 1. Determine the start and end of the event's day to query conflicting events (with 12h buffer for timezone differences)
    const eventDate = new Date(event.date);
    const startOfDay = new Date(eventDate);
    startOfDay.setUTCHours(0, 0, 0, 0);
    const queryStart = new Date(startOfDay.getTime() - 12 * 60 * 60 * 1000);
    const queryEnd = new Date(startOfDay.getTime() + 36 * 60 * 60 * 1000);

    // 2. Fetch all active events with a manager assigned on this day
    const candidateEvents = await this.eventRepository.findActiveAssignedEventsForDateRange(queryStart, queryEnd);
    const sameDayEvents = candidateEvents.filter((other) => this.isSameDay(event.date, other.date));

    // 3. Query all active Event Managers (no pending invitation)
    const activeManagers = await this.userRepository.findActiveEventManagers([]);

    // 4. Map same-day assignments & check for overlapping time conflicts
    const managersWithSchedule: ManagerAvailabilityDTO[] = activeManagers.map((m) => {
      const assignments: ManagerSameDayAssignment[] = sameDayEvents
        .filter((other) => other.id !== event.id && other.eventManagerId?.toString() === m._id.toString())
        .map((other) => ({
          eventId: other.id,
          title: other.title,
          startTime: other.startTime,
          endTime: other.endTime,
          location: other.location?.address || '',
        }));

      const isOverlapping = assignments.some((other) =>
        this.isOverlapping(event.startTime, event.endTime, other.startTime, other.endTime)
      );

      return {
        _id: m._id.toString(),
        name: m.name,
        email: m.email,
        businessId: m.businessId,
        isActive: m.isActive,
        status: (m as any).status || 'active',
        isOverlapping,
        hasWorkOnDay: assignments.length > 0,
        sameDayAssignments: assignments,
      };
    });

    // 5. Sort:
    // 1. Available & completely free on that day
    // 2. Available with other work on that day (non-overlapping)
    // 3. Busy (overlapping)
    return managersWithSchedule.sort((a, b) => {
      if (a.isOverlapping !== b.isOverlapping) return a.isOverlapping ? 1 : -1;
      if (a.hasWorkOnDay !== b.hasWorkOnDay) return a.hasWorkOnDay ? 1 : -1;
      return (a.name || '').localeCompare(b.name || '');
    });
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
    const targetManager = await this.userRepository.findByIdWithInvitation(eventManagerId);
    if (!targetManager) {
      throw ApiError.notFound('Event Manager not found');
    }
    if (targetManager.role !== 'event_manager') {
      throw ApiError.forbidden('User is not an Event Manager');
    }
    if (!targetManager.isActive || (targetManager as any).invitationTokenHash) {
      throw ApiError.badRequest('Event Manager is inactive or has a pending invitation');
    }

    // Same-event protection / idempotent check
    if (event.eventManagerId?.toString() === eventManagerId) {
      return event;
    }

    // Check availability at the time of assignment
    const eventDate = new Date(event.date);
    const startOfDay = new Date(eventDate);
    startOfDay.setUTCHours(0, 0, 0, 0);
    const queryStart = new Date(startOfDay.getTime() - 12 * 60 * 60 * 1000);
    const queryEnd = new Date(startOfDay.getTime() + 36 * 60 * 60 * 1000);

    const candidateEvents = await this.eventRepository.findActiveAssignedEventsForDateRange(queryStart, queryEnd);
    const sameDayEvents = candidateEvents.filter((other) => this.isSameDay(event.date, other.date));

    for (const otherEvent of sameDayEvents) {
      if (otherEvent.id === event.id) continue;

      if (otherEvent.eventManagerId?.toString() === eventManagerId) {
        if (this.isOverlapping(event.startTime, event.endTime, otherEvent.startTime, otherEvent.endTime)) {
          throw ApiError.badRequest(
            `Event Manager is busy during this event time: scheduling conflict with "${otherEvent.title || 'another event'}" (${otherEvent.startTime} – ${otherEvent.endTime}) on this date.`
          );
        }
      }
    }

    // Atomic assignment with state guard to ensure event is still confirmed/in_progress
    const previousManagerId = event.eventManagerId;
    const updated = await Event.findOneAndUpdate(
      {
        _id: event._id,
        status: { $in: ['confirmed', 'in_progress'] },
      },
      {
        $set: { eventManagerId: targetManager._id },
      },
      { new: true }
    );

    if (!updated) {
      throw ApiError.badRequest('Event is no longer in an assignable state');
    }

    // Post-write concurrency conflict check
    const recheckCandidates = await this.eventRepository.findActiveAssignedEventsForDateRange(queryStart, queryEnd);
    const recheckEvents = recheckCandidates.filter((other) => this.isSameDay(event.date, other.date));
    for (const otherEvent of recheckEvents) {
      if (otherEvent.id === event.id) continue;
      if (otherEvent.eventManagerId?.toString() === eventManagerId) {
        if (this.isOverlapping(event.startTime, event.endTime, otherEvent.startTime, otherEvent.endTime)) {
          // Revert concurrent collision
          await Event.findByIdAndUpdate(event._id, { $set: { eventManagerId: previousManagerId || null } });
          throw ApiError.badRequest(
            `Event Manager is busy during this event time: scheduling conflict with "${otherEvent.title || 'another event'}" (${otherEvent.startTime} – ${otherEvent.endTime}) on this date.`
          );
        }
      }
    }

    return updated as unknown as IEvent;
  }
}
