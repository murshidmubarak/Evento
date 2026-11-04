import './setup.js';
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { connectDB } from '../src/config/db.js';
import {
  NotificationOutbox,
} from '../src/modules/notifications/model/notification-outbox.model.js';
import { notificationOutboxRepository } from '../src/modules/notifications/repository/notification-outbox.repository.js';
import {
  notificationQueueService,
} from '../src/modules/notifications/queues/notification.queue.js';
import { notificationService } from '../src/modules/notifications/service/notification.service.js';
import { notificationRepository } from '../src/modules/notifications/repository/notification.repository.js';
import { Notification } from '../src/modules/notifications/model/notification.model.js';
import { WorkRequirement } from '../src/modules/work-requirements/model/work-requirement.model.js';
import { WorkResponse } from '../src/modules/work-requirements/model/work-response.model.js';
import { Event } from '../src/modules/events/model/event.model.js';
import '../src/modules/services/model/service.model.js';
import { User } from '../src/modules/auth/model/user.model.js';

describe('Open -> Open Work Requirement Notification Reliability Suite', () => {
  let clientId: string;
  let managerId: string;
  let eventId: string;
  let worker1Id: string;
  let worker2Id: string;
  let worker3Id: string;
  let worker4Id: string;

  before(async () => {
    await connectDB();
    notificationQueueService.setMockMode(true);
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

    clientId = new mongoose.Types.ObjectId().toString();
    await User.create({
      _id: clientId,
      name: 'Client Test',
      email: `client.${Date.now()}@test.com`,
      role: 'client',
      isActive: true,
    });

    managerId = new mongoose.Types.ObjectId().toString();
    await User.create({
      _id: managerId,
      name: 'Manager Test',
      email: `manager.${Date.now()}@test.com`,
      role: 'event_manager',
      isActive: true,
    });

    const event = await Event.create({
      title: 'Reliability Gala 2026',
      clientId: new mongoose.Types.ObjectId(clientId),
      eventType: 'Corporate',
      guestCount: 200,
      description: 'Reliability Event',
      date: new Date(Date.now() + 86400000 * 5),
      startTime: '10:00',
      endTime: '18:00',
      eventManagerId: new mongoose.Types.ObjectId(managerId),
      location: {
        address: 'Marine Drive, Kochi, Kerala',
        latitude: 9.972,
        longitude: 76.278,
      },
      status: 'confirmed',
    });
    eventId = event._id.toString();

    worker1Id = new mongoose.Types.ObjectId().toString();
    worker2Id = new mongoose.Types.ObjectId().toString();
    worker3Id = new mongoose.Types.ObjectId().toString();
    worker4Id = new mongoose.Types.ObjectId().toString();

    for (const [idx, wId] of [worker1Id, worker2Id, worker3Id, worker4Id].entries()) {
      await User.create({
        _id: wId,
        name: `Worker ${idx + 1}`,
        email: `worker${idx + 1}.${Date.now()}@test.com`,
        role: 'worker',
        workerType: 'Chef',
        isActive: true,
      });
    }
  });

  // ─── 1. Successful Persistence ──────────────────────────────────────────────
  it('1. Successful persistence: creates and persists all notification records across batches', async () => {
    const inputs = [worker1Id, worker2Id, worker3Id, worker4Id].map((wId, i) => ({
      recipientId: wId,
      type: 'requirement_updated',
      title: 'Update Title',
      message: 'Update Message',
      deduplicationKey: `test_batch_succ_${i}_${Date.now()}`,
    }));

    const result = await notificationService.createNotificationsBatch(inputs, 2);
    assert.strictEqual(result.length, 4);

    const count = await Notification.countDocuments({ type: 'requirement_updated' });
    assert.strictEqual(count, 4);
  });

  // ─── 2. Later Batch Failure Propagates ──────────────────────────────────────
  it('2. Multi-batch failure: first batch succeeds and a later batch fails, propagating error', async () => {
    const inputs = [worker1Id, worker2Id, worker3Id, worker4Id].map((wId, i) => ({
      recipientId: wId,
      type: 'requirement_updated',
      title: 'Update Title',
      message: 'Update Message',
      deduplicationKey: `test_batch_fail_${i}_${Date.now()}`,
    }));

    const origCreateManySafe = (notificationService as any).repository.createManySafe.bind((notificationService as any).repository);
    let callCount = 0;
    (notificationService as any).repository.createManySafe = async (chunk: any, session: any) => {
      callCount++;
      if (callCount === 2) {
        throw new Error('Simulated Database Crash on Batch 2');
      }
      return origCreateManySafe(chunk, session);
    };

    try {
      await assert.rejects(
        async () => {
          await notificationService.createNotificationsBatch(inputs, 2);
        },
        {
          message: 'Simulated Database Crash on Batch 2',
        }
      );
    } finally {
      (notificationService as any).repository.createManySafe = origCreateManySafe;
    }
  });

  // ─── 3. Transient Network Error Propagates ──────────────────────────────────
  it('3. Transient error propagation: notification insert fails with a transient network error and throws', async () => {
    const inputs = [{
      recipientId: worker1Id,
      type: 'requirement_updated',
      title: 'Transient Error Test',
      message: 'Testing network failure',
      deduplicationKey: `test_transient_${Date.now()}`,
    }];

    const origInsertMany = Notification.insertMany;
    Notification.insertMany = (async () => {
      throw new Error('MongoNetworkTimeoutError: connection timed out');
    }) as any;

    try {
      await assert.rejects(
        async () => {
          await notificationService.createNotificationsBatch(inputs, 50);
        },
        /MongoNetworkTimeoutError/
      );
    } finally {
      Notification.insertMany = origInsertMany;
    }
  });

  // ─── 4. Duplicate Key Safely Ignored ─────────────────────────────────────────
  it('4. Duplicate key handling: duplicate key error is safely ignored and existing record loaded', async () => {
    const dupKey = `dup_test_${Date.now()}`;
    const initialDoc = await Notification.create({
      recipientId: worker1Id,
      type: 'requirement_updated',
      title: 'Original Title',
      message: 'Original Message',
      deduplicationKey: dupKey,
    });

    const result = await notificationRepository.createManySafe([
      {
        recipientId: new mongoose.Types.ObjectId(worker1Id),
        type: 'requirement_updated',
        title: 'New Title Attempt',
        message: 'New Message Attempt',
        deduplicationKey: dupKey,
      },
    ]);

    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0]._id.toString(), initialDoc._id.toString());

    // Verify no second document was created
    const count = await Notification.countDocuments({ deduplicationKey: dupKey });
    assert.strictEqual(count, 1);
  });

  // ─── 5. Non-Duplicate Error Propagates ──────────────────────────────────────
  it('5. Non-duplicate error propagation: non-duplicate write error is propagated', async () => {
    const origInsertMany = Notification.insertMany;
    Notification.insertMany = (async () => {
      const err: any = new Error('BulkWriteError: Document failed validation');
      err.code = 121;
      err.writeErrors = [{ code: 121, errmsg: 'Document failed validation' }];
      throw err;
    }) as any;

    try {
      await assert.rejects(
        async () => {
          await notificationRepository.createManySafe([
            {
              recipientId: new mongoose.Types.ObjectId(worker1Id),
              type: 'requirement_updated',
              title: 'Validation Error Test',
              message: 'Will fail validation',
              deduplicationKey: `val_err_${Date.now()}`,
            },
          ]);
        },
        (err: any) => err.code === 121 || /validation/i.test(err.message)
      );
    } finally {
      Notification.insertMany = origInsertMany;
    }
  });

  // ─── 6, 7, 8. Partial Persistence + Retry + Deduplication ───────────────────
  it('6, 7 & 8. Partial persistence recovery: retry persists missing notifications without duplicating existing', async () => {
    const req = await WorkRequirement.create({
      eventId: new mongoose.Types.ObjectId(eventId),
      workerType: 'Chef',
      requiredCount: 2,
      reportingTime: '08:00 AM',
      maxDistanceKm: 25,
      interestDeadlineAt: new Date(Date.now() + 86400000 * 2),
      status: 'open',
      assignedWorkers: [
        { workerId: new mongoose.Types.ObjectId(worker1Id), assignedAt: new Date() },
        { workerId: new mongoose.Types.ObjectId(worker2Id), assignedAt: new Date() },
      ],
    });

    const outboxEventId = `outbox_partial_${Date.now()}`;
    await notificationOutboxRepository.create({
      eventId: outboxEventId,
      eventType: 'requirement_updated',
      aggregateType: 'work_requirement',
      aggregateId: req._id.toString(),
      payload: {
        requirementId: req._id.toString(),
        changedFields: { reportingTime: { old: '08:00 AM', new: '09:00 AM' } },
        enqueuedAt: '2026-11-04T10:00:00.000Z',
      },
      status: 'queued',
      nextAttemptAt: new Date(),
    });

    // Manually simulate partial persistence of Worker 1's notification from an earlier crashed attempt
    const stableUpdateStamp = '2026-11-04T10:00:00.000Z';
    const worker1DupKey = `req_upd_${req._id}_reportingTime_${stableUpdateStamp}_${worker1Id}`;
    await Notification.create({
      recipientId: worker1Id,
      type: 'requirement_updated',
      title: 'Work Requirement Updated',
      message: 'Partial save worker 1',
      deduplicationKey: worker1DupKey,
    });

    // Now execute processRequirementUpdate (representing a BullMQ retry)
    const result = await notificationQueueService.processRequirementUpdate({
      requirementId: req._id.toString(),
      changedFields: { reportingTime: { old: '08:00 AM', new: '09:00 AM' } },
      enqueuedAt: stableUpdateStamp,
      outboxEventId,
    });

    // Both assigned workers should be accounted for
    assert.strictEqual(result.notifiedCount, 2);

    // Verify Worker 1 was NOT duplicated
    const w1Docs = await Notification.find({ deduplicationKey: worker1DupKey });
    assert.strictEqual(w1Docs.length, 1);

    // Verify Worker 2 was successfully persisted on the retry
    const worker2DupKey = `req_upd_${req._id}_reportingTime_${stableUpdateStamp}_${worker2Id}`;
    const w2Docs = await Notification.find({ deduplicationKey: worker2DupKey });
    assert.strictEqual(w2Docs.length, 1);

    // Outbox event should now be marked processed
    const outbox = await notificationOutboxRepository.findByEventId(outboxEventId);
    assert.strictEqual(outbox?.status, 'processed');
  });

  // ─── 9. Outbox Remains Unprocessed on Failed Persistence ───────────────────
  it('9. Outbox integrity: outbox remains unprocessed after a failed persistence attempt', async () => {
    const req = await WorkRequirement.create({
      eventId: new mongoose.Types.ObjectId(eventId),
      workerType: 'Chef',
      requiredCount: 1,
      reportingTime: '08:00 AM',
      maxDistanceKm: 25,
      interestDeadlineAt: new Date(Date.now() + 86400000 * 2),
      status: 'open',
      assignedWorkers: [
        { workerId: new mongoose.Types.ObjectId(worker1Id), assignedAt: new Date() },
      ],
    });

    const outboxEventId = `outbox_fail_${Date.now()}`;
    await notificationOutboxRepository.create({
      eventId: outboxEventId,
      eventType: 'requirement_updated',
      aggregateType: 'work_requirement',
      aggregateId: req._id.toString(),
      payload: {
        requirementId: req._id.toString(),
        changedFields: { reportingTime: { old: '08:00 AM', new: '09:00 AM' } },
        enqueuedAt: new Date().toISOString(),
      },
      status: 'queued',
      nextAttemptAt: new Date(),
    });

    const origBatch = notificationService.createNotificationsBatch.bind(notificationService);
    notificationService.createNotificationsBatch = async () => {
      throw new Error('Simulated Batch Persistence Catastrophe');
    };

    try {
      await assert.rejects(
        async () => {
          await notificationQueueService.processRequirementUpdate({
            requirementId: req._id.toString(),
            changedFields: { reportingTime: { old: '08:00 AM', new: '09:00 AM' } },
            outboxEventId,
          });
        },
        /Simulated Batch Persistence Catastrophe/
      );

      // Verify Outbox is STILL NOT processed
      const outbox = await notificationOutboxRepository.findByEventId(outboxEventId);
      assert.strictEqual(outbox?.status, 'queued');
    } finally {
      notificationService.createNotificationsBatch = origBatch;
    }
  });

  // ─── 10. Outbox Becomes Processed Only After Full Success ───────────────────
  it('10. Outbox acknowledgment: becomes processed only after all notifications are saved', async () => {
    const req = await WorkRequirement.create({
      eventId: new mongoose.Types.ObjectId(eventId),
      workerType: 'Chef',
      requiredCount: 1,
      reportingTime: '08:00 AM',
      maxDistanceKm: 25,
      interestDeadlineAt: new Date(Date.now() + 86400000 * 2),
      status: 'open',
      assignedWorkers: [
        { workerId: new mongoose.Types.ObjectId(worker1Id), assignedAt: new Date() },
      ],
    });

    const outboxEventId = `outbox_succ_${Date.now()}`;
    await notificationOutboxRepository.create({
      eventId: outboxEventId,
      eventType: 'requirement_updated',
      aggregateType: 'work_requirement',
      aggregateId: req._id.toString(),
      payload: {
        requirementId: req._id.toString(),
        changedFields: { reportingTime: { old: '08:00 AM', new: '09:00 AM' } },
        enqueuedAt: new Date().toISOString(),
      },
      status: 'queued',
      nextAttemptAt: new Date(),
    });

    await notificationQueueService.processRequirementUpdate({
      requirementId: req._id.toString(),
      changedFields: { reportingTime: { old: '08:00 AM', new: '09:00 AM' } },
      outboxEventId,
    });

    const outbox = await notificationOutboxRepository.findByEventId(outboxEventId);
    assert.strictEqual(outbox?.status, 'processed');
    assert.ok(outbox?.processedAt);
  });

  // ─── 11. Empty Recipient List Handled Safely ────────────────────────────────
  it('11. Empty recipient list: marks outbox processed without retrying indefinitely', async () => {
    // A requirement with no assigned workers, no interested workers, and closed deadline
    const req = await WorkRequirement.create({
      eventId: new mongoose.Types.ObjectId(eventId),
      workerType: 'Chef',
      requiredCount: 2,
      reportingTime: '08:00 AM',
      maxDistanceKm: 25,
      interestDeadlineAt: new Date(Date.now() - 10000), // Closed deadline
      status: 'open',
      assignedWorkers: [],
    });

    const outboxEventId = `outbox_empty_${Date.now()}`;
    await notificationOutboxRepository.create({
      eventId: outboxEventId,
      eventType: 'requirement_updated',
      aggregateType: 'work_requirement',
      aggregateId: req._id.toString(),
      payload: {
        requirementId: req._id.toString(),
        changedFields: { reportingTime: { old: '08:00 AM', new: '09:00 AM' } },
        enqueuedAt: new Date().toISOString(),
      },
      status: 'queued',
      nextAttemptAt: new Date(),
    });

    const result = await notificationQueueService.processRequirementUpdate({
      requirementId: req._id.toString(),
      changedFields: { reportingTime: { old: '08:00 AM', new: '09:00 AM' } },
      outboxEventId,
    });

    assert.strictEqual(result.notifiedCount, 0);

    const outbox = await notificationOutboxRepository.findByEventId(outboxEventId);
    assert.strictEqual(outbox?.status, 'processed');
  });

  // ─── 12. Retry Exhaustion Routes to Dead-Letter ─────────────────────────────
  it('12. Dead-letter routing: exhausted attempts transition Outbox event to dead_letter state', async () => {
    const outboxEventId = `outbox_dlq_${Date.now()}`;
    await notificationOutboxRepository.create({
      eventId: outboxEventId,
      eventType: 'requirement_updated',
      aggregateType: 'work_requirement',
      aggregateId: new mongoose.Types.ObjectId().toString(),
      payload: { test: true },
      status: 'dispatching',
      leaseToken: 'worker_lease_dlq',
      attempts: 5, // At max attempts
      nextAttemptAt: new Date(),
    });

    await notificationOutboxRepository.recordDispatchFailure(
      outboxEventId,
      'worker_lease_dlq',
      'Persistent Database Error',
      0,
      5 // maxAttempts = 5
    );

    const outbox = await notificationOutboxRepository.findByEventId(outboxEventId);
    assert.strictEqual(outbox?.status, 'dead_letter');
    assert.strictEqual(outbox?.lastError, 'Persistent Database Error');
  });
});
