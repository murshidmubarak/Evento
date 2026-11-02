import mongoose from 'mongoose';
import {
  PushSubscription,
  type IPushSubscription,
  type IDeviceMetadata,
  type IPushKeys,
  hashEndpoint,
} from '../model/push-subscription.model.js';

export interface UpsertSubscriptionInput {
  userId: string | mongoose.Types.ObjectId;
  endpoint: string;
  keys: IPushKeys;
  device?: IDeviceMetadata;
}

export class PushSubscriptionRepository {
  /**
   * Atomically upserts a subscription by endpointHash.
   * If an existing device with this endpoint exists (even under another user):
   * - Atomically reassigns ownership to the currently authenticated userId (Shared-Device protection).
   * - Restores status to 'active'.
   * - Updates encryption keys and device metadata.
   */
  async upsertSubscription(input: UpsertSubscriptionInput): Promise<IPushSubscription> {
    const endpointHash = hashEndpoint(input.endpoint);
    const userId = typeof input.userId === 'string' ? new mongoose.Types.ObjectId(input.userId) : input.userId;

    const update: any = {
      $set: {
        userId,
        endpoint: input.endpoint.trim(),
        endpointHash,
        'keys.p256dh': input.keys.p256dh.trim(),
        'keys.auth': input.keys.auth.trim(),
        status: 'active',
        failureCount: 0,
        lastFailureReason: null,
        invalidatedAt: null,
      },
    };

    if (input.device) {
      if (input.device.userAgent !== undefined) update.$set['device.userAgent'] = input.device.userAgent;
      if (input.device.deviceType !== undefined) update.$set['device.deviceType'] = input.device.deviceType;
      if (input.device.browser !== undefined) update.$set['device.browser'] = input.device.browser;
      if (input.device.os !== undefined) update.$set['device.os'] = input.device.os;
      if (input.device.label !== undefined) update.$set['device.label'] = input.device.label;
    }

    const doc = await PushSubscription.findOneAndUpdate({ endpointHash }, update, {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
    });

    return doc;
  }

  /**
   * Retrieves all active subscriptions for a given user.
   */
  async findActiveByUserId(
    userId: string | mongoose.Types.ObjectId,
    includeKeys = false
  ): Promise<IPushSubscription[]> {
    const query = PushSubscription.find({
      userId: typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId,
      status: 'active',
    }).sort({ updatedAt: -1 });

    if (includeKeys) {
      query.select('+keys.p256dh +keys.auth');
    }

    return query.exec();
  }

  /**
   * Retrieves a single subscription by ID, verifying user ownership.
   */
  async findByIdAndUserId(
    id: string | mongoose.Types.ObjectId,
    userId: string | mongoose.Types.ObjectId
  ): Promise<IPushSubscription | null> {
    if (!mongoose.Types.ObjectId.isValid(id) || !mongoose.Types.ObjectId.isValid(userId)) {
      return null;
    }

    return PushSubscription.findOne({
      _id: id,
      userId: new mongoose.Types.ObjectId(userId),
    }).exec();
  }

  /**
   * Finds subscription by endpoint hash.
   */
  async findByEndpointHash(endpointHash: string, includeKeys = false): Promise<IPushSubscription | null> {
    const query = PushSubscription.findOne({ endpointHash });
    if (includeKeys) {
      query.select('+keys.p256dh +keys.auth');
    }
    return query.exec();
  }

  /**
   * Finds subscription by raw endpoint URL.
   */
  async findByEndpoint(endpoint: string, includeKeys = false): Promise<IPushSubscription | null> {
    const endpointHash = hashEndpoint(endpoint);
    return this.findByEndpointHash(endpointHash, includeKeys);
  }

  /**
   * Deactivates a subscription owned by the user.
   */
  async deactivateById(
    id: string | mongoose.Types.ObjectId,
    userId: string | mongoose.Types.ObjectId
  ): Promise<boolean> {
    if (!mongoose.Types.ObjectId.isValid(id) || !mongoose.Types.ObjectId.isValid(userId)) {
      return false;
    }

    const result = await PushSubscription.updateOne(
      {
        _id: id,
        userId: new mongoose.Types.ObjectId(userId),
        status: { $ne: 'inactive' },
      },
      {
        $set: {
          status: 'inactive',
          invalidatedAt: new Date(),
        },
      }
    );

    return result.modifiedCount > 0;
  }

  /**
   * Deactivates a subscription matching the browser endpoint and userId.
   */
  async deactivateByEndpoint(
    endpoint: string,
    userId: string | mongoose.Types.ObjectId
  ): Promise<boolean> {
    const endpointHash = hashEndpoint(endpoint);
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return false;
    }

    const result = await PushSubscription.updateOne(
      {
        endpointHash,
        userId: new mongoose.Types.ObjectId(userId),
        status: { $ne: 'inactive' },
      },
      {
        $set: {
          status: 'inactive',
          invalidatedAt: new Date(),
        },
      }
    );

    return result.modifiedCount > 0;
  }

  /**
   * Permanently marks a subscription as invalid (e.g. 404/410 from Push Service).
   */
  async markInvalid(endpointHash: string, reason: string): Promise<void> {
    await PushSubscription.updateOne(
      { endpointHash },
      {
        $set: {
          status: 'invalid',
          invalidatedAt: new Date(),
          lastFailureReason: reason.slice(0, 300),
        },
      }
    );
  }

  /**
   * Records provider acceptance of delivery.
   */
  async recordDeliverySuccess(id: mongoose.Types.ObjectId | string): Promise<void> {
    await PushSubscription.updateOne(
      { _id: id },
      {
        $set: {
          lastUsedAt: new Date(),
          lastSuccessAt: new Date(),
          failureCount: 0,
        },
      }
    );
  }

  /**
   * Records provider rejection or transmission failure.
   */
  async recordDeliveryFailure(id: mongoose.Types.ObjectId | string, reason: string): Promise<void> {
    await PushSubscription.updateOne(
      { _id: id },
      {
        $set: {
          lastUsedAt: new Date(),
          lastFailureReason: reason.slice(0, 300),
        },
        $inc: { failureCount: 1 },
      }
    );
  }
}

export const pushSubscriptionRepository = new PushSubscriptionRepository();

