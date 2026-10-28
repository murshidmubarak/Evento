import { Redis } from 'ioredis';
import { env } from '../config/env.js';
import { getSocketServer } from './socket.server.js';
import type { INotification } from '../modules/notifications/model/notification.model.js';

export const NOTIFICATION_REALTIME_CHANNEL = 'eventops:notifications:realtime';

export interface RealtimeNotificationPayload {
  recipientId: string;
  notification: Partial<INotification>;
  originId: string;
}

export class NotificationTransport {
  private redisPublisher: Redis | null = null;
  private redisSubscriber: Redis | null = null;
  private readonly instanceId: string = `proc_${process.pid}_${Math.random().toString(36).substring(2, 8)}`;
  private isSubscriberInitialized: boolean = false;
  private isMockMode: boolean = process.env.NODE_ENV === 'test' || !env.redisUrl;

  constructor() {}

  public setMockMode(enabled: boolean): void {
    this.isMockMode = enabled;
  }

  private getPublisher(): Redis | null {
    if (this.isMockMode || !env.redisUrl) return null;
    if (!this.redisPublisher) {
      try {
        this.redisPublisher = new Redis(env.redisUrl, {
          maxRetriesPerRequest: 1,
          enableReadyCheck: false,
          retryStrategy: (times) => Math.min(times * 200, 2000),
        });
        this.redisPublisher.on('error', (err) => {
          console.warn('⚠️ [NotificationTransport] Redis publisher warning:', err.message);
        });
      } catch (err: any) {
        console.warn('⚠️ [NotificationTransport] Failed to initialize Redis publisher:', err.message);
        this.redisPublisher = null;
      }
    }
    return this.redisPublisher;
  }

  /**
   * Initializes the Redis subscriber in processes running the Socket.IO server.
   */
  public initSubscriber(): void {
    if (this.isMockMode || this.isSubscriberInitialized || !env.redisUrl) return;

    try {
      this.redisSubscriber = new Redis(env.redisUrl, {
        maxRetriesPerRequest: 1,
        enableReadyCheck: false,
        retryStrategy: (times) => Math.min(times * 200, 2000),
      });

      this.redisSubscriber.on('error', (err) => {
        console.warn('⚠️ [NotificationTransport] Redis subscriber warning:', err.message);
      });

      this.redisSubscriber.subscribe(NOTIFICATION_REALTIME_CHANNEL, (err) => {
        if (err) {
          console.warn('⚠️ [NotificationTransport] Failed to subscribe to realtime channel:', err.message);
        } else {
          this.isSubscriberInitialized = true;
        }
      });

      this.redisSubscriber.on('message', (channel, message) => {
        if (channel !== NOTIFICATION_REALTIME_CHANNEL) return;

        try {
          const payload: RealtimeNotificationPayload = JSON.parse(message);
          // If message originated from this same process and was already emitted locally, skip
          if (payload.originId === this.instanceId) return;

          const io = getSocketServer();
          if (io) {
            io.to(`user:${payload.recipientId}`).emit('notification', payload.notification);
          }
        } catch (parseErr: any) {
          console.warn('⚠️ [NotificationTransport] Malformed realtime payload:', parseErr.message);
        }
      });
    } catch (err: any) {
      console.warn('⚠️ [NotificationTransport] Could not initialize Redis subscriber:', err.message);
    }
  }

  /**
   * Dispatches a real-time notification to the specified recipient.
   * If local Socket.IO server is running, emits directly.
   * Also publishes to Redis Pub/Sub so that standalone workers reach connected users on API nodes.
   */
  public async sendNotification(recipientId: string, notification: Partial<INotification>): Promise<void> {
    try {
      // 1. Emit locally if Socket.IO server is running in this process
      const io = getSocketServer();
      if (io) {
        io.to(`user:${recipientId}`).emit('notification', notification);
      }

      // 2. Publish to Redis Pub/Sub for cross-process delivery
      const publisher = this.getPublisher();
      if (publisher) {
        const payload: RealtimeNotificationPayload = {
          recipientId,
          notification,
          originId: this.instanceId,
        };
        await publisher.publish(NOTIFICATION_REALTIME_CHANNEL, JSON.stringify(payload));
      }
    } catch (err: any) {
      // Transport failures must never crash caller or roll back persistence
      console.warn(`⚠️ [NotificationTransport] Real-time delivery warning for recipient ${recipientId}:`, err.message);
    }
  }

  /**
   * Closes Redis connections cleanly during graceful shutdown.
   */
  public async close(): Promise<void> {
    try {
      if (this.redisSubscriber) {
        await this.redisSubscriber.quit().catch(() => {});
        this.redisSubscriber = null;
        this.isSubscriberInitialized = false;
      }
      if (this.redisPublisher) {
        await this.redisPublisher.quit().catch(() => {});
        this.redisPublisher = null;
      }
    } catch {
      // Best-effort cleanup
    }
  }
}

export const notificationTransport = new NotificationTransport();
