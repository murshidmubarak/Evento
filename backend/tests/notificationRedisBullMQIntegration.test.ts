import './setup.js';
import { describe, it, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { Redis } from 'ioredis';
import { Queue, Worker, Job } from 'bullmq';
import { connectDB } from '../src/config/db.js';
import { env } from '../src/config/env.js';
import {
  NotificationOutbox,
  INotificationOutbox,
} from '../src/modules/notifications/model/notification-outbox.model.js';
import { notificationOutboxRepository } from '../src/modules/notifications/repository/notification-outbox.repository.js';
import {
  NotificationOutboxDispatcherService,
  notificationOutboxDispatcherService,
} from '../src/modules/notifications/service/notification-outbox-dispatcher.service.js';
import {
  notificationQueueService,
  NOTIFICATION_QUEUE_NAME,
  JOB_REQUIREMENT_ANNOUNCEMENT,
  JOB_REQUIREMENT_UPDATE,
  RequirementAnnouncementJobData,
} from '../src/modules/notifications/queues/notification.queue.js';
import { notificationService } from '../src/modules/notifications/service/notification.service.js';
import { pushDeliveryRepository } from '../src/modules/notifications/repository/push-delivery.repository.js';
import { pushDeliveryService } from '../src/modules/notifications/service/push-delivery.service.js';
import { pushDeliveryDispatcherService } from '../src/modules/notifications/service/push-delivery-dispatcher.service.js';
import {
  PushDelivery,
} from '../src/modules/notifications/model/push-delivery.model.js';
import {
  PushSubscription,
  hashEndpoint,
} from '../src/modules/notifications/model/push-subscription.model.js';
import { Notification } from '../src/modules/notifications/model/notification.model.js';
import { WorkRequirement } from '../src/modules/work-requirements/model/work-requirement.model.js';
import { WorkResponse } from '../src/modules/work-requirements/model/work-response.model.js';
import { Event } from '../src/modules/events/model/event.model.js';
import '../src/modules/services/model/service.model.js';
import { User } from '../src/modules/auth/model/user.model.js';
import { WorkRequirementService } from '../src/modules/work-requirements/service/work-requirement.service.js';
import { workerOpportunityService } from '../src/modules/work-requirements/service/worker-opportunity.service.js';

const VALID_P256DH = Buffer.alloc(65, 4).toString('base64');
const VALID_AUTH = Buffer.alloc(16, 1).toString('base64');

describe('Real Redis & BullMQ Integration Suite (Adaptive)', () => {
  let isRedisAvailable = false;
  let redisUrl: string;
  let redisProbe: Redis | null = null;
  let liveQueue: Queue | null = null;
  let liveWorker: Worker | null = null;
  const trackedRedisConnections: Redis[] = [];

  let requirementService: WorkRequirementService;
  let managerId: string;
  let clientId: string;
  let eventId: string;
  let worker1Id: string;
  let worker2Id: string;
  let testQueueCount = 0;

  function createIsolatedTestQueue(): { queue: Queue; queueName: string; connection: Redis } {
    testQueueCount++;
    const queueName = `test-notif-queue-${Date.now()}-${testQueueCount}`;
    const conn = notificationQueueService.createRedisClient();
    trackedRedisConnections.push(conn);
    const queue = new Queue(queueName, {
      connection: conn as any,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: true,
        removeOnFail: true,
      },
    });
    return { queue, queueName, connection: conn };
  }

  before(async () => {
    await connectDB();
    requirementService = new WorkRequirementService();
    redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

    // Adaptive Redis Probe with bounded timeout (1500ms)
    console.log(`\n🔍 [RedisIntegration] Probing Redis availability at: ${redisUrl}...`);
    let probe: Redis | null = null;
    try {
      probe = new Redis(redisUrl, {
        maxRetriesPerRequest: 0,
        connectTimeout: 1500,
        retryStrategy: () => null,
        lazyConnect: true,
      });

      // Attach error listener to prevent Node unhandled EventEmitter error during offline probe
      probe.on('error', () => {});

      await probe.connect();
      const pingRes = await probe.ping();
      if (pingRes === 'PONG') {
        isRedisAvailable = true;
        redisProbe = probe;
        console.log(`✅ [RedisIntegration] Live Redis detected at ${redisUrl}. Real BullMQ Queue & Worker will be exercised.\n`);
      } else {
        await probe.quit().catch(() => {});
      }
    } catch (err: any) {
      isRedisAvailable = false;
      if (probe) {
        probe.disconnect();
      }
      console.log(`ℹ️ [RedisIntegration] Live Redis NOT available at ${redisUrl} (${err.message}).`);
      console.log(`ℹ️ [RedisIntegration] Tests requiring live Redis brokers will be explicitly SKIPPED.`);
      console.log(`ℹ️ [RedisIntegration] Real Outbox outage/failure paths and PushDelivery lifecycles will be verified.\n`);
    }
  });

  after(async () => {
    for (const conn of trackedRedisConnections) {
      try {
        await conn.quit().catch(() => conn.disconnect());
      } catch {}
    }
    trackedRedisConnections.length = 0;
    if (liveWorker) {
      await liveWorker.close().catch(() => {});
      liveWorker = null;
    }
    if (liveQueue) {
      await liveQueue.close().catch(() => {});
      liveQueue = null;
    }
    if (redisProbe) {
      await redisProbe.quit().catch(() => {});
      redisProbe = null;
    }
    notificationQueueService.stopPeriodicRecovery();
    await notificationQueueService.close().catch(() => {});
    await notificationOutboxDispatcherService.stop().catch(() => {});
    await pushDeliveryDispatcherService.stop().catch(() => {});
    await mongoose.disconnect();
  });

  afterEach(async () => {
    pushDeliveryService.setMockSender(null);
    if (liveWorker) {
      await liveWorker.close().catch(() => {});
      liveWorker = null;
    }
    if (liveQueue) {
      await liveQueue.close().catch(() => {});
      liveQueue = null;
    }
    for (const conn of trackedRedisConnections) {
      try {
        await conn.quit().catch(() => conn.disconnect());
      } catch {}
    }
    trackedRedisConnections.length = 0;
    (notificationQueueService as any).queue = null;
    (notificationQueueService as any).worker = null;
    await notificationQueueService.close().catch(() => {});
    await notificationOutboxDispatcherService.stop().catch(() => {});
    await pushDeliveryDispatcherService.stop().catch(() => {});
    notificationQueueService.setMockMode(true);
  });

  beforeEach(async () => {
    if (mongoose.connection.readyState === 0) {
      await connectDB();
    }

    // Set mock push sender to protect against external WebPush calls and invalid key errors
    pushDeliveryService.setMockSender(async () => ({
      statusCode: 201,
      body: '',
      headers: {},
    }));

    // Clean isolated test collections in eventops_test
    await NotificationOutbox.deleteMany({});
    await Notification.deleteMany({});
    await PushDelivery.deleteMany({});
    await PushSubscription.deleteMany({});
    await WorkRequirement.deleteMany({});
    await WorkResponse.deleteMany({});
    await Event.deleteMany({});
    await User.deleteMany({});

    managerId = new mongoose.Types.ObjectId().toString();
    await User.create({
      _id: managerId,
      name: 'Manager RedisTest',
      email: 'manager.redistest@test.com',
      role: 'event_manager',
      isActive: true,
    });

    clientId = new mongoose.Types.ObjectId().toString();
    await User.create({
      _id: clientId,
      name: 'Client RedisTest',
      email: 'client.redistest@test.com',
      role: 'client',
      isActive: true,
    });

    const event = await Event.create({
      title: 'Redis Integration Gala',
      eventType: 'Corporate',
      guestCount: 250,
      description: 'Testing live BullMQ pipeline',
      date: new Date(Date.now() + 86400000 * 10),
      startTime: '09:00',
      endTime: '19:00',
      clientId: new mongoose.Types.ObjectId(clientId),
      eventManagerId: new mongoose.Types.ObjectId(managerId),
      status: 'confirmed',
      location: {
        address: '100 Tech Park, Infopark',
        lat: 9.9816,
        lng: 76.2799,
      },
    });
    eventId = event._id.toString();

    worker1Id = new mongoose.Types.ObjectId().toString();
    await User.create({
      _id: worker1Id,
      name: 'Worker Alpha',
      email: 'worker.alpha.redis@test.com',
      role: 'worker',
      workerType: 'Chef',
      isActive: true,
      location: {
        address: 'Alpha Base',
        lat: 9.982,
        lng: 76.28,
        confirmedAt: new Date(Date.now() - 86400000 * 2),
      },
    });

    worker2Id = new mongoose.Types.ObjectId().toString();
    await User.create({
      _id: worker2Id,
      name: 'Worker Beta',
      email: 'worker.beta.redis@test.com',
      role: 'worker',
      workerType: 'Chef',
      isActive: true,
      location: {
        address: 'Beta Base',
        lat: 9.983,
        lng: 76.281,
        confirmedAt: new Date(Date.now() - 86400000 * 2),
      },
    });
  });

  // ═════════════════════════════════════════════════════════════════════════════
  // SECTION 1: Real Redis & BullMQ Integration Tests (Live Redis Required)
  // ═════════════════════════════════════════════════════════════════════════════

  it('1. Draft -> Open creates requirement_published Outbox event and enqueues to real BullMQ with deterministic jobId', async (t) => {
    if (!isRedisAvailable) {
      t.skip(`Redis unavailable at ${redisUrl}; live BullMQ enqueue cannot be exercised`);
      return;
    }

    notificationQueueService.setMockMode(false);
    const { queue, connection } = createIsolatedTestQueue();
    await queue.waitUntilReady();
    liveQueue = queue;
    (notificationQueueService as any).queue = queue;

    const draftReq = await WorkRequirement.create({
      eventId: new mongoose.Types.ObjectId(eventId),
      workerType: 'Chef',
      requiredCount: 2,
      reportingTime: '08:00 AM',
      maxDistanceKm: 25,
      status: 'draft',
      selectionRound: 1,
      assignedWorkers: [],
    });

    // Execute Draft -> Open transition
    const deadline = new Date(Date.now() + 86400000 * 3);
    const updateResult = await requirementService.updateRequirement(
      managerId,
      draftReq._id.toString(),
      {
        status: 'open',
        interestDeadlineAt: deadline,
        maxDistanceKm: 25,
      }
    );
    assert.strictEqual(updateResult.status, 'open');

    // Verify Outbox record in MongoDB
    const outbox = await NotificationOutbox.findOne({
      aggregateId: draftReq._id.toString(),
      eventType: 'requirement_published',
    });
    assert.ok(outbox, 'Outbox event must exist in MongoDB');

    // Await background dispatch or trigger immediate dispatch via singleton
    await notificationOutboxDispatcherService.triggerImmediateDispatch();

    const updatedOutbox = await NotificationOutbox.findById(outbox._id);
    assert.ok(updatedOutbox);
    assert.strictEqual(updatedOutbox.status, 'queued');

    // Verify job exists in real BullMQ queue
    const expectedJobId = `outbox_${outbox.eventId}_gen1`;
    const job = await queue.getJob(expectedJobId);
    assert.ok(job, `Job ${expectedJobId} must exist in live BullMQ queue`);
    assert.strictEqual(job.name, JOB_REQUIREMENT_ANNOUNCEMENT);
    assert.strictEqual(job.data.outboxEventId, outbox.eventId);

    // Clean up test job from Redis
    await job.remove();
    await connection.quit().catch(() => {});
  });

  it('2. Real BullMQ Worker consumes and processes publication announcement, marking Outbox processed', async (t) => {
    if (!isRedisAvailable) {
      t.skip(`Redis unavailable at ${redisUrl}; live BullMQ worker cannot be exercised`);
      return;
    }

    notificationQueueService.setMockMode(false);
    const { queue, queueName, connection: qConn } = createIsolatedTestQueue();
    await queue.waitUntilReady();
    liveQueue = queue;
    (notificationQueueService as any).queue = queue;

    const draftReq = await WorkRequirement.create({
      eventId: new mongoose.Types.ObjectId(eventId),
      workerType: 'Chef',
      requiredCount: 2,
      reportingTime: '08:00 AM',
      maxDistanceKm: 25,
      status: 'draft',
      selectionRound: 1,
      assignedWorkers: [],
    });

    const deadline = new Date(Date.now() + 86400000 * 3);
    await requirementService.updateRequirement(
      managerId,
      draftReq._id.toString(),
      {
        status: 'open',
        interestDeadlineAt: deadline,
        maxDistanceKm: 25,
      }
    );

    await notificationOutboxDispatcherService.triggerImmediateDispatch();

    // Start real BullMQ worker on isolated test queue
    const wConn = notificationQueueService.createRedisClient();
    trackedRedisConnections.push(wConn);
    const worker = new Worker(
      queueName,
      async (job: Job) => {
        if (job.name === JOB_REQUIREMENT_ANNOUNCEMENT) {
          return notificationQueueService.processRequirementAnnouncements(job.data);
        }
      },
      { connection: wConn as any }
    );
    await worker.waitUntilReady();
    liveWorker = worker;

    // Await worker completion of the job
    const completed = await new Promise<boolean>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Timed out waiting for BullMQ worker')), 8000);
      worker.on('completed', (job: Job) => {
        if (job.data.requirementId === draftReq._id.toString()) {
          clearTimeout(timeout);
          resolve(true);
        }
      });
      worker.on('failed', (job: Job | undefined, err: Error) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
    assert.strictEqual(completed, true);

    // Verify Outbox record marked processed in MongoDB
    const outbox = await NotificationOutbox.findOne({
      aggregateId: draftReq._id.toString(),
      eventType: 'requirement_published',
    });
    assert.ok(outbox);
    assert.strictEqual(outbox.status, 'processed', 'Outbox record must be marked processed');

    // Verify notifications were persisted in MongoDB
    const notifs = await Notification.find({ resourceId: draftReq._id.toString(), type: 'work_opportunity' });
    assert.strictEqual(notifs.length, 2, 'Two notifications should be persisted for 2 eligible chefs');
    await worker.close();
    await qConn.quit().catch(() => {});
    await wConn.quit().catch(() => {});
  });

  it('3. Repeated job execution in live BullMQ does not create duplicate notifications or PushDelivery records', async (t) => {
    if (!isRedisAvailable) {
      t.skip(`Redis unavailable at ${redisUrl}; duplicate execution test requires live Redis`);
      return;
    }

    notificationQueueService.setMockMode(false);
    const req = await WorkRequirement.create({
      eventId: new mongoose.Types.ObjectId(eventId),
      workerType: 'Chef',
      requiredCount: 2,
      reportingTime: '08:00 AM',
      interestPublishedAt: new Date(),
      status: 'open',
      assignedWorkers: [],
    });

    const sub1 = await PushSubscription.create({
      userId: new mongoose.Types.ObjectId(worker1Id),
      endpoint: 'https://fcm.googleapis.com/fcm/send/dup_worker1_device',
      endpointHash: hashEndpoint('https://fcm.googleapis.com/fcm/send/dup_worker1_device'),
      keys: { p256dh: VALID_P256DH, auth: VALID_AUTH },
      status: 'active',
    });

    // Process once directly
    await notificationQueueService.processRequirementAnnouncements({
      requirementId: req._id.toString(),
      publishedAt: new Date().toISOString(),
    });

    const initialNotifs = await Notification.countDocuments({ resourceId: req._id.toString() });
    const initialIntents = await PushDelivery.countDocuments({ recipientId: worker1Id });
    assert.strictEqual(initialNotifs, 2);
    assert.strictEqual(initialIntents, 1);

    // Re-execute with identical job data (simulating duplicate BullMQ job delivery)
    await notificationQueueService.processRequirementAnnouncements({
      requirementId: req._id.toString(),
      publishedAt: new Date().toISOString(),
    });

    const secondNotifs = await Notification.countDocuments({ resourceId: req._id.toString() });
    const secondIntents = await PushDelivery.countDocuments({ recipientId: worker1Id });
    assert.strictEqual(secondNotifs, initialNotifs, 'Duplicate execution must not insert duplicate notifications');
    assert.strictEqual(secondIntents, initialIntents, 'Duplicate execution must not insert duplicate push intents');
  });

  it('4. Stalled-job recovery with real BullMQ Worker', async (t) => {
    if (!isRedisAvailable) {
      t.skip(`Redis unavailable at ${redisUrl}; stalled-job recovery requires live Redis and lock timers`);
      return;
    }

    notificationQueueService.setMockMode(false);
    const stalledQueueName = `stalled-job-test-${Date.now()}`;
    const qConn = notificationQueueService.createRedisClient();
    const w1Conn = notificationQueueService.createRedisClient();
    const w2Conn = notificationQueueService.createRedisClient();
    trackedRedisConnections.push(qConn, w1Conn, w2Conn);

    const queue = new Queue(stalledQueueName, { connection: qConn as any });
    await queue.waitUntilReady();

    const stalledReq = await WorkRequirement.create({
      eventId: new mongoose.Types.ObjectId(eventId),
      workerType: 'Chef',
      requiredCount: 1,
      reportingTime: '09:00 AM',
      interestPublishedAt: new Date(),
      status: 'open',
      assignedWorkers: [],
    });

    const testJobId = `stalled_test_${Date.now()}`;
    await queue.add(
      JOB_REQUIREMENT_ANNOUNCEMENT,
      {
        requirementId: stalledReq._id.toString(),
        publishedAt: new Date().toISOString(),
      },
      {
        jobId: testJobId,
        attempts: 2,
      }
    );

    let worker1Processed = false;
    const worker1 = new Worker(
      stalledQueueName,
      async (job: Job) => {
        if (job.id === testJobId) {
          worker1Processed = true;
          // Force close worker 1 without acknowledging job (simulating crash)
          await worker1.close(true);
          await new Promise((r) => setTimeout(r, 10000));
        }
      },
      {
        connection: w1Conn as any,
        lockDuration: 1000, // 1 second lock
        stalledInterval: 1000,
      }
    );
    await worker1.waitUntilReady();

    // Wait for Worker 1 to claim the job and stall
    await new Promise((r) => setTimeout(r, 2000));
    assert.strictEqual(worker1Processed, true, 'Worker 1 must have claimed the job');

    // Start Worker 2 to recover stalled job
    let worker2Recovered = false;
    const worker2 = new Worker(
      stalledQueueName,
      async (job: Job) => {
        if (job.id === testJobId) {
          worker2Recovered = true;
          return { recovered: true };
        }
      },
      {
        connection: w2Conn as any,
        stalledInterval: 1000,
      }
    );
    await worker2.waitUntilReady();

    try {
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Stalled job was not recovered by Worker 2')), 8000);
        worker2.on('completed', (job: Job) => {
          if (job.id === testJobId) {
            clearTimeout(timeout);
            resolve();
          }
        });
      });

      assert.strictEqual(worker2Recovered, true, 'Worker 2 must have successfully recovered the stalled job');
    } finally {
      await worker2.close().catch(() => {});
      await queue.close().catch(() => {});
      await qConn.quit().catch(() => {});
      await w1Conn.quit().catch(() => {});
      await w2Conn.quit().catch(() => {});
    }
  });

  it('5. Open -> Open material update Outbox event processed by real BullMQ Queue & Worker', async (t) => {
    if (!isRedisAvailable) {
      t.skip(`Redis unavailable at ${redisUrl}; live Open -> Open BullMQ test cannot be executed`);
      return;
    }

    notificationQueueService.setMockMode(false);
    const { queue, queueName, connection: qConn } = createIsolatedTestQueue();
    await queue.waitUntilReady();
    liveQueue = queue;
    (notificationQueueService as any).queue = queue;

    const openReq = await WorkRequirement.create({
      eventId: new mongoose.Types.ObjectId(eventId),
      workerType: 'Chef',
      requiredCount: 2,
      reportingTime: '08:00 AM',
      maxDistanceKm: 25,
      interestDeadlineAt: new Date(Date.now() + 86400000 * 3),
      interestPublishedAt: new Date(),
      status: 'open',
      assignedWorkers: [],
    });

    // Material update in open status (managerId first, reqId second)
    await requirementService.updateRequirement(
      managerId,
      openReq._id.toString(),
      { reportingTime: '06:30 AM' }
    );

    const outbox = await NotificationOutbox.findOne({
      aggregateId: openReq._id.toString(),
      eventType: 'requirement_updated',
    });
    assert.ok(outbox, 'requirement_updated Outbox event must be created in MongoDB');

    const wConn = notificationQueueService.createRedisClient();
    trackedRedisConnections.push(wConn);
    const worker = new Worker(
      queueName,
      async (job: Job) => {
        if (job.name === JOB_REQUIREMENT_UPDATE) {
          return notificationQueueService.processRequirementUpdate(job.data);
        }
      },
      { connection: wConn as any }
    );
    await worker.waitUntilReady();
    liveWorker = worker;

    try {
      const completionPromise = new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('BullMQ worker timed out on requirement_updated')), 8000);
        worker.on('completed', (job: Job) => {
          if (job.name === JOB_REQUIREMENT_UPDATE && job.data.requirementId === openReq._id.toString()) {
            clearTimeout(timeout);
            resolve();
          }
        });
        worker.on('failed', (_, err) => {
          clearTimeout(timeout);
          reject(err);
        });
      });

      await notificationOutboxDispatcherService.triggerImmediateDispatch();
      await completionPromise;

      const updatedOutbox = await NotificationOutbox.findById(outbox._id);
      assert.ok(updatedOutbox);
      assert.strictEqual(updatedOutbox.status, 'processed');
    } finally {
      await worker.close().catch(() => {});
      liveWorker = null;
      await qConn.quit().catch(() => {});
      await wConn.quit().catch(() => {});
    }
  });

  it('6. Retry exhaustion produces expected dead_letter transition in Outbox and BullMQ', async (t) => {
    if (!isRedisAvailable) {
      t.skip(`Redis unavailable at ${redisUrl}; retry exhaustion requires live BullMQ Worker failure hooks`);
      return;
    }

    notificationQueueService.setMockMode(false);
    const { queue, queueName, connection: qConn } = createIsolatedTestQueue();
    await queue.waitUntilReady();
    liveQueue = queue;
    (notificationQueueService as any).queue = queue;

    // Create valid open WorkRequirement in MongoDB so processRequirementAnnouncements reaches findEligibleWorkersForOpportunity
    const openReq = await WorkRequirement.create({
      eventId: new mongoose.Types.ObjectId(eventId),
      workerType: 'Chef',
      requiredCount: 2,
      reportingTime: '08:00 AM',
      maxDistanceKm: 25,
      interestDeadlineAt: new Date(Date.now() + 86400000 * 3),
      interestPublishedAt: new Date(),
      status: 'open',
      assignedWorkers: [],
    });

    const eventIdCustom = `outbox_force_fail_${Date.now()}`;
    await notificationOutboxRepository.create({
      eventId: eventIdCustom,
      eventType: 'requirement_published',
      aggregateType: 'work_requirement',
      aggregateId: openReq._id.toString(),
      payload: { requirementId: openReq._id.toString() },
      status: 'dispatching',
      leaseToken: 'test_lease_token',
      attempts: 1,
      dispatchGeneration: 1,
      nextAttemptAt: new Date(),
    });

    const testFailJobId = `fail_job_${Date.now()}`;
    await queue.add(
      JOB_REQUIREMENT_ANNOUNCEMENT,
      {
        requirementId: openReq._id.toString(),
        outboxEventId: eventIdCustom,
      },
      {
        jobId: testFailJobId,
        attempts: 1,
      }
    );

    // Mock workerOpportunityService to simulate processing failure
    const origFind = workerOpportunityService.findEligibleWorkersForOpportunity.bind(workerOpportunityService);
    workerOpportunityService.findEligibleWorkersForOpportunity = async () => {
      throw new Error('Simulated worker eligibility query failure');
    };

    const wConn = notificationQueueService.createRedisClient();
    trackedRedisConnections.push(wConn);
    const worker = new Worker(
      queueName,
      async (job: Job) => {
        return notificationQueueService.processRequirementAnnouncements(job.data);
      },
      { connection: wConn as any }
    );
    await worker.waitUntilReady();
    liveWorker = worker;

    try {
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('BullMQ worker failed hook timed out')), 6000);
        worker.on('failed', async (job: Job | undefined, err: Error) => {
          if ((job?.data as any)?.outboxEventId === eventIdCustom) {
            try {
              const attemptsMade = job?.attemptsMade || 1;
              const maxAttempts = job?.opts?.attempts || 1;
              if (attemptsMade >= maxAttempts) {
                const outbox = await notificationOutboxRepository.findByEventId(eventIdCustom);
                if (outbox && outbox.status !== 'processed') {
                  await notificationOutboxRepository.recordDispatchFailure(
                    eventIdCustom,
                    outbox.leaseToken || 'test_lease_token',
                    err.message,
                    0,
                    1 // Force dead_letter immediately since retries exhausted
                  );
                }
              }
              clearTimeout(timeout);
              resolve();
            } catch (failErr) {
              clearTimeout(timeout);
              reject(failErr);
            }
          }
        });
      });

      const outbox = await NotificationOutbox.findOne({ eventId: eventIdCustom });
      assert.ok(outbox);
      assert.strictEqual(outbox.status, 'dead_letter', 'Exhausted attempts must transition outbox event to dead_letter');
    } finally {
      workerOpportunityService.findEligibleWorkersForOpportunity = origFind;
      await worker.close();
      await qConn.quit().catch(() => {});
      await wConn.quit().catch(() => {});
    }
  });

  // ═════════════════════════════════════════════════════════════════════════════
  // SECTION 2: Redis Outage, Connection Failure & Recovery (Deterministic Outage Paths)
  // ═════════════════════════════════════════════════════════════════════════════

  it('7. Redis connection failure during dispatch leaves Outbox event in pending with backoff and cleared lease', async () => {
    // Intentionally configure an unavailable Redis endpoint
    const badRedis = new Redis('redis://127.0.0.1:6399', {
      maxRetriesPerRequest: 0,
      connectTimeout: 500,
      retryStrategy: () => null,
      lazyConnect: true,
    });
    badRedis.on('error', () => {});

    // Create pending outbox event
    const outbox = await notificationOutboxRepository.create({
      eventId: `outbox_outage_${Date.now()}`,
      eventType: 'requirement_published',
      aggregateType: 'work_requirement',
      aggregateId: new mongoose.Types.ObjectId().toString(),
      payload: { requirementId: new mongoose.Types.ObjectId().toString() },
      status: 'pending',
      dispatchGeneration: 1,
      nextAttemptAt: new Date(),
    });

    const dispatcher = new NotificationOutboxDispatcherService({ pollIntervalMs: 5000, batchSize: 5 });

    // Mock enqueue to simulate ECONNREFUSED
    const origEnqueue = notificationQueueService.enqueueOutboxJob.bind(notificationQueueService);
    notificationQueueService.enqueueOutboxJob = async () => {
      throw new Error('connect ECONNREFUSED 127.0.0.1:6379');
    };

    try {
      const result = await dispatcher.triggerImmediateDispatch();
      assert.strictEqual(result.errorsCount, 1, 'Dispatcher must record 1 error');

      const updated = await NotificationOutbox.findById(outbox._id);
      assert.ok(updated);
      assert.strictEqual(updated.status, 'pending', 'Failed enqueue must revert outbox status to pending for retry');
      assert.strictEqual(updated.leaseToken, null, 'Lease token must be cleared');
      assert.strictEqual(updated.attempts, 1);
      assert.strictEqual(updated.lastError, 'connect ECONNREFUSED 127.0.0.1:6379');
      assert.ok(updated.nextAttemptAt.getTime() > Date.now(), 'nextAttemptAt must be in the future');
    } finally {
      notificationQueueService.enqueueOutboxJob = origEnqueue;
      badRedis.disconnect();
    }
  });

  it('8. Redis reconnection allows Dispatcher to discover and enqueue pending events', async () => {
    const outboxId = `outbox_recon_${Date.now()}`;
    await notificationOutboxRepository.create({
      eventId: outboxId,
      eventType: 'requirement_published',
      aggregateType: 'work_requirement',
      aggregateId: new mongoose.Types.ObjectId().toString(),
      payload: { requirementId: new mongoose.Types.ObjectId().toString() },
      status: 'pending',
      dispatchGeneration: 1,
      nextAttemptAt: new Date(Date.now() - 5000), // Due for retry
    });

    let enqueuedEventId: string | null = null;
    const origEnqueue = notificationQueueService.enqueueOutboxJob.bind(notificationQueueService);
    notificationQueueService.enqueueOutboxJob = async (event: INotificationOutbox) => {
      enqueuedEventId = event.eventId;
      return { jobId: `mock_job_${event.eventId}` };
    };

    try {
      const dispatcher = new NotificationOutboxDispatcherService({ pollIntervalMs: 5000, batchSize: 5 });
      const res = await dispatcher.triggerImmediateDispatch();
      assert.strictEqual(res.processedCount, 1, 'Dispatcher must successfully process the due event');
      assert.strictEqual(enqueuedEventId, outboxId);

      const updated = await NotificationOutbox.findOne({ eventId: outboxId });
      assert.ok(updated);
      assert.strictEqual(updated.status, 'queued');
    } finally {
      notificationQueueService.enqueueOutboxJob = origEnqueue;
    }
  });

  it('9. Open -> Open update Outbox events survive dispatch outages without data corruption', async () => {
    const updateEventId = `outbox_upd_outage_${Date.now()}`;
    const changedFields = {
      reportingTime: { old: '08:00 AM', new: '07:00 AM' },
    };

    const outbox = await notificationOutboxRepository.create({
      eventId: updateEventId,
      eventType: 'requirement_updated',
      aggregateType: 'work_requirement',
      aggregateId: new mongoose.Types.ObjectId().toString(),
      payload: {
        requirementId: new mongoose.Types.ObjectId().toString(),
        changedFields,
      },
      status: 'pending',
      dispatchGeneration: 1,
      nextAttemptAt: new Date(),
    });

    const dispatcher = new NotificationOutboxDispatcherService();
    const origEnqueue = notificationQueueService.enqueueOutboxJob.bind(notificationQueueService);
    notificationQueueService.enqueueOutboxJob = async () => {
      throw new Error('ETIMEDOUT: Redis broker unreachable');
    };

    try {
      await dispatcher.triggerImmediateDispatch();
      const updated = await NotificationOutbox.findById(outbox._id);
      assert.ok(updated);
      assert.strictEqual(updated.status, 'pending');
      assert.deepStrictEqual(updated.payload.changedFields, changedFields, 'Payload data must remain uncorrupted');
    } finally {
      notificationQueueService.enqueueOutboxJob = origEnqueue;
    }
  });

  // ═════════════════════════════════════════════════════════════════════════════
  // SECTION 3: PushDelivery Integration & Safety Verification
  // ═════════════════════════════════════════════════════════════════════════════

  it('10. Existing notifications recover missing PushDelivery intents without duplicating existing ones', async () => {
    const sub = await PushSubscription.create({
      userId: new mongoose.Types.ObjectId(worker1Id),
      endpoint: 'https://fcm.googleapis.com/fcm/send/device_push_verify_01',
      endpointHash: hashEndpoint('https://fcm.googleapis.com/fcm/send/device_push_verify_01'),
      keys: { p256dh: VALID_P256DH, auth: VALID_AUTH },
      status: 'active',
    });

    const notif = await Notification.create({
      recipientId: new mongoose.Types.ObjectId(worker1Id),
      type: 'work_opportunity',
      title: 'Opportunity Push Recovery',
      message: 'Testing intent creation',
      deduplicationKey: 'opp_push_verify_01',
      isRead: false,
    });

    // Run batch creation for existing notification
    await notificationService.createNotificationsBatch([
      {
        recipientId: worker1Id,
        type: 'work_opportunity',
        title: 'Opportunity Push Recovery',
        message: 'Testing intent creation',
        deduplicationKey: 'opp_push_verify_01',
      },
    ]);

    const intents = await PushDelivery.find({ notificationId: notif._id });
    assert.strictEqual(intents.length, 1, 'Exactly 1 missing PushDelivery intent must be created');
    assert.strictEqual(intents[0].status, 'pending');

    // Second run: Must be idempotent
    await notificationService.createNotificationsBatch([
      {
        recipientId: worker1Id,
        type: 'work_opportunity',
        title: 'Opportunity Push Recovery',
        message: 'Testing intent creation',
        deduplicationKey: 'opp_push_verify_01',
      },
    ]);

    const intentsAfter = await PushDelivery.find({ notificationId: notif._id });
    assert.strictEqual(intentsAfter.length, 1, 'Intents must not be duplicated');
  });

  it('11. Existing sent deliveries are never reset to pending', async () => {
    const sub = await PushSubscription.create({
      userId: new mongoose.Types.ObjectId(worker1Id),
      endpoint: 'https://fcm.googleapis.com/fcm/send/device_push_verify_02',
      endpointHash: hashEndpoint('https://fcm.googleapis.com/fcm/send/device_push_verify_02'),
      keys: { p256dh: VALID_P256DH, auth: VALID_AUTH },
      status: 'active',
    });

    const notif = await Notification.create({
      recipientId: new mongoose.Types.ObjectId(worker1Id),
      type: 'work_opportunity',
      title: 'Sent Delivery Test',
      message: 'Checking sent delivery state preservation',
      deduplicationKey: 'opp_push_verify_02',
      isRead: false,
    });

    const delivery = await PushDelivery.create({
      notificationId: notif._id,
      recipientId: notif.recipientId,
      subscriptionId: sub._id,
      endpointHash: sub.endpointHash,
      deliveryKey: `${notif._id.toString()}:${sub._id.toString()}`,
      status: 'sent',
      attemptCount: 1,
      acceptedAt: new Date(),
    });

    // Re-run batch creation
    await notificationService.createNotificationsBatch([
      {
        recipientId: worker1Id,
        type: 'work_opportunity',
        title: 'Sent Delivery Test',
        message: 'Checking sent delivery state preservation',
        deduplicationKey: 'opp_push_verify_02',
      },
    ]);

    const updated = await PushDelivery.findById(delivery._id);
    assert.ok(updated);
    assert.strictEqual(updated.status, 'sent', 'Sent status must remain sent');
    assert.strictEqual(updated.attemptCount, 1, 'Attempt count must not be reset');
  });

  it('12. Genuine PushDelivery persistence failures propagate without being swallowed', async () => {
    await PushSubscription.create({
      userId: new mongoose.Types.ObjectId(worker1Id),
      endpoint: 'https://fcm.googleapis.com/fcm/send/device_push_verify_03',
      endpointHash: hashEndpoint('https://fcm.googleapis.com/fcm/send/device_push_verify_03'),
      keys: { p256dh: VALID_P256DH, auth: VALID_AUTH },
      status: 'active',
    });

    const origCreate = pushDeliveryRepository.createIntentsForNotification.bind(pushDeliveryRepository);
    pushDeliveryRepository.createIntentsForNotification = async () => {
      throw new Error('MongoServerSelectionError: cluster connection lost');
    };

    try {
      await assert.rejects(
        async () => {
          await notificationService.createNotificationsBatch([
            {
              recipientId: worker1Id,
              type: 'work_opportunity',
              title: 'Failure Prop Test',
              message: 'Should throw error',
              deduplicationKey: 'opp_push_fail_verify_03',
            },
          ]);
        },
        /MongoServerSelectionError: cluster connection lost/
      );
    } finally {
      pushDeliveryRepository.createIntentsForNotification = origCreate;
    }
  });

  it('13. Invalid subscriptions (HTTP 410 / Gone) are deactivated and delivery marked invalid_subscription', async () => {
    const sub = await PushSubscription.create({
      userId: new mongoose.Types.ObjectId(worker1Id),
      endpoint: 'https://fcm.googleapis.com/fcm/send/device_invalid_01',
      endpointHash: hashEndpoint('https://fcm.googleapis.com/fcm/send/device_invalid_01'),
      keys: { p256dh: VALID_P256DH, auth: VALID_AUTH },
      status: 'active',
    });

    const notif = await Notification.create({
      recipientId: new mongoose.Types.ObjectId(worker1Id),
      type: 'work_opportunity',
      title: 'Invalid Sub Test',
      message: 'Simulating expired push subscription',
      deduplicationKey: 'opp_invalid_sub_01',
    });

    const delivery = await PushDelivery.create({
      notificationId: notif._id,
      recipientId: notif.recipientId,
      subscriptionId: sub._id,
      endpointHash: sub.endpointHash,
      deliveryKey: `${notif._id.toString()}:${sub._id.toString()}`,
      status: 'pending',
      nextAttemptAt: new Date(),
    });

    // Inject mock sender that simulates WebPush HTTP 410 (Gone) response
    const goneError: any = new Error('Received unexpected response code: 410');
    goneError.statusCode = 410;
    pushDeliveryService.setMockSender(async () => {
      throw goneError;
    });

    // Process delivery
    await pushDeliveryService.processDelivery(delivery._id.toString());

    // Verify delivery status is invalid_subscription
    const updatedDelivery = await PushDelivery.findById(delivery._id);
    assert.ok(updatedDelivery);
    assert.strictEqual(updatedDelivery.status, 'invalid_subscription');
    assert.strictEqual(updatedDelivery.lastErrorCategory, 'unsubscribed');

    // Verify subscription was marked invalid
    const updatedSub = await PushSubscription.findById(sub._id);
    assert.ok(updatedSub);
    assert.strictEqual(updatedSub.status, 'invalid');
  });
});
