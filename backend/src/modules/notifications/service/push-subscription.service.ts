import { env } from '../../../config/env.js';
import { ApiError } from '../../../utils/ApiError.js';
import {
  PushSubscriptionRepository,
  pushSubscriptionRepository,
  type UpsertSubscriptionInput,
} from '../repository/push-subscription.repository.js';
import type { IDeviceMetadata, IPushKeys, IPushSubscription } from '../model/push-subscription.model.js';

export interface RegisterSubscriptionDto {
  endpoint: string;
  keys: IPushKeys;
  device?: IDeviceMetadata;
}

export interface PushConfigDto {
  enabled: boolean;
  publicKey: string | null;
}

export interface SafeDeviceSubscriptionDto {
  id: string;
  device: IDeviceMetadata;
  status: string;
  createdAt: Date;
  lastUsedAt?: Date;
  lastSuccessAt?: Date;
}

export class PushSubscriptionService {
  private repository: PushSubscriptionRepository;

  constructor(repository?: PushSubscriptionRepository) {
    this.repository = repository || pushSubscriptionRepository;
  }

  /**
   * Returns safe public Web Push configuration.
   * Never exposes VAPID private credentials.
   */
  getPublicConfig(): PushConfigDto {
    return {
      enabled: env.vapid.isConfigured,
      publicKey: env.vapid.publicKey,
    };
  }

  /**
   * Registers or updates a browser device push subscription.
   * Guarantees atomic ownership re-assignment on account switch.
   */
  async registerSubscription(
    userId: string,
    dto: RegisterSubscriptionDto
  ): Promise<SafeDeviceSubscriptionDto> {
    if (!dto.endpoint || typeof dto.endpoint !== 'string') {
      throw ApiError.badRequest('Valid push subscription endpoint is required');
    }

    const trimmedEndpoint = dto.endpoint.trim();
    if (!trimmedEndpoint.startsWith('https://') && !trimmedEndpoint.startsWith('http://localhost')) {
      throw ApiError.badRequest('Push subscription endpoint must use a secure URL (https://)');
    }

    if (!dto.keys || typeof dto.keys !== 'object') {
      throw ApiError.badRequest('Push subscription encryption keys are required');
    }

    if (!dto.keys.p256dh || typeof dto.keys.p256dh !== 'string' || !dto.keys.p256dh.trim()) {
      throw ApiError.badRequest('Valid p256dh encryption key is required');
    }

    if (!dto.keys.auth || typeof dto.keys.auth !== 'string' || !dto.keys.auth.trim()) {
      throw ApiError.badRequest('Valid auth encryption secret is required');
    }

    const upsertData: UpsertSubscriptionInput = {
      userId,
      endpoint: trimmedEndpoint,
      keys: {
        p256dh: dto.keys.p256dh.trim(),
        auth: dto.keys.auth.trim(),
      },
      device: {
        userAgent: dto.device?.userAgent?.trim().slice(0, 500) || '',
        deviceType: dto.device?.deviceType || 'unknown',
        browser: dto.device?.browser?.trim().slice(0, 50) || 'Unknown Browser',
        os: dto.device?.os?.trim().slice(0, 50) || 'Unknown OS',
        label: dto.device?.label?.trim().slice(0, 100) || 'Web Browser',
      },
    };

    const doc = await this.repository.upsertSubscription(upsertData);

    return {
      id: doc._id.toString(),
      device: doc.device,
      status: doc.status,
      createdAt: doc.createdAt,
      lastUsedAt: doc.lastUsedAt,
      lastSuccessAt: doc.lastSuccessAt,
    };
  }

  /**
   * Returns active device subscriptions owned by the authenticated user.
   */
  async getUserSubscriptions(userId: string): Promise<SafeDeviceSubscriptionDto[]> {
    const subs = await this.repository.findActiveByUserId(userId);
    return subs.map((s) => ({
      id: s._id.toString(),
      device: s.device,
      status: s.status,
      createdAt: s.createdAt,
      lastUsedAt: s.lastUsedAt,
      lastSuccessAt: s.lastSuccessAt,
    }));
  }

  /**
   * Deactivates a specific device subscription owned by the authenticated user.
   */
  async deleteSubscription(userId: string, subscriptionId: string): Promise<void> {
    const existing = await this.repository.findByIdAndUserId(subscriptionId, userId);
    if (!existing) {
      throw ApiError.notFound('Subscription not found or not owned by current user');
    }

    await this.repository.deactivateById(subscriptionId, userId);
  }

  /**
   * Deactivates the subscription identified by the current browser endpoint.
   */
  async deleteCurrentSubscription(userId: string, endpoint: string): Promise<void> {
    if (!endpoint || typeof endpoint !== 'string') {
      throw ApiError.badRequest('Subscription endpoint is required');
    }

    await this.repository.deactivateByEndpoint(endpoint.trim(), userId);
  }
}

export const pushSubscriptionService = new PushSubscriptionService();

