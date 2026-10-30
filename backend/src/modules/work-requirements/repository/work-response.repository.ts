import { WorkResponse, type IWorkResponse, type WorkerResponseStatus } from '../model/work-response.model.js';
import mongoose from 'mongoose';

export class WorkResponseRepository {
  async create(data: Partial<IWorkResponse>): Promise<IWorkResponse> {
    const response = new WorkResponse({
      ...data,
      respondedAt: new Date(), // Authoritative server timestamp
    });
    return (await response.save()) as unknown as Promise<IWorkResponse>;
  }

  async findByRequirementAndWorker(requirementId: string, workerId: string): Promise<IWorkResponse | null> {
    return WorkResponse.findOne({
      requirementId: new mongoose.Types.ObjectId(requirementId),
      workerId: new mongoose.Types.ObjectId(workerId),
    }) as unknown as Promise<IWorkResponse | null>;
  }

  async findInterestedByRequirement(requirementId: string): Promise<IWorkResponse[]> {
    return WorkResponse.find({
      requirementId: new mongoose.Types.ObjectId(requirementId),
      responseStatus: { $in: ['interested', 'not_selected'] },
    }).sort({ respondedAt: 1 }) as unknown as Promise<IWorkResponse[]>;
  }

  async countInterestedByRequirement(requirementId: string): Promise<number> {
    return WorkResponse.countDocuments({
      requirementId: new mongoose.Types.ObjectId(requirementId),
      responseStatus: { $in: ['interested', 'selected'] },
    });
  }

  async findByWorkerId(workerId: string): Promise<IWorkResponse[]> {
    return WorkResponse.find({
      workerId: new mongoose.Types.ObjectId(workerId),
    }).sort({ createdAt: -1 }) as unknown as Promise<IWorkResponse[]>;
  }

  async findByWorkerAndEvent(workerId: string, eventId: string): Promise<IWorkResponse[]> {
    return WorkResponse.find({
      workerId: new mongoose.Types.ObjectId(workerId),
      eventId: new mongoose.Types.ObjectId(eventId),
    }) as unknown as Promise<IWorkResponse[]>;
  }

  async updateStatus(
    id: string,
    update: {
      responseStatus: WorkerResponseStatus;
      selectedAt?: Date;
      distanceKm?: number;
      distanceScore?: number;
      selectionRound?: number;
    }
  ): Promise<IWorkResponse | null> {
    return WorkResponse.findByIdAndUpdate(id, update, { new: true }) as unknown as Promise<IWorkResponse | null>;
  }

  async updateManyStatus(
    requirementId: string,
    workerIds: string[],
    update: {
      responseStatus: WorkerResponseStatus;
      selectedAt?: Date;
      distanceKm?: number;
      distanceScore?: number;
      selectionRound?: number;
    }
  ): Promise<void> {
    await WorkResponse.updateMany(
      {
        requirementId: new mongoose.Types.ObjectId(requirementId),
        workerId: { $in: workerIds.map((id) => new mongoose.Types.ObjectId(id)) },
      },
      { $set: update }
    );
  }
}

export const workResponseRepository = new WorkResponseRepository();
