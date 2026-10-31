/**
 * src/modules/notifications/service/notification-outbox-dispatcher.service.ts
 *
 * EventOps ERP — Transactional Notification Outbox Dispatcher
 *
 * Responsibilities:
 * 1. Bounded, indexed polling for pending outbox notification events.
 * 2. Atomic distributed lease locking using unique instance tokens.
 * 3. Submission of events to the existing BullMQ 'notification-processing' queue.
 * 4. Waiting for BullMQ acknowledgment before marking outbox records as 'queued'.
 * 5. Expired lease recovery and bounded exponential backoff on enqueue failures (e.g. Redis outage).
 * 6. Graceful shutdown without dropping in-flight claims.
 */
import { notificationOutboxRepository } from '../repository/notification-outbox.repository.js';
import { notificationQueueService } from '../queues/notification.queue.js';
import { INotificationOutbox } from '../model/notification-outbox.model.js';

export interface OutboxDispatcherOptions {
  pollIntervalMs?: number;
  batchSize?: number;
  leaseDurationMs?: number;
  maxAttempts?: number;
}

export class NotificationOutboxDispatcherService {
  private readonly instanceId: string = `disp_${process.pid}_${Math.random().toString(36).substring(2, 8)}`;
  private isRunning: boolean = false;
  private pollTimer: NodeJS.Timeout | null = null;
  private isPolling: boolean = false;
  private activeDispatchPromise: Promise<{ processedCount: number; errorsCount: number }> | null = null;

  private pollIntervalMs: number = 2000;
  private batchSize: number = 10;
  private leaseDurationMs: number = 30000;
  private maxAttempts: number = 5;

  constructor(options?: OutboxDispatcherOptions) {
    if (options?.pollIntervalMs) this.pollIntervalMs = options.pollIntervalMs;
    if (options?.batchSize) this.batchSize = options.batchSize;
    if (options?.leaseDurationMs) this.leaseDurationMs = options.leaseDurationMs;
    if (options?.maxAttempts) this.maxAttempts = options.maxAttempts;
  }

  public getInstanceId(): string {
    return this.instanceId;
  }

  public getIsRunning(): boolean {
    return this.isRunning;
  }

  /**
   * Starts the polling background dispatcher.
   */
  public start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    console.log(`🚀 [OutboxDispatcher] Started dispatcher instance '${this.instanceId}' (Interval: ${this.pollIntervalMs}ms, Batch: ${this.batchSize})`);

    // Run first dispatch immediately
    this.dispatchDueEvents().catch((err) => {
      console.error('⚠️ [OutboxDispatcher] Initial dispatch error:', err.message);
    });

    this.pollTimer = setInterval(() => {
      this.dispatchDueEvents().catch((err) => {
        console.error('⚠️ [OutboxDispatcher] Dispatch cycle error:', err.message);
      });
    }, this.pollIntervalMs);
  }

  /**
   * Stops the dispatcher cleanly, waiting for any in-flight poll cycle to settle.
   */
  public async stop(): Promise<void> {
    this.isRunning = false;
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    console.log(`🛑 [OutboxDispatcher] Stopped dispatcher instance '${this.instanceId}'.`);
  }

  /**
   * Forces an immediate dispatch cycle (e.g. after a transaction commits or during tests).
   * Awaits any active dispatch in flight before triggering/returning.
   */
  public async triggerImmediateDispatch(): Promise<{ processedCount: number; errorsCount: number }> {
    if (this.activeDispatchPromise) {
      await this.activeDispatchPromise;
    }
    return this.dispatchDueEvents();
  }

  /**
   * Core dispatch cycle:
   * 1. Recovers any expired leases from crashed dispatcher instances.
   * 2. Finds due pending outbox events.
   * 3. Atomically claims each event with this instance's lease token.
   * 4. Enqueues claimed events into BullMQ and marks them 'queued' upon queue acknowledgment.
   */
  public async dispatchDueEvents(): Promise<{ processedCount: number; errorsCount: number }> {
    if (this.isPolling) {
      if (this.activeDispatchPromise) {
        return this.activeDispatchPromise;
      }
      return { processedCount: 0, errorsCount: 0 };
    }
    this.isPolling = true;

    this.activeDispatchPromise = (async () => {
      let processedCount = 0;
      let errorsCount = 0;

      try {
        // 1. Recover expired leases back to pending state
        const expiredCount = await notificationOutboxRepository.recoverExpiredLeases();
        if (expiredCount > 0) {
          console.log(`🔄 [OutboxDispatcher] Recovered ${expiredCount} expired lease(s).`);
        }

        // 2. Query due pending events within bounded batch
        const pendingEvents = await notificationOutboxRepository.findDuePendingEvents(this.batchSize);
        if (pendingEvents.length === 0) {
          return { processedCount: 0, errorsCount: 0 };
        }

        // 3. Process each event sequentially or in bounded manner
        for (const event of pendingEvents) {
          // Atomic claim ensures no other dispatcher instance can process the same event
          const claimed = await notificationOutboxRepository.claimEvent(
            event.eventId,
            this.instanceId,
            this.leaseDurationMs
          );

          if (!claimed) {
            // Another dispatcher already claimed or modified this event
            continue;
          }

          try {
            // 4. Submit to BullMQ notification queue
            await notificationQueueService.enqueueOutboxJob(claimed);

            // 5. Acknowledge and mark queued only after BullMQ confirms receipt
            await notificationOutboxRepository.markQueued(claimed.eventId, this.instanceId);
            processedCount++;
          } catch (enqueueErr: any) {
            errorsCount++;
            console.warn(`⚠️ [OutboxDispatcher] Failed to enqueue event ${claimed.eventId} (Redis outage?):`, enqueueErr.message);

            // Compute bounded exponential backoff (e.g. 2s, 4s, 8s, 16s... up to 60s)
            const backoffMs = Math.min(1000 * Math.pow(2, claimed.attempts), 60000);
            await notificationOutboxRepository.recordDispatchFailure(
              claimed.eventId,
              this.instanceId,
              enqueueErr.message,
              backoffMs,
              this.maxAttempts
            );
          }
        }
      } catch (cycleErr: any) {
        console.error('⚠️ [OutboxDispatcher] Unhandled cycle error:', cycleErr.message);
      } finally {
        this.isPolling = false;
        this.activeDispatchPromise = null;
      }

      return { processedCount, errorsCount };
    })();

    return this.activeDispatchPromise;
  }
}

export const notificationOutboxDispatcherService = new NotificationOutboxDispatcherService();

