import crypto from 'node:crypto';
import { env } from '../../../config/env.js';
import {
  PushDeliveryRepository,
  pushDeliveryRepository,
} from '../repository/push-delivery.repository.js';
import {
  PushDeliveryQueueService,
  pushDeliveryQueueService,
} from '../queues/push-delivery.queue.js';
import type { IPushDelivery } from '../model/push-delivery.model.js';

export class PushDeliveryDispatcherService {
  private deliveryRepo: PushDeliveryRepository;
  private queueService: PushDeliveryQueueService;

  private pollIntervalMs: number = 2500;
  private batchSize: number = 20;
  private leaseDurationMs: number = 30000;
  private timer: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;
  private isDispatching: boolean = false;
  private activeDispatchPromise: Promise<number> | null = null;
  private dispatcherId: string;

  // Backoff tracking for Redis outages
  private consecutiveRedisFailures: number = 0;
  private maxBackoffDelayMs: number = 30000;
  private currentBackoffDelayMs: number = 2500;

  constructor(
    deliveryRepo?: PushDeliveryRepository,
    queueService?: PushDeliveryQueueService
  ) {
    this.deliveryRepo = deliveryRepo || pushDeliveryRepository;
    this.queueService = queueService || pushDeliveryQueueService;
    this.dispatcherId = `dispatcher:${process.pid}:${crypto.randomBytes(4).toString('hex')}`;
  }

  public getDispatcherId(): string {
    return this.dispatcherId;
  }

  /**
   * Starts the polling loop for pending push delivery intents.
   */
  public start(pollIntervalMs = 2500, batchSize = 20): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.pollIntervalMs = pollIntervalMs;
    this.batchSize = batchSize;
    this.consecutiveRedisFailures = 0;

    console.log(
      `🚀 [PushDispatcher] Started push delivery dispatcher (Poll: ${pollIntervalMs}ms, Batch: ${batchSize})`
    );
    this.scheduleNextPoll();
  }

  /**
   * Stops the polling loop and cancels any active timer.
   */
  public async stop(): Promise<void> {
    this.isRunning = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    if (this.activeDispatchPromise) {
      await this.activeDispatchPromise.catch(() => {});
    }

    console.log('🛑 [PushDispatcher] Stopped push delivery dispatcher.');
  }

  private scheduleNextPoll(delayMs = this.pollIntervalMs): void {
    if (!this.isRunning) return;
    if (this.timer) clearTimeout(this.timer);

    this.timer = setTimeout(async () => {
      try {
        await this.dispatchPending();
      } catch (err: any) {
        console.error('⚠️ [PushDispatcher] Error during poll cycle:', err.message);
      } finally {
        if (this.isRunning) {
          const nextDelay =
            this.consecutiveRedisFailures > 0
              ? this.currentBackoffDelayMs
              : this.pollIntervalMs;
          this.scheduleNextPoll(nextDelay);
        }
      }
    }, delayMs);
  }

  /**
   * Immediate dispatch trigger called after persisting notification deliveries.
   */
  public async triggerDispatch(): Promise<number> {
    return this.dispatchPending();
  }

  /**
   * Main dispatch iteration:
   * 1. Recovers expired leases.
   * 2. Atomically claims due pending deliveries.
   * 3. Enqueues jobs to notification-push BullMQ queue.
   * 4. Updates records to 'queued' upon BullMQ acknowledgment.
   */
  public async dispatchPending(): Promise<number> {
    if (this.isDispatching && this.activeDispatchPromise) {
      return this.activeDispatchPromise;
    }

    this.isDispatching = true;
    this.activeDispatchPromise = (async () => {
      let dispatchedCount = 0;
      try {
        // 1. Recover stale leases
        await this.deliveryRepo.recoverExpiredLeases();

        // 2. Pause dispatching if VAPID is unconfigured on server (unless mock/test mode is active)
        if (!env.vapid.isConfigured && !this.queueService.getIsMockMode()) {
          return 0;
        }

        // 3. Claim batch of due deliveries
        const claimed = await this.deliveryRepo.claimDueDeliveries(
          this.batchSize,
          this.dispatcherId,
          this.leaseDurationMs
        );

        if (claimed.length === 0) {
          return 0;
        }

        // 3. Enqueue into BullMQ queue
        for (const delivery of claimed) {
          try {
            await this.queueService.enqueuePushDelivery(
              delivery._id.toString(),
              delivery.dispatchGeneration,
              delivery.notificationId.toString(),
              delivery.subscriptionId.toString()
            );

            // 4. Mark queued only after BullMQ acknowledgment
            await this.deliveryRepo.markQueued(delivery._id, this.dispatcherId);
            dispatchedCount++;
          } catch (enqueueErr: any) {
            console.warn(
              `⚠️ [PushDispatcher] Failed to enqueue delivery ${delivery._id} (Redis down?): ${enqueueErr.message}`
            );
            // Delivery record remains intact in MongoDB with its lease expiring naturally
            this.handleRedisFailure();
            break; // Stop batch on Redis outage
          }
        }

        if (dispatchedCount > 0) {
          this.consecutiveRedisFailures = 0;
          this.currentBackoffDelayMs = this.pollIntervalMs;
        }

        return dispatchedCount;
      } finally {
        this.isDispatching = false;
        this.activeDispatchPromise = null;
      }
    })();

    return this.activeDispatchPromise;
  }

  private handleRedisFailure(): void {
    this.consecutiveRedisFailures++;
    this.currentBackoffDelayMs = Math.min(
      this.pollIntervalMs * Math.pow(2, this.consecutiveRedisFailures),
      this.maxBackoffDelayMs
    );
    console.warn(
      `⚠️ [PushDispatcher] Redis unavailable. Exponential backoff set to ${this.currentBackoffDelayMs}ms`
    );
  }
}

export const pushDeliveryDispatcherService = new PushDeliveryDispatcherService();

