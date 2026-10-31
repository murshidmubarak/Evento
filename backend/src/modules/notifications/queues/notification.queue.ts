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
import { workResponseRepository } from '../../work-requirements/repository/work-response.repository.js';
import { notificationOutboxRepository } from '../repository/notification-outbox.repository.js';
import type { INotificationOutbox, OutboxEventType } from '../model/notification-outbox.model.js';

export const NOTIFICATION_QUEUE_NAME = 'notification-processing';

export const JOB_REQUIREMENT_ANNOUNCEMENT = 'requirement-announcement';
export const JOB_SELECTION_COMPLETION = 'selection-completion';
export const JOB_REQUIREMENT_CANCELLATION = 'requirement-cancellation';
export const JOB_REQUIREMENT_UPDATE = 'requirement-update';
export const JOB_DEADLINE_EXTENSION = 'deadline-extension';
export const JOB_OUTBOX_EVENT = 'outbox-event';

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

export interface RequirementCancellationJobData {
  requirementId: string;
  cancelledAt?: string;
  enqueuedAt?: string;
}

export interface RequirementUpdateJobData {
  requirementId: string;
  changedFields: Record<string, { old: any; new: any }>;
  enqueuedAt?: string;
}

export interface DeadlineExtensionJobData {
  requirementId: string;
  selectionRound: number;
  newDeadline: string;
  previousDeadline?: string;
  enqueuedAt?: string;
}

export interface OutboxNotificationJobData {
  outboxEventId: string;
  eventType: OutboxEventType;
  dispatchGeneration: number;
  payload: any;
  enqueuedAt?: string;
}

export type NotificationJobData =
  | RequirementAnnouncementJobData
  | SelectionCompletionJobData
  | RequirementCancellationJobData
  | RequirementUpdateJobData
  | DeadlineExtensionJobData
  | OutboxNotificationJobData;

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

  /**
   * Enqueues an asynchronous Work Requirement cancellation notification dispatch.
   */
  public async enqueueRequirementCancellation(data: {
    requirementId: string;
    cancelledAt?: string;
  }): Promise<{ jobId: string }> {
    const enqueuedAt = new Date().toISOString();
    const jobId = `cancellation_${data.requirementId}_${Date.now()}`;
    const jobData: RequirementCancellationJobData = {
      requirementId: data.requirementId,
      cancelledAt: data.cancelledAt || enqueuedAt,
      enqueuedAt,
    };

    if (this.isMockMode) {
      const job = await this.mockQueue.add(JOB_REQUIREMENT_CANCELLATION, jobData, { jobId });
      if (this.autoProcessInMock) {
        setImmediate(() => {
          this.processRequirementCancellation(jobData).catch((err) => {
            console.error('⚠️ [NotificationQueue Mock] Cancellation processing error:', err);
          });
        });
      }
      return { jobId: job.id };
    }

    const queue = this.getQueue() as Queue<any>;
    const job = await queue.add(JOB_REQUIREMENT_CANCELLATION, jobData, {
      jobId,
      attempts: 3,
      backoff: { type: 'exponential', delay: 3000 },
    });

    console.log(`📨 [NotificationQueue] Enqueued cancellation job '${job.id}' for req ${data.requirementId}`);
    return { jobId: job.id || jobId };
  }

  /**
   * Enqueues an asynchronous Work Requirement update notification dispatch.
   */
  public async enqueueRequirementUpdate(data: {
    requirementId: string;
    changedFields: Record<string, { old: any; new: any }>;
  }): Promise<{ jobId: string }> {
    const enqueuedAt = new Date().toISOString();
    const jobId = `update_${data.requirementId}_${Date.now()}`;
    const jobData: RequirementUpdateJobData = {
      requirementId: data.requirementId,
      changedFields: data.changedFields,
      enqueuedAt,
    };

    if (this.isMockMode) {
      const job = await this.mockQueue.add(JOB_REQUIREMENT_UPDATE, jobData, { jobId });
      if (this.autoProcessInMock) {
        setImmediate(() => {
          this.processRequirementUpdate(jobData).catch((err) => {
            console.error('⚠️ [NotificationQueue Mock] Update notification processing error:', err);
          });
        });
      }
      return { jobId: job.id };
    }

    const queue = this.getQueue() as Queue<any>;
    const job = await queue.add(JOB_REQUIREMENT_UPDATE, jobData, {
      jobId,
      attempts: 3,
      backoff: { type: 'exponential', delay: 3000 },
    });

    console.log(`📨 [NotificationQueue] Enqueued update job '${job.id}' for req ${data.requirementId}`);
    return { jobId: job.id || jobId };
  }

  /**
   * Enqueues an asynchronous Work Requirement deadline extension notification dispatch.
   */
  public async enqueueDeadlineExtension(data: {
    requirementId: string;
    selectionRound: number;
    newDeadline: string;
    previousDeadline?: string;
  }): Promise<{ jobId: string }> {
    const enqueuedAt = new Date().toISOString();
    const jobId = `extension_${data.requirementId}_round_${data.selectionRound}`;
    const jobData: DeadlineExtensionJobData = {
      requirementId: data.requirementId,
      selectionRound: data.selectionRound,
      newDeadline: data.newDeadline,
      previousDeadline: data.previousDeadline,
      enqueuedAt,
    };

    if (this.isMockMode) {
      const job = await this.mockQueue.add(JOB_DEADLINE_EXTENSION, jobData, { jobId });
      if (this.autoProcessInMock) {
        setImmediate(() => {
          this.processDeadlineExtension(jobData).catch((err) => {
            console.error('⚠️ [NotificationQueue Mock] Deadline extension processing error:', err);
          });
        });
      }
      return { jobId: job.id };
    }

    const queue = this.getQueue() as Queue<any>;
    const job = await queue.add(JOB_DEADLINE_EXTENSION, jobData, {
      jobId,
      attempts: 3,
      backoff: { type: 'exponential', delay: 3000 },
    });

    console.log(`📨 [NotificationQueue] Enqueued deadline extension job '${job.id}' for req ${data.requirementId} (Round ${data.selectionRound})`);
    return { jobId: job.id || jobId };
  }

  /**
   * Enqueues an asynchronous notification job from an outbox event record.
   * Maps outbox eventType to appropriate typed BullMQ job names:
   * - requirement_cancelled -> requirement-cancellation
   * - requirement_updated -> requirement-update
   * - deadline_extended -> deadline-extension
   */
  public async enqueueOutboxJob(event: INotificationOutbox): Promise<{ jobId: string }> {
    const enqueuedAt = new Date().toISOString();
    const jobId = `outbox_${event.eventId}_gen${event.dispatchGeneration}`;

    let jobName: string = JOB_OUTBOX_EVENT;
    let jobData: any = {
      outboxEventId: event.eventId,
      eventType: event.eventType,
      dispatchGeneration: event.dispatchGeneration,
      payload: event.payload,
      enqueuedAt,
    };

    if (event.eventType === 'requirement_cancelled') {
      jobName = JOB_REQUIREMENT_CANCELLATION;
      jobData = {
        ...event.payload,
        outboxEventId: event.eventId,
        eventType: event.eventType,
        dispatchGeneration: event.dispatchGeneration,
        enqueuedAt: event.payload?.enqueuedAt || enqueuedAt,
      };
    } else if (event.eventType === 'requirement_updated') {
      jobName = JOB_REQUIREMENT_UPDATE;
      jobData = {
        ...event.payload,
        outboxEventId: event.eventId,
        eventType: event.eventType,
        dispatchGeneration: event.dispatchGeneration,
        enqueuedAt: event.payload?.enqueuedAt || enqueuedAt,
      };
    } else if (event.eventType === 'deadline_extended') {
      jobName = JOB_DEADLINE_EXTENSION;
      jobData = {
        ...event.payload,
        outboxEventId: event.eventId,
        eventType: event.eventType,
        dispatchGeneration: event.dispatchGeneration,
        enqueuedAt: event.payload?.enqueuedAt || enqueuedAt,
      };
    }

    if (this.isMockMode) {
      const job = await this.mockQueue.add(jobName, jobData, { jobId });
      if (this.autoProcessInMock) {
        setImmediate(() => {
          if (jobName === JOB_REQUIREMENT_CANCELLATION) {
            this.processRequirementCancellation(jobData).catch((err) => {
              console.error('⚠️ [NotificationQueue Mock] Cancellation processing error:', err);
            });
          } else if (jobName === JOB_REQUIREMENT_UPDATE) {
            this.processRequirementUpdate(jobData).catch((err) => {
              console.error('⚠️ [NotificationQueue Mock] Update notification processing error:', err);
            });
          } else if (jobName === JOB_DEADLINE_EXTENSION) {
            this.processDeadlineExtension(jobData).catch((err) => {
              console.error('⚠️ [NotificationQueue Mock] Deadline extension processing error:', err);
            });
          } else {
            this.processOutboxEvent(jobData).catch((err) => {
              console.error('⚠️ [NotificationQueue Mock] Outbox processing error:', err);
            });
          }
        });
      }
      return { jobId: job.id };
    }

    const queue = this.getQueue() as Queue<any>;
    const job = await queue.add(jobName, jobData, {
      jobId,
      attempts: 3,
      backoff: { type: 'exponential', delay: 3000 },
    });

    console.log(`📨 [NotificationQueue] Enqueued outbox job '${job.id}' (${jobName}) for event ${event.eventId}`);
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
   * 3. Notifies responsible Event Manager with selection summary or unfilled staffing alert.
   */
  public async processSelectionCompletion(
    data: SelectionCompletionJobData
  ): Promise<{ selectedWorkerCount: number; managerNotified: boolean; isUnfilledAlert: boolean }> {
    const { requirementId, selectionRound } = data;
    console.log(`🔍 [NotificationProcessor] Processing selection notifications for requirement ${requirementId} (Round ${selectionRound})...`);

    if (!mongoose.Types.ObjectId.isValid(requirementId)) {
      console.warn(`⚠️ [NotificationProcessor] Invalid requirement ID format: ${requirementId}`);
      return { selectedWorkerCount: 0, managerNotified: false, isUnfilledAlert: false };
    }

    const req = await WorkRequirement.findById(requirementId).populate('eventId');
    if (!req) {
      console.warn(`⚠️ [NotificationProcessor] Requirement ${requirementId} not found, skipping.`);
      return { selectedWorkerCount: 0, managerNotified: false, isUnfilledAlert: false };
    }

    // Skip if requirement is cancelled or in draft
    if (req.status === 'cancelled' || req.status === 'draft') {
      console.log(`ℹ️ [NotificationProcessor] Requirement ${requirementId} is in '${req.status}' status, skipping selection notifications.`);
      return { selectedWorkerCount: 0, managerNotified: false, isUnfilledAlert: false };
    }

    // Guard against stale jobs from an earlier round or mismatched round
    if (req.selectionRound !== selectionRound) {
      console.log(`ℹ️ [NotificationProcessor] Stale or mismatched selection notification job: current round ${req.selectionRound} !== job round ${selectionRound}.`);
      return { selectedWorkerCount: 0, managerNotified: false, isUnfilledAlert: false };
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
    let isUnfilledAlert = false;
    if (event && event.eventManagerId) {
      const managerId = event.eventManagerId.toString();
      const newlyAssigned = targetWorkerIds.length;
      const totalAssigned = req.assignedWorkers.length;
      const remaining = Math.max(0, req.requiredCount - totalAssigned);

      let summaryMsg = '';
      let notifTitle = 'Worker selection complete';
      let notifType = 'selection_summary';
      let dedupKey = `sel_summary_${requirementId}_round${selectionRound}_${managerId}`;

      if (remaining > 0 && req.status !== 'filled') {
        isUnfilledAlert = true;
        notifTitle = 'Staffing Requirement Still Unfilled';
        summaryMsg = `Staffing requirement for ${req.workerType} on ${eventTitle} remains unfilled. Required: ${req.requiredCount}, Assigned: ${totalAssigned}, Remaining: ${remaining}. Please review candidates or extend the deadline.`;
        notifType = 'staffing_unfilled';
        dedupKey = `staffing_unfilled_${requirementId}_round${selectionRound}_${managerId}`;
      } else {
        summaryMsg = `Worker selection completed for ${req.workerType} on ${eventTitle}. All ${req.requiredCount} position(s) have been filled.`;
        notifTitle = 'Worker selection complete';
        notifType = 'selection_summary';
        dedupKey = `sel_summary_${requirementId}_round${selectionRound}_${managerId}`;
      }

      const managerNotification = await notificationService.createNotification({
        recipientId: managerId,
        type: notifType,
        title: notifTitle,
        message: summaryMsg,
        resourceType: 'work_requirement',
        resourceId: requirementId,
        destinationRoute: `/manager/events/${event._id.toString()}`,
        deduplicationKey: dedupKey,
        metadata: {
          selectionRound,
          workerType: req.workerType,
          requiredCount: req.requiredCount,
          totalAssigned,
          remaining,
          status: req.status,
          isUnfilledAlert,
        },
      });

      managerNotified = managerNotification !== null;
    }

    console.log(
      `✅ [NotificationProcessor] Selection notifications dispatched for req ${requirementId}: ${selectedWorkerCount} worker(s) notified, manager notified: ${managerNotified} (Unfilled alert: ${isUnfilledAlert}).`
    );

    return { selectedWorkerCount, managerNotified, isUnfilledAlert };
  }

  /**
   * Processes a Work Requirement cancellation notification job (Event A):
   * 1. Revalidates persisted WorkRequirement and verifies 'cancelled' status.
   * 2. Notifies assigned workers with assignment cancellation message.
   * 3. Notifies interested workers with opportunity cancellation message.
   * 4. Deduplicates recipient groups by Worker ID.
   */
  public async processRequirementCancellation(
    data: RequirementCancellationJobData
  ): Promise<{ notifiedAssignedCount: number; notifiedInterestedCount: number; totalNotified: number }> {
    const { requirementId } = data;
    console.log(`🔍 [NotificationProcessor] Processing cancellation job for requirement ${requirementId}...`);

    if (!mongoose.Types.ObjectId.isValid(requirementId)) {
      console.warn(`⚠️ [NotificationProcessor] Invalid requirement ID format: ${requirementId}`);
      return { notifiedAssignedCount: 0, notifiedInterestedCount: 0, totalNotified: 0 };
    }

    const req = await WorkRequirement.findById(requirementId).populate('eventId');
    if (!req) {
      console.warn(`⚠️ [NotificationProcessor] Requirement ${requirementId} not found, skipping.`);
      return { notifiedAssignedCount: 0, notifiedInterestedCount: 0, totalNotified: 0 };
    }

    // Safety revalidation: only process if requirement is genuinely cancelled
    if (req.status !== 'cancelled') {
      console.log(`ℹ️ [NotificationProcessor] Requirement ${requirementId} is not in 'cancelled' status (current: '${req.status}'), skipping cancellation notifications.`);
      return { notifiedAssignedCount: 0, notifiedInterestedCount: 0, totalNotified: 0 };
    }

    const event = req.eventId as any;
    const eventTitle = event?.title || 'an upcoming event';

    // Group 1: Persisted assigned workers
    const assignedWorkerIds = (req.assignedWorkers || [])
      .map((a: any) => a.workerId?.toString())
      .filter((id: string) => Boolean(id) && mongoose.Types.ObjectId.isValid(id));
    const assignedSet = new Set(assignedWorkerIds);

    // Group 2: Valid active interested workers
    const responses = await workResponseRepository.findInterestedByRequirement(requirementId);
    const interestedWorkerIds = responses
      .filter((r) => r.responseStatus === 'interested')
      .map((r) => r.workerId.toString())
      .filter((id) => !assignedSet.has(id)); // Deduplicate against assigned group

    const notificationItems: CreateNotificationInput[] = [];

    // Assigned workers notification
    for (const workerId of assignedWorkerIds) {
      notificationItems.push({
        recipientId: workerId,
        type: 'requirement_cancelled',
        title: 'Work Requirement Cancelled',
        message: `Your confirmed assignment for ${req.workerType} on ${eventTitle} has been cancelled.`,
        resourceType: 'work_requirement',
        resourceId: requirementId,
        destinationRoute: '/worker',
        deduplicationKey: `req_cancel_${requirementId}_${workerId}`,
        metadata: {
          eventId: event?._id ? event._id.toString() : req.eventId.toString(),
          workerType: req.workerType,
          wasAssigned: true,
        },
      });
    }

    // Interested workers notification
    for (const workerId of interestedWorkerIds) {
      notificationItems.push({
        recipientId: workerId,
        type: 'requirement_cancelled',
        title: 'Work Requirement Cancelled',
        message: `The work requirement for ${req.workerType} on ${eventTitle} that you expressed interest in has been cancelled.`,
        resourceType: 'work_requirement',
        resourceId: requirementId,
        destinationRoute: '/worker',
        deduplicationKey: `req_cancel_${requirementId}_${workerId}`,
        metadata: {
          eventId: event?._id ? event._id.toString() : req.eventId.toString(),
          workerType: req.workerType,
          wasAssigned: false,
        },
      });
    }

    const saved = await notificationService.createNotificationsBatch(notificationItems, 50);
    console.log(
      `✅ [NotificationProcessor] Cancellation notifications complete for req ${requirementId}: ${saved.length} notification(s) dispatched (${assignedWorkerIds.length} assigned, ${interestedWorkerIds.length} interested).`
    );

    if ((data as any).outboxEventId) {
      await notificationOutboxRepository.markProcessed((data as any).outboxEventId);
    }

    return {
      notifiedAssignedCount: assignedWorkerIds.length,
      notifiedInterestedCount: interestedWorkerIds.length,
      totalNotified: saved.length,
    };
  }

  /**
   * Processes a Work Requirement operational update notification job (Event B):
   * 1. Revalidates persisted WorkRequirement and staffing counts.
   * 2. Evaluates Scenario A (fully filled), Scenario B (unfilled, open window), or Scenario C (unfilled, closed window).
   * 3. Assembles concise diff notification and deduplicates recipients.
   */
  public async processRequirementUpdate(
    data: RequirementUpdateJobData
  ): Promise<{ scenario: 'A' | 'B' | 'C' | 'none'; notifiedCount: number }> {
    const { requirementId, changedFields } = data;
    console.log(`🔍 [NotificationProcessor] Processing update notifications for requirement ${requirementId}...`);

    if (!mongoose.Types.ObjectId.isValid(requirementId)) {
      console.warn(`⚠️ [NotificationProcessor] Invalid requirement ID format: ${requirementId}`);
      return { scenario: 'none', notifiedCount: 0 };
    }

    const req = await WorkRequirement.findById(requirementId).populate('eventId');
    if (!req) {
      console.warn(`⚠️ [NotificationProcessor] Requirement ${requirementId} not found, skipping.`);
      return { scenario: 'none', notifiedCount: 0 };
    }

    // Skip if requirement is draft or cancelled
    if (req.status === 'draft' || req.status === 'cancelled') {
      console.log(`ℹ️ [NotificationProcessor] Requirement ${requirementId} is in '${req.status}' status, skipping update notifications.`);
      return { scenario: 'none', notifiedCount: 0 };
    }

    // Verify there are actual material changes
    if (!changedFields || Object.keys(changedFields).length === 0) {
      console.log(`ℹ️ [NotificationProcessor] No material changes provided for req ${requirementId}, skipping.`);
      return { scenario: 'none', notifiedCount: 0 };
    }

    const event = req.eventId as any;
    const eventTitle = event?.title || 'an upcoming event';

    // Build human-readable description of changed operational fields
    const changeSummaries: string[] = [];
    if (changedFields.reportingTime) {
      changeSummaries.push(`Reporting time: ${changedFields.reportingTime.old} -> ${changedFields.reportingTime.new}`);
    }
    if (changedFields.requiredCount) {
      changeSummaries.push(`Required count: ${changedFields.requiredCount.old} -> ${changedFields.requiredCount.new}`);
    }
    if (changedFields.workerType) {
      changeSummaries.push(`Role: ${changedFields.workerType.old} -> ${changedFields.workerType.new}`);
    }
    if (changedFields.maxDistanceKm) {
      changeSummaries.push(`Max distance: ${changedFields.maxDistanceKm.old}km -> ${changedFields.maxDistanceKm.new}km`);
    }
    if (changedFields.description) {
      changeSummaries.push('Work details updated');
    }
    const changesText = changeSummaries.length > 0 ? changeSummaries.join(', ') : 'operational details updated';

    // 6.1 Determine staffing status after update
    const assignedWorkers = req.assignedWorkers || [];
    const assignedWorkerIds = assignedWorkers
      .map((a: any) => a.workerId?.toString())
      .filter((id: string) => Boolean(id) && mongoose.Types.ObjectId.isValid(id));
    const assignedCount = assignedWorkerIds.length;
    const requiredCount = req.requiredCount;
    const isFullyFilled = assignedCount >= requiredCount;

    // Check if interest window is open
    const isInterestOpen =
      req.status === 'open' &&
      Boolean(req.interestDeadlineAt && req.interestDeadlineAt.getTime() > Date.now());

    let scenario: 'A' | 'B' | 'C' = 'C';
    let recipientIds: string[] = [];

    if (isFullyFilled) {
      // 6.2 Scenario A — Worker count fully filled: notify only selected/assigned workers
      scenario = 'A';
      recipientIds = [...assignedWorkerIds];
    } else if (isInterestOpen) {
      // 6.3 Scenario B — Worker count not filled and interest window is open:
      // Notify assigned workers + valid interested workers + currently eligible workers
      scenario = 'B';
      const responses = await workResponseRepository.findInterestedByRequirement(requirementId);
      const interestedWorkerIds = responses
        .filter((r) => r.responseStatus === 'interested')
        .map((r) => r.workerId.toString());

      const eligibleWorkerIds = await workerOpportunityService.findEligibleWorkersForOpportunity(requirementId);

      const combined = new Set<string>([
        ...assignedWorkerIds,
        ...interestedWorkerIds,
        ...eligibleWorkerIds,
      ]);
      recipientIds = Array.from(combined);
    } else {
      // 6.4 Scenario C — Worker count not filled but interest window is closed:
      // Notify assigned workers + valid interested workers (do not notify newly eligible workers)
      scenario = 'C';
      const responses = await workResponseRepository.findInterestedByRequirement(requirementId);
      const interestedWorkerIds = responses
        .filter((r) => r.responseStatus === 'interested')
        .map((r) => r.workerId.toString());

      const combined = new Set<string>([
        ...assignedWorkerIds,
        ...interestedWorkerIds,
      ]);
      recipientIds = Array.from(combined);
    }

    if (recipientIds.length === 0) {
      if ((data as any).outboxEventId) {
        await notificationOutboxRepository.markProcessed((data as any).outboxEventId);
      }
      return { scenario, notifiedCount: 0 };
    }

    const updateStamp = data.enqueuedAt || new Date().toISOString();
    const sortedFieldNames = Object.keys(changedFields).sort().join('_');

    const notificationItems: CreateNotificationInput[] = recipientIds.map((workerId) => {
      const isAssigned = assignedWorkerIds.includes(workerId);
      const title = 'Work Requirement Updated';
      const message = isAssigned
        ? `Your assigned requirement for ${req.workerType} on ${eventTitle} has been updated: ${changesText}.`
        : `Work requirement for ${req.workerType} on ${eventTitle} has been updated: ${changesText}.`;

      return {
        recipientId: workerId,
        type: 'requirement_updated',
        title,
        message,
        resourceType: 'work_requirement',
        resourceId: requirementId,
        destinationRoute: '/worker',
        deduplicationKey: `req_upd_${requirementId}_${sortedFieldNames}_${updateStamp}_${workerId}`,
        metadata: {
          eventId: event?._id ? event._id.toString() : req.eventId.toString(),
          workerType: req.workerType,
          scenario,
          changedFields,
          isAssigned,
        },
      };
    });

    const saved = await notificationService.createNotificationsBatch(notificationItems, 50);
    console.log(
      `✅ [NotificationProcessor] Update notifications dispatched for req ${requirementId} (Scenario ${scenario}): ${saved.length}/${recipientIds.length} worker(s) notified.`
    );

    if ((data as any).outboxEventId) {
      await notificationOutboxRepository.markProcessed((data as any).outboxEventId);
    }

    return { scenario, notifiedCount: saved.length };
  }

  /**
   * Processes a Work Requirement deadline extension notification job (Event C):
   * 1. Revalidates persisted WorkRequirement and selection round.
   * 2. Notifies valid interested workers and other currently eligible workers.
   * 3. Excludes already assigned workers (assignments preserved, not new candidates).
   * 4. Deduplicates recipient groups by Worker ID.
   */
  public async processDeadlineExtension(
    data: DeadlineExtensionJobData
  ): Promise<{ notifiedCount: number; eligibleCount: number }> {
    const { requirementId, selectionRound, newDeadline } = data;
    console.log(`🔍 [NotificationProcessor] Processing deadline extension for req ${requirementId} (Round ${selectionRound})...`);

    if (!mongoose.Types.ObjectId.isValid(requirementId)) {
      console.warn(`⚠️ [NotificationProcessor] Invalid requirement ID format: ${requirementId}`);
      return { notifiedCount: 0, eligibleCount: 0 };
    }

    const req = await WorkRequirement.findById(requirementId).populate('eventId');
    if (!req) {
      console.warn(`⚠️ [NotificationProcessor] Requirement ${requirementId} not found, skipping.`);
      return { notifiedCount: 0, eligibleCount: 0 };
    }

    // Skip if requirement is cancelled or closed
    if (req.status === 'cancelled' || req.status === 'closed') {
      console.log(`ℹ️ [NotificationProcessor] Requirement ${requirementId} is in '${req.status}' status, skipping deadline extension notification.`);
      return { notifiedCount: 0, eligibleCount: 0 };
    }

    // Stale round guard
    if (req.selectionRound !== selectionRound) {
      console.log(`ℹ️ [NotificationProcessor] Mismatched selection round for deadline extension: current round ${req.selectionRound} !== job round ${selectionRound}.`);
      return { notifiedCount: 0, eligibleCount: 0 };
    }

    const event = req.eventId as any;
    const eventTitle = event?.title || 'an upcoming event';

    // Assigned workers are preserved and excluded from opportunity candidate notifications
    const assignedIds = new Set(
      (req.assignedWorkers || []).map((a: any) => a.workerId?.toString()).filter(Boolean)
    );

    // Group 2: Workers who have already expressed valid interest
    const responses = await workResponseRepository.findInterestedByRequirement(requirementId);
    const interestedWorkerIds = responses
      .filter((r) => r.responseStatus === 'interested' || r.responseStatus === 'not_selected')
      .map((r) => r.workerId.toString())
      .filter((id) => !assignedIds.has(id));

    // Group 3: Other workers who are currently eligible under existing Worker Opportunity service
    const eligibleWorkerIds = await workerOpportunityService.findEligibleWorkersForOpportunity(requirementId);
    const unassignedEligibleIds = eligibleWorkerIds.filter((id) => !assignedIds.has(id));

    // Combine Group 2 and Group 3 and deduplicate by Worker ID
    const recipientIds = Array.from(new Set<string>([...interestedWorkerIds, ...unassignedEligibleIds]));

    if (recipientIds.length === 0) {
      console.log(`ℹ️ [NotificationProcessor] No interested or eligible workers found for extension on req ${requirementId}.`);
      if ((data as any).outboxEventId) {
        await notificationOutboxRepository.markProcessed((data as any).outboxEventId);
      }
      return { notifiedCount: 0, eligibleCount: 0 };
    }

    // Format deadline using standard conventions
    const formattedDeadline = new Date(newDeadline).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    const notificationItems: CreateNotificationInput[] = recipientIds.map((workerId) => ({
      recipientId: workerId,
      type: 'deadline_extended',
      title: 'Work Requirement Deadline Extended',
      message: `The interest deadline for ${req.workerType} on ${eventTitle} has been extended to ${formattedDeadline}.`,
      resourceType: 'work_requirement',
      resourceId: requirementId,
      destinationRoute: '/worker',
      deduplicationKey: `req_ext_${requirementId}_round${selectionRound}_${workerId}`,
      metadata: {
        eventId: event?._id ? event._id.toString() : req.eventId.toString(),
        workerType: req.workerType,
        selectionRound,
        newDeadline,
      },
    }));

    const saved = await notificationService.createNotificationsBatch(notificationItems, 50);
    console.log(
      `✅ [NotificationProcessor] Deadline extension notifications dispatched for req ${requirementId}: ${saved.length}/${recipientIds.length} worker(s) notified.`
    );

    if ((data as any).outboxEventId) {
      await notificationOutboxRepository.markProcessed((data as any).outboxEventId);
    }

    return {
      notifiedCount: saved.length,
      eligibleCount: unassignedEligibleIds.length,
    };
  }

  /**
   * Processes an outbox notification job:
   * 1. Loads outbox record and checks if already processed.
   * 2. Delegates to the established business event processor.
   * 3. Marks outbox record as 'processed' after successful dispatch.
   */
  public async processOutboxEvent(
    data: OutboxNotificationJobData
  ): Promise<{ status: string; outboxEventId: string }> {
    const { outboxEventId, eventType, payload } = data;
    console.log(`🔍 [NotificationProcessor] Processing outbox job ${outboxEventId} (Type: ${eventType})...`);

    const outbox = await notificationOutboxRepository.findByEventId(outboxEventId);
    if (!outbox) {
      console.warn(`⚠️ [NotificationProcessor] Outbox record ${outboxEventId} not found, skipping.`);
      return { status: 'not_found', outboxEventId };
    }

    if (outbox.status === 'processed') {
      console.log(`ℹ️ [NotificationProcessor] Outbox event ${outboxEventId} already processed, skipping.`);
      return { status: 'already_processed', outboxEventId };
    }

    if (eventType === 'requirement_cancelled') {
      await this.processRequirementCancellation(payload);
    } else if (eventType === 'requirement_updated') {
      await this.processRequirementUpdate(payload);
    } else if (eventType === 'deadline_extended') {
      await this.processDeadlineExtension(payload);
    } else {
      console.warn(`⚠️ [NotificationProcessor] Unknown outbox event type: ${eventType}`);
    }

    await notificationOutboxRepository.markProcessed(outboxEventId);
    console.log(`✅ [NotificationProcessor] Outbox event ${outboxEventId} marked as processed.`);

    return { status: 'success', outboxEventId };
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

        if (job.name === JOB_OUTBOX_EVENT) {
          return this.processOutboxEvent(job.data as OutboxNotificationJobData);
        } else if (job.name === JOB_REQUIREMENT_ANNOUNCEMENT) {
          return this.processRequirementAnnouncements(job.data as RequirementAnnouncementJobData);
        } else if (job.name === JOB_SELECTION_COMPLETION) {
          return this.processSelectionCompletion(job.data as SelectionCompletionJobData);
        } else if (job.name === JOB_REQUIREMENT_CANCELLATION) {
          return this.processRequirementCancellation(job.data as RequirementCancellationJobData);
        } else if (job.name === JOB_REQUIREMENT_UPDATE) {
          return this.processRequirementUpdate(job.data as RequirementUpdateJobData);
        } else if (job.name === JOB_DEADLINE_EXTENSION) {
          return this.processDeadlineExtension(job.data as DeadlineExtensionJobData);
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

    this.worker.on('failed', async (job, err) => {
      console.error(`💥 [NotificationWorker] Job ${job?.id} failed:`, err.message);
      const outboxEventId = (job?.data as any)?.outboxEventId;
      if (outboxEventId) {
        const attemptsMade = job?.attemptsMade || 1;
        const maxAttempts = job?.opts?.attempts || 3;
        if (attemptsMade >= maxAttempts) {
          console.warn(`🚨 [NotificationWorker] Outbox event ${outboxEventId} exhausted BullMQ retries (${attemptsMade}/${maxAttempts}), moving to dead_letter.`);
          const outbox = await notificationOutboxRepository.findByEventId(outboxEventId);
          if (outbox && outbox.status !== 'processed') {
            await notificationOutboxRepository.recordDispatchFailure(
              outboxEventId,
              outbox.leaseToken || 'worker_failed',
              err.message,
              0,
              1 // Force dead_letter immediately since retries exhausted
            );
          }
        }
      }
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
