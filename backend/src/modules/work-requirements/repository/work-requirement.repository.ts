import { WorkRequirement, type IWorkRequirement, type IAssignedWorker } from '../model/work-requirement.model.js';
import mongoose from 'mongoose';

export class WorkRequirementRepository {
  async create(data: Partial<IWorkRequirement>): Promise<IWorkRequirement> {
    const requirement = new WorkRequirement(data);
    return (await requirement.save()) as unknown as Promise<IWorkRequirement>;
  }

  async findByEventId(eventId: string): Promise<IWorkRequirement[]> {
    return WorkRequirement.find({ eventId }).sort({ createdAt: 1 }) as unknown as Promise<IWorkRequirement[]>;
  }

  async findById(id: string): Promise<IWorkRequirement | null> {
    if (!mongoose.Types.ObjectId.isValid(id)) return null;
    return WorkRequirement.findById(id) as unknown as Promise<IWorkRequirement | null>;
  }

  /**
   * Finds requirements by an array of IDs, excluding cancelled requirements, with populated event.
   */
  async findByIds(ids: (string | mongoose.Types.ObjectId)[]): Promise<IWorkRequirement[]> {
    if (!ids || ids.length === 0) return [];
    const validIds = ids.filter((id) => mongoose.Types.ObjectId.isValid(id as string));
    if (validIds.length === 0) return [];
    return WorkRequirement.find({
      _id: { $in: validIds },
      status: { $ne: 'cancelled' },
    }).populate('eventId') as unknown as Promise<IWorkRequirement[]>;
  }

  async updateById(id: string, updateData: Partial<IWorkRequirement>): Promise<IWorkRequirement | null> {
    if (!mongoose.Types.ObjectId.isValid(id)) return null;
    return WorkRequirement.findByIdAndUpdate(id, updateData, { new: true, runValidators: true }) as unknown as Promise<IWorkRequirement | null>;
  }

  /**
   * Atomically appends newly selected workers to assignedWorkers.
   * Preserves all existing assignments and ensures no duplicates.
   */
  async appendAssignedWorkers(id: string, newAssignments: IAssignedWorker[], newStatus?: string): Promise<IWorkRequirement | null> {
    if (!mongoose.Types.ObjectId.isValid(id)) return null;

    const updateDoc: Record<string, unknown> = {
      $push: {
        assignedWorkers: { $each: newAssignments },
      },
    };
    if (newStatus) {
      updateDoc.$set = { status: newStatus };
    }

    return WorkRequirement.findByIdAndUpdate(id, updateDoc, { new: true }) as unknown as Promise<IWorkRequirement | null>;
  }

  /**
   * Finds all requirements where a worker is assigned, excluding cancelled requirements.
   */
  async findAssignedRequirementsByWorker(workerId: string): Promise<IWorkRequirement[]> {
    return WorkRequirement.find({
      'assignedWorkers.workerId': new mongoose.Types.ObjectId(workerId),
      status: { $ne: 'cancelled' },
    }).populate('eventId') as unknown as Promise<IWorkRequirement[]>;
  }

  /**
   * Finds open requirements matching worker type whose deadline is in the future.
   */
  async findAvailableRequirementsForWorker(workerType: string): Promise<IWorkRequirement[]> {
    return WorkRequirement.find({
      workerType,
      status: 'open',
      interestDeadlineAt: { $gt: new Date() },
    })
      .populate('eventId')
      .sort({ interestDeadlineAt: 1 }) as unknown as Promise<IWorkRequirement[]>;
  }

  /**
   * Finds open requirements whose interest deadline has arrived/passed and need selection.
   */
  async findPendingDeadlineRequirements(now: Date = new Date()): Promise<IWorkRequirement[]> {
    return WorkRequirement.find({
      status: 'open',
      interestDeadlineAt: { $lte: now },
    }).populate('eventId') as unknown as Promise<IWorkRequirement[]>;
  }
}
