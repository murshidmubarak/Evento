import { paymentReminderService, ReminderProcessingResult } from './payment-reminder.service.js';

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
  private isRunningJob: boolean = false;
  private intervalMs: number = 3600000; // 1 hour default

  constructor() {
    const customInterval = process.env.REMINDER_CHECK_INTERVAL_MS;
    if (customInterval && !isNaN(parseInt(customInterval, 10))) {
      this.intervalMs = Math.max(10000, parseInt(customInterval, 10)); // Minimum 10 seconds safety
    }
  }

  /**
   * Starts the background scheduler loop.
   */
  start(customIntervalMs?: number): void {
    if (this.timer) {
      return; // Already running
    }

    if (customIntervalMs && customIntervalMs >= 1000) {
      this.intervalMs = customIntervalMs;
    }

    // Run first check shortly after boot (e.g., 5 seconds) to catch pending items
    const initialDelay = process.env.NODE_ENV === 'test' ? 0 : 5000;
    setTimeout(() => {
      this.executeJob().catch((err) => {
        console.error('[ReminderScheduler] Initial execution error:', err);
      });
    }, initialDelay);

    // Schedule periodic execution
    this.timer = setInterval(() => {
      this.executeJob().catch((err) => {
        console.error('[ReminderScheduler] Scheduled execution error:', err);
      });
    }, this.intervalMs);

    console.log(`⏰ [ReminderScheduler] Started background reminder service (interval: ${this.intervalMs / 1000}s)`);
  }

  /**
   * Stops the background scheduler loop cleanly.
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
   * Triggers an immediate execution of the reminder job.
   */
  async triggerManualRun(referenceDate: Date = new Date(), eventId?: string): Promise<SchedulerRunSummary> {
    return this.executeJob(referenceDate, eventId);
  }

  /**
   * Internal job runner with concurrency protection and safe error handling.
   */
  private async executeJob(referenceDate: Date = new Date(), eventId?: string): Promise<SchedulerRunSummary> {
    if (this.isRunningJob) {
      console.log('⏳ [ReminderScheduler] Job execution already in progress, skipping overlap.');
      return {
        startedAt: new Date(),
        completedAt: new Date(),
        dueDateCount: 0,
        expiryCount: 0,
        dueDateReminders: [],
        expiryWarnings: [],
      };
    }

    this.isRunningJob = true;
    const startedAt = new Date();

    try {
      const results = await paymentReminderService.runAllReminders(referenceDate, eventId);

      const summary: SchedulerRunSummary = {
        startedAt,
        completedAt: new Date(),
        dueDateCount: results.dueDateReminders.length,
        expiryCount: results.expiryWarnings.length,
        dueDateReminders: results.dueDateReminders,
        expiryWarnings: results.expiryWarnings,
      };

      if (summary.dueDateCount > 0 || summary.expiryCount > 0) {
        console.log(
          `🔔 [ReminderScheduler] Processed ${summary.dueDateCount} due-date reminder(s) and ${summary.expiryCount} expiry warning(s).`
        );
      }

      return summary;
    } catch (error) {
      console.error('❌ [ReminderScheduler] Unexpected error during reminder processing:', error);
      return {
        startedAt,
        completedAt: new Date(),
        dueDateCount: 0,
        expiryCount: 0,
        dueDateReminders: [],
        expiryWarnings: [],
      };
    } finally {
      this.isRunningJob = false;
    }
  }
}

export const reminderSchedulerService = new ReminderSchedulerService();
