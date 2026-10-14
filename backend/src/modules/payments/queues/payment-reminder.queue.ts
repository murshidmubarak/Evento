import { Queue, Worker, Job } from 'bullmq';
import { Redis } from 'ioredis';
import crypto from 'node:crypto';
import { env } from '../../../config/env.js';
import {
  paymentReminderService,
  DueDateReminderCandidate,
  ExpiryWarningCandidate,
  ReminderProcessingResult,
} from '../service/payment-reminder.service.js';
import { PaymentReminderLog, IPaymentReminderLog } from '../model/payment-reminder-log.model.js';
import { ApiError } from '../../../utils/ApiError.js';
import { Types } from 'mongoose';

export const REMINDER_SCAN_QUEUE_NAME = 'payment-reminder-scan';
export const REMINDER_EMAIL_QUEUE_NAME = 'payment-reminder-email';
export const RECURRING_SCAN_SCHEDULER_ID = 'periodic-payment-reminder-scan';

export interface ReminderScanJobData {
  referenceDate?: string;
  eventId?: string;
  isManual?: boolean;
  triggeredBy?: string;
  enqueuedAt?: string;
}

export interface ReminderEmailJobData {
  reminderLogId: string;
  dedupKey: string;
  reminderType: 'due_date' | 'link_expiry';
  eventId: string;
  quotationId: string;
  installmentIndex: number;
}

export interface EnqueueScanResult {
  jobId: string;
  status: 'queued';
  enqueuedAt: Date;
}

/**
 * Lightweight in-memory queue adapter for testing without an external Redis instance.
 */
export class InMemoryQueue<T = any> {
  public name: string;
  public jobs: { id: string; name: string; data: T; opts?: any }[] = [];
  public schedulers: Map<string, { repeat: any; template: any }> = new Map();

  constructor(name: string) {
    this.name = name;
  }

  async add(jobName: string, data: T, opts?: any): Promise<{ id: string; name: string; data: T; opts?: any }> {
    const id = opts?.jobId || `mock_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const job = { id, name: jobName, data, opts };
    this.jobs.push(job);
    return job;
  }

  async upsertJobScheduler(schedulerId: string, repeat: any, template: any): Promise<boolean> {
    this.schedulers.set(schedulerId, { repeat, template });
    return true;
  }

  async getJob(jobId: string) {
    return this.jobs.find((j) => j.id === jobId) || null;
  }

  async count(): Promise<number> {
    return this.jobs.length;
  }

  async close(): Promise<void> {
    this.jobs = [];
    this.schedulers.clear();
  }

  clear(): void {
    this.jobs = [];
    this.schedulers.clear();
  }
}

export class PaymentReminderQueueService {
  private scanQueue: Queue<ReminderScanJobData> | null = null;
  private emailQueue: Queue<ReminderEmailJobData> | null = null;
  private scanWorker: Worker<ReminderScanJobData> | null = null;
  private emailWorker: Worker<ReminderEmailJobData> | null = null;
  private sharedRedisConnection: Redis | null = null;

  // Test Isolation: In-memory queues for tests when Redis is not running
  private isMockMode: boolean = process.env.NODE_ENV === 'test';
  private mockScanQueue: InMemoryQueue<ReminderScanJobData> = new InMemoryQueue(REMINDER_SCAN_QUEUE_NAME);
  private mockEmailQueue: InMemoryQueue<ReminderEmailJobData> = new InMemoryQueue(REMINDER_EMAIL_QUEUE_NAME);

  setMockMode(enabled: boolean): void {
    this.isMockMode = enabled;
  }

  getIsMockMode(): boolean {
    return this.isMockMode;
  }

  getMockScanJobs(): { id: string; name: string; data: ReminderScanJobData; opts?: any }[] {
    return [...this.mockScanQueue.jobs];
  }

  getMockEmailJobs(): { id: string; name: string; data: ReminderEmailJobData; opts?: any }[] {
    return [...this.mockEmailQueue.jobs];
  }

  clearMockQueues(): void {
    this.mockScanQueue.clear();
    this.mockEmailQueue.clear();
  }

  /**
   * Creates a dedicated ioredis connection configured for BullMQ.
   */
  createRedisClient(customUrl?: string): Redis {
    const url = customUrl || env.redisUrl;
    if (!url) {
      throw new Error('REDIS_URL is not configured in environment.');
    }

    const redis = new Redis(url, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      lazyConnect: false,
      retryStrategy: (times: number) => {
        if (times > 10) return null; // stop retrying after 10 attempts
        return Math.min(times * 500, 3000);
      },
    });

    redis.on('error', (err: any) => {
      console.error('⚠️ [PaymentReminderQueue] Redis connection error:', err.message);
    });

    return redis;
  }

  /**
   * Initializes BullMQ queues for producers (e.g. Express server or scheduler).
   */
  getScanQueue(customConnection?: Redis): Queue<ReminderScanJobData> | InMemoryQueue<ReminderScanJobData> {
    if (this.isMockMode && !customConnection) {
      return this.mockScanQueue;
    }
    if (!this.scanQueue) {
      const connection = customConnection || this.getSharedRedisClient();
      this.scanQueue = new Queue<ReminderScanJobData>(REMINDER_SCAN_QUEUE_NAME, {
        connection: connection as any,
        defaultJobOptions: {
          attempts: 2,
          backoff: { type: 'exponential', delay: 3000 },
          removeOnComplete: { count: 50, age: 86400 },
          removeOnFail: { count: 100, age: 604800 },
        },
      });
    }
    return this.scanQueue;
  }

  getEmailQueue(customConnection?: Redis): Queue<ReminderEmailJobData> | InMemoryQueue<ReminderEmailJobData> {
    if (this.isMockMode && !customConnection) {
      return this.mockEmailQueue;
    }
    if (!this.emailQueue) {
      const connection = customConnection || this.getSharedRedisClient();
      this.emailQueue = new Queue<ReminderEmailJobData>(REMINDER_EMAIL_QUEUE_NAME, {
        connection: connection as any,
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
          removeOnComplete: { count: 100, age: 86400 },
          removeOnFail: { count: 200, age: 604800 },
        },
      });
    }
    return this.emailQueue;
  }

  private getSharedRedisClient(): Redis {
    if (!this.sharedRedisConnection) {
      this.sharedRedisConnection = this.createRedisClient();
    }
    return this.sharedRedisConnection;
  }

  /**
   * Enqueues an on-demand or periodic reminder scan job.
   */
  async enqueueReminderScan(options: {
    referenceDate?: Date;
    eventId?: string;
    isManual?: boolean;
    triggeredBy?: string;
  } = {}): Promise<EnqueueScanResult> {
    const queue = this.getScanQueue();
    const enqueuedAt = new Date();
    const jobId = options.isManual
      ? `manual_scan_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`
      : `scheduled_scan_${Date.now()}`;

    const jobData: ReminderScanJobData = {
      referenceDate: options.referenceDate ? options.referenceDate.toISOString() : undefined,
      eventId: options.eventId,
      isManual: options.isManual ?? false,
      triggeredBy: options.triggeredBy,
      enqueuedAt: enqueuedAt.toISOString(),
    };

    try {
      const job = await queue.add('scan-payment-reminders', jobData, {
        jobId,
      });

      return {
        jobId: job.id || jobId,
        status: 'queued',
        enqueuedAt,
      };
    } catch (err: any) {
      console.error('❌ [PaymentReminderQueue] Failed to enqueue reminder scan job:', err.message);
      throw ApiError.internal(`Failed to enqueue reminder scan job to Redis: ${err.message}`);
    }
  }

  /**
   * Registers BullMQ periodic JobScheduler for recurring scans.
   */
  async setupRecurringScanScheduler(intervalMs: number = env.reminderCheckIntervalMs): Promise<void> {
    const queue = this.getScanQueue();
    console.log(`⏰ [PaymentReminderQueue] Registering recurring scan scheduler (interval: ${intervalMs / 1000}s)`);

    try {
      await queue.upsertJobScheduler(
        RECURRING_SCAN_SCHEDULER_ID,
        { every: intervalMs },
        {
          name: 'periodic-scan',
          data: { isManual: false },
        }
      );
      console.log('✅ [PaymentReminderQueue] Recurring JobScheduler registered successfully.');
    } catch (err: any) {
      console.error('❌ [PaymentReminderQueue] Failed to register recurring JobScheduler:', err.message);
      throw err;
    }
  }

  /**
   * Scan job processor: discovers eligible candidates, reserves atomic MongoDB records,
   * and enqueues individual email jobs with deterministic job IDs.
   */
  async processScanJob(job: Job<ReminderScanJobData> | { id?: string; data: ReminderScanJobData }): Promise<{
    dueRemindersQueued: number;
    expiryWarningsQueued: number;
    skippedCount: number;
  }> {
    const { referenceDate, eventId, isManual } = job.data;
    const refDate = referenceDate ? new Date(referenceDate) : new Date();

    console.log(`🔍 [PaymentReminderScanWorker] Running reminder scan (Job ID: ${job.id}, manual: ${isManual ?? false})`);

    const dueCandidates = await paymentReminderService.findEligibleDueDateReminders(refDate, eventId);
    const expiryCandidates = await paymentReminderService.findEligibleExpiryWarnings(refDate, eventId);

    const emailQueue = this.getEmailQueue();
    let dueQueued = 0;
    let expiryQueued = 0;
    let skipped = 0;

    // 1. Process and enqueue due-date reminders
    for (const cand of dueCandidates) {
      const reservation = await this.reserveAndEnqueueDueDateCandidate(cand, emailQueue as any);
      if (reservation.queued) dueQueued++;
      else skipped++;
    }

    // 2. Process and enqueue expiry warnings
    for (const cand of expiryCandidates) {
      const reservation = await this.reserveAndEnqueueExpiryWarningCandidate(cand, emailQueue as any);
      if (reservation.queued) expiryQueued++;
      else skipped++;
    }

    console.log(
      `📊 [PaymentReminderScanWorker] Scan complete: ${dueQueued} due reminder(s) queued, ${expiryQueued} expiry warning(s) queued, ${skipped} skipped.`
    );

    return {
      dueRemindersQueued: dueQueued,
      expiryWarningsQueued: expiryQueued,
      skippedCount: skipped,
    };
  }

  /**
   * Atomically reserves a due-date reminder in MongoDB and enqueues to email queue.
   */
  private async reserveAndEnqueueDueDateCandidate(
    cand: DueDateReminderCandidate,
    emailQueue: Queue<ReminderEmailJobData> | InMemoryQueue<ReminderEmailJobData>
  ): Promise<{ queued: boolean }> {
    let log: IPaymentReminderLog;

    try {
      log = await PaymentReminderLog.create({
        dedupKey: cand.dedupKey,
        eventId: new Types.ObjectId(cand.eventId),
        quotationId: new Types.ObjectId(cand.quotationId),
        quotationRevision: cand.quotationRevision,
        installmentIndex: cand.installmentIndex,
        installmentTitle: cand.installmentTitle,
        reminderType: 'due_date',
        reminderWindow: cand.reminderWindow,
        recipientEmail: cand.clientEmail,
        recipientName: cand.clientName,
        scheduledAmount: cand.scheduledAmount,
        paidAmount: cand.verifiedPaidAmount,
        outstandingAmount: cand.outstandingAmount,
        dueDate: cand.dueDate,
        linkExpiryDate: cand.linkExpiryDate,
        paymentLinkUrl: cand.activeLinkUrl,
        status: 'pending',
      });
    } catch (err: any) {
      if (err.code === 11000) {
        // Check existing log status
        const existing = await PaymentReminderLog.findOne({ dedupKey: cand.dedupKey });
        if (existing && (existing.status === 'sent' || existing.status === 'skipped')) {
          return { queued: false };
        }
        // If orphaned pending from past crash, reuse existing
        if (existing && existing.status === 'pending') {
          log = existing;
        } else {
          return { queued: false };
        }
      } else {
        throw err;
      }
    }

    // Enqueue to email queue with deterministic job ID
    const deterministicJobId = 'email_' + crypto.createHash('sha256').update(cand.dedupKey).digest('hex').substring(0, 32);

    try {
      await emailQueue.add(
        'send-due-date-reminder',
        {
          reminderLogId: log._id.toString(),
          dedupKey: cand.dedupKey,
          reminderType: 'due_date',
          eventId: cand.eventId,
          quotationId: cand.quotationId,
          installmentIndex: cand.installmentIndex,
        },
        {
          jobId: deterministicJobId,
        }
      );
      return { queued: true };
    } catch (enqueueErr: any) {
      console.error(`❌ [PaymentReminderQueue] Failed to enqueue email job for ${cand.dedupKey}:`, enqueueErr.message);
      log.status = 'failed';
      log.failureReason = `Failed to enqueue to BullMQ: ${enqueueErr.message}`;
      await log.save();
      return { queued: false };
    }
  }

  /**
   * Atomically reserves an expiry warning in MongoDB and enqueues to email queue.
   */
  private async reserveAndEnqueueExpiryWarningCandidate(
    cand: ExpiryWarningCandidate,
    emailQueue: Queue<ReminderEmailJobData> | InMemoryQueue<ReminderEmailJobData>
  ): Promise<{ queued: boolean }> {
    let log: IPaymentReminderLog;

    try {
      log = await PaymentReminderLog.create({
        dedupKey: cand.dedupKey,
        eventId: new Types.ObjectId(cand.eventId),
        quotationId: new Types.ObjectId(cand.quotationId),
        quotationRevision: cand.quotationRevision,
        installmentIndex: cand.installmentIndex,
        installmentTitle: cand.installmentTitle,
        reminderType: 'link_expiry',
        reminderWindow: cand.reminderWindow,
        paymentLinkId: cand.paymentLinkId,
        recipientEmail: cand.clientEmail,
        recipientName: cand.clientName,
        scheduledAmount: cand.scheduledAmount,
        paidAmount: cand.verifiedPaidAmount,
        outstandingAmount: cand.outstandingAmount,
        dueDate: cand.dueDate,
        linkExpiryDate: cand.linkExpiryDate,
        paymentLinkUrl: cand.paymentLinkUrl,
        status: 'pending',
      });
    } catch (err: any) {
      if (err.code === 11000) {
        const existing = await PaymentReminderLog.findOne({ dedupKey: cand.dedupKey });
        if (existing && (existing.status === 'sent' || existing.status === 'skipped')) {
          return { queued: false };
        }
        if (existing && existing.status === 'pending') {
          log = existing;
        } else {
          return { queued: false };
        }
      } else {
        throw err;
      }
    }

    const deterministicJobId = 'email_' + crypto.createHash('sha256').update(cand.dedupKey).digest('hex').substring(0, 32);

    try {
      await emailQueue.add(
        'send-link-expiry-warning',
        {
          reminderLogId: log._id.toString(),
          dedupKey: cand.dedupKey,
          reminderType: 'link_expiry',
          eventId: cand.eventId,
          quotationId: cand.quotationId,
          installmentIndex: cand.installmentIndex,
        },
        {
          jobId: deterministicJobId,
        }
      );
      return { queued: true };
    } catch (enqueueErr: any) {
      console.error(`❌ [PaymentReminderQueue] Failed to enqueue email job for ${cand.dedupKey}:`, enqueueErr.message);
      log.status = 'failed';
      log.failureReason = `Failed to enqueue to BullMQ: ${enqueueErr.message}`;
      await log.save();
      return { queued: false };
    }
  }

  /**
   * Email job processor: loads MongoDB log, executes authoritative Just-in-Time re-check,
   * dispatches email via emailService, and updates log status.
   */
  async processEmailJob(job: Job<ReminderEmailJobData> | { id?: string; data: ReminderEmailJobData }): Promise<ReminderProcessingResult> {
    const { reminderLogId, reminderType } = job.data;
    const log = await PaymentReminderLog.findById(reminderLogId);

    if (!log) {
      console.warn(`⚠️ [PaymentReminderEmailWorker] Log ${reminderLogId} not found, skipping.`);
      return { candidateKey: `missing_${reminderLogId}`, status: 'skipped', logId: reminderLogId, reason: 'log_not_found' };
    }

    // Idempotency: if already sent or skipped, do not re-send
    if (log.status === 'sent') {
      return { candidateKey: log.dedupKey, status: 'already_sent', logId: reminderLogId, reason: 'already_sent' };
    }
    if (log.status === 'skipped') {
      return { candidateKey: log.dedupKey, status: 'already_skipped', logId: reminderLogId, reason: 'already_skipped' };
    }

    console.log(`✉️ [PaymentReminderEmailWorker] Processing ${reminderType} email for Log ${log._id} (${log.recipientEmail})`);

    if (reminderType === 'due_date') {
      return paymentReminderService.dispatchQueuedDueDateReminder(log);
    } else {
      return paymentReminderService.dispatchQueuedExpiryWarning(log);
    }
  }

  /**
   * Starts background BullMQ workers for scan queue and email queue.
   */
  startWorkers(customConnection?: Redis): {
    scanWorker: Worker<ReminderScanJobData> | any;
    emailWorker: Worker<ReminderEmailJobData> | any;
  } {
    if (this.scanWorker && this.emailWorker) {
      return { scanWorker: this.scanWorker, emailWorker: this.emailWorker };
    }

    if (this.isMockMode && !customConnection) {
      const mockWorker = {
        on: () => mockWorker,
        close: async () => {},
      };
      this.scanWorker = mockWorker as any;
      this.emailWorker = mockWorker as any;
      return { scanWorker: this.scanWorker, emailWorker: this.emailWorker };
    }

    const connection = customConnection || this.createRedisClient();

    this.scanWorker = new Worker<ReminderScanJobData>(
      REMINDER_SCAN_QUEUE_NAME,
      async (job) => this.processScanJob(job),
      {
        connection: connection as any,
        concurrency: 1, // Ensure scans are sequential
      }
    );

    this.emailWorker = new Worker<ReminderEmailJobData>(
      REMINDER_EMAIL_QUEUE_NAME,
      async (job) => this.processEmailJob(job),
      {
        connection: connection as any,
        concurrency: 5, // Concurrent email delivery
      }
    );

    this.scanWorker.on('completed', (job) => {
      console.log(`✅ [PaymentReminderScanWorker] Job ${job.id} completed.`);
    });
    this.scanWorker.on('failed', (job, err) => {
      console.error(`❌ [PaymentReminderScanWorker] Job ${job?.id} failed:`, err.message);
    });

    this.emailWorker.on('completed', (job) => {
      console.log(`✅ [PaymentReminderEmailWorker] Job ${job.id} completed.`);
    });
    this.emailWorker.on('failed', (job, err) => {
      console.error(`❌ [PaymentReminderEmailWorker] Job ${job?.id} failed:`, err.message);
    });

    return { scanWorker: this.scanWorker, emailWorker: this.emailWorker };
  }

  /**
   * Graceful cleanup of all queues, workers, and Redis connections.
   */
  async closeAll(): Promise<void> {
    if (this.isMockMode) {
      this.clearMockQueues();
      this.scanWorker = null;
      this.emailWorker = null;
      return;
    }

    if (this.scanWorker) {
      await this.scanWorker.close();
      this.scanWorker = null;
    }
    if (this.emailWorker) {
      await this.emailWorker.close();
      this.emailWorker = null;
    }
    if (this.scanQueue) {
      await this.scanQueue.close();
      this.scanQueue = null;
    }
    if (this.emailQueue) {
      await this.emailQueue.close();
      this.emailQueue = null;
    }
    if (this.sharedRedisConnection) {
      await this.sharedRedisConnection.quit();
      this.sharedRedisConnection = null;
    }
    console.log('🛑 [PaymentReminderQueue] Cleanly closed all queues and workers.');
  }
}

export const paymentReminderQueueService = new PaymentReminderQueueService();
