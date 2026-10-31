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
  JOB_REQUIREMENT_CANCELLATION,
  JOB_REQUIREMENT_UPDATE,
  JOB_DEADLINE_EXTENSION,
} from '../src/modules/notifications/queues/notification.queue.js';
import { WorkRequirement } from '../src/modules/work-requirements/model/work-requirement.model.js';
import { WorkResponse } from '../src/modules/work-requirements/model/work-response.model.js';
import { Event } from '../src/modules/events/model/event.model.js';
import '../src/modules/services/model/service.model.js';
import { User } from '../src/modules/auth/model/user.model.js';
import { Notification } from '../src/modules/notifications/model/notification.model.js';
import { WorkRequirementService } from '../src/modules/work-requirements/service/work-requirement.service.js';

describe('Notification Reliability Upgrade — Transactional Outbox Pattern (Path A)', () => {
  let requirementService: WorkRequirementService;
  let managerId: string;
  let eventId: string;
  let assignedWorkerId: string;
  let interestedWorkerId: string;

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
      name: 'Manager Test',
      email: 'manager.outbox@test.com',
      role: 'event_manager',
      isActive: true,
    });

    const event = await Event.create({
      title: 'Grand Gala 2026',
      eventType: 'Corporate',
      guestCount: 300,
      description: 'Reliability Gala Event',
      date: new Date(Date.now() + 86400000 * 10),
      startTime: '10:00',
      endTime: '18:00',
      eventManagerId: new mongoose.Types.ObjectId(managerId),
      location: {
        address: 'Marine Drive, Kochi, Kerala',
        lat: 9.9816,
        lng: 76.2799,
      },
      status: 'confirmed',
      clientId: new mongoose.Types.ObjectId(),
    });
    eventId = event._id.toString();

    assignedWorkerId = new mongoose.Types.ObjectId().toString();
    await User.create({
      _id: assignedWorkerId,
      name: 'Assigned Worker',
      email: 'assigned@test.com',
      role: 'worker',
      workerType: 'Chef',
      isActive: true,
      location: { address: 'Ernakulam', latitude: 9.982, longitude: 76.28 },
    });

    interestedWorkerId = new mongoose.Types.ObjectId().toString();
    await User.create({
      _id: interestedWorkerId,
      name: 'Interested Worker',
      email: 'interested@test.com',
      role: 'worker',
      workerType: 'Chef',
      isActive: true,
      location: { address: 'Kaloor', latitude: 9.99, longitude: 76.29 },
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 1: Transactional Atomicity on Cancellation
  // ───────────────────────────────────────────────────────────────────────────
  it('1. Transactional Atomicity: Work Requirement cancellation atomically commits requirement and outbox record', async () => {
    const req = await WorkRequirement.create({
      eventId: new mongoose.Types.ObjectId(eventId),
      workerType: 'Chef',
      requiredCount: 2,
      reportingTime: '08:00',
      maxDistanceKm: 25,
      interestDeadlineAt: new Date(Date.now() + 86400000 * 3),
      status: 'open',
      assignedWorkers: [
        {
          workerId: new mongoose.Types.ObjectId(assignedWorkerId),
          assignedAt: new Date(),
          distanceKm: 2.0,
          selectionRound: 1,
        },
      ],
    });

    await WorkResponse.create({
      requirementId: req._id,
      workerId: new mongoose.Types.ObjectId(interestedWorkerId),
      eventId: new mongoose.Types.ObjectId(eventId),
      responseStatus: 'interested',
      respondedAt: new Date(),
    });

    // Execute cancellation
    const cancelled = await requirementService.cancelRequirement(managerId, req._id.toString());
    assert.strictEqual(cancelled.status, 'cancelled', 'Requirement status must be cancelled');

    // Deterministically trigger and await outbox dispatcher
    await notificationOutboxDispatcherService.triggerImmediateDispatch();

    // Verify outbox record was created atomically in MongoDB
    const outboxRecord = await NotificationOutbox.findOne({
      aggregateId: req._id.toString(),
      eventType: 'requirement_cancelled',
    });
    assert.ok(outboxRecord, 'Notification outbox record must exist');
    assert.strictEqual(outboxRecord.aggregateType, 'work_requirement');
    assert.strictEqual(outboxRecord.payload.requirementId, req._id.toString());
    assert.ok(
      ['queued', 'processed'].includes(outboxRecord.status),
      `Outbox record status must be queued or processed, was: ${outboxRecord.status}`
    );

    // Verify BullMQ received the corresponding typed cancellation job
    const mockQueue = notificationQueueService.getMockQueue();
    const cancelJob = mockQueue.jobs.find((j) => j.name === JOB_REQUIREMENT_CANCELLATION);
    assert.ok(cancelJob, 'BullMQ cancellation job must be enqueued');
    assert.strictEqual(cancelJob.data.requirementId, req._id.toString());
    assert.strictEqual(cancelJob.data.outboxEventId, outboxRecord.eventId);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 2: Transactional Rollback on Simulated Outbox Failure
  // ───────────────────────────────────────────────────────────────────────────
  it('2. Transactional Rollback: Outbox failure aborts the entire transaction and leaves requirement untouched', async () => {
    const req = await WorkRequirement.create({
      eventId: new mongoose.Types.ObjectId(eventId),
      workerType: 'Chef',
      requiredCount: 2,
      reportingTime: '08:00',
      maxDistanceKm: 25,
      interestDeadlineAt: new Date(Date.now() + 86400000 * 3),
      status: 'open',
    });

    // Temporarily monkey-patch repository to throw error during transaction
    const originalCreate = notificationOutboxRepository.create.bind(notificationOutboxRepository);
    notificationOutboxRepository.create = async () => {
      throw new Error('Simulated Outbox Disk/Schema Failure during transaction');
    };

    try {
      await assert.rejects(
        async () => {
          await requirementService.cancelRequirement(managerId, req._id.toString());
        },
        /Simulated Outbox Disk\/Schema Failure/
      );

      // Verify requirement in MongoDB was NOT changed to cancelled (rollback confirmed)
      const afterReq = await WorkRequirement.findById(req._id);
      assert.strictEqual(afterReq?.status, 'open', 'Requirement status must remain open after rollback');

      // Verify no outbox record exists
      const outboxCount = await NotificationOutbox.countDocuments({
        aggregateId: req._id.toString(),
      });
      assert.strictEqual(outboxCount, 0, 'No outbox record should exist due to rollback');
    } finally {
      // Restore repository
      notificationOutboxRepository.create = originalCreate;
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 3: Material Update Atomicity & Idempotency
  // ───────────────────────────────────────────────────────────────────────────
  it('3. Material Update Atomicity: Material change inserts outbox record, unchanged update skips outbox', async () => {
    const req = await WorkRequirement.create({
      eventId: new mongoose.Types.ObjectId(eventId),
      workerType: 'Chef',
      requiredCount: 2,
      reportingTime: '08:00',
      maxDistanceKm: 25,
      interestDeadlineAt: new Date(Date.now() + 86400000 * 3),
      interestPublishedAt: new Date(),
      status: 'open',
    });

    // 1. Material change: change reporting time to 09:30
    await requirementService.updateRequirement(managerId, req._id.toString(), {
      reportingTime: '09:30',
    });
    await notificationOutboxDispatcherService.triggerImmediateDispatch();

    const outboxRecords = await NotificationOutbox.find({
      aggregateId: req._id.toString(),
      eventType: 'requirement_updated',
    });
    assert.strictEqual(outboxRecords.length, 1, 'Exactly one outbox record must be created for material update');
    assert.strictEqual(outboxRecords[0].payload.changedFields.reportingTime.new, '09:30');

    // Verify BullMQ received typed update job
    const mockQueue = notificationQueueService.getMockQueue();
    const updateJob = mockQueue.jobs.find((j) => j.name === JOB_REQUIREMENT_UPDATE);
    assert.ok(updateJob, 'BullMQ update job must be enqueued with typed name');
    assert.strictEqual(updateJob.data.changedFields.reportingTime.new, '09:30');

    // 2. Unchanged update: send identical reporting time
    await requirementService.updateRequirement(managerId, req._id.toString(), {
      reportingTime: '09:30',
    });

    const outboxAfter = await NotificationOutbox.find({
      aggregateId: req._id.toString(),
      eventType: 'requirement_updated',
    });
    assert.strictEqual(outboxAfter.length, 1, 'No additional outbox record should be created when fields are unchanged');
  });

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 4: Deadline Extension Atomicity & Preservation
  // ───────────────────────────────────────────────────────────────────────────
  it('4. Deadline Extension Atomicity: Extends deadline, increments selectionRound, preserves assigned workers, inserts outbox', async () => {
    const req = await WorkRequirement.create({
      eventId: new mongoose.Types.ObjectId(eventId),
      workerType: 'Chef',
      requiredCount: 3,
      reportingTime: '08:00',
      maxDistanceKm: 25,
      interestDeadlineAt: new Date(Date.now() - 3600000), // 1h in the past
      interestPublishedAt: new Date(Date.now() - 86400000),
      selectionRound: 1,
      status: 'open',
      assignedWorkers: [
        {
          workerId: new mongoose.Types.ObjectId(assignedWorkerId),
          assignedAt: new Date(),
          distanceKm: 2.0,
          selectionRound: 1,
        },
      ],
    });

    const newDeadline = new Date(Date.now() + 86400000 * 5);
    const updated = await requirementService.extendDeadline(
      managerId,
      req._id.toString(),
      newDeadline.toISOString()
    );
    await notificationOutboxDispatcherService.triggerImmediateDispatch();

    // Business checks
    assert.strictEqual(updated.selectionRound, 2);
    assert.strictEqual(updated.assignedWorkers.length, 1);
    assert.strictEqual(updated.assignedWorkers[0].workerId.toString(), assignedWorkerId);

    // Outbox check
    const outboxRecord = await NotificationOutbox.findOne({
      aggregateId: req._id.toString(),
      eventType: 'deadline_extended',
    });
    assert.ok(outboxRecord, 'Deadline extension outbox record must exist');
    assert.strictEqual(outboxRecord.payload.selectionRound, 2);
    assert.strictEqual(outboxRecord.payload.newDeadline, newDeadline.toISOString());

    // Queue check
    const mockQueue = notificationQueueService.getMockQueue();
    const extJob = mockQueue.jobs.find((j) => j.name === JOB_DEADLINE_EXTENSION);
    assert.ok(extJob, 'Deadline extension job must be in BullMQ');
    assert.strictEqual(extJob.data.selectionRound, 2);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 5: Redis Outage Simulation & Automatic Recovery
  // ───────────────────────────────────────────────────────────────────────────
  it('5. Redis Outage Simulation: Outbox remains safe when Redis fails, retries with exponential backoff, recovers on reconnect', async () => {
    const dispatcher = new NotificationOutboxDispatcherService({
      pollIntervalMs: 500,
      batchSize: 5,
      leaseDurationMs: 10000,
      maxAttempts: 5,
    });

    // Create a pending outbox event directly in DB (simulating committed business tx)
    const testEventId = `outbox_outage_${Date.now()}`;
    await NotificationOutbox.create({
      eventId: testEventId,
      eventType: 'requirement_cancelled',
      aggregateType: 'work_requirement',
      aggregateId: new mongoose.Types.ObjectId().toString(),
      payload: { requirementId: new mongoose.Types.ObjectId().toString() },
      status: 'pending',
      nextAttemptAt: new Date(Date.now() - 1000), // Due now
    });

    // Simulate Redis outage by mocking enqueueOutboxJob failure
    const originalEnqueue = notificationQueueService.enqueueOutboxJob.bind(notificationQueueService);
    let redisIsDown = true;
    notificationQueueService.enqueueOutboxJob = async () => {
      if (redisIsDown) {
        throw new Error('ECONNREFUSED: Redis instance offline at 127.0.0.1:6379');
      }
      return { jobId: 'mock_restored_job_id' };
    };

    try {
      // 1. Dispatch cycle runs while Redis is down
      const result1 = await dispatcher.dispatchDueEvents();
      assert.strictEqual(result1.errorsCount, 1, 'Should record 1 enqueue error during outage');

      // Verify outbox record was NOT lost and entered pending with backoff
      const recordAfterOutage = await NotificationOutbox.findOne({ eventId: testEventId });
      assert.ok(recordAfterOutage);
      assert.strictEqual(recordAfterOutage.status, 'pending');
      assert.strictEqual(recordAfterOutage.attempts, 1);
      assert.ok(recordAfterOutage.lastError?.includes('ECONNREFUSED'));
      assert.ok(recordAfterOutage.nextAttemptAt.getTime() > Date.now());

      // 2. Dispatch cycle runs again before nextAttemptAt: should skip it
      const result2 = await dispatcher.dispatchDueEvents();
      assert.strictEqual(result2.processedCount, 0);

      // 3. Redis is restored: reset nextAttemptAt to now and enable Redis
      redisIsDown = false;
      await NotificationOutbox.updateOne(
        { eventId: testEventId },
        { $set: { nextAttemptAt: new Date(Date.now() - 100) } }
      );

      // 4. Dispatcher runs again and successfully enqueues the record
      const result3 = await dispatcher.dispatchDueEvents();
      assert.strictEqual(result3.processedCount, 1, 'Should successfully process recovered event');

      const recordAfterRecovery = await NotificationOutbox.findOne({ eventId: testEventId });
      assert.ok(recordAfterRecovery);
      assert.strictEqual(recordAfterRecovery.status, 'queued');
      assert.strictEqual(recordAfterRecovery.leaseToken, null);
    } finally {
      notificationQueueService.enqueueOutboxJob = originalEnqueue;
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 6: Concurrent Dispatcher Distributed Lease Locking
  // ───────────────────────────────────────────────────────────────────────────
  it('6. Distributed Lease Locking: Second dispatcher cannot claim or double-process an actively leased outbox event', async () => {
    const testEventId = `outbox_lease_${Date.now()}`;
    await NotificationOutbox.create({
      eventId: testEventId,
      eventType: 'requirement_cancelled',
      aggregateType: 'work_requirement',
      aggregateId: new mongoose.Types.ObjectId().toString(),
      payload: { requirementId: new mongoose.Types.ObjectId().toString() },
      status: 'pending',
      nextAttemptAt: new Date(Date.now() - 1000),
    });

    const leaseDuration = 30000;
    // Dispatcher 1 claims event
    const claimed1 = await notificationOutboxRepository.claimEvent(
      testEventId,
      'instance_node_1',
      leaseDuration
    );
    assert.ok(claimed1, 'First dispatcher instance must successfully claim event');
    assert.strictEqual(claimed1.status, 'dispatching');
    assert.strictEqual(claimed1.leaseToken, 'instance_node_1');
    assert.strictEqual(claimed1.attempts, 1);

    // Dispatcher 2 attempts to claim the exact same event
    const claimed2 = await notificationOutboxRepository.claimEvent(
      testEventId,
      'instance_node_2',
      leaseDuration
    );
    assert.strictEqual(claimed2, null, 'Second dispatcher instance MUST be rejected (null claim)');

    // Dispatcher 1 finishes and marks queued
    const queued = await notificationOutboxRepository.markQueued(testEventId, 'instance_node_1');
    assert.ok(queued);
    assert.strictEqual(queued.status, 'queued');
    assert.strictEqual(queued.leaseToken, null);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 7: Expired Lease Recovery
  // ───────────────────────────────────────────────────────────────────────────
  it('7. Expired Lease Recovery: Stale dispatching leases from crashed workers are cleanly recovered back to pending', async () => {
    const staleEventId = `outbox_stale_${Date.now()}`;
    const fiveSecondsAgo = new Date(Date.now() - 5000);

    // Create an event that was abandoned in dispatching status with an expired lease
    await NotificationOutbox.create({
      eventId: staleEventId,
      eventType: 'requirement_cancelled',
      aggregateType: 'work_requirement',
      aggregateId: new mongoose.Types.ObjectId().toString(),
      payload: { requirementId: 'test_req' },
      status: 'dispatching',
      leaseToken: 'crashed_worker_pid_9999',
      leaseExpiresAt: fiveSecondsAgo,
      attempts: 1,
    });

    // Run recovery
    const recoveredCount = await notificationOutboxRepository.recoverExpiredLeases();
    assert.ok(recoveredCount >= 1, 'Should recover at least 1 expired lease');

    const recoveredDoc = await NotificationOutbox.findOne({ eventId: staleEventId });
    assert.ok(recoveredDoc);
    assert.strictEqual(recoveredDoc.status, 'pending', 'Stale event must be returned to pending status');
    assert.strictEqual(recoveredDoc.leaseToken, null, 'Lease token must be cleared');
    assert.strictEqual(recoveredDoc.leaseExpiresAt, null, 'Lease expiration must be cleared');
  });

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 8: Exhausted Retries Dead-Letter Transition & Redrive
  // ───────────────────────────────────────────────────────────────────────────
  it('8. Dead-Letter Transition & Redrive: Exhausted attempts transition to dead_letter, and redrive resets generation and pending state', async () => {
    const dlqEventId = `outbox_dlq_${Date.now()}`;
    await NotificationOutbox.create({
      eventId: dlqEventId,
      eventType: 'requirement_cancelled',
      aggregateType: 'work_requirement',
      aggregateId: new mongoose.Types.ObjectId().toString(),
      payload: { requirementId: 'test_dlq_req' },
      status: 'dispatching',
      leaseToken: 'tester_token',
      attempts: 5, // At max limit
      dispatchGeneration: 1,
    });

    // Record failure with maxAttempts = 5
    const failedDoc = await notificationOutboxRepository.recordDispatchFailure(
      dlqEventId,
      'tester_token',
      'Unrecoverable upstream failure',
      1000,
      5
    );

    assert.ok(failedDoc);
    assert.strictEqual(failedDoc.status, 'dead_letter', 'Must transition to dead_letter when attempts reach maxAttempts');
    assert.strictEqual(failedDoc.lastError, 'Unrecoverable upstream failure');

    // Redrive event
    const redriven = await notificationOutboxRepository.redriveDeadLetter(dlqEventId);
    assert.ok(redriven);
    assert.strictEqual(redriven.status, 'pending', 'Redriven event must have status pending');
    assert.strictEqual(redriven.attempts, 0, 'Attempts must reset to 0');
    assert.strictEqual(redriven.dispatchGeneration, 2, 'Dispatch generation must increment from 1 to 2');
    assert.strictEqual(redriven.lastError, null, 'Last error must be cleared');
  });

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 9: Typed BullMQ Outbox Job Names & Payload Contract
  // ───────────────────────────────────────────────────────────────────────────
  it('9. Typed Job Mapping: Verifies requirement_cancelled, requirement_updated, and deadline_extended submit with typed names and full contract', async () => {
    const mockQueue = notificationQueueService.getMockQueue();
    notificationQueueService.clearMockQueue();

    // 1. Test requirement_cancelled mapping
    const cancelEvent: INotificationOutbox = {
      eventId: 'outbox_test_cancel_123',
      eventType: 'requirement_cancelled',
      aggregateType: 'work_requirement',
      aggregateId: 'req_123',
      payload: { requirementId: 'req_123', cancelledAt: '2026-10-31T12:00:00.000Z' },
      status: 'dispatching',
      dispatchGeneration: 1,
      attempts: 1,
      nextAttemptAt: new Date(),
    } as any;

    await notificationQueueService.enqueueOutboxJob(cancelEvent);
    const cancelJob = mockQueue.jobs.find((j) => j.id === 'outbox_outbox_test_cancel_123_gen1');
    assert.ok(cancelJob, 'Cancel job must be enqueued with deterministic ID');
    assert.strictEqual(cancelJob.name, JOB_REQUIREMENT_CANCELLATION, 'Job name must be requirement-cancellation');
    assert.strictEqual(cancelJob.data.requirementId, 'req_123');
    assert.strictEqual(cancelJob.data.outboxEventId, 'outbox_test_cancel_123');
    assert.strictEqual(cancelJob.data.dispatchGeneration, 1);
    assert.strictEqual(cancelJob.data.eventType, 'requirement_cancelled');

    // 2. Test requirement_updated mapping
    const updateEvent: INotificationOutbox = {
      eventId: 'outbox_test_update_456',
      eventType: 'requirement_updated',
      aggregateType: 'work_requirement',
      aggregateId: 'req_456',
      payload: {
        requirementId: 'req_456',
        changedFields: { reportingTime: { old: '08:00', new: '09:00' } },
        enqueuedAt: '2026-10-31T12:05:00.000Z',
      },
      status: 'dispatching',
      dispatchGeneration: 2,
      attempts: 1,
      nextAttemptAt: new Date(),
    } as any;

    await notificationQueueService.enqueueOutboxJob(updateEvent);
    const updateJob = mockQueue.jobs.find((j) => j.id === 'outbox_outbox_test_update_456_gen2');
    assert.ok(updateJob, 'Update job must be enqueued with deterministic ID');
    assert.strictEqual(updateJob.name, JOB_REQUIREMENT_UPDATE, 'Job name must be requirement-update');
    assert.strictEqual(updateJob.data.requirementId, 'req_456');
    assert.strictEqual(updateJob.data.changedFields.reportingTime.new, '09:00');
    assert.strictEqual(updateJob.data.outboxEventId, 'outbox_test_update_456');
    assert.strictEqual(updateJob.data.dispatchGeneration, 2);

    // 3. Test deadline_extended mapping
    const extendEvent: INotificationOutbox = {
      eventId: 'outbox_test_ext_789',
      eventType: 'deadline_extended',
      aggregateType: 'work_requirement',
      aggregateId: 'req_789',
      payload: {
        requirementId: 'req_789',
        selectionRound: 3,
        newDeadline: '2026-11-05T18:00:00.000Z',
      },
      status: 'dispatching',
      dispatchGeneration: 1,
      attempts: 1,
      nextAttemptAt: new Date(),
    } as any;

    await notificationQueueService.enqueueOutboxJob(extendEvent);
    const extJob = mockQueue.jobs.find((j) => j.id === 'outbox_outbox_test_ext_789_gen1');
    assert.ok(extJob, 'Extend job must be enqueued with deterministic ID');
    assert.strictEqual(extJob.name, JOB_DEADLINE_EXTENSION, 'Job name must be deadline-extension');
    assert.strictEqual(extJob.data.requirementId, 'req_789');
    assert.strictEqual(extJob.data.selectionRound, 3);
    assert.strictEqual(extJob.data.newDeadline, '2026-11-05T18:00:00.000Z');
    assert.strictEqual(extJob.data.outboxEventId, 'outbox_test_ext_789');
  });
});
