/**
 * src/modules/notifications/queues/notification.queue.ts
 *
 * EventOps ERP — Dedicated BullMQ Notification Queue & Processing Service
 *
 * Responsibilities:
 * 1. Asynchronous processing for Work Requirement opportunity announcements.
 * 2. Asynchronous processing for Worker Selection completion & manager summaries.
 * 3. Bounded batch notification persistence and cross-process Socket.IO emission.
 * 4. Startup recovery of un-dispatched announcements and selection summaries surviving restarts/Redis outages.
 * 5. Test isolation via in-memory mock queue adapter when NODE_ENV === 'test'.
 */
import { Queue, Worker, Job } from 'bullmq';
import { Redis } from 'ioredis';
import mongoose from 'mongoose';
import { env } from '../../../config/env.js';
import { notificationService, CreateNotificationInput } from '../service/notification.service.js';
import { Notification } from '../model/notification.model.js';
import { WorkRequirement } from '../../work-requirements/model/work-requirement.model.js';
import { workerOpportunityService } from '../../work-requirements/service/worker-opportunity.service.js';

export const NOTIFICATION_QUEUE_NAME = 'notification-processing';

export const JOB_REQUIREMENT_ANNOUNCEMENT = 'requirement-announcement';
export const JOB_SELECTION_COMPLETION = 'selection-completion';

export interface RequirementAnnouncementJobData {
  requirementId: string;
  publishedAt?: string;
  enqueuedAt?: string;
}

export interface SelectionCompletionJobData {
  requirementId: string;
  selectionRound: number;
  newlySelectedWorkerIds?: string[];
  totalAssignedCount?: number;
  requiredCount?: number;
  status?: string;
  enqueuedAt?: string;
}

export type NotificationJobData = RequirementAnnouncementJobData | SelectionCompletionJobData;

/**
 * Lightweight in-memory queue adapter for testing without an external Redis instance.
 */
export class InMemoryNotificationQueue {
  public name: string;
  public jobs: { id: string; name: string; data: any; opts?: any }[] = [];

  constructor(name: string) {
    this.name = name;
  }

  async add(
    jobName: string,
    data: any,
    opts?: any
  ): Promise<{ id: string; name: string; data: any; opts?: any }> {
    const id = opts?.jobId || `mock_notif_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const job = { id, name: jobName, data, opts };
    this.jobs.push(job);
    return job;
  }

  async getJob(jobId: string) {
    return this.jobs.find((j) => j.id === jobId) || null;
  }

  async count(): Promise<number> {
    return this.jobs.length;
  }

  async close(): Promise<void> {
    this.jobs = [];
  }

  clear(): void {
    this.jobs = [];
  }
}

export class NotificationQueueService {
  private queue: Queue<any> | null = null;
  private worker: Worker<any> | null = null;
  private sharedRedisConnection: Redis | null = null;

  // Test Isolation: In-memory queue for tests when Redis is not running
  private isMockMode: boolean = process.env.NODE_ENV === 'test' || !env.redisUrl;
  private mockQueue: InMemoryNotificationQueue = new InMemoryNotificationQueue(NOTIFICATION_QUEUE_NAME);
  private autoProcessInMock: boolean = true;

  constructor() { }

  public setMockMode(enabled: boolean): void {
    this.isMockMode = enabled;
  }

  public getIsMockMode(): boolean {
    return this.isMockMode;
  }

  public setAutoProcessInMock(autoProcess: boolean): void {
    this.autoProcessInMock = autoProcess;
  }

  public getMockQueue(): InMemoryNotificationQueue {
    return this.mockQueue;
  }

  public clearMockQueue(): void {
    this.mockQueue.clear();
  }

  public getQueueName(): string {
    return NOTIFICATION_QUEUE_NAME;
  }

  public getConcurrency(): number {
    return 3;
  }

  public getMaxRetries(): number {
    return 3;
  }

  /**
   * Creates a dedicated ioredis client configured for BullMQ.
   */
  public createRedisClient(): Redis {
    if (!env.redisUrl) {
      throw new Error('REDIS_URL is not configured in environment.');
    }
    const redis = new Redis(env.redisUrl, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      lazyConnect: false,
      retryStrategy: (times: number) => {
        if (times > 10) return null;
        return Math.min(times * 300, 3000);
      },
    });

    redis.on('error', (err: any) => {
      console.warn('⚠️ [NotificationQueue] Redis connection warning:', err.message);
    });

    return redis;
  }

  private getSharedRedisConnection(): Redis {
    if (!this.sharedRedisConnection) {
      this.sharedRedisConnection = this.createRedisClient();
    }
    return this.sharedRedisConnection;
  }

  /**
   * Returns BullMQ Queue instance or mock in-memory queue.
   */
  public getQueue(): Queue<any> | InMemoryNotificationQueue {
    if (this.isMockMode) {
      return this.mockQueue;
    }

    if (!this.queue) {
      const connection = this.getSharedRedisConnection();
      this.queue = new Queue(NOTIFICATION_QUEUE_NAME, {
        connection: connection as any,
        defaultJobOptions: {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 3000,
          },
          removeOnComplete: { count: 100, age: 86400 },
          removeOnFail: { count: 200, age: 604800 },
        },
      });
    }

    return this.queue;
  }

  // ─── Producer Operations ───────────────────────────────────────────────────

  /**
   * Enqueues an asynchronous requirement announcement broadcast.
   */
  public async enqueueRequirementAnnouncements(data: {
    requirementId: string;
    publishedAt?: string;
  }): Promise<{ jobId: string }> {
    const enqueuedAt = new Date().toISOString();
    const jobId = `announcement_${data.requirementId}_${Date.now()}`;
    const jobData: RequirementAnnouncementJobData = {
      requirementId: data.requirementId,
      publishedAt: data.publishedAt || enqueuedAt,
      enqueuedAt,
    };

    if (this.isMockMode) {
      const job = await this.mockQueue.add(JOB_REQUIREMENT_ANNOUNCEMENT, jobData, { jobId });
      if (this.autoProcessInMock) {
        // Asynchronously process in mock mode to verify integration tests without hanging
        setImmediate(() => {
          this.processRequirementAnnouncements(jobData).catch((err) => {
            console.error('⚠️ [NotificationQueue Mock] Announcement processing error:', err);
          });
        });
      }
      return { jobId: job.id };
    }

    const queue = this.getQueue() as Queue<any>;
    const job = await queue.add(JOB_REQUIREMENT_ANNOUNCEMENT, jobData, {
      jobId,
      attempts: 3,
      backoff: { type: 'exponential', delay: 3000 },
    });

    console.log(`📨 [NotificationQueue] Enqueued announcement job '${job.id}' for req ${data.requirementId}`);
    return { jobId: job.id || jobId };
  }

  /**
   * Enqueues an asynchronous selection outcome & manager summary notification dispatch.
   */
  public async enqueueSelectionNotifications(data: {
    requirementId: string;
    selectionRound: number;
    newlySelectedWorkerIds?: string[];
    totalAssignedCount?: number;
    requiredCount?: number;
    status?: string;
  }): Promise<{ jobId: string }> {
    const enqueuedAt = new Date().toISOString();
    const jobId = `selection_notif_${data.requirementId}_round_${data.selectionRound}`;
    const jobData: SelectionCompletionJobData = {
      ...data,
      enqueuedAt,
    };

    if (this.isMockMode) {
      const job = await this.mockQueue.add(JOB_SELECTION_COMPLETION, jobData, { jobId });
      if (this.autoProcessInMock) {
        setImmediate(() => {
          this.processSelectionCompletion(jobData).catch((err) => {
            console.error('⚠️ [NotificationQueue Mock] Selection notification processing error:', err);
          });
        });
      }
      return { jobId: job.id };
    }

    const queue = this.getQueue() as Queue<any>;
    const job = await queue.add(JOB_SELECTION_COMPLETION, jobData, {
      jobId,
      attempts: 3,
      backoff: { type: 'exponential', delay: 3000 },
    });

    console.log(`📨 [NotificationQueue] Enqueued selection completion job '${job.id}' for req ${data.requirementId} (Round ${data.selectionRound})`);
    return { jobId: job.id || jobId };
  }

  // ─── Processor Operations ───────────────────────────────────────────────────

  /**
   * Processes a Work Requirement publication announcement job:
   * 1. Reads persisted WorkRequirement and verifies active 'open' state.
   * 2. Evaluates canonical Worker Opportunity eligibility rules.
   * 3. Creates durable notifications in bounded batches with deduplication keys.
   * 4. Dispatches real-time Socket.IO events cross-process.
   */
  public async processRequirementAnnouncements(
    data: RequirementAnnouncementJobData
  ): Promise<{ eligibleCount: number; notifiedCount: number }> {
    const { requirementId } = data;
    console.log(`🔍 [NotificationProcessor] Processing announcement job for requirement ${requirementId}...`);

    if (!mongoose.Types.ObjectId.isValid(requirementId)) {
      console.warn(`⚠️ [NotificationProcessor] Invalid requirement ID format: ${requirementId}`);
      return { eligibleCount: 0, notifiedCount: 0 };
    }

    const req = await WorkRequirement.findById(requirementId).populate('eventId');
    if (!req) {
      console.warn(`⚠️ [NotificationProcessor] Requirement ${requirementId} not found, skipping.`);
      return { eligibleCount: 0, notifiedCount: 0 };
    }

    // Lifecycle check: skip stale jobs if requirement was draft, cancelled, or closed
    if (req.status === 'draft' || req.status === 'cancelled') {
      console.log(`ℹ️ [NotificationProcessor] Requirement ${requirementId} is in status '${req.status}', skipping announcement.`);
      return { eligibleCount: 0, notifiedCount: 0 };
    }

    // Centralized eligibility evaluation
    const eligibleWorkerIds = await workerOpportunityService.findEligibleWorkersForOpportunity(requirementId);
    if (!eligibleWorkerIds || eligibleWorkerIds.length === 0) {
      console.log(`ℹ️ [NotificationProcessor] No eligible workers found for requirement ${requirementId}.`);
      return { eligibleCount: 0, notifiedCount: 0 };
    }

    const event = req.eventId as any;
    const eventTitle = event?.title || 'an upcoming event';
    const reportingTimeInfo = req.reportingTime ? `Reporting time: ${req.reportingTime}.` : '';

    const notificationItems: CreateNotificationInput[] = eligibleWorkerIds.map((workerId) => ({
      recipientId: workerId,
      type: 'work_opportunity',
      title: 'New work opportunity',
      message: `A new requirement for ${req.workerType} has been announced for ${eventTitle}. ${reportingTimeInfo}`.trim(),
      resourceType: 'work_requirement',
      resourceId: requirementId,
      destinationRoute: '/worker',
      deduplicationKey: `req_opp_${requirementId}_${workerId}`,
      metadata: {
        workerType: req.workerType,
        requiredCount: req.requiredCount,
        maxDistanceKm: req.maxDistanceKm,
      },
    }));

    // Bounded batch persistence and real-time delivery
    const saved = await notificationService.createNotificationsBatch(notificationItems, 50);
    console.log(
      `✅ [NotificationProcessor] Announcement complete for req ${requirementId}: ${saved.length}/${eligibleWorkerIds.length} worker notification(s) dispatched.`
    );

    return {
      eligibleCount: eligibleWorkerIds.length,
      notifiedCount: saved.length,
    };
  }

  /**
   * Processes a Worker Selection completion job:
   * 1. Reads persisted WorkRequirement and validates current selection round.
   * 2. Notifies newly selected workers with assignment confirmation.
   * 3. Notifies responsible Event Manager with selection summary.
   */
  public async processSelectionCompletion(
    data: SelectionCompletionJobData
  ): Promise<{ selectedWorkerCount: number; managerNotified: boolean }> {
    const { requirementId, selectionRound } = data;
    console.log(`🔍 [NotificationProcessor] Processing selection notifications for requirement ${requirementId} (Round ${selectionRound})...`);

    if (!mongoose.Types.ObjectId.isValid(requirementId)) {
      console.warn(`⚠️ [NotificationProcessor] Invalid requirement ID format: ${requirementId}`);
      return { selectedWorkerCount: 0, managerNotified: false };
    }

    const req = await WorkRequirement.findById(requirementId).populate('eventId');
    if (!req) {
      console.warn(`⚠️ [NotificationProcessor] Requirement ${requirementId} not found, skipping.`);
      return { selectedWorkerCount: 0, managerNotified: false };
    }

    // Guard against stale jobs from an earlier round or mismatched round
    if (req.selectionRound !== selectionRound) {
      console.log(`ℹ️ [NotificationProcessor] Stale or mismatched selection notification job: current round ${req.selectionRound} !== job round ${selectionRound}.`);
      return { selectedWorkerCount: 0, managerNotified: false };
    }

    const event = req.eventId as any;
    const eventTitle = event?.title || 'an upcoming event';

    // Retrieve workers assigned for this round
    const assignedThisRound = req.assignedWorkers.filter(
      (w) => w.selectionRound === selectionRound
    );

    // Fallback to newlySelectedWorkerIds if provided
    const targetWorkerIds = assignedThisRound.length > 0
      ? assignedThisRound.map((w) => w.workerId.toString())
      : (data.newlySelectedWorkerIds || []);

    let selectedWorkerCount = 0;
    if (targetWorkerIds.length > 0) {
      const workerNotifications: CreateNotificationInput[] = targetWorkerIds.map((workerId) => ({
        recipientId: workerId,
        type: 'assignment_confirmed',
        title: 'Assignment confirmed',
        message: `You have been selected for ${req.workerType} on ${eventTitle}. Please check your schedule and details.`,
        resourceType: 'work_requirement',
        resourceId: requirementId,
        destinationRoute: '/worker',
        deduplicationKey: `sel_confirm_${requirementId}_round${selectionRound}_${workerId}`,
        metadata: {
          selectionRound,
          workerType: req.workerType,
          reportingTime: req.reportingTime,
        },
      }));

      const savedWorkers = await notificationService.createNotificationsBatch(workerNotifications, 50);
      selectedWorkerCount = savedWorkers.length;
    }

    // Notify responsible Event Manager
    let managerNotified = false;
    if (event && event.eventManagerId) {
      const managerId = event.eventManagerId.toString();
      const newlyAssigned = targetWorkerIds.length;
      const totalAssigned = req.assignedWorkers.length;
      const remaining = Math.max(0, req.requiredCount - totalAssigned);

      let summaryMsg = '';
      if (req.status === 'filled') {
        summaryMsg = `Worker selection completed for ${req.workerType} on ${eventTitle}. All ${req.requiredCount} position(s) have been filled.`;
      } else {
        summaryMsg = `Worker selection completed for ${req.workerType} on ${eventTitle}. ${newlyAssigned} assigned, ${remaining} position(s) remain unfilled.`;
      }

      const managerNotification = await notificationService.createNotification({
        recipientId: managerId,
        type: 'selection_summary',
        title: 'Worker selection complete',
        message: summaryMsg,
        resourceType: 'work_requirement',
        resourceId: requirementId,
        destinationRoute: `/manager/events/${event._id.toString()}`,
        deduplicationKey: `sel_summary_${requirementId}_round${selectionRound}_${managerId}`,
        metadata: {
          selectionRound,
          workerType: req.workerType,
          requiredCount: req.requiredCount,
          totalAssigned,
          remaining,
          status: req.status,
        },
      });

      managerNotified = managerNotification !== null;
    }

    console.log(
      `✅ [NotificationProcessor] Selection notifications dispatched for req ${requirementId}: ${selectedWorkerCount} worker(s) notified, manager notified: ${managerNotified}.`
    );

    return { selectedWorkerCount, managerNotified };
  }

  // ─── Startup Recovery & Enqueue Resilience ──────────────────────────────────

  /**
   * Recovers any pending announcements or selection summaries that were missed due to
   * worker downtime or transient Redis unavailability (§9).
   */
  public async scanAndRecoverPendingNotifications(): Promise<number> {
    let recoveredCount = 0;

    // 1. Recover unannounced open requirements
    try {
      const openReqs = await WorkRequirement.find({
        status: 'open',
        interestPublishedAt: { $exists: true, $ne: null },
      });

      for (const req of openReqs) {
        // Check if opportunity announcement exists
        const exists = await Notification.exists({
          resourceId: req._id.toString(),
          type: 'work_opportunity',
        });

        if (!exists) {
          console.log(`🔎 [NotificationQueue] Found unannounced open requirement ${req._id}, recovering announcements...`);
          await this.processRequirementAnnouncements({
            requirementId: req._id.toString(),
            publishedAt: req.interestPublishedAt ? req.interestPublishedAt.toISOString() : undefined,
          });
          recoveredCount++;
        }
      }
    } catch (annErr: any) {
      console.error('⚠️ [NotificationQueue] Recovery error checking announcements:', annErr.message);
    }

    // 2. Recover un-notified selection summaries
    try {
      const completedReqs = await WorkRequirement.find({
        assignedWorkers: { $exists: true, $not: { $size: 0 } },
      });

      for (const req of completedReqs) {
        const round = req.selectionRound || 1;
        const exists = await Notification.exists({
          resourceId: req._id.toString(),
          type: 'selection_summary',
          deduplicationKey: { $regex: `round${round}` },
        });

        if (!exists) {
          console.log(`🔎 [NotificationQueue] Found completed selection for req ${req._id} lacking summary, recovering...`);
          await this.processSelectionCompletion({
            requirementId: req._id.toString(),
            selectionRound: round,
          });
          recoveredCount++;
        }
      }
    } catch (selErr: any) {
      console.error('⚠️ [NotificationQueue] Recovery error checking selection summaries:', selErr.message);
    }

    return recoveredCount;
  }

  // ─── Worker Lifecycle ───────────────────────────────────────────────────────

  /**
   * Initializes the BullMQ Worker to process notification queue jobs.
   */
  public startWorker(): { worker: Worker<any> | null } {
    if (this.isMockMode) {
      console.log('ℹ️ [NotificationQueue] Running in mock/test mode: Live Redis worker not started.');
      return { worker: null };
    }

    if (this.worker) {
      return { worker: this.worker };
    }

    const connection = this.createRedisClient();

    this.worker = new Worker(
      NOTIFICATION_QUEUE_NAME,
      async (job: Job<NotificationJobData>) => {
        console.log(`⚙️ [NotificationWorker] Executing job ${job.id} (Name: ${job.name})...`);

        if (job.name === JOB_REQUIREMENT_ANNOUNCEMENT) {
          return this.processRequirementAnnouncements(job.data as RequirementAnnouncementJobData);
        } else if (job.name === JOB_SELECTION_COMPLETION) {
          return this.processSelectionCompletion(job.data as SelectionCompletionJobData);
        } else {
          console.warn(`⚠️ [NotificationWorker] Unknown job name: ${job.name}`);
        }
      },
      {
        connection: connection as any,
        concurrency: 3, // Bounded parallel notification handling
      }
    );

    this.worker.on('completed', (job) => {
      console.log(`✅ [NotificationWorker] Job ${job.id} completed.`);
    });

    this.worker.on('failed', (job, err) => {
      console.error(`💥 [NotificationWorker] Job ${job?.id} failed:`, err.message);
    });

    return { worker: this.worker };
  }

  /**
   * Clean shutdown of BullMQ workers, queues, and Redis connections.
   */
  public async close(): Promise<void> {
    if (this.worker) {
      await this.worker.close();
      this.worker = null;
    }
    if (this.queue) {
      await this.queue.close();
      this.queue = null;
    }
    if (this.sharedRedisConnection) {
      await this.sharedRedisConnection.quit().catch(() => { });
      this.sharedRedisConnection = null;
    }
    this.mockQueue.clear();
  }
}

export const notificationQueueService = new NotificationQueueService();
