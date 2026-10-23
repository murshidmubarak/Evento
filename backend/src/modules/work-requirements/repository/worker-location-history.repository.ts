import mongoose, { type Types } from 'mongoose';
import {
  WorkerLocationHistory,
  type IWorkerLocationHistory,
} from '../model/worker-location-history.model.js';
import { User } from '../../auth/model/user.model.js';
import { isValidCoordinate } from '../../worker-selection/utils/distance.util.js';

export interface EffectiveWorkerLocation {
  address?: string;
  lat: number;
  lng: number;
  effectiveFrom: Date;
  versionId: string;
}

export class WorkerLocationHistoryRepository {
  /**
   * Creates an immutable location version record.
   */
  async createVersion(data: {
    workerId: string | Types.ObjectId;
    address?: string;
    lat: number;
    lng: number;
    effectiveFrom?: Date;
    versionId?: string;
  }): Promise<IWorkerLocationHistory> {
    const version = new WorkerLocationHistory({
      workerId: new mongoose.Types.ObjectId(data.workerId as string),
      address: data.address?.trim(),
      lat: data.lat,
      lng: data.lng,
      effectiveFrom: data.effectiveFrom || new Date(),
      versionId: data.versionId || new mongoose.Types.ObjectId().toString(),
    });

    return (await version.save()) as unknown as IWorkerLocationHistory;
  }

  /**
   * Finds the latest location version for a worker.
   */
  async findLatestByWorker(
    workerId: string | Types.ObjectId
  ): Promise<IWorkerLocationHistory | null> {
    if (!mongoose.Types.ObjectId.isValid(workerId as string)) return null;
    return WorkerLocationHistory.findOne({
      workerId: new mongoose.Types.ObjectId(workerId as string),
    }).sort({ effectiveFrom: -1, createdAt: -1 });
  }

  /**
   * Resolves the immutable location version that was valid at the specified cutoff timestamp.
   * Conceptually: locationVersion.effectiveFrom <= cutoffTimestamp.
   *
   * Includes safe migration / fallback for pre-existing workers (§16) whose locations were
   * confirmed before this history collection was instantiated.
   */
  async findEffectiveLocationAt(
    workerId: string | Types.ObjectId,
    cutoffTimestamp: Date
  ): Promise<EffectiveWorkerLocation | null> {
    if (!mongoose.Types.ObjectId.isValid(workerId as string)) return null;

    const wId = new mongoose.Types.ObjectId(workerId as string);

    // 1. Query immutable history for the latest record with effectiveFrom <= cutoffTimestamp
    const historyRecord = await WorkerLocationHistory.findOne({
      workerId: wId,
      effectiveFrom: { $lte: cutoffTimestamp },
    }).sort({ effectiveFrom: -1, createdAt: -1 });

    if (historyRecord) {
      return {
        address: historyRecord.address,
        lat: historyRecord.lat,
        lng: historyRecord.lng,
        effectiveFrom: historyRecord.effectiveFrom,
        versionId: historyRecord.versionId,
      };
    }

    // 2. Pre-existing / legacy worker fallback (§16):
    // If no history record exists at or before cutoff, inspect user.location.
    // Only accept it if user.location.confirmedAt was <= cutoffTimestamp.
    const user = await User.findById(wId);
    if (
      user?.location &&
      isValidCoordinate(user.location.lat, user.location.lng) &&
      user.location.confirmedAt
    ) {
      const userConfirmedAt = new Date(user.location.confirmedAt);
      if (userConfirmedAt.getTime() <= cutoffTimestamp.getTime()) {
        // Seed an initial historical version so subsequent lookups are fast and immutable
        const versionId = new mongoose.Types.ObjectId().toString();
        try {
          const seeded = await WorkerLocationHistory.create({
            workerId: wId,
            address: user.location.address || 'Confirmed Location',
            lat: user.location.lat,
            lng: user.location.lng,
            effectiveFrom: userConfirmedAt,
            versionId,
          });
          return {
            address: seeded.address,
            lat: seeded.lat,
            lng: seeded.lng,
            effectiveFrom: seeded.effectiveFrom,
            versionId: seeded.versionId,
          };
        } catch {
          return {
            address: user.location.address,
            lat: user.location.lat!,
            lng: user.location.lng!,
            effectiveFrom: userConfirmedAt,
            versionId,
          };
        }
      }
    }

    // No valid historical location was active at or before publication cutoff
    return null;
  }

  /**
   * Retrieves all location versions for a worker (read-only audit trail).
   */
  async getHistoryByWorker(
    workerId: string | Types.ObjectId
  ): Promise<IWorkerLocationHistory[]> {
    if (!mongoose.Types.ObjectId.isValid(workerId as string)) return [];
    return WorkerLocationHistory.find({
      workerId: new mongoose.Types.ObjectId(workerId as string),
    }).sort({ effectiveFrom: -1, createdAt: -1 });
  }
}
