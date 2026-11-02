import webpush from 'web-push';
import mongoose from 'mongoose';
import { env } from '../../../config/env.js';
import { PushDelivery, type IPushDelivery } from '../model/push-delivery.model.js';
import { PushSubscription, type IPushSubscription } from '../model/push-subscription.model.js';
import { Notification, type INotification } from '../model/notification.model.js';
import {
  PushDeliveryRepository,
  pushDeliveryRepository,
} from '../repository/push-delivery.repository.js';
import {
  PushSubscriptionRepository,
  pushSubscriptionRepository,
} from '../repository/push-subscription.repository.js';

export type PushSendFunction = (
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  payload: string,
  options?: webpush.RequestOptions
) => Promise<webpush.SendResult>;

export class PushDeliveryService {
  private deliveryRepo: PushDeliveryRepository;
  private subscriptionRepo: PushSubscriptionRepository;
  private mockSender: PushSendFunction | null = null;
  private vapidConfigured: boolean = false;

  constructor(
    deliveryRepo?: PushDeliveryRepository,
    subscriptionRepo?: PushSubscriptionRepository
  ) {
    this.deliveryRepo = deliveryRepo || pushDeliveryRepository;
    this.subscriptionRepo = subscriptionRepo || pushSubscriptionRepository;
    this.initVapid();
  }

  /**
   * Initializes VAPID details with web-push library once during boot.
   */
  public initVapid(): void {
    if (env.vapid.isConfigured && env.vapid.subject && env.vapid.publicKey && env.vapid.privateKey) {
      try {
        webpush.setVapidDetails(
          env.vapid.subject,
          env.vapid.publicKey,
          env.vapid.privateKey
        );
        this.vapidConfigured = true;
      } catch (err: any) {
        console.error('⚠️ [PushDeliveryService] Failed to set VAPID details:', err.message);
        this.vapidConfigured = false;
      }
    } else {
      this.vapidConfigured = false;
    }
  }

  /**
   * Test Hook: Injects a mock sender to simulate external Web Push service behavior.
   */
  public setMockSender(mock: PushSendFunction | null): void {
    this.mockSender = mock;
  }

  /**
   * Builds the minimal notification payload.
   * Strips all internal authentication tokens, database IDs, and sensitive data.
   */
  public buildPushPayload(notification: INotification): string {
    return JSON.stringify({
      notificationId: notification._id.toString(),
      title: notification.title,
      body: notification.message,
      destinationRoute: notification.destinationRoute || '/dashboard',
      tag: `eventops-${notification._id.toString()}`,
      type: notification.type,
      createdAt: notification.createdAt,
    });
  }

  /**
   * Core processing function for a single durable push delivery record.
   */
  public async processDelivery(deliveryId: string): Promise<IPushDelivery | null> {
    const delivery = await this.deliveryRepo.findById(deliveryId);
    if (!delivery) {
      console.warn(`⚠️ [PushDelivery] Delivery record ${deliveryId} not found`);
      return null;
    }

    // Idempotency: Skip if already reached terminal successful state
    if (delivery.status === 'sent') {
      return delivery;
    }

    // Confirm delivery is still active / valid
    if (['invalid_subscription', 'dead_letter'].includes(delivery.status)) {
      return delivery;
    }

    // 1. Mark status as 'sending'
    await this.deliveryRepo.markSending(delivery._id);

    // 2. Load referenced Notification
    const notification = await Notification.findById(delivery.notificationId);
    if (!notification) {
      await this.deliveryRepo.markDeadLetter(
        delivery._id,
        'permanent',
        'Referenced notification record does not exist or was deleted'
      );
      return this.deliveryRepo.findById(deliveryId);
    }

    // Verify recipient ownership on notification
    if (notification.recipientId.toString() !== delivery.recipientId.toString()) {
      await this.deliveryRepo.markDeadLetter(
        delivery._id,
        'permanent',
        'Notification recipient mismatch with delivery intent'
      );
      return this.deliveryRepo.findById(deliveryId);
    }

    // 3. Load referenced PushSubscription with encryption keys
    const subscription = await PushSubscription.findById(delivery.subscriptionId).select(
      '+keys.p256dh +keys.auth'
    );

    if (!subscription) {
      await this.deliveryRepo.markInvalidSubscription(
        delivery._id,
        'Subscription record does not exist or was removed'
      );
      return this.deliveryRepo.findById(deliveryId);
    }

    // 4. Verify subscription status
    if (subscription.status !== 'active') {
      await this.deliveryRepo.markInvalidSubscription(
        delivery._id,
        `Subscription is not active (status: ${subscription.status})`
      );
      return this.deliveryRepo.findById(deliveryId);
    }

    // 5. CRITICAL SECURITY: Shared-Device Ownership Revalidation
    // If the browser device was subsequently logged in and claimed by another user,
    // do NOT send the old account's notification to this device!
    if (subscription.userId.toString() !== delivery.recipientId.toString()) {
      console.warn(
        `🛡️ [PushDelivery] Security Guard: Subscription ${subscription._id} was reassigned to user ${subscription.userId}. Aborting delivery for recipient ${delivery.recipientId}.`
      );
      await this.deliveryRepo.markInvalidSubscription(
        delivery._id,
        'Subscription endpoint was reassigned to another user account'
      );
      return this.deliveryRepo.findById(deliveryId);
    }

    // 6. Check VAPID configuration
    if (!this.vapidConfigured && !this.mockSender) {
      this.initVapid();
      if (!this.vapidConfigured) {
        if (!env.vapid.isConfigured) {
          // Missing application configuration:
          // Safely pause delivery in pending state without exhausting attemptCount or deactivating the subscription.
          // When valid configuration becomes available, pending deliveries are recoverable without duplicate records.
          console.warn(
            `⏸️ [PushDelivery] VAPID credentials not configured on server. Pausing delivery ${delivery._id}.`
          );
          await this.deliveryRepo.markConfigurationPending(
            delivery._id,
            'VAPID credentials are not configured on server'
          );
          return this.deliveryRepo.findById(deliveryId);
        } else {
          // Invalid VAPID credentials provided on server (malformed keys / failed initialization):
          // Move to dead_letter with 'configuration' category (do NOT deactivate the user's PushSubscription)
          console.error(
            `❌ [PushDelivery] Invalid VAPID credentials provided on server for delivery ${delivery._id}.`
          );
          await this.deliveryRepo.markDeadLetter(
            delivery._id,
            'configuration',
            'Invalid VAPID credentials provided on server'
          );
          return this.deliveryRepo.findById(deliveryId);
        }
      }
    }

    // 7. Build minimal payload
    const payload = this.buildPushPayload(notification);
    const subTarget = {
      endpoint: subscription.endpoint,
      keys: {
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
      },
    };

    const pushOptions: webpush.RequestOptions = {
      TTL: 86400, // 24 hours
      urgency: 'high',
    };

    // 8. Send to Web Push Service
    try {
      if (this.mockSender) {
        await this.mockSender(subTarget, payload, pushOptions);
      } else {
        await webpush.sendNotification(subTarget, payload, pushOptions);
      }

      // Success (HTTP 201/200 acceptance by push provider)
      await this.deliveryRepo.markSent(delivery._id, new Date());
      await this.subscriptionRepo.recordDeliverySuccess(subscription._id);
    } catch (err: any) {
      const statusCode = err.statusCode || (err.response ? err.response.status : undefined);
      const errorMessage = err.message || 'Push transmission failed';

      // 404 Not Found or 410 Gone → Client unregistered or subscription expired
      if (statusCode === 404 || statusCode === 410) {
        console.info(`ℹ️ [PushDelivery] Subscription expired (HTTP ${statusCode}): ${subscription.endpointHash}`);
        await this.subscriptionRepo.markInvalid(
          subscription.endpointHash,
          `Push service returned HTTP ${statusCode} (unsubscribed/expired)`
        );
        await this.deliveryRepo.markInvalidSubscription(
          delivery._id,
          `Push service rejected: HTTP ${statusCode}`
        );
      }
      // VAPID authorization failure (HTTP 401 Unauthorized / 403 Forbidden from Push Service)
      else if (statusCode === 401 || statusCode === 403) {
        console.error(`❌ [PushDelivery] VAPID authentication rejected by push service (HTTP ${statusCode}): ${errorMessage}`);
        // Mark delivery dead_letter with 'configuration' category without deactivating user's device subscription
        await this.deliveryRepo.markDeadLetter(
          delivery._id,
          'configuration',
          `VAPID authentication rejected by push service: HTTP ${statusCode} (${errorMessage})`
        );
      }
      // Temporary errors: HTTP 429 (rate limit), 5xx (server error), network timeouts
      else if (
        statusCode === 429 ||
        (statusCode >= 500 && statusCode < 600) ||
        err.code === 'ECONNRESET' ||
        err.code === 'ETIMEDOUT' ||
        err.code === 'ECONNREFUSED' ||
        err.name === 'FetchError'
      ) {
        const nextAttemptCount = delivery.attemptCount + 1;
        if (nextAttemptCount < delivery.maxAttempts) {
          // Bounded exponential backoff: 5s, 15s, 45s, 120s
          const backoffDelays = [5000, 15000, 45000, 120000];
          const delayMs = backoffDelays[delivery.attemptCount] || 120000;
          const nextAttemptAt = new Date(Date.now() + delayMs);

          console.warn(
            `⚠️ [PushDelivery] Temporary error for ${delivery._id} (HTTP ${statusCode || err.code}): ${errorMessage}. Retrying in ${delayMs}ms`
          );
          await this.deliveryRepo.markRetryPending(
            delivery._id,
            'temporary',
            errorMessage,
            nextAttemptAt
          );
          await this.subscriptionRepo.recordDeliveryFailure(subscription._id, errorMessage);
        } else {
          console.error(
            `❌ [PushDelivery] Max retries exhausted (${delivery.maxAttempts}) for ${delivery._id}. Moving to dead_letter.`
          );
          await this.deliveryRepo.markDeadLetter(
            delivery._id,
            'temporary',
            `Exhausted retries: ${errorMessage}`
          );
          await this.subscriptionRepo.recordDeliveryFailure(subscription._id, errorMessage);
        }
      }
      // Permanent errors (400 Bad Request, 401 Unauthorized, payload too large, etc.)
      else {
        console.error(`❌ [PushDelivery] Permanent push error for ${delivery._id}: ${errorMessage}`);
        await this.deliveryRepo.markDeadLetter(
          delivery._id,
          'permanent',
          `Permanent error: ${errorMessage}`
        );
        await this.subscriptionRepo.recordDeliveryFailure(subscription._id, errorMessage);
      }
    }

    return this.deliveryRepo.findById(deliveryId);
  }
}

export const pushDeliveryService = new PushDeliveryService();

