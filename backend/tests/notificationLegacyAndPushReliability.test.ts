import './setup.js';
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { connectDB } from '../src/config/db.js';
import {
  Notification,
  INotification,
} from '../src/modules/notifications/model/notification.model.js';
import {
  NotificationOutbox,
} from '../src/modules/notifications/model/notification-outbox.model.js';
import {
  PushDelivery,
} from '../src/modules/notifications/model/push-delivery.model.js';
import {
  PushSubscription,
  hashEndpoint,
} from '../src/modules/notifications/model/push-subscription.model.js';
import { User } from '../src/modules/auth/model/user.model.js';
import { Event } from '../src/modules/events/model/event.model.js';
import '../src/modules/services/model/service.model.js';
import { WorkRequirement } from '../src/modules/work-requirements/model/work-requirement.model.js';
import { WorkResponse } from '../src/modules/work-requirements/model/work-response.model.js';
import { notificationService } from '../src/modules/notifications/service/notification.service.ts';
import { pushDeliveryRepository } from '../src/modules/notifications/repository/push-delivery.repository.js';
import { notificationQueueService } from '../src/modules/notifications/queues/notification.queue.js';
import { notificationTransport } from '../src/sockets/notification-transport.js';
import { startNotificationWorker } from '../src/workers/notificationWorker.js';

describe('Legacy Recovery & PushDelivery Reliability Suite', () => {
  let managerId: string;
  let eventId: string;
  let worker1Id: string;
  let worker2Id: string;

  before(async () => {
    await connectDB();
    notificationQueueService.setMockMode(true);
  });

  after(async () => {
    notificationQueueService.stopPeriodicRecovery();
    await notificationQueueService.close();
    await mongoose.disconnect();
  });

  beforeEach(async () => {
    if (mongoose.connection.readyState === 0) {
      await connectDB();
    }
    notificationQueueService.setMockMode(true);
    notificationQueueService.clearMockQueue();
    notificationQueueService.stopPeriodicRecovery();

    // Clean test collections in eventops_test
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
      name: 'Manager Test',
      email: 'manager.push@test.com',
      role: 'event_manager',
      isActive: true,
    });

    const clientId = new mongoose.Types.ObjectId().toString();
    await User.create({
      _id: clientId,
      name: 'Client Test',
      email: 'client.push@test.com',
      role: 'client',
      isActive: true,
    });

    const event = await Event.create({
      title: 'Grand Gala Night',
      eventType: 'Corporate',
      guestCount: 250,
      description: 'Reliability Gala',
      date: new Date(Date.now() + 86400000 * 10),
      startTime: '09:00',
      endTime: '19:00',
      clientId: new mongoose.Types.ObjectId(clientId),
      eventManagerId: new mongoose.Types.ObjectId(managerId),
      status: 'confirmed',
      location: {
        address: '100 Main Street, Downtown',
        lat: 9.9816,
        lng: 76.2799,
      },
    });
    eventId = event._id.toString();

    worker1Id = new mongoose.Types.ObjectId().toString();
    await User.create({
      _id: worker1Id,
      name: 'Worker One',
      email: 'worker1.push@test.com',
      role: 'worker',
      workerType: 'Chef',
      isActive: true,
      location: {
        address: 'Worker 1 Studio',
        lat: 9.982,
        lng: 76.28,
        confirmedAt: new Date(Date.now() - 86400000 * 2),
      },
    });

    worker2Id = new mongoose.Types.ObjectId().toString();
    await User.create({
      _id: worker2Id,
      name: 'Worker Two',
      email: 'worker2.push@test.com',
      role: 'worker',
      workerType: 'Chef',
      isActive: true,
      location: {
        address: 'Worker 2 Studio',
        lat: 9.983,
        lng: 76.281,
        confirmedAt: new Date(Date.now() - 86400000 * 2),
      },
    });
  });

  // ─── 1. Existing notification without PushDelivery intent ────────────────────
  it('1. Existing notification without PushDelivery intent creates missing intent', async () => {
    // Worker 1 has an active push subscription
    const sub = await PushSubscription.create({
      userId: new mongoose.Types.ObjectId(worker1Id),
      endpoint: 'https://fcm.googleapis.com/fcm/send/device_worker1_alpha',
      endpointHash: hashEndpoint('https://fcm.googleapis.com/fcm/send/device_worker1_alpha'),
      keys: { p256dh: 'dummy_p256dh_key', auth: 'dummy_auth_key' },
      status: 'active',
    });

    // Simulate notification pre-existing in MongoDB without PushDelivery intent
    const notif = await Notification.create({
      recipientId: new mongoose.Types.ObjectId(worker1Id),
      type: 'work_opportunity',
      title: 'Existing Opportunity',
      message: 'Check available shifts',
      deduplicationKey: 'opp_existing_push_01',
      isRead: false,
    });

    const initialIntents = await PushDelivery.find({ notificationId: notif._id });
    assert.strictEqual(initialIntents.length, 0, 'Initially no push intents should exist');

    // Run batch persistence for this existing notification (e.g. during reconciliation or retry)
    const result = await notificationService.createNotificationsBatch([
      {
        recipientId: worker1Id,
        type: 'work_opportunity',
        title: 'Existing Opportunity',
        message: 'Check available shifts',
        deduplicationKey: 'opp_existing_push_01',
      },
    ]);

    assert.strictEqual(result.length, 1);
    const createdIntents = await PushDelivery.find({ notificationId: notif._id });
    assert.strictEqual(createdIntents.length, 1, 'Missing PushDelivery intent must be created for existing notification');
    assert.strictEqual(createdIntents[0].status, 'pending');
    assert.strictEqual(createdIntents[0].subscriptionId.toString(), sub._id.toString());
  });

  // ─── 2. Existing notification with already-created PushDelivery intent ─────────
  it('2. Existing notification with already-created PushDelivery intent is not duplicated', async () => {
    const sub = await PushSubscription.create({
      userId: new mongoose.Types.ObjectId(worker1Id),
      endpoint: 'https://fcm.googleapis.com/fcm/send/device_worker1_beta',
      endpointHash: hashEndpoint('https://fcm.googleapis.com/fcm/send/device_worker1_beta'),
      keys: { p256dh: 'dummy_p256dh_key', auth: 'dummy_auth_key' },
      status: 'active',
    });

    const notif = await Notification.create({
      recipientId: new mongoose.Types.ObjectId(worker1Id),
      type: 'work_opportunity',
      title: 'Opportunity',
      message: 'Shift available',
      deduplicationKey: 'opp_existing_push_02',
      isRead: false,
    });

    // Existing pending intent already created previously
    await PushDelivery.create({
      notificationId: notif._id,
      recipientId: notif.recipientId,
      subscriptionId: sub._id,
      endpointHash: sub.endpointHash,
      deliveryKey: `${notif._id.toString()}:${sub._id.toString()}`,
      status: 'pending',
      nextAttemptAt: new Date(),
    });

    // Run batch creation again
    await notificationService.createNotificationsBatch([
      {
        recipientId: worker1Id,
        type: 'work_opportunity',
        title: 'Opportunity',
        message: 'Shift available',
        deduplicationKey: 'opp_existing_push_02',
      },
    ]);

    const totalIntents = await PushDelivery.find({ notificationId: notif._id });
    assert.strictEqual(totalIntents.length, 1, 'Total push intents must remain 1 without duplicates');
  });

  // ─── 3. Existing notification with previously sent PushDelivery record ────────
  it('3. Existing notification with previously sent PushDelivery record is not reset or resent', async () => {
    const sub = await PushSubscription.create({
      userId: new mongoose.Types.ObjectId(worker1Id),
      endpoint: 'https://fcm.googleapis.com/fcm/send/device_worker1_gamma',
      endpointHash: hashEndpoint('https://fcm.googleapis.com/fcm/send/device_worker1_gamma'),
      keys: { p256dh: 'dummy_p256dh_key', auth: 'dummy_auth_key' },
      status: 'active',
    });

    const notif = await Notification.create({
      recipientId: new mongoose.Types.ObjectId(worker1Id),
      type: 'work_opportunity',
      title: 'Opportunity',
      message: 'Shift available',
      deduplicationKey: 'opp_existing_push_03',
      isRead: false,
    });

    // Push delivery was already completed in the past ('sent')
    const sentRecord = await PushDelivery.create({
      notificationId: notif._id,
      recipientId: notif.recipientId,
      subscriptionId: sub._id,
      endpointHash: sub.endpointHash,
      deliveryKey: `${notif._id.toString()}:${sub._id.toString()}`,
      status: 'sent',
      acceptedAt: new Date(),
      nextAttemptAt: new Date(),
    });

    // Run batch creation again
    await notificationService.createNotificationsBatch([
      {
        recipientId: worker1Id,
        type: 'work_opportunity',
        title: 'Opportunity',
        message: 'Shift available',
        deduplicationKey: 'opp_existing_push_03',
      },
    ]);

    const updated = await PushDelivery.findById(sentRecord._id);
    assert.ok(updated);
    assert.strictEqual(updated.status, 'sent', 'Sent PushDelivery status must remain sent');
    assert.strictEqual(await PushDelivery.countDocuments({ notificationId: notif._id }), 1);
  });

  // ─── 4. Newly created notification still emits Socket.IO ─────────────────────
  it('4. Newly created notification still emits Socket.IO in real time', async () => {
    const emittedEvents: Array<{ userId: string; payload: any }> = [];
    const origSend = notificationTransport.sendNotification.bind(notificationTransport);
    notificationTransport.sendNotification = async (userId: string, payload: any) => {
      emittedEvents.push({ userId, payload });
    };

    try {
      await notificationService.createNotificationsBatch([
        {
          recipientId: worker1Id,
          type: 'work_opportunity',
          title: 'Brand New Opportunity',
          message: 'Real-time alert expected',
          deduplicationKey: 'opp_socket_new_04',
        },
      ]);

      assert.strictEqual(emittedEvents.length, 1, 'Socket.IO must be emitted for newly created notification');
      assert.strictEqual(emittedEvents[0].userId, worker1Id);
      assert.strictEqual(emittedEvents[0].payload.title, 'Brand New Opportunity');
    } finally {
      notificationTransport.sendNotification = origSend;
    }
  });

  // ─── 5. Existing notification does not emit duplicate Socket.IO ───────────────
  it('5. Existing notification does not emit duplicate Socket.IO', async () => {
    // Pre-create notification in MongoDB
    await Notification.create({
      recipientId: new mongoose.Types.ObjectId(worker1Id),
      type: 'work_opportunity',
      title: 'Already Emitted Opportunity',
      message: 'No duplicate socket alert',
      deduplicationKey: 'opp_socket_existing_05',
      isRead: false,
    });

    const emittedEvents: Array<{ userId: string; payload: any }> = [];
    const origSend = notificationTransport.sendNotification.bind(notificationTransport);
    notificationTransport.sendNotification = async (userId: string, payload: any) => {
      emittedEvents.push({ userId, payload });
    };

    try {
      await notificationService.createNotificationsBatch([
        {
          recipientId: worker1Id,
          type: 'work_opportunity',
          title: 'Already Emitted Opportunity',
          message: 'No duplicate socket alert',
          deduplicationKey: 'opp_socket_existing_05',
        },
      ]);

      assert.strictEqual(emittedEvents.length, 0, 'Socket.IO must NOT be emitted for pre-existing notifications');
    } finally {
      notificationTransport.sendNotification = origSend;
    }
  });

  // ─── 6. PushDelivery persistence failure propagates correctly ─────────────────
  it('6. PushDelivery persistence failure propagates correctly and is not swallowed', async () => {
    await PushSubscription.create({
      userId: new mongoose.Types.ObjectId(worker1Id),
      endpoint: 'https://fcm.googleapis.com/fcm/send/device_fail_06',
      endpointHash: hashEndpoint('https://fcm.googleapis.com/fcm/send/device_fail_06'),
      keys: { p256dh: 'dummy_p256dh_key', auth: 'dummy_auth_key' },
      status: 'active',
    });

    // Mock createIntentsForNotification to simulate database failure
    const origCreateIntents = pushDeliveryRepository.createIntentsForNotification.bind(pushDeliveryRepository);
    pushDeliveryRepository.createIntentsForNotification = async () => {
      throw new Error('MongoNetworkError: push cluster connection dropped');
    };

    try {
      await assert.rejects(
        async () => {
          await notificationService.createNotificationsBatch([
            {
              recipientId: worker1Id,
              type: 'work_opportunity',
              title: 'Push Fail Opportunity',
              message: 'Database failure expected',
              deduplicationKey: 'opp_push_fail_06',
            },
          ]);
        },
        /MongoNetworkError: push cluster connection dropped/
      );
    } finally {
      pushDeliveryRepository.createIntentsForNotification = origCreateIntents;
    }
  });

  // ─── 7. PushDelivery retry does not create duplicate intents ──────────────────
  it('7. PushDelivery retry handles duplicate key code 11000 and returns existing intents', async () => {
    const notif = await Notification.create({
      recipientId: new mongoose.Types.ObjectId(worker1Id),
      type: 'work_opportunity',
      title: 'Retry Notification',
      message: 'Testing idempotent push intent creation',
      deduplicationKey: 'opp_retry_07',
    });

    const sub1 = await PushSubscription.create({
      userId: new mongoose.Types.ObjectId(worker1Id),
      endpoint: 'https://fcm.googleapis.com/fcm/send/device_retry_07_a',
      endpointHash: hashEndpoint('https://fcm.googleapis.com/fcm/send/device_retry_07_a'),
      keys: { p256dh: 'dummy_p256dh_1', auth: 'dummy_auth_1' },
      status: 'active',
    });

    const sub2 = await PushSubscription.create({
      userId: new mongoose.Types.ObjectId(worker1Id),
      endpoint: 'https://fcm.googleapis.com/fcm/send/device_retry_07_b',
      endpointHash: hashEndpoint('https://fcm.googleapis.com/fcm/send/device_retry_07_b'),
      keys: { p256dh: 'dummy_p256dh_2', auth: 'dummy_auth_2' },
      status: 'active',
    });

    // Attempt 1: Inserts 2 intents
    const firstCall = await pushDeliveryRepository.createIntentsForNotification(notif, [sub1, sub2]);
    assert.strictEqual(firstCall.length, 2);
    assert.strictEqual(await PushDelivery.countDocuments({ notificationId: notif._id }), 2);

    // Attempt 2 (retry): Idempotently retrieves and returns existing intents without crashing
    const secondCall = await pushDeliveryRepository.createIntentsForNotification(notif, [sub1, sub2]);
    assert.strictEqual(secondCall.length, 2);
    assert.strictEqual(await PushDelivery.countDocuments({ notificationId: notif._id }), 2);
  });

  // ─── 8, 9, 10. Legacy Recovery: Per-requirement error isolation ──────────────
  it('8, 9, 10. One legacy requirement failure does not stop subsequent requirements, backfilling only successful ones', async () => {
    const legacyReqA = await WorkRequirement.create({
      eventId: new mongoose.Types.ObjectId(eventId),
      workerType: 'Chef',
      requiredCount: 2,
      reportingTime: '09:00 AM',
      maxDistanceKm: 25,
      interestDeadlineAt: new Date(Date.now() + 86400000 * 2),
      interestPublishedAt: new Date(Date.now() - 3600000 * 2),
      status: 'open',
      assignedWorkers: [],
    });

    const legacyReqB = await WorkRequirement.create({
      eventId: new mongoose.Types.ObjectId(eventId),
      workerType: 'Chef',
      requiredCount: 2,
      reportingTime: '10:00 AM',
      maxDistanceKm: 25,
      interestDeadlineAt: new Date(Date.now() + 86400000 * 2),
      interestPublishedAt: new Date(Date.now() - 3600000 * 2),
      status: 'open',
      assignedWorkers: [],
    });

    // Mock processRequirementAnnouncements so Req A fails but Req B succeeds
    const origProcess = notificationQueueService.processRequirementAnnouncements.bind(notificationQueueService);
    notificationQueueService.processRequirementAnnouncements = async (data: any) => {
      if (data.requirementId === legacyReqA._id.toString()) {
        throw new Error('Simulated failure during legacy Req A announcement');
      }
      return origProcess(data);
    };

    try {
      const recovered = await notificationQueueService.scanAndRecoverPendingNotifications();
      assert.strictEqual(recovered, 1, 'Exactly 1 requirement (Req B) should be recovered');

      // 9. Failed legacy requirement must NOT receive a processed backfill event
      const outboxA = await NotificationOutbox.findOne({
        aggregateId: legacyReqA._id.toString(),
        eventType: 'requirement_published',
      });
      assert.strictEqual(outboxA, null, 'Req A must not have an outbox backfill record');

      // 10. Successful legacy requirement MUST receive its processed backfill event
      const outboxB = await NotificationOutbox.findOne({
        aggregateId: legacyReqB._id.toString(),
        eventType: 'requirement_published',
      });
      assert.ok(outboxB, 'Req B must have received its outbox backfill record');
      assert.strictEqual(outboxB.status, 'processed');
    } finally {
      notificationQueueService.processRequirementAnnouncements = origProcess;
    }
  });

  // ─── 11. Selection-summary recovery executes even if legacy announcement fails ─
  it('11. Selection-summary recovery still executes after a legacy announcement failure', async () => {
    // Failing legacy announcement requirement
    const legacyReqA = await WorkRequirement.create({
      eventId: new mongoose.Types.ObjectId(eventId),
      workerType: 'Chef',
      requiredCount: 1,
      reportingTime: '08:00 AM',
      interestPublishedAt: new Date(Date.now() - 3600000),
      status: 'open',
      assignedWorkers: [],
    });

    // Completed selection requirement lacking summary notification
    const completedReq = await WorkRequirement.create({
      eventId: new mongoose.Types.ObjectId(eventId),
      workerType: 'Chef',
      requiredCount: 1,
      reportingTime: '08:00 AM',
      status: 'open',
      assignedWorkers: [{ workerId: new mongoose.Types.ObjectId(worker1Id), assignedAt: new Date() }],
      selectionRound: 1,
    });

    const origProcessAnn = notificationQueueService.processRequirementAnnouncements.bind(notificationQueueService);
    notificationQueueService.processRequirementAnnouncements = async (data: any) => {
      if (data.requirementId === legacyReqA._id.toString()) {
        throw new Error('Fatal error processing announcement for Req A');
      }
      return origProcessAnn(data);
    };

    try {
      await notificationQueueService.scanAndRecoverPendingNotifications();

      // Verify that selection-summary recovery executed and created the manager summary notification
      const summaryNotif = await Notification.findOne({
        resourceId: completedReq._id.toString(),
        type: 'selection_summary',
      });
      assert.ok(summaryNotif, 'Selection summary notification must be created despite announcement failure');
    } finally {
      notificationQueueService.processRequirementAnnouncements = origProcessAnn;
    }
  });

  // ─── 12. Periodic recovery reattempts failed legacy requirements ───────────────
  it('12. Periodic recovery reattempts failed legacy requirements without Worker restart', async () => {
    const legacyReq = await WorkRequirement.create({
      eventId: new mongoose.Types.ObjectId(eventId),
      workerType: 'Chef',
      requiredCount: 1,
      reportingTime: '09:00 AM',
      maxDistanceKm: 25,
      interestDeadlineAt: new Date(Date.now() + 86400000 * 2),
      interestPublishedAt: new Date(Date.now() - 3600000),
      status: 'open',
      assignedWorkers: [],
    });

    let failOnFirstAttempt = true;
    const origProcessAnn = notificationQueueService.processRequirementAnnouncements.bind(notificationQueueService);
    notificationQueueService.processRequirementAnnouncements = async (data: any) => {
      if (data.requirementId === legacyReq._id.toString() && failOnFirstAttempt) {
        throw new Error('Transient failure on cycle 1');
      }
      return origProcessAnn(data);
    };

    try {
      // Cycle 1: Fails
      const count1 = await notificationQueueService.scanAndRecoverPendingNotifications();
      assert.strictEqual(count1, 0);
      assert.strictEqual(
        await NotificationOutbox.countDocuments({ aggregateId: legacyReq._id.toString() }),
        0
      );

      // Cycle 2: Problem resolved, next scan cycle reattempts
      failOnFirstAttempt = false;
      const count2 = await notificationQueueService.scanAndRecoverPendingNotifications();
      assert.strictEqual(count2, 1, 'Legacy requirement should succeed on subsequent scan cycle');

      const outbox = await NotificationOutbox.findOne({
        aggregateId: legacyReq._id.toString(),
        eventType: 'requirement_published',
      });
      assert.ok(outbox, 'Backfilled outbox record must now exist');
      assert.strictEqual(outbox.status, 'processed');
    } finally {
      notificationQueueService.processRequirementAnnouncements = origProcessAnn;
    }
  });

  // ─── 13. Overlapping recovery scans are prevented ──────────────────────────────
  it('13. Overlapping recovery scans are safely prevented', async () => {
    let activeScans = 0;
    let maxConcurrentScans = 0;

    const origProcessAnn = notificationQueueService.processRequirementAnnouncements.bind(notificationQueueService);
    notificationQueueService.processRequirementAnnouncements = async (data: any) => {
      activeScans++;
      if (activeScans > maxConcurrentScans) maxConcurrentScans = activeScans;
      // Delay to simulate in-flight asynchronous recovery work
      await new Promise((r) => setTimeout(r, 100));
      activeScans--;
      return origProcessAnn(data);
    };

    await WorkRequirement.create({
      eventId: new mongoose.Types.ObjectId(eventId),
      workerType: 'Chef',
      requiredCount: 1,
      reportingTime: '11:00 AM',
      interestPublishedAt: new Date(Date.now() - 3600000),
      status: 'open',
      assignedWorkers: [],
    });

    try {
      // Trigger two recovery scans concurrently
      const [res1, res2] = await Promise.all([
        notificationQueueService.scanAndRecoverPendingNotifications(),
        notificationQueueService.scanAndRecoverPendingNotifications(),
      ]);

      assert.strictEqual(maxConcurrentScans, 1, 'Max concurrent recovery execution must be exactly 1');
      assert.strictEqual(res1 + res2 >= 1, true, 'At least one invocation resolves the recovery count');
    } finally {
      notificationQueueService.processRequirementAnnouncements = origProcessAnn;
    }
  });

  // ─── 14. Unified Worker shutdown clears recovery scheduling ───────────────────
  it('14. Unified Worker shutdown clears recovery scheduling cleanly', async () => {
    const workerHandle = await startNotificationWorker({
      autoConnectDB: false,
      recoveryIntervalMs: 500, // Explicit fast periodic interval for testing
    });

    assert.ok(workerHandle, 'Notification worker handle initialized');

    // Close the worker handle (simulating Unified Worker shutdown)
    await workerHandle.close();

    // Verify periodic timer is stopped and closed cleanly
    assert.strictEqual(notificationQueueService.getIsScanningRecovery(), false);
  });
});
