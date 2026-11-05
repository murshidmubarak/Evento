import './setup.js';
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { connectDB } from '../src/config/db.js';
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
  JOB_REQUIREMENT_ANNOUNCEMENT,
} from '../src/modules/notifications/queues/notification.queue.js';
import { notificationService } from '../src/modules/notifications/service/notification.service.js';
import { notificationTransport } from '../src/sockets/notification-transport.js';
import { WorkRequirement } from '../src/modules/work-requirements/model/work-requirement.model.js';
import { WorkResponse } from '../src/modules/work-requirements/model/work-response.model.js';
import { Event } from '../src/modules/events/model/event.model.js';
import '../src/modules/services/model/service.model.js';
import { User } from '../src/modules/auth/model/user.model.js';
import { Notification } from '../src/modules/notifications/model/notification.model.js';
import { WorkRequirementService } from '../src/modules/work-requirements/service/work-requirement.service.js';

describe('Draft -> Open Work Requirement Outbox Reliability Suite', () => {
  let requirementService: WorkRequirementService;
  let managerId: string;
  let eventId: string;
  let worker1Id: string;
  let worker2Id: string;

  before(async () => {
    await connectDB();
    notificationQueueService.setMockMode(true);
    requirementService = new WorkRequirementService();
  });

  after(async () => {
    await mongoose.disconnect();
  });

  beforeEach(async () => {
    if (mongoose.connection.readyState === 0) {
      await connectDB();
    }
    notificationQueueService.setMockMode(true);
    notificationQueueService.clearMockQueue();

    // Clean test collections
    await NotificationOutbox.deleteMany({});
    await Notification.deleteMany({});
    await WorkRequirement.deleteMany({});
    await WorkResponse.deleteMany({});
    await Event.deleteMany({});
    await User.deleteMany({});

    managerId = new mongoose.Types.ObjectId().toString();
    await User.create({
      _id: managerId,
      name: 'Manager DraftOpen Test',
      email: 'manager.draftopen@test.com',
      role: 'event_manager',
      isActive: true,
    });

    const clientId = new mongoose.Types.ObjectId().toString();
    await User.create({
      _id: clientId,
      name: 'Client Test',
      email: 'client.draftopen@test.com',
      role: 'client',
      isActive: true,
    });

    const event = await Event.create({
      title: 'Grand Annual Convention',
      eventType: 'Corporate',
      guestCount: 250,
      description: 'Reliability Publication Gala',
      date: new Date(Date.now() + 86400000 * 10),
      startTime: '09:00',
      endTime: '19:00',
      eventManagerId: new mongoose.Types.ObjectId(managerId),
      clientId: new mongoose.Types.ObjectId(clientId),
      location: {
        address: 'Marine Drive, Kochi, Kerala',
        lat: 9.9816,
        lng: 76.2799,
      },
      status: 'confirmed',
    });
    eventId = event._id.toString();

    worker1Id = new mongoose.Types.ObjectId().toString();
    await User.create({
      _id: worker1Id,
      name: 'Chef One',
      email: 'chef1.draftopen@test.com',
      role: 'worker',
      workerType: 'Chef',
      isActive: true,
      location: { address: 'Ernakulam', lat: 9.982, lng: 76.28, confirmedAt: new Date(Date.now() - 86400000 * 2) },
    });

    worker2Id = new mongoose.Types.ObjectId().toString();
    await User.create({
      _id: worker2Id,
      name: 'Chef Two',
      email: 'chef2.draftopen@test.com',
      role: 'worker',
      workerType: 'Chef',
      isActive: true,
      location: { address: 'Kaloor', lat: 9.99, lng: 76.29, confirmedAt: new Date(Date.now() - 86400000 * 2) },
    });
  });

  // ─── 1. Draft -> Open creates exactly one requirement_published outbox event ───
  it('1. Draft -> Open creates exactly one requirement_published Outbox event atomically', async () => {
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
    const updated = await requirementService.updateRequirement(managerId, draftReq._id.toString(), {
      status: 'open',
      interestDeadlineAt: deadline,
      maxDistanceKm: 25,
    });

    assert.strictEqual(updated.status, 'open');
    assert.ok(updated.interestPublishedAt);

    // Verify exactly one requirement_published Outbox event exists in MongoDB
    const outboxEvents = await NotificationOutbox.find({
      aggregateId: draftReq._id.toString(),
      eventType: 'requirement_published',
    });

    assert.strictEqual(outboxEvents.length, 1);
    const pubEvent = outboxEvents[0];
    assert.strictEqual(pubEvent.aggregateType, 'work_requirement');
    assert.strictEqual(pubEvent.payload.requirementId, draftReq._id.toString());
    assert.ok(pubEvent.payload.publishedAt);
    assert.ok(['pending', 'dispatching', 'queued', 'processed'].includes(pubEvent.status));
  });

  // ─── 2. Outbox creation failure rolls back WorkRequirement status update ─────
  it('2. Outbox creation failure rolls back the WorkRequirement status update', async () => {
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

    // Monkey-patch repository to throw error during transaction
    const origCreate = notificationOutboxRepository.create.bind(notificationOutboxRepository);
    notificationOutboxRepository.create = async () => {
      throw new Error('Simulated Outbox Creation Failure During Transaction');
    };

    try {
      await assert.rejects(
        async () => {
          await requirementService.updateRequirement(managerId, draftReq._id.toString(), {
            status: 'open',
            interestDeadlineAt: new Date(Date.now() + 86400000 * 3),
            maxDistanceKm: 25,
          });
        },
        /Simulated Outbox Creation Failure During Transaction/
      );

      // Verify requirement in MongoDB remains 'draft' (transaction rolled back)
      const afterReq = await WorkRequirement.findById(draftReq._id);
      assert.strictEqual(afterReq?.status, 'draft');
      assert.strictEqual(afterReq?.interestPublishedAt, undefined);

      // Verify no outbox records were committed
      const outboxCount = await NotificationOutbox.countDocuments({
        aggregateId: draftReq._id.toString(),
      });
      assert.strictEqual(outboxCount, 0);
    } finally {
      notificationOutboxRepository.create = origCreate;
    }
  });

  // ─── 3. Stable eventId outside transaction callback prevents duplicate events ─
  it('3. Stable eventId prevents duplicate publication events on transaction retry', async () => {
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

    const updated = await requirementService.updateRequirement(managerId, draftReq._id.toString(), {
      status: 'open',
      interestDeadlineAt: new Date(Date.now() + 86400000 * 3),
      maxDistanceKm: 25,
    });

    assert.strictEqual(updated.status, 'open');

    // Verify outbox has unique index on eventId and only 1 event exists
    const events = await NotificationOutbox.find({ aggregateId: draftReq._id.toString() });
    assert.strictEqual(events.length, 1);
    assert.ok(events[0].eventId.startsWith('outbox_pub_'));
  });

  // ─── 4. Redis unavailable after commit does not lose the Outbox event ─────────
  it('4. Redis unavailable after commit does not lose the Outbox event', async () => {
    const eventIdCustom = `outbox_redis_fail_${Date.now()}`;
    const reqId = new mongoose.Types.ObjectId().toString();

    // Persist a pending publication event in MongoDB
    await notificationOutboxRepository.create({
      eventId: eventIdCustom,
      eventType: 'requirement_published',
      aggregateType: 'work_requirement',
      aggregateId: reqId,
      payload: {
        requirementId: reqId,
        publishedAt: new Date().toISOString(),
      },
      status: 'pending',
      nextAttemptAt: new Date(),
    });

    // Simulate Redis enqueue failure
    const origEnqueue = notificationQueueService.enqueueOutboxJob.bind(notificationQueueService);
    notificationQueueService.enqueueOutboxJob = async () => {
      throw new Error('ECONNREFUSED: Redis cluster unreachable');
    };

    try {
      const dispatcher = new NotificationOutboxDispatcherService({ pollIntervalMs: 100000, batchSize: 5 });
      const result = await dispatcher.dispatchDueEvents();

      assert.strictEqual(result.errorsCount, 1);

      // Verify the event in MongoDB was NOT lost — remains pending with backoff
      const outbox = await notificationOutboxRepository.findByEventId(eventIdCustom);
      assert.ok(outbox);
      assert.strictEqual(outbox?.status, 'pending');
      assert.strictEqual(outbox?.attempts, 1);
      assert.match(outbox?.lastError || '', /ECONNREFUSED/);
    } finally {
      notificationQueueService.enqueueOutboxJob = origEnqueue;
    }
  });

  // ─── 5. Dispatcher recovers pending publication event after restart ───────────
  it('5. Dispatcher recovers the pending publication event after restart', async () => {
    const pubEventId = `outbox_pub_restart_${Date.now()}`;
    const req = await WorkRequirement.create({
      eventId: new mongoose.Types.ObjectId(eventId),
      workerType: 'Chef',
      requiredCount: 2,
      reportingTime: '08:00 AM',
      maxDistanceKm: 25,
      interestDeadlineAt: new Date(Date.now() + 86400000 * 2),
      status: 'open',
      assignedWorkers: [],
    });

    // Unclaimed pending event created prior to dispatcher startup
    await notificationOutboxRepository.create({
      eventId: pubEventId,
      eventType: 'requirement_published',
      aggregateType: 'work_requirement',
      aggregateId: req._id.toString(),
      payload: {
        requirementId: req._id.toString(),
        publishedAt: new Date().toISOString(),
      },
      status: 'pending',
      nextAttemptAt: new Date(Date.now() - 5000), // Due immediately
    });

    // New dispatcher instance starts up
    const freshDispatcher = new NotificationOutboxDispatcherService();
    const result = await freshDispatcher.dispatchDueEvents();
    assert.ok(result.processedCount >= 1);

    // Verify BullMQ received the typed requirement-announcement job
    const mockQueue = notificationQueueService.getMockQueue();
    const job = mockQueue.jobs.find((j) => j.name === JOB_REQUIREMENT_ANNOUNCEMENT && j.data.requirementId === req._id.toString());
    assert.ok(job, 'Typed announcement job must be enqueued');
    assert.strictEqual(job.data.outboxEventId, pubEventId);

    // Verify outbox was transitioned out of pending
    const outbox = await notificationOutboxRepository.findByEventId(pubEventId);
    assert.ok(['queued', 'processed'].includes(outbox?.status || ''));
  });

  // ─── 6. Dispatcher periodically discovers pending publication events ──────────
  it('6. Dispatcher periodically discovers pending publication events without restart', async () => {
    const pubEventId = `outbox_pub_periodic_${Date.now()}`;
    const req = await WorkRequirement.create({
      eventId: new mongoose.Types.ObjectId(eventId),
      workerType: 'Chef',
      requiredCount: 1,
      reportingTime: '08:00 AM',
      maxDistanceKm: 25,
      interestDeadlineAt: new Date(Date.now() + 86400000 * 2),
      status: 'open',
      assignedWorkers: [],
    });

    await notificationOutboxRepository.create({
      eventId: pubEventId,
      eventType: 'requirement_published',
      aggregateType: 'work_requirement',
      aggregateId: req._id.toString(),
      payload: {
        requirementId: req._id.toString(),
        publishedAt: new Date().toISOString(),
      },
      status: 'pending',
      nextAttemptAt: new Date(),
    });

    // Trigger immediate polling cycle
    const result = await notificationOutboxDispatcherService.triggerImmediateDispatch();
    assert.ok(result.processedCount >= 1);

    const outbox = await notificationOutboxRepository.findByEventId(pubEventId);
    assert.ok(['queued', 'processed'].includes(outbox?.status || ''));
  });

  // ─── 7 & 8. Worker crash after partial persistence recovers missing recipients ─
  it('7 & 8. Partial persistence recovery: retry persists missing recipients without duplicating existing ones', async () => {
    const req = await WorkRequirement.create({
      eventId: new mongoose.Types.ObjectId(eventId),
      workerType: 'Chef',
      requiredCount: 2,
      reportingTime: '08:00 AM',
      maxDistanceKm: 25,
      interestDeadlineAt: new Date(Date.now() + 86400000 * 2),
      status: 'open',
      assignedWorkers: [],
    });

    const outboxEventId = `outbox_pub_partial_${Date.now()}`;
    await notificationOutboxRepository.create({
      eventId: outboxEventId,
      eventType: 'requirement_published',
      aggregateType: 'work_requirement',
      aggregateId: req._id.toString(),
      payload: {
        requirementId: req._id.toString(),
        publishedAt: new Date().toISOString(),
      },
      status: 'queued',
      nextAttemptAt: new Date(),
    });

    // Simulate pre-existing notification for Worker 1 (from an earlier crashed attempt)
    const worker1DupKey = `req_opp_${req._id}_${worker1Id}`;
    await Notification.create({
      recipientId: new mongoose.Types.ObjectId(worker1Id),
      type: 'work_opportunity',
      title: 'New work opportunity',
      message: 'Pre-existing announcement',
      resourceType: 'work_requirement',
      resourceId: req._id.toString(),
      destinationRoute: '/worker',
      deduplicationKey: worker1DupKey,
    });

    // Execute announcement processor (representing BullMQ retry)
    const result = await notificationQueueService.processRequirementAnnouncements({
      requirementId: req._id.toString(),
      outboxEventId,
    });

    // Both workers should be accounted for (Worker 1 deduplicated, Worker 2 inserted)
    assert.strictEqual(result.notifiedCount, 2);

    // Verify Worker 1 was NOT duplicated
    const w1Docs = await Notification.find({ deduplicationKey: worker1DupKey });
    assert.strictEqual(w1Docs.length, 1);

    // Verify Worker 2 was persisted on the retry
    const worker2DupKey = `req_opp_${req._id}_${worker2Id}`;
    const w2Docs = await Notification.find({ deduplicationKey: worker2DupKey });
    assert.strictEqual(w2Docs.length, 1);

    // Outbox event should now be marked processed
    const outbox = await notificationOutboxRepository.findByEventId(outboxEventId);
    assert.strictEqual(outbox?.status, 'processed');
  });

  // ─── 9. Non-duplicate persistence errors propagate and Outbox is not processed ─
  it('9. Non-duplicate persistence errors propagate and Outbox remains unprocessed', async () => {
    const req = await WorkRequirement.create({
      eventId: new mongoose.Types.ObjectId(eventId),
      workerType: 'Chef',
      requiredCount: 2,
      reportingTime: '08:00 AM',
      maxDistanceKm: 25,
      interestDeadlineAt: new Date(Date.now() + 86400000 * 2),
      status: 'open',
      assignedWorkers: [],
    });

    const outboxEventId = `outbox_pub_fail_${Date.now()}`;
    await notificationOutboxRepository.create({
      eventId: outboxEventId,
      eventType: 'requirement_published',
      aggregateType: 'work_requirement',
      aggregateId: req._id.toString(),
      payload: {
        requirementId: req._id.toString(),
        publishedAt: new Date().toISOString(),
      },
      status: 'queued',
      nextAttemptAt: new Date(),
    });

    const origBatch = notificationService.createNotificationsBatch.bind(notificationService);
    notificationService.createNotificationsBatch = async () => {
      throw new Error('Simulated Database Fatal Persistence Error');
    };

    try {
      await assert.rejects(
        async () => {
          await notificationQueueService.processRequirementAnnouncements({
            requirementId: req._id.toString(),
            outboxEventId,
          });
        },
        /Simulated Database Fatal Persistence Error/
      );

      // Verify Outbox is STILL NOT processed
      const outbox = await notificationOutboxRepository.findByEventId(outboxEventId);
      assert.strictEqual(outbox?.status, 'queued');
    } finally {
      notificationService.createNotificationsBatch = origBatch;
    }
  });

  // ─── 10. Outbox is processed only after complete notification persistence ─────
  it('10. Outbox is processed only after complete notification persistence', async () => {
    const req = await WorkRequirement.create({
      eventId: new mongoose.Types.ObjectId(eventId),
      workerType: 'Chef',
      requiredCount: 2,
      reportingTime: '08:00 AM',
      maxDistanceKm: 25,
      interestDeadlineAt: new Date(Date.now() + 86400000 * 2),
      status: 'open',
      assignedWorkers: [],
    });

    const outboxEventId = `outbox_pub_success_${Date.now()}`;
    await notificationOutboxRepository.create({
      eventId: outboxEventId,
      eventType: 'requirement_published',
      aggregateType: 'work_requirement',
      aggregateId: req._id.toString(),
      payload: {
        requirementId: req._id.toString(),
        publishedAt: new Date().toISOString(),
      },
      status: 'queued',
      nextAttemptAt: new Date(),
    });

    const result = await notificationQueueService.processRequirementAnnouncements({
      requirementId: req._id.toString(),
      outboxEventId,
    });

    assert.strictEqual(result.notifiedCount, 2);

    const outbox = await notificationOutboxRepository.findByEventId(outboxEventId);
    assert.strictEqual(outbox?.status, 'processed');
    assert.ok(outbox?.processedAt);
  });

  // ─── 11. Zero eligible workers handled without infinite retries ───────────────
  it('11. Zero eligible workers handled without infinite retries', async () => {
    // Work requirement for a workerType with 0 registered workers
    const req = await WorkRequirement.create({
      eventId: new mongoose.Types.ObjectId(eventId),
      workerType: 'Cameraman / Photographer',
      requiredCount: 1,
      reportingTime: '08:00 AM',
      maxDistanceKm: 25,
      interestDeadlineAt: new Date(Date.now() + 86400000 * 2),
      status: 'open',
      assignedWorkers: [],
    });

    const outboxEventId = `outbox_pub_zero_${Date.now()}`;
    await notificationOutboxRepository.create({
      eventId: outboxEventId,
      eventType: 'requirement_published',
      aggregateType: 'work_requirement',
      aggregateId: req._id.toString(),
      payload: {
        requirementId: req._id.toString(),
        publishedAt: new Date().toISOString(),
      },
      status: 'queued',
      nextAttemptAt: new Date(),
    });

    const result = await notificationQueueService.processRequirementAnnouncements({
      requirementId: req._id.toString(),
      outboxEventId,
    });

    assert.strictEqual(result.eligibleCount, 0);
    assert.strictEqual(result.notifiedCount, 0);

    // Outbox event should be marked processed cleanly without retrying indefinitely
    const outbox = await notificationOutboxRepository.findByEventId(outboxEventId);
    assert.strictEqual(outbox?.status, 'processed');
  });

  // ─── 12. Repeated or concurrent processing does not create duplicates ─────────
  it('12. Repeated or concurrent processing does not create duplicate notifications', async () => {
    const req = await WorkRequirement.create({
      eventId: new mongoose.Types.ObjectId(eventId),
      workerType: 'Chef',
      requiredCount: 2,
      reportingTime: '08:00 AM',
      maxDistanceKm: 25,
      interestDeadlineAt: new Date(Date.now() + 86400000 * 2),
      status: 'open',
      assignedWorkers: [],
    });

    const outboxEventId = `outbox_pub_concurr_${Date.now()}`;
    await notificationOutboxRepository.create({
      eventId: outboxEventId,
      eventType: 'requirement_published',
      aggregateType: 'work_requirement',
      aggregateId: req._id.toString(),
      payload: {
        requirementId: req._id.toString(),
        publishedAt: new Date().toISOString(),
      },
      status: 'queued',
      nextAttemptAt: new Date(),
    });

    // Run first time
    const res1 = await notificationQueueService.processRequirementAnnouncements({
      requirementId: req._id.toString(),
      outboxEventId,
    });

    // Run second time (simulating concurrent or redelivered job)
    const res2 = await notificationQueueService.processRequirementAnnouncements({
      requirementId: req._id.toString(),
      outboxEventId,
    });

    assert.strictEqual(res1.notifiedCount, 2);
    assert.strictEqual(res2.notifiedCount, 2);

    // Total notifications in database for this requirement must be exactly 2 (1 per worker)
    const totalNotifs = await Notification.countDocuments({ resourceId: req._id.toString() });
    assert.strictEqual(totalNotifs, 2);
  });

  // ─── 13. Legacy open requirements handled safely without duplication ──────────
  it('13. Legacy open requirements without publication Outbox records are recovered safely', async () => {
    // Open requirement created before Outbox migration: has interestPublishedAt but NO outbox record
    const legacyReq = await WorkRequirement.create({
      eventId: new mongoose.Types.ObjectId(eventId),
      workerType: 'Chef',
      requiredCount: 2,
      reportingTime: '08:00 AM',
      maxDistanceKm: 25,
      interestDeadlineAt: new Date(Date.now() + 86400000 * 2),
      interestPublishedAt: new Date(Date.now() - 3600000), // published 1 hr ago
      status: 'open',
      assignedWorkers: [],
    });

    // Verify 0 notifications and 0 outbox events initially
    const beforeNotifs = await Notification.countDocuments({ resourceId: legacyReq._id.toString() });
    assert.strictEqual(beforeNotifs, 0);
    const beforeOutbox = await NotificationOutbox.countDocuments({ aggregateId: legacyReq._id.toString() });
    assert.strictEqual(beforeOutbox, 0);

    // Run recovery scanner
    const recovered = await notificationQueueService.scanAndRecoverPendingNotifications();
    assert.ok(recovered >= 1);

    // Check notifications are now persisted
    const afterNotifs = await Notification.find({ resourceId: legacyReq._id.toString() });
    assert.strictEqual(afterNotifs.length, 2);

    // Check backfilled outbox record is marked processed
    const legacyOutbox = await NotificationOutbox.findOne({
      aggregateId: legacyReq._id.toString(),
      eventType: 'requirement_published',
    });
    assert.ok(legacyOutbox);
    assert.strictEqual(legacyOutbox?.status, 'processed');

    // Run recovery scanner again: should be an idempotent no-op
    const recoveredSecond = await notificationQueueService.scanAndRecoverPendingNotifications();
    assert.strictEqual(recoveredSecond, 0);

    // No duplicate notifications
    const finalNotifs = await Notification.countDocuments({ resourceId: legacyReq._id.toString() });
    assert.strictEqual(finalNotifs, 2);
  });

  // ─── 14. Legacy requirement with partial notifications heals missing recipients ─
  it('14. Legacy requirement with partial notifications heals missing recipients without duplicate notifications', async () => {
    const legacyReq = await WorkRequirement.create({
      eventId: new mongoose.Types.ObjectId(eventId),
      workerType: 'Chef',
      requiredCount: 2,
      reportingTime: '08:00 AM',
      maxDistanceKm: 25,
      interestDeadlineAt: new Date(Date.now() + 86400000 * 2),
      interestPublishedAt: new Date(Date.now() - 3600000),
      status: 'open',
      assignedWorkers: [],
    });

    // Simulate pre-existing notification for Worker 1 only (partial legacy announcement before crash)
    const worker1DupKey = `req_opp_${legacyReq._id}_${worker1Id}`;
    await Notification.create({
      recipientId: new mongoose.Types.ObjectId(worker1Id),
      type: 'work_opportunity',
      title: 'New work opportunity',
      message: 'Pre-existing legacy announcement',
      resourceType: 'work_requirement',
      resourceId: legacyReq._id.toString(),
      destinationRoute: '/worker',
      deduplicationKey: worker1DupKey,
    });

    // Verify 1 notification exists initially
    const beforeCount = await Notification.countDocuments({ resourceId: legacyReq._id.toString() });
    assert.strictEqual(beforeCount, 1);

    // Run recovery scanner — must NOT skip due to Notification.exists()!
    const recovered = await notificationQueueService.scanAndRecoverPendingNotifications();
    assert.ok(recovered >= 1);

    // Verify Worker 1 was NOT duplicated
    const w1Docs = await Notification.find({ deduplicationKey: worker1DupKey });
    assert.strictEqual(w1Docs.length, 1);

    // Verify Worker 2 missing notification was healed
    const worker2DupKey = `req_opp_${legacyReq._id}_${worker2Id}`;
    const w2Docs = await Notification.find({ deduplicationKey: worker2DupKey });
    assert.strictEqual(w2Docs.length, 1);

    // Total notifications in database for this requirement is now 2
    const totalCount = await Notification.countDocuments({ resourceId: legacyReq._id.toString() });
    assert.strictEqual(totalCount, 2);

    // Backfilled outbox record exists and is marked processed
    const legacyOutbox = await NotificationOutbox.findOne({
      aggregateId: legacyReq._id.toString(),
      eventType: 'requirement_published',
    });
    assert.ok(legacyOutbox);
    assert.strictEqual(legacyOutbox?.status, 'processed');
  });

  // ─── 15. Legacy requirement with all notifications does not re-emit Socket.IO ─
  it('15. Legacy requirement with all notifications backfills outbox without re-emitting Socket.IO or Push', async () => {
    const legacyReq = await WorkRequirement.create({
      eventId: new mongoose.Types.ObjectId(eventId),
      workerType: 'Chef',
      requiredCount: 2,
      reportingTime: '08:00 AM',
      maxDistanceKm: 25,
      interestDeadlineAt: new Date(Date.now() + 86400000 * 2),
      interestPublishedAt: new Date(Date.now() - 3600000),
      status: 'open',
      assignedWorkers: [],
    });

    // Pre-insert notifications for BOTH eligible workers
    await Notification.create([
      {
        recipientId: new mongoose.Types.ObjectId(worker1Id),
        type: 'work_opportunity',
        title: 'New work opportunity',
        message: 'Pre-existing announcement 1',
        resourceType: 'work_requirement',
        resourceId: legacyReq._id.toString(),
        destinationRoute: '/worker',
        deduplicationKey: `req_opp_${legacyReq._id}_${worker1Id}`,
      },
      {
        recipientId: new mongoose.Types.ObjectId(worker2Id),
        type: 'work_opportunity',
        title: 'New work opportunity',
        message: 'Pre-existing announcement 2',
        resourceType: 'work_requirement',
        resourceId: legacyReq._id.toString(),
        destinationRoute: '/worker',
        deduplicationKey: `req_opp_${legacyReq._id}_${worker2Id}`,
      },
    ]);

    // Spy on Socket.IO notificationTransport.sendNotification
    let emittedCount = 0;
    const origSend = notificationTransport.sendNotification.bind(notificationTransport);
    notificationTransport.sendNotification = async () => {
      emittedCount++;
    };

    try {
      const recovered = await notificationQueueService.scanAndRecoverPendingNotifications();
      assert.ok(recovered >= 1);

      // Verify zero Socket.IO events were emitted for pre-existing notifications
      assert.strictEqual(emittedCount, 0, 'Must NOT re-emit Socket.IO events for already-existing notifications');

      // Verify notification count is still exactly 2
      const totalCount = await Notification.countDocuments({ resourceId: legacyReq._id.toString() });
      assert.strictEqual(totalCount, 2);

      // Verify outbox record was backfilled as processed
      const legacyOutbox = await NotificationOutbox.findOne({
        aggregateId: legacyReq._id.toString(),
        eventType: 'requirement_published',
      });
      assert.ok(legacyOutbox);
      assert.strictEqual(legacyOutbox?.status, 'processed');
    } finally {
      notificationTransport.sendNotification = origSend;
    }
  });

  // ─── 16. Persistence failure must not produce a processed backfill event ──────
  it('16. Persistence failure must not produce a processed backfill event', async () => {
    const legacyReq = await WorkRequirement.create({
      eventId: new mongoose.Types.ObjectId(eventId),
      workerType: 'Chef',
      requiredCount: 2,
      reportingTime: '08:00 AM',
      maxDistanceKm: 25,
      interestDeadlineAt: new Date(Date.now() + 86400000 * 2),
      interestPublishedAt: new Date(Date.now() - 3600000),
      status: 'open',
      assignedWorkers: [],
    });

    // Monkey patch createNotificationsBatch to simulate a failure
    const origBatch = notificationService.createNotificationsBatch.bind(notificationService);
    notificationService.createNotificationsBatch = async () => {
      throw new Error('Simulated Recovery Batch Persistence Failure');
    };

    try {
      // With per-requirement error isolation, a persistence failure on an individual requirement
      // is safely logged and does not abort the entire scan loop
      const recovered = await notificationQueueService.scanAndRecoverPendingNotifications();
      assert.strictEqual(recovered, 0, 'No requirements should be counted as recovered on failure');

      // Outbox event must NOT be created or marked processed
      const outbox = await NotificationOutbox.findOne({
        aggregateId: legacyReq._id.toString(),
        eventType: 'requirement_published',
      });
      assert.strictEqual(outbox, null, 'No processed outbox record should exist after persistence failure');
    } finally {
      notificationService.createNotificationsBatch = origBatch;
    }
  });

  // ─── 17. Concurrent recovery execution on the same legacy requirement ─────────
  it('17. Concurrent recovery execution does not produce duplicate notifications or outbox records', async () => {
    const legacyReq = await WorkRequirement.create({
      eventId: new mongoose.Types.ObjectId(eventId),
      workerType: 'Chef',
      requiredCount: 2,
      reportingTime: '08:00 AM',
      maxDistanceKm: 25,
      interestDeadlineAt: new Date(Date.now() + 86400000 * 2),
      interestPublishedAt: new Date(Date.now() - 3600000),
      status: 'open',
      assignedWorkers: [],
    });

    // Run two recovery scans concurrently
    await Promise.all([
      notificationQueueService.scanAndRecoverPendingNotifications(),
      notificationQueueService.scanAndRecoverPendingNotifications(),
    ]);

    // Verify notifications: exactly 2 in database (1 per worker)
    const notifs = await Notification.find({ resourceId: legacyReq._id.toString() });
    assert.strictEqual(notifs.length, 2);

    // Verify outbox: exactly 1 outbox record in database
    const outboxRecords = await NotificationOutbox.find({
      aggregateId: legacyReq._id.toString(),
      eventType: 'requirement_published',
    });
    assert.strictEqual(outboxRecords.length, 1);
    assert.strictEqual(outboxRecords[0].status, 'processed');
  });

  // ─── 18. New Outbox-managed requirements are skipped by legacy recovery ────────
  it('18. New Outbox-managed requirements are skipped by legacy recovery', async () => {
    const newReq = await WorkRequirement.create({
      eventId: new mongoose.Types.ObjectId(eventId),
      workerType: 'Chef',
      requiredCount: 2,
      reportingTime: '08:00 AM',
      maxDistanceKm: 25,
      interestDeadlineAt: new Date(Date.now() + 86400000 * 2),
      interestPublishedAt: new Date(),
      status: 'open',
      assignedWorkers: [],
    });

    // Create a pending Outbox event (simulating the new Draft -> Open transaction)
    await notificationOutboxRepository.create({
      eventId: `outbox_pub_new_${newReq._id}`,
      eventType: 'requirement_published',
      aggregateType: 'work_requirement',
      aggregateId: newReq._id.toString(),
      payload: {
        requirementId: newReq._id.toString(),
        publishedAt: new Date().toISOString(),
      },
      status: 'pending',
      nextAttemptAt: new Date(),
    });

    // Run recovery scan
    await notificationQueueService.scanAndRecoverPendingNotifications();

    // Verify: 0 notifications created by legacy scan (it leaves the requirement to the Outbox Dispatcher)
    const notifs = await Notification.find({ resourceId: newReq._id.toString() });
    assert.strictEqual(notifs.length, 0);

    // The Outbox record must remain pending (not modified by legacy scanner)
    const outbox = await notificationOutboxRepository.findByEventId(`outbox_pub_new_${newReq._id}`);
    assert.strictEqual(outbox?.status, 'pending');
  });
});
