import mongoose, { ClientSession } from 'mongoose';
import {
  PushDelivery,
  type IPushDelivery,
  type PushDeliveryStatus,
  type PushErrorCategory,
} from '../model/push-delivery.model.js';
import type { INotification } from '../model/notification.model.js';
import type { IPushSubscription } from '../model/push-subscription.model.js';

export class PushDeliveryRepository {
  /**
   * Persists push delivery intent records for all active subscriptions of a notification recipient.
   */
  async createIntentsForNotification(
    notification: INotification,
    subscriptions: IPushSubscription[],
    session?: ClientSession
  ): Promise<IPushDelivery[]> {
    if (!subscriptions || subscriptions.length === 0) {
      return [];
    }

    const records: Partial<IPushDelivery>[] = subscriptions.map((sub) => ({
      notificationId: notification._id,
      recipientId: notification.recipientId,
      subscriptionId: sub._id,
      endpointHash: sub.endpointHash,
      deliveryKey: `${notification._id.toString()}:${sub._id.toString()}`,
      status: 'pending' as PushDeliveryStatus,
      dispatchGeneration: 1,
      attemptCount: 0,
      maxAttempts: 5,
      nextAttemptAt: new Date(),
    }));

    try {
      const inserted = await PushDelivery.insertMany(records, {
        ordered: false,
        session,
      });
      return inserted as unknown as IPushDelivery[];
    } catch (err: any) {
      if (err.code === 11000 && err.insertedDocs) {
        return err.insertedDocs as IPushDelivery[];
      }
      // If some failed due to duplicate keys, retrieve existing/saved documents
      const deliveryKeys = records.map((r) => r.deliveryKey as string);
      return PushDelivery.find({ deliveryKey: { $in: deliveryKeys } }, null, { session }).exec();
    }
  }

  /**
   * Atomically claims due push delivery records with a distributed lease lock.
   */
  async claimDueDeliveries(
    batchSize: number,
    leaseOwner: string,
    leaseDurationMs = 30000
  ): Promise<IPushDelivery[]> {
    const now = new Date();
    const leaseExpiresAt = new Date(now.getTime() + leaseDurationMs);

    // 1. Find candidates due for dispatch
    const candidates = await PushDelivery.find({
      status: { $in: ['pending', 'retry_pending'] },
      nextAttemptAt: { $lte: now },
      $or: [{ leaseExpiresAt: null }, { leaseExpiresAt: { $lte: now } }],
    })
      .sort({ nextAttemptAt: 1, createdAt: 1 })
      .limit(batchSize)
      .select('_id')
      .lean()
      .exec();

    if (candidates.length === 0) {
      return [];
    }

    // 2. Atomically claim each candidate individually to prevent race conditions
    const claimed: IPushDelivery[] = [];
    for (const cand of candidates) {
      const doc = await PushDelivery.findOneAndUpdate(
        {
          _id: cand._id,
          status: { $in: ['pending', 'retry_pending'] },
          $or: [{ leaseExpiresAt: null }, { leaseExpiresAt: { $lte: now } }],
        },
        {
          $set: {
            leaseOwner,
            leaseExpiresAt,
          },
        },
        { new: true }
      );

      if (doc) {
        claimed.push(doc);
      }
    }

    return claimed;
  }

  /**
   * Marks a delivery record as queued after BullMQ acknowledges the job.
   */
  async markQueued(id: mongoose.Types.ObjectId | string, leaseOwner: string): Promise<boolean> {
    const result = await PushDelivery.updateOne(
      {
        _id: id,
        leaseOwner,
      },
      {
        $set: {
          status: 'queued',
        },
      }
    );
    return result.modifiedCount > 0;
  }

  /**
   * Marks a delivery record as sending when the worker begins active processing.
   */
  async markSending(id: mongoose.Types.ObjectId | string): Promise<boolean> {
    const result = await PushDelivery.updateOne(
      {
        _id: id,
        status: { $in: ['queued', 'pending', 'retry_pending'] },
      },
      {
        $set: {
          status: 'sending',
          lastAttemptAt: new Date(),
        },
        $inc: { attemptCount: 1 },
      }
    );
    return result.modifiedCount > 0;
  }

  /**
   * Marks a delivery record as successfully sent (accepted by Web Push service).
   */
  async markSent(id: mongoose.Types.ObjectId | string, acceptedAt = new Date()): Promise<void> {
    await PushDelivery.updateOne(
      { _id: id },
      {
        $set: {
          status: 'sent',
          acceptedAt,
          leaseOwner: null,
          leaseExpiresAt: null,
          lastErrorCategory: null,
          lastError: null,
        },
      }
    );
  }

  /**
   * Marks a delivery record as invalid_subscription (e.g. 404 or 410 from Push Service).
   */
  async markInvalidSubscription(
    id: mongoose.Types.ObjectId | string,
    reason: string
  ): Promise<void> {
    await PushDelivery.updateOne(
      { _id: id },
      {
        $set: {
          status: 'invalid_subscription',
          lastErrorCategory: 'unsubscribed',
          lastError: reason.slice(0, 500),
          leaseOwner: null,
          leaseExpiresAt: null,
        },
      }
    );
  }

  /**
   * Marks a delivery record for retry following a temporary failure (429, 5xx, network timeout).
   */
  async markRetryPending(
    id: mongoose.Types.ObjectId | string,
    errorCategory: PushErrorCategory,
    errorMessage: string,
    nextAttemptAt: Date
  ): Promise<void> {
    await PushDelivery.updateOne(
      { _id: id },
      {
        $set: {
          status: 'retry_pending',
          lastErrorCategory: errorCategory,
          lastError: errorMessage.slice(0, 500),
          nextAttemptAt,
          leaseOwner: null,
          leaseExpiresAt: null,
        },
        $inc: { dispatchGeneration: 1 },
      }
    );
  }

  /**
   * Transitions a delivery record to dead_letter when retries are exhausted or on permanent configuration errors.
   */
  async markDeadLetter(
    id: mongoose.Types.ObjectId | string,
    errorCategory: PushErrorCategory,
    errorMessage: string
  ): Promise<void> {
    await PushDelivery.updateOne(
      { _id: id },
      {
        $set: {
          status: 'dead_letter',
          lastErrorCategory: errorCategory,
          lastError: errorMessage.slice(0, 500),
          leaseOwner: null,
          leaseExpiresAt: null,
        },
      }
    );
  }

  /**
   * Pauses delivery when server VAPID credentials are not configured.
   * Keeps the record in 'pending' status without exhausting retry attemptCount,
   * releasing any active lease lock so it is cleanly recovered once configuration is supplied.
   */
  async markConfigurationPending(
    id: mongoose.Types.ObjectId | string,
    reason: string,
    nextAttemptAt: Date = new Date(Date.now() + 60000)
  ): Promise<void> {
    await PushDelivery.updateOne(
      { _id: id },
      {
        $set: {
          status: 'pending',
          lastErrorCategory: 'configuration',
          lastError: reason.slice(0, 500),
          nextAttemptAt,
          leaseOwner: null,
          leaseExpiresAt: null,
        },
        $inc: { attemptCount: -1 },
      }
    );
  }

  /**
   * Recovers any expired leases from crashed dispatcher or worker processes.
   */
  async recoverExpiredLeases(): Promise<number> {
    const now = new Date();
    const result = await PushDelivery.updateMany(
      {
        status: { $in: ['sending', 'queued'] },
        leaseExpiresAt: { $lte: now },
      },
      {
        $set: {
          status: 'retry_pending',
          leaseOwner: null,
          leaseExpiresAt: null,
          nextAttemptAt: now,
        },
        $inc: { dispatchGeneration: 1 },
      }
    );
    return result.modifiedCount;
  }

  /**
   * Finds a delivery record by ID.
   */
  async findById(id: mongoose.Types.ObjectId | string): Promise<IPushDelivery | null> {
    if (!mongoose.Types.ObjectId.isValid(id)) return null;
    return PushDelivery.findById(id).exec();
  }

  /**
   * Finds all deliveries for a specific notification.
   */
  async findByNotificationId(
    notificationId: mongoose.Types.ObjectId | string
  ): Promise<IPushDelivery[]> {
    if (!mongoose.Types.ObjectId.isValid(notificationId)) return [];
    return PushDelivery.find({ notificationId }).exec();
  }
}

export const pushDeliveryRepository = new PushDeliveryRepository();

