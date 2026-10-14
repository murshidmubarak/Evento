import { paymentReminderService, ReminderProcessingResult } from './payment-reminder.service.js';
import { paymentReminderQueueService, EnqueueScanResult } from '../queues/payment-reminder.queue.js';

export interface SchedulerRunSummary {
  startedAt: Date;
  completedAt: Date;
  dueDateCount: number;
  expiryCount: number;
  dueDateReminders: ReminderProcessingResult[];
  expiryWarnings: ReminderProcessingResult[];
}

export class ReminderSchedulerService {
  private timer: NodeJS.Timeout | null = null;
  private intervalMs: number = 3600000; // 1 hour default

  constructor() {
    const customInterval = process.env.REMINDER_CHECK_INTERVAL_MS;
    if (customInterval && !isNaN(parseInt(customInterval, 10))) {
      this.intervalMs = Math.max(10000, parseInt(customInterval, 10)); // Minimum 10 seconds safety
    }
  }

  /**
   * Starts the background scheduler loop.
   * @deprecated Scheduling is now performed by the BullMQ JobScheduler in the dedicated worker process.
   */
  start(_customIntervalMs?: number): void {
    console.warn(
      '⚠️ [ReminderScheduler] In-process setInterval scheduler is deprecated. Payment reminder scheduling is managed via BullMQ in the dedicated worker (npm run worker).'
    );
  }

  /**
   * Stops any legacy background scheduler loop cleanly.
   */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      console.log('🛑 [ReminderScheduler] Stopped background reminder service.');
    }
  }

  /**
   * Returns current active status of the scheduler timer.
   */
  isActive(): boolean {
    return this.timer !== null;
  }

  /**
   * Triggers an asynchronous reminder scan job via BullMQ.
   */
  async triggerManualRun(referenceDate: Date = new Date(), eventId?: string): Promise<EnqueueScanResult> {
    return paymentReminderQueueService.enqueueReminderScan({
      referenceDate,
      eventId,
      isManual: true,
    });
  }

  /**
   * Direct synchronous execution utility for testing or debugging without BullMQ.
   */
  async executeJobDirectly(referenceDate: Date = new Date(), eventId?: string): Promise<SchedulerRunSummary> {
    const startedAt = new Date();
    const results = await paymentReminderService.runAllReminders(referenceDate, eventId);
    return {
      startedAt,
      completedAt: new Date(),
      dueDateCount: results.dueDateReminders.length,
      expiryCount: results.expiryWarnings.length,
      dueDateReminders: results.dueDateReminders,
      expiryWarnings: results.expiryWarnings,
    };
  }
}

export const reminderSchedulerService = new ReminderSchedulerService();
