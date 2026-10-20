import { WorkRequirementRepository } from '../repository/work-requirement.repository.js';
import { EventRepository } from '../../events/repository/event.repository.js';
import { ApiError } from '../../../utils/ApiError.js';
import type { IWorkRequirement } from '../model/work-requirement.model.js';
import { isValidReportingTime } from '../validation/work-requirement.validation.js';
import mongoose from 'mongoose';

export class WorkRequirementService {
  private requirementRepository: WorkRequirementRepository;
  private eventRepository: EventRepository;

  constructor() {
    this.requirementRepository = new WorkRequirementRepository();
    this.eventRepository = new EventRepository();
  }

  private async validateManagerOwnershipAndEventState(managerId: string, eventId: string): Promise<void> {
    if (!mongoose.Types.ObjectId.isValid(eventId)) {
      throw ApiError.badRequest('Invalid event ID format');
    }

    const event = await this.eventRepository.findById(eventId);
    
    if (!event) {
      throw ApiError.notFound('Event not found');
    }

    if (event.eventManagerId?.toString() !== managerId) {
      throw ApiError.forbidden('You do not have permission to access this event');
    }

    // Business rule (§25): Worker recruitment begins only after Event = confirmed
    // See docs/04-status-and-business-rules.md §25 "Event Manager Recruitment Rule"
    if (event.status !== 'confirmed') {
      throw ApiError.badRequest(`Work requirements can only be managed on confirmed events. Current status: '${event.status}'`);
    }
  }

  async createRequirement(managerId: string, eventId: string, data: Partial<IWorkRequirement>): Promise<IWorkRequirement> {
    await this.validateManagerOwnershipAndEventState(managerId, eventId);
    
    const timeValidation = isValidReportingTime(data.reportingTime);
    if (!timeValidation.valid) {
      throw ApiError.badRequest(timeValidation.error || 'Reporting time is required');
    }

    const requirementData = {
      ...data,
      reportingTime: data.reportingTime!.trim(),
      eventId: new mongoose.Types.ObjectId(eventId) as any,
      status: 'draft' as any
    };

    return this.requirementRepository.create(requirementData);
  }

  async getRequirementsByEvent(managerId: string, eventId: string): Promise<IWorkRequirement[]> {
    await this.validateManagerOwnershipAndEventState(managerId, eventId);
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

    await this.validateManagerOwnershipAndEventState(managerId, requirement.eventId.toString());
    return requirement;
  }

  async updateRequirement(managerId: string, reqId: string, data: Partial<IWorkRequirement>): Promise<IWorkRequirement> {
    if (!mongoose.Types.ObjectId.isValid(reqId)) {
      throw ApiError.badRequest('Invalid work requirement ID format');
    }

    const requirement = await this.getRequirementById(managerId, reqId);

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
      } else if (data.status !== 'draft') {
        throw ApiError.badRequest(`Status transition to '${data.status}' is not permitted directly`);
      }
    }

    // Business rules logic: Cannot modify fields if recruitment has started (i.e. status is not 'draft')
    const hasFieldEdits = data.workerType !== undefined ||
      data.requiredCount !== undefined ||
      data.reportingTime !== undefined ||
      data.description !== undefined;

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
    if (data.status !== undefined) allowedUpdates.status = data.status;

    const updated = await this.requirementRepository.updateById(reqId, allowedUpdates);
    if (!updated) {
      throw ApiError.notFound('Work requirement not found');
    }
    return updated;
  }

  async cancelRequirement(managerId: string, reqId: string): Promise<IWorkRequirement> {
    return this.updateRequirement(managerId, reqId, { status: 'cancelled' });
  }
}
