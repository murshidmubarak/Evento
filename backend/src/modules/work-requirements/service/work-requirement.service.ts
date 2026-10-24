import { WorkRequirementRepository } from '../repository/work-requirement.repository.js';
import { WorkResponseRepository } from '../repository/work-response.repository.js';
import { EventRepository } from '../../events/repository/event.repository.js';
import { Event } from '../../events/model/event.model.js';
import { ApiError } from '../../../utils/ApiError.js';
import { WorkRequirement, type IWorkRequirement } from '../model/work-requirement.model.js';
import { isValidReportingTime, isValidMaxDistanceKm, isValidDeadline } from '../validation/work-requirement.validation.js';
import { workerSelectionQueueService } from '../../worker-selection/queues/worker-selection.queue.js';
import { toCalendarDayString, isEventDatePassed } from '../../worker-selection/utils/calendar-day.util.js';
import mongoose from 'mongoose';

export class WorkRequirementService {
  private requirementRepository: WorkRequirementRepository;
  private responseRepository: WorkResponseRepository;
  private eventRepository: EventRepository;

  constructor() {
    this.requirementRepository = new WorkRequirementRepository();
    this.responseRepository = new WorkResponseRepository();
    this.eventRepository = new EventRepository();
  }

  private async ensureEventCompleted(event: any): Promise<void> {
    if (!event) return;
    if (event.status !== 'completed' && event.status !== 'cancelled') {
      await Event.findByIdAndUpdate(event._id, { status: 'completed' });
      event.status = 'completed';
    }
    await WorkRequirement.updateMany(
      { eventId: event._id, status: { $nin: ['closed', 'cancelled'] } },
      { $set: { status: 'closed' } }
    );
  }

  private async validateManagerOwnershipAndEventState(managerId: string, eventId: string, isReadOnly = false): Promise<any> {
    if (!mongoose.Types.ObjectId.isValid(eventId)) {
      throw ApiError.badRequest('Invalid event ID format');
    }

    const event = await this.eventRepository.findById(eventId);

    if (!event) {
      throw ApiError.notFound('Event not found');
    }

    const assignedManagerId = (event.eventManagerId as any)?._id?.toString() || event.eventManagerId?.toString();
    if (assignedManagerId !== managerId) {
      throw ApiError.forbidden('You do not have permission to access this event');
    }

    const isPast = isEventDatePassed(event.date, event.endTime);
    if (isPast && event.status !== 'completed' && event.status !== 'cancelled') {
      await this.ensureEventCompleted(event);
      event.status = 'completed';
    }

    if (isReadOnly) {
      if (event.status !== 'confirmed' && event.status !== 'completed') {
        throw ApiError.badRequest(`Work requirements can only be accessed on confirmed or completed events. Current status: '${event.status}'`);
      }
      return event;
    }

    if (event.status === 'completed' || isPast) {
      throw ApiError.badRequest('Cannot create or manage work requirements for completed events or events whose date has passed');
    }

    // Business rule (§25): Worker recruitment begins only after Event = confirmed
    if (event.status !== 'confirmed') {
      throw ApiError.badRequest(`Work requirements can only be managed on confirmed events. Current status: '${event.status}'`);
    }

    return event;
  }

  /**
   * Helper to ensure the interest deadline occurs before the event start / reporting time.
   */
  private validateDeadlineBeforeEvent(deadline: Date, event: any, reportingTime?: string): void {
    if (!event.date) return;

    // Use event date as base boundary
    const eventDate = new Date(event.date);

    // If reporting time is formatted like HH:mm, we can parse event boundary precisely
    if (reportingTime) {
      const match = reportingTime.match(/^(\d{1,2}):(\d{2})(\s?[APap][Mm])?$/);
      if (match) {
        let hours = parseInt(match[1], 10);
        const mins = parseInt(match[2], 10);
        const ampm = match[3]?.trim().toUpperCase();
        if (ampm === 'PM' && hours < 12) hours += 12;
        if (ampm === 'AM' && hours === 12) hours = 0;
        eventDate.setHours(hours, mins, 0, 0);
      }
    }

    if (deadline.getTime() >= eventDate.getTime()) {
      throw ApiError.badRequest(
        `Interest deadline (${deadline.toISOString()}) must occur before the event start and reporting time (${eventDate.toISOString()})`
      );
    }
  }

  async createRequirement(managerId: string, eventId: string, data: Partial<IWorkRequirement>): Promise<IWorkRequirement> {
    const event = await this.validateManagerOwnershipAndEventState(managerId, eventId);

    const timeValidation = isValidReportingTime(data.reportingTime);
    if (!timeValidation.valid) {
      throw ApiError.badRequest(timeValidation.error || 'Reporting time is required');
    }

    if (data.maxDistanceKm !== undefined && data.maxDistanceKm !== null) {
      const distValidation = isValidMaxDistanceKm(data.maxDistanceKm);
      if (!distValidation.valid) {
        throw ApiError.badRequest(distValidation.error || 'Invalid maximum distance');
      }
    }

    let parsedDeadline: Date | undefined;
    if (data.interestDeadlineAt !== undefined && data.interestDeadlineAt !== null) {
      const deadlineValidation = isValidDeadline(data.interestDeadlineAt);
      if (!deadlineValidation.valid) {
        throw ApiError.badRequest(deadlineValidation.error || 'Invalid interest deadline');
      }
      parsedDeadline = deadlineValidation.date;
      this.validateDeadlineBeforeEvent(parsedDeadline!, event, data.reportingTime);
    }

    const requirementData: Partial<IWorkRequirement> = {
      ...data,
      reportingTime: data.reportingTime!.trim(),
      eventId: new mongoose.Types.ObjectId(eventId) as any,
      maxDistanceKm: data.maxDistanceKm,
      interestDeadlineAt: parsedDeadline,
      selectionRound: 1,
      assignedWorkers: [],
      extensionHistory: [],
      status: 'draft' as any,
    };

    return this.requirementRepository.create(requirementData);
  }

  async getRequirementsByEvent(managerId: string, eventId: string): Promise<IWorkRequirement[]> {
    await this.validateManagerOwnershipAndEventState(managerId, eventId, true);
    return this.requirementRepository.findByEventId(eventId);
  }

  async getRequirementById(managerId: string, reqId: string): Promise<IWorkRequirement> {
    if (!mongoose.Types.ObjectId.isValid(reqId)) {
      throw ApiError.badRequest('Invalid work requirement ID format');
    }

    const requirement = await this.requirementRepository.findById(reqId);
    if (!requirement) {
      throw ApiError.notFound('Work requirement not found');
    }

    await this.validateManagerOwnershipAndEventState(managerId, requirement.eventId.toString(), true);
    return requirement;
  }

  async updateRequirement(managerId: string, reqId: string, data: Partial<IWorkRequirement>): Promise<IWorkRequirement> {
    if (!mongoose.Types.ObjectId.isValid(reqId)) {
      throw ApiError.badRequest('Invalid work requirement ID format');
    }

    const requirement = await this.getRequirementById(managerId, reqId);
    const event = await this.eventRepository.findById(requirement.eventId.toString());

    if (!event) {
      throw ApiError.notFound('Event not found');
    }

    const isPast = isEventDatePassed(event.date, event.endTime);
    if (isPast || event.status === 'completed') {
      await this.ensureEventCompleted(event);
      throw ApiError.badRequest('Cannot update work requirement: Event date has already passed and the event is completed.');
    }

    // Business rules: If changing status
    if (data.status) {
      if (data.status === 'cancelled') {
        if (requirement.status === 'cancelled') {
          throw ApiError.badRequest('Work requirement is already cancelled');
        }
        if (requirement.status === 'filled' || requirement.status === 'closed') {
          throw ApiError.badRequest(`Cannot cancel a work requirement in '${requirement.status}' status`);
        }
      } else if (data.status === 'open') {
        if (requirement.status !== 'draft') {
          throw ApiError.badRequest(`Cannot open recruitment for requirement in '${requirement.status}' status`);
        }

        // Before transitioning draft -> open, ensure mandatory distance and deadline are provided
        const effectiveMaxDistance = data.maxDistanceKm !== undefined ? data.maxDistanceKm : requirement.maxDistanceKm;
        if (effectiveMaxDistance === undefined || effectiveMaxDistance === null || effectiveMaxDistance <= 0) {
          throw ApiError.badRequest('Maximum worker distance (km) must be configured with a positive value before opening recruitment');
        }

        const effectiveDeadlineInput = data.interestDeadlineAt !== undefined ? data.interestDeadlineAt : requirement.interestDeadlineAt;
        if (!effectiveDeadlineInput) {
          throw ApiError.badRequest('An interest deadline is required before opening recruitment');
        }
        const deadlineValidation = isValidDeadline(effectiveDeadlineInput);
        if (!deadlineValidation.valid) {
          throw ApiError.badRequest(deadlineValidation.error || 'Invalid interest deadline');
        }
        const effectiveDeadline = deadlineValidation.date!;
        this.validateDeadlineBeforeEvent(effectiveDeadline, event, data.reportingTime || requirement.reportingTime);
      } else if (data.status !== 'draft') {
        throw ApiError.badRequest(`Status transition to '${data.status}' is not permitted directly`);
      }
    }

    // Business rules logic: Cannot modify fields if recruitment has started (i.e. status is not 'draft')
    const hasFieldEdits =
      data.workerType !== undefined ||
      data.requiredCount !== undefined ||
      data.reportingTime !== undefined ||
      data.description !== undefined ||
      data.maxDistanceKm !== undefined ||
      data.interestDeadlineAt !== undefined;

    if (hasFieldEdits && requirement.status !== 'draft') {
      throw ApiError.badRequest('Cannot update a work requirement that is already open or in progress');
    }

    // Protect against modifying eventId
    const allowedUpdates: Partial<IWorkRequirement> = {};
    if (data.workerType !== undefined) allowedUpdates.workerType = data.workerType;
    if (data.requiredCount !== undefined) allowedUpdates.requiredCount = data.requiredCount;
    if (data.reportingTime !== undefined) {
      const timeValidation = isValidReportingTime(data.reportingTime);
      if (!timeValidation.valid) {
        throw ApiError.badRequest(timeValidation.error || 'Invalid reporting time');
      }
      allowedUpdates.reportingTime = data.reportingTime.trim();
    }
    if (data.description !== undefined) allowedUpdates.description = data.description;
    if (data.maxDistanceKm !== undefined) {
      if (data.maxDistanceKm !== null) {
        const distValidation = isValidMaxDistanceKm(data.maxDistanceKm);
        if (!distValidation.valid) throw ApiError.badRequest(distValidation.error!);
      }
      allowedUpdates.maxDistanceKm = data.maxDistanceKm;
    }
    if (data.interestDeadlineAt !== undefined) {
      if (data.interestDeadlineAt !== null) {
        const deadlineValidation = isValidDeadline(data.interestDeadlineAt);
        if (!deadlineValidation.valid) throw ApiError.badRequest(deadlineValidation.error!);
        this.validateDeadlineBeforeEvent(deadlineValidation.date!, event, allowedUpdates.reportingTime || requirement.reportingTime);
        allowedUpdates.interestDeadlineAt = deadlineValidation.date;
      } else {
        allowedUpdates.interestDeadlineAt = undefined;
      }
    }
    if (data.status !== undefined) {
      allowedUpdates.status = data.status;
      // Record immutable publication timestamp on first transition to open (§6)
      if (data.status === 'open' && !requirement.interestPublishedAt) {
        allowedUpdates.interestPublishedAt = new Date();
      }
    }

    const updated = await this.requirementRepository.updateById(reqId, allowedUpdates);
    if (!updated) {
      throw ApiError.notFound('Work requirement not found');
    }

    // If transitioned to 'open', automatically schedule deadline selection job
    if (data.status === 'open' && updated.interestDeadlineAt) {
      await workerSelectionQueueService.scheduleSelectionJob(
        updated._id.toString(),
        updated.interestDeadlineAt,
        updated.selectionRound || 1
      );
    }

    return updated;
  }

  async cancelRequirement(managerId: string, reqId: string): Promise<IWorkRequirement> {
    return this.updateRequirement(managerId, reqId, { status: 'cancelled' });
  }

  /**
   * Extends the interest deadline for an incompletely staffed requirement.
   *
   * Critical business rules:
   * 1. Preserves all previously selected and assigned workers.
   * 2. Reopens the interest window for unfilled positions only.
   * 3. Schedulers or background workers for the new deadline evaluate additional candidates
   *    and fill only the remaining positions.
   * 4. Appends to extensionHistory for audit integrity.
   */
  async extendDeadline(managerId: string, reqId: string, newDeadlineStr: string): Promise<IWorkRequirement> {
    const requirement = await this.getRequirementById(managerId, reqId);
    const event = await this.eventRepository.findById(requirement.eventId.toString());

    if (requirement.status === 'cancelled' || requirement.status === 'closed') {
      throw ApiError.badRequest(`Cannot extend deadline for a requirement in '${requirement.status}' status`);
    }

    // If event day has passed, close requirement and disallow extension
    if (event) {
      const isPast = isEventDatePassed(event.date, event.endTime);
      if (isPast || event.status === 'completed') {
        await this.ensureEventCompleted(event);
        throw ApiError.badRequest('Cannot extend deadline: Event day has already passed and this work requirement is now closed');
      }
    }

    // Verify existing deadline has passed
    if (requirement.interestDeadlineAt && requirement.interestDeadlineAt.getTime() > Date.now()) {
      throw ApiError.badRequest('Cannot extend interest deadline while the current window is still active');
    }

    // Verify requirement is incompletely staffed
    const existingAssignedCount = requirement.assignedWorkers?.length || 0;
    if (existingAssignedCount >= requirement.requiredCount) {
      throw ApiError.badRequest('Work requirement is already fully staffed and cannot be extended');
    }

    // Validate new deadline
    const deadlineValidation = isValidDeadline(newDeadlineStr);
    if (!deadlineValidation.valid || !deadlineValidation.date) {
      throw ApiError.badRequest(deadlineValidation.error || 'A valid future interest deadline is required');
    }
    const newDeadline = deadlineValidation.date;
    this.validateDeadlineBeforeEvent(newDeadline, event, requirement.reportingTime);

    const remainingCount = requirement.requiredCount - existingAssignedCount;
    const previousDeadline = requirement.interestDeadlineAt || new Date();
    const newRound = (requirement.selectionRound || 1) + 1;

    // Preserve existing assigned workers completely!
    const extensionEntry = {
      previousDeadline,
      newDeadline,
      extendedBy: new mongoose.Types.ObjectId(managerId),
      extendedAt: new Date(),
      remainingCount,
    };

    const updated = await WorkRequirement.findByIdAndUpdate(
      reqId,
      {
        $set: {
          interestDeadlineAt: newDeadline,
          selectionRound: newRound,
          status: 'open',
        },
        $push: {
          extensionHistory: extensionEntry,
        },
      },
      { new: true }
    );

    if (!updated) {
      throw ApiError.notFound('Work requirement not found');
    }

    // Schedule BullMQ job for the new deadline
    await workerSelectionQueueService.scheduleSelectionJob(reqId, newDeadline, newRound);

    return updated;
  }

  /**
   * Retrieves selection results and candidate breakdown for manager inspection.
   */
  async getSelectionResults(managerId: string, reqId: string): Promise<any> {
    const requirement = await this.getRequirementById(managerId, reqId);
    await requirement.populate('assignedWorkers.workerId', 'name email phone workerType businessId location');

    const responses = await this.responseRepository.findInterestedByRequirement(reqId);
    await WorkRequirement.populate(responses, {
      path: 'workerId',
      select: 'name email phone workerType businessId location',
    });

    const interestCount = await this.responseRepository.countInterestedByRequirement(reqId);

    const totalAssigned = requirement.assignedWorkers?.length || 0;
    const remainingCount = Math.max(0, requirement.requiredCount - totalAssigned);

    return {
      requirement: {
        ...requirement.toJSON(),
        filled: totalAssigned,
        pending: remainingCount,
        interestCount,
      },
      assignedWorkers: requirement.assignedWorkers || [],
      candidates: responses,
      extensionHistory: requirement.extensionHistory || [],
    };
  }
}
