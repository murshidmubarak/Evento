import mongoose, { ClientSession } from 'mongoose';
import {
  NotificationOutbox,
  INotificationOutbox,
} from '../model/notification-outbox.model.js';

export class NotificationOutboxRepository {
  /**
   * Persists an outbox event, optionally attaching a Mongoose session for multi-document transaction atomicity.
   */
  async create(
    data: Partial<INotificationOutbox>,
    session?: ClientSession
  ): Promise<INotificationOutbox> {
    const doc = new NotificationOutbox(data);
    return doc.save({ session });
  }

  async findById(id: string): Promise<INotificationOutbox | null> {
    return NotificationOutbox.findById(id);
  }

  async findByEventId(eventId: string): Promise<INotificationOutbox | null> {
    return NotificationOutbox.findOne({ eventId });
  }

  /**
   * Queries pending events that are due for dispatch.
   */
  async findDuePendingEvents(limit: number = 10): Promise<INotificationOutbox[]> {
    const now = new Date();
    return NotificationOutbox.find({
      status: 'pending',
      nextAttemptAt: { $lte: now },
    })
      .sort({ createdAt: 1 })
      .limit(limit);
  }

  /**
   * Atomically claims an event for dispatching with a unique lease token and duration.
   * A claim succeeds only if the event is pending and due, or if its previous dispatch lease expired.
   */
  async claimEvent(
    eventId: string,
    leaseToken: string,
    leaseDurationMs: number = 30000
  ): Promise<INotificationOutbox | null> {
    const now = new Date();
    const leaseExpiresAt = new Date(Date.now() + leaseDurationMs);

    return NotificationOutbox.findOneAndUpdate(
      {
        eventId,
        $or: [
          { status: 'pending', nextAttemptAt: { $lte: now } },
          { status: 'dispatching', leaseExpiresAt: { $lt: now } },
        ],
      },
      {
        $set: {
          status: 'dispatching',
          leaseToken,
          leaseExpiresAt,
        },
        $inc: {
          attempts: 1,
        },
      },
      {
        new: true,
      }
    );
  }

  /**
   * Marks an outbox record as 'queued' once BullMQ acknowledges the job.
   * Requires matching lease token to ensure another worker did not reclaim the lease.
   */
  async markQueued(
    eventId: string,
    leaseToken: string,
    enqueuedAt: Date = new Date()
  ): Promise<INotificationOutbox | null> {
    return NotificationOutbox.findOneAndUpdate(
      {
        eventId,
        leaseToken,
        status: 'dispatching',
      },
      {
        $set: {
          status: 'queued',
          enqueuedAt,
          leaseToken: null,
          leaseExpiresAt: null,
          lastError: null,
        },
      },
      {
        new: true,
      }
    );
  }

  /**
   * Marks an outbox record as 'processed' after notification persistence has successfully completed.
   */
  async markProcessed(eventId: string): Promise<INotificationOutbox | null> {
    return NotificationOutbox.findOneAndUpdate(
      {
        eventId,
        status: { $ne: 'processed' },
      },
      {
        $set: {
          status: 'processed',
          processedAt: new Date(),
          leaseToken: null,
          leaseExpiresAt: null,
          lastError: null,
        },
      },
      {
        new: true,
      }
    );
  }

  /**
   * Records a dispatch enqueue failure (e.g. transient Redis outage) with bounded exponential backoff.
   * Moves event to 'dead_letter' if max attempts are exceeded.
   */
  async recordDispatchFailure(
    eventId: string,
    leaseToken: string,
    errorMsg: string,
    backoffMs: number,
    maxAttempts: number = 5
  ): Promise<INotificationOutbox | null> {
    const existing = await NotificationOutbox.findOne({ eventId });
    if (!existing) return null;

    const newAttempts = existing.attempts;
    const isTerminal = newAttempts >= maxAttempts;

    const nextAttemptAt = new Date(Date.now() + backoffMs);

    return NotificationOutbox.findOneAndUpdate(
      {
        eventId,
        leaseToken,
        status: 'dispatching',
      },
      {
        $set: {
          status: isTerminal ? 'dead_letter' : 'pending',
          nextAttemptAt: isTerminal ? existing.nextAttemptAt : nextAttemptAt,
          leaseToken: null,
          leaseExpiresAt: null,
          lastError: errorMsg.slice(0, 1000), // sanitize / truncate error text
        },
      },
      {
        new: true,
      }
    );
  }

  /**
   * Recovers expired dispatch leases back to pending state.
   */
  async recoverExpiredLeases(): Promise<number> {
    const now = new Date();
    const result = await NotificationOutbox.updateMany(
      {
        status: 'dispatching',
        leaseExpiresAt: { $lt: now },
      },
      {
        $set: {
          status: 'pending',
          leaseToken: null,
          leaseExpiresAt: null,
        },
      }
    );
    return result.modifiedCount;
  }

  /**
   * Safely marks a terminal dead-letter event as eligible for operational redrive with an incremented generation.
   */
  async redriveDeadLetter(eventId: string): Promise<INotificationOutbox | null> {
    return NotificationOutbox.findOneAndUpdate(
      {
        eventId,
        status: 'dead_letter',
      },
      {
        $set: {
          status: 'pending',
          attempts: 0,
          nextAttemptAt: new Date(),
          leaseToken: null,
          leaseExpiresAt: null,
          lastError: null,
        },
        $inc: {
          dispatchGeneration: 1,
        },
      },
      {
        new: true,
      }
    );
  }
}

export const notificationOutboxRepository = new NotificationOutboxRepository();

