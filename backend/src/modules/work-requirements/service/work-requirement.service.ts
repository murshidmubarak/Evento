import { WorkRequirementRepository } from '../repository/work-requirement.repository.js';
import { EventRepository } from '../../events/repository/event.repository.js';
import { ApiError } from '../../../utils/ApiError.js';
import type { IWorkRequirement } from '../model/work-requirement.model.js';
import mongoose from 'mongoose';

export class WorkRequirementService {
  private requirementRepository: WorkRequirementRepository;
  private eventRepository: EventRepository;

  constructor() {
    this.requirementRepository = new WorkRequirementRepository();
    this.eventRepository = new EventRepository();
  }

  private async validateManagerOwnershipAndEventState(managerId: string, eventId: string): Promise<void> {
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
    
    const requirementData = {
      ...data,
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
    const requirement = await this.requirementRepository.findById(reqId);
    if (!requirement) {
      throw ApiError.notFound('Work requirement not found');
    }

    await this.validateManagerOwnershipAndEventState(managerId, requirement.eventId.toString());
    return requirement;
  }

  async updateRequirement(managerId: string, reqId: string, data: Partial<IWorkRequirement>): Promise<IWorkRequirement> {
    const requirement = await this.getRequirementById(managerId, reqId);

    // Business rules logic: Cannot modify if recruitment has started (i.e. status is not 'draft')
    if (requirement.status !== 'draft') {
      throw ApiError.badRequest('Cannot update a work requirement that is already open or in progress');
    }

    // Protect against modifying eventId
    const allowedUpdates = {
      requiredCount: data.requiredCount,
      reportingTime: data.reportingTime,
      description: data.description,
      status: data.status,
    };

    // Remove undefined fields
    Object.keys(allowedUpdates).forEach(key => (allowedUpdates as any)[key] === undefined && delete (allowedUpdates as any)[key]);

    const updated = await this.requirementRepository.updateById(reqId, allowedUpdates);
    if (!updated) {
      throw ApiError.notFound('Work requirement not found');
    }
    return updated;
  }
}
