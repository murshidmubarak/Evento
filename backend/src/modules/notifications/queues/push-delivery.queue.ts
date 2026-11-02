import { Queue, Worker, Job } from 'bullmq';
import { Redis } from 'ioredis';
import { env } from '../../../config/env.js';
import { pushDeliveryService } from '../service/push-delivery.service.js';

export const NOTIFICATION_PUSH_QUEUE_NAME = 'notification-push';
export const JOB_PUSH_DELIVERY = 'push-delivery';

export interface PushDeliveryJobData {
  deliveryId: string;
  dispatchGeneration: number;
  notificationId: string;
  subscriptionId: string;
  enqueuedAt?: string;
}

export class InMemoryPushQueue {
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
    const id = opts?.jobId || `mock_push_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
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

export class PushDeliveryQueueService {
  private queue: Queue<PushDeliveryJobData> | null = null;
  private worker: Worker<PushDeliveryJobData> | null = null;
  private sharedRedisConnection: Redis | null = null;

  private isMockMode: boolean = process.env.NODE_ENV === 'test' || !env.redisUrl;
  private mockQueue: InMemoryPushQueue = new InMemoryPushQueue(NOTIFICATION_PUSH_QUEUE_NAME);
  private autoProcessInMock: boolean = true;

  constructor() {}

  public setMockMode(enabled: boolean): void {
    this.isMockMode = enabled;
  }

  public getIsMockMode(): boolean {
    return this.isMockMode;
  }

  public setAutoProcessInMock(enabled: boolean): void {
    this.autoProcessInMock = enabled;
  }

  public getMockQueue(): InMemoryPushQueue {
    return this.mockQueue;
  }

  private getRedisConnection(): Redis {
    if (!this.sharedRedisConnection) {
      if (!env.redisUrl) {
        throw new Error('REDIS_URL is required to initialize PushDeliveryQueue connection.');
      }
      this.sharedRedisConnection = new Redis(env.redisUrl, {
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
        retryStrategy(times) {
          return Math.min(times * 100, 3000);
        },
      });
    }
    return this.sharedRedisConnection;
  }

  public getQueue(): Queue<PushDeliveryJobData> | InMemoryPushQueue {
    if (this.isMockMode) {
      return this.mockQueue;
    }

    if (!this.queue) {
      const connection = this.getRedisConnection();
      this.queue = new Queue<PushDeliveryJobData>(NOTIFICATION_PUSH_QUEUE_NAME, {
        connection,
        defaultJobOptions: {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
          removeOnComplete: { count: 1000 },
          removeOnFail: { count: 5000 },
        },
      });
    }
    return this.queue;
  }

  /**
   * Enqueues a PushDelivery record for asynchronous processing.
   */
  public async enqueuePushDelivery(
    deliveryId: string,
    dispatchGeneration: number,
    notificationId: string,
    subscriptionId: string
  ): Promise<{ id: string; name: string }> {
    const jobData: PushDeliveryJobData = {
      deliveryId,
      dispatchGeneration,
      notificationId,
      subscriptionId,
      enqueuedAt: new Date().toISOString(),
    };

    const jobId = `push:${deliveryId}:${dispatchGeneration}`;

    if (this.isMockMode) {
      const job = await this.mockQueue.add(JOB_PUSH_DELIVERY, jobData, { jobId });
      if (this.autoProcessInMock) {
        // Asynchronously process in background
        setImmediate(async () => {
          try {
            await pushDeliveryService.processDelivery(deliveryId);
          } catch (err: any) {
            console.error('❌ [PushQueue:Mock] Failed processing delivery:', err.message);
          }
        });
      }
      return { id: job.id, name: job.name };
    }

    const q = this.getQueue() as Queue<PushDeliveryJobData>;
    const job = await q.add(JOB_PUSH_DELIVERY, jobData, { jobId });
    return { id: job.id as string, name: job.name };
  }

  /**
   * Starts the BullMQ worker for the notification-push queue.
   */
  public startWorker(concurrency = 5): Worker<PushDeliveryJobData> | null {
    if (this.isMockMode) {
      console.log('ℹ️ [PushDeliveryQueue] Running in mock/test mode: Live Redis worker not started.');
      return null;
    }

    if (this.worker) {
      return this.worker;
    }

    const connection = this.getRedisConnection();

    this.worker = new Worker<PushDeliveryJobData>(
      NOTIFICATION_PUSH_QUEUE_NAME,
      async (job: Job<PushDeliveryJobData>) => {
        const { deliveryId } = job.data;
        await pushDeliveryService.processDelivery(deliveryId);
      },
      {
        connection,
        concurrency,
      }
    );

    this.worker.on('failed', (job, err) => {
      console.error(`❌ [PushDeliveryWorker] Job ${job?.id} failed with error:`, err.message);
    });

    this.worker.on('error', (err) => {
      console.error('❌ [PushDeliveryWorker] Worker error:', err.message);
    });

    return this.worker;
  }

  /**
   * Graceful shutdown of queue and worker.
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
      await this.sharedRedisConnection.quit();
      this.sharedRedisConnection = null;
    }

    this.mockQueue.clear();
  }
}

export const pushDeliveryQueueService = new PushDeliveryQueueService();

