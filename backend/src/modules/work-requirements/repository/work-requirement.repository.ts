import { WorkRequirement, type IWorkRequirement } from '../model/work-requirement.model.js';

export class WorkRequirementRepository {
  async create(data: Partial<IWorkRequirement>): Promise<IWorkRequirement> {
    const requirement = new WorkRequirement(data);
    return (await requirement.save()) as unknown as Promise<IWorkRequirement>;
  }

  async findByEventId(eventId: string): Promise<IWorkRequirement[]> {
    return WorkRequirement.find({ eventId }).sort({ createdAt: 1 }) as unknown as Promise<IWorkRequirement[]>;
  }

  async findById(id: string): Promise<IWorkRequirement | null> {
    return WorkRequirement.findById(id) as unknown as Promise<IWorkRequirement | null>;
  }

  async updateById(id: string, updateData: Partial<IWorkRequirement>): Promise<IWorkRequirement | null> {
    return WorkRequirement.findByIdAndUpdate(id, updateData, { new: true, runValidators: true }) as unknown as Promise<IWorkRequirement | null>;
  }
}
