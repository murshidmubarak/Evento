import { Queue, Worker, Job } from 'bullmq';
import { Redis } from 'ioredis';
import { env } from '../../../config/env.js';
import { workerSelectionService } from '../service/worker-selection.service.js';
import { WorkRequirementRepository } from '../../work-requirements/repository/work-requirement.repository.js';
import { WorkRequirement } from '../../work-requirements/model/work-requirement.model.js';
import { toCalendarDayString } from '../utils/calendar-day.util.js';

export const WORKER_SELECTION_QUEUE_NAME = 'worker-selection';

export interface WorkerSelectionJobData {
  requirementId: string;
  selectionRound: number;
  scheduledDeadline: string;
  enqueuedAt: string;
}

/**
 * Lightweight in-memory queue adapter for testing without an external Redis instance.
 */
export class InMemorySelectionQueue {
  public name: string;
  public jobs: { id: string; name: string; data: WorkerSelectionJobData; opts?: any }[] = [];

  constructor(name: string) {
    this.name = name;
  }

  async add(
    jobName: string,
    data: WorkerSelectionJobData,
    opts?: any
  ): Promise<{ id: string; name: string; data: WorkerSelectionJobData; opts?: any }> {
    const id = opts?.jobId || `mock_sel_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
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

export class WorkerSelectionQueueService {
  private selectionQueue: Queue<WorkerSelectionJobData> | null = null;
  private selectionWorker: Worker<WorkerSelectionJobData> | null = null;
  private sharedRedisConnection: Redis | null = null;
  private requirementRepository: WorkRequirementRepository;

  // Test Isolation: In-memory queues for tests or when Redis is absent
  private isMockMode: boolean = process.env.NODE_ENV === 'test' || !env.redisUrl;
  private mockSelectionQueue: InMemorySelectionQueue = new InMemorySelectionQueue(WORKER_SELECTION_QUEUE_NAME);

  constructor() {
    this.requirementRepository = new WorkRequirementRepository();
  }

  setMockMode(enabled: boolean): void {
    this.isMockMode = enabled;
  }

  getMockQueue(): InMemorySelectionQueue {
    return this.mockSelectionQueue;
  }

  private getRedisConnection(): Redis {
    if (!this.sharedRedisConnection) {
      if (!env.redisUrl) {
        throw new Error('REDIS_URL is not configured in environment.');
      }
      this.sharedRedisConnection = new Redis(env.redisUrl, {
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
        retryStrategy: (times) => Math.min(times * 100, 3000),
      });
      this.sharedRedisConnection.on('error', (err) => {
        console.error('⚠️ [WorkerSelectionQueue] Redis error:', err.message);
      });
    }
    return this.sharedRedisConnection;
  }

  getQueue(): Queue<WorkerSelectionJobData> | InMemorySelectionQueue {
    if (this.isMockMode) {
      return this.mockSelectionQueue;
    }
    if (!this.selectionQueue) {
      const connection = this.getRedisConnection();
      this.selectionQueue = new Queue<WorkerSelectionJobData>(WORKER_SELECTION_QUEUE_NAME, {
        connection,
        defaultJobOptions: {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
          removeOnComplete: true,
          removeOnFail: false,
        },
      });
    }
    return this.selectionQueue;
  }

  /**
   * Schedules a delayed BullMQ job to run selection when the interest deadline arrives.
   */
  async scheduleSelectionJob(
    requirementId: string,
    deadline: Date,
    selectionRound: number = 1
  ): Promise<{ jobId: string; delayMs: number }> {
    const now = Date.now();
    const deadlineTime = deadline.getTime();
    const delayMs = Math.max(0, deadlineTime - now);
    const jobId = `selection_${requirementId}_round_${selectionRound}`;

    const jobData: WorkerSelectionJobData = {
      requirementId,
      selectionRound,
      scheduledDeadline: deadline.toISOString(),
      enqueuedAt: new Date().toISOString(),
    };

    if (this.isMockMode) {
      await this.mockSelectionQueue.add('execute-selection', jobData, { jobId, delay: delayMs });
      return { jobId, delayMs };
    }

    const queue = this.getQueue() as Queue<WorkerSelectionJobData>;
    await queue.add('execute-selection', jobData, {
      jobId,
      delay: delayMs,
    });

    console.log(`⏰ [WorkerSelectionQueue] Scheduled selection job '${jobId}' with ${Math.round(delayMs / 1000)}s delay`);
    return { jobId, delayMs };
  }

  /**
   * Initializes the standalone Worker to process selection jobs.
   */
  startWorker(): { selectionWorker: Worker<WorkerSelectionJobData> | null } {
    if (this.isMockMode) {
      console.log('ℹ️ [WorkerSelectionQueue] Running in mock/test mode: Live Redis worker not started.');
      return { selectionWorker: null };
    }

    if (this.selectionWorker) {
      return { selectionWorker: this.selectionWorker };
    }

    const connection = this.getRedisConnection();

    this.selectionWorker = new Worker<WorkerSelectionJobData>(
      WORKER_SELECTION_QUEUE_NAME,
      async (job: Job<WorkerSelectionJobData>) => {
        const { requirementId, selectionRound } = job.data;
        console.log(`🔄 [WorkerSelectionWorker] Processing selection job ${job.id} for requirement ${requirementId} (Round ${selectionRound})...`);

        try {
          const result = await workerSelectionService.executeSelection(requirementId, selectionRound);
          console.log(`✅ [WorkerSelectionWorker] Selection complete for requirement ${requirementId}: Selected ${result.newlySelectedCount}, Total Assigned ${result.totalAssignedCount}/${result.requiredCount}, Status: ${result.status}`);
          return result;
        } catch (err: any) {
          console.error(`❌ [WorkerSelectionWorker] Selection job ${job.id} failed:`, err.message);
          throw err;
        }
      },
      {
        connection,
        concurrency: 2,
      }
    );

    this.selectionWorker.on('failed', (job, err) => {
      console.error(`💥 [WorkerSelectionWorker] Job ${job?.id} failed permanently:`, err.message);
    });

    return { selectionWorker: this.selectionWorker };
  }

  /**
   * Scans MongoDB for any open requirements whose deadlines have expired
   * and runs selection (resilient against service restarts).
   */
  async scanAndProcessExpiredDeadlines(): Promise<number> {
    const expiredRequirements = await this.requirementRepository.findPendingDeadlineRequirements();
    let processedCount = 0;
    const todayStr = toCalendarDayString(new Date());

    for (const req of expiredRequirements) {
      try {
        const event = req.eventId as any;
        if (event && event.date) {
          let isPast = false;
          try {
            if (toCalendarDayString(event.date) < todayStr) isPast = true;
          } catch {
            if (new Date(event.date).getTime() < Date.now()) isPast = true;
          }

          if (isPast) {
            console.log(`ℹ️ [WorkerSelectionQueue] Auto-closing requirement ${req._id} because event date has passed.`);
            await WorkRequirement.updateOne(
              { _id: req._id, status: { $nin: ['closed', 'cancelled'] } },
              { $set: { status: 'closed' } }
            );
            continue;
          }
        }

        console.log(`🔎 [WorkerSelectionQueue] Processing expired requirement ${req._id} found during scan...`);
        await workerSelectionService.executeSelection(req._id.toString(), req.selectionRound);
        processedCount++;
      } catch (err: any) {
        console.error(`⚠️ [WorkerSelectionQueue] Failed processing expired requirement ${req._id}:`, err.message);
      }
    }

    return processedCount;
  }

  async close(): Promise<void> {
    if (this.selectionWorker) {
      await this.selectionWorker.close();
      this.selectionWorker = null;
    }
    if (this.selectionQueue) {
      await this.selectionQueue.close();
      this.selectionQueue = null;
    }
    if (this.sharedRedisConnection) {
      await this.sharedRedisConnection.quit();
      this.sharedRedisConnection = null;
    }
    this.mockSelectionQueue.clear();
  }
}

export const workerSelectionQueueService = new WorkerSelectionQueueService();
