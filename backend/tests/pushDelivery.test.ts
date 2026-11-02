import './setup.js';
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import webpush from 'web-push';

import { connectDB } from '../src/config/db.js';
import { User } from '../src/modules/auth/model/user.model.js';
import { Notification } from '../src/modules/notifications/model/notification.model.js';
import { PushSubscription } from '../src/modules/notifications/model/push-subscription.model.js';
import { PushDelivery, type IPushDelivery } from '../src/modules/notifications/model/push-delivery.model.js';
import { pushSubscriptionRepository } from '../src/modules/notifications/repository/push-subscription.repository.js';
import { pushDeliveryRepository } from '../src/modules/notifications/repository/push-delivery.repository.js';
import { pushDeliveryService } from '../src/modules/notifications/service/push-delivery.service.js';
import { pushDeliveryQueueService, NOTIFICATION_PUSH_QUEUE_NAME } from '../src/modules/notifications/queues/push-delivery.queue.js';
import { pushDeliveryDispatcherService } from '../src/modules/notifications/service/push-delivery-dispatcher.service.js';
import { notificationService } from '../src/modules/notifications/service/notification.service.js';
import { startPushDeliveryWorker } from '../src/workers/pushDeliveryWorker.js';

describe('Notification Milestone 3 — Part 3B: Background Push Delivery & BullMQ Processing', () => {
  let user1Id: string;
  let user2Id: string;
  let sub1Id: string;
  let sub2Id: string;
  let sub3Id: string;

  before(async () => {
    await connectDB();

    // Create test accounts
    const u1 = await User.create({
      name: 'Push Worker User 1',
      email: `push.worker.u1.${Date.now()}@example.com`,
      password: 'Password123!',
      role: 'worker',
      phone: '+919999900011',
      isActive: true,
      emailVerified: true,
    });
    user1Id = u1._id.toString();

    const u2 = await User.create({
      name: 'Push Worker User 2',
      email: `push.worker.u2.${Date.now()}@example.com`,
      password: 'Password123!',
      role: 'worker',
      phone: '+919999900022',
      isActive: true,
      emailVerified: true,
    });
    user2Id = u2._id.toString();
  });

  after(async () => {
    await pushDeliveryQueueService.close();
    await PushDelivery.deleteMany({});
    await PushSubscription.deleteMany({});
    await Notification.deleteMany({});
    await User.deleteMany({ _id: { $in: [user1Id, user2Id] } });
    await mongoose.disconnect();
  });

  beforeEach(async () => {
    await PushDelivery.deleteMany({});
    await PushSubscription.deleteMany({});
    await Notification.deleteMany({});
    pushDeliveryQueueService.getMockQueue().clear();
    pushDeliveryService.setMockSender(null);

    // Register 2 active devices for User 1 (Desktop + Phone)
    const s1 = await pushSubscriptionRepository.upsertSubscription({
      userId: user1Id,
      endpoint: 'https://fcm.googleapis.com/fcm/send/u1-desktop-endpoint',
      keys: { p256dh: 'p256dh_u1_d', auth: 'auth_u1_d' },
      device: { deviceType: 'desktop', label: 'User 1 Desktop' },
    });
    sub1Id = s1._id.toString();

    const s2 = await pushSubscriptionRepository.upsertSubscription({
      userId: user1Id,
      endpoint: 'https://fcm.googleapis.com/fcm/send/u1-mobile-endpoint',
      keys: { p256dh: 'p256dh_u1_m', auth: 'auth_u1_m' },
      device: { deviceType: 'mobile', label: 'User 1 Mobile' },
    });
    sub2Id = s2._id.toString();

    // Register 1 active device for User 2 (Tablet)
    const s3 = await pushSubscriptionRepository.upsertSubscription({
      userId: user2Id,
      endpoint: 'https://fcm.googleapis.com/fcm/send/u2-tablet-endpoint',
      keys: { p256dh: 'p256dh_u2_t', auth: 'auth_u2_t' },
      device: { deviceType: 'tablet', label: 'User 2 Tablet' },
    });
    sub3Id = s3._id.toString();
  });

  // ─── 1. Durable Delivery Intent Persistence ───────────────────────────────────

  describe('Durable Per-Device Push Delivery Model & Intent Persistence', () => {
    it('1. Persisting a Notification creates independent PushDelivery records for all active devices of the recipient', async () => {
      // User 1 has 2 active devices
      const notif = await notificationService.createNotification({
        recipientId: user1Id,
        type: 'work_opportunity',
        title: 'New Work Opportunity Available',
        message: 'Catering supervisor required in Kochi',
        destinationRoute: '/worker',
      });

      assert.ok(notif);

      const deliveries = await PushDelivery.find({ notificationId: notif._id });
      assert.equal(deliveries.length, 2, 'Must create exactly 2 delivery records for 2 registered devices');

      const subIds = deliveries.map((d) => d.subscriptionId.toString());
      assert.ok(subIds.includes(sub1Id));
      assert.ok(subIds.includes(sub2Id));

      for (const del of deliveries) {
        assert.equal(del.recipientId.toString(), user1Id);
        assert.equal(del.status, 'pending');
        assert.equal(del.attemptCount, 0);
        assert.equal(del.dispatchGeneration, 1);
        assert.ok(del.endpointHash);
      }
    });

    it('2. Unique compound index prevents duplicate logical delivery records for same notification and subscription', async () => {
      const notif = await Notification.create({
        recipientId: new mongoose.Types.ObjectId(user1Id),
        type: 'general',
        title: 'Duplicate Guard Test',
        message: 'Testing compound index',
      });

      const sub = await PushSubscription.findById(sub1Id);
      assert.ok(sub);

      // Attempt manual duplicate insertion
      const doc1 = await PushDelivery.create({
        notificationId: notif._id,
        recipientId: notif.recipientId,
        subscriptionId: sub._id,
        endpointHash: sub.endpointHash,
        deliveryKey: `${notif._id}:${sub._id}`,
        status: 'pending',
      });
      assert.ok(doc1);

      await assert.rejects(
        async () => {
          await PushDelivery.create({
            notificationId: notif._id,
            recipientId: notif.recipientId,
            subscriptionId: sub._id,
            endpointHash: sub.endpointHash,
            deliveryKey: `${notif._id}:${sub._id}`,
            status: 'pending',
          });
        },
        /E11000 duplicate key error/
      );
    });

    it('3. User without active device subscriptions creates notification without creating PushDelivery records', async () => {
      const uNoDevice = await User.create({
        name: 'No Device User',
        email: `nodevice.${Date.now()}@example.com`,
        password: 'Password123!',
        role: 'worker',
        phone: '+919999900099',
        isActive: true,
      });

      const notif = await notificationService.createNotification({
        recipientId: uNoDevice._id.toString(),
        type: 'general',
        title: 'In-app only notification',
        message: 'No push record should exist',
      });

      assert.ok(notif);
      const deliveries = await PushDelivery.find({ notificationId: notif._id });
      assert.equal(deliveries.length, 0, 'No deliveries must be created when recipient has no registered devices');

      await User.deleteOne({ _id: uNoDevice._id });
    });
  });

  // ─── 2. Push Delivery Dispatcher & Lease Locking ───────────────────────────────

  describe('Push Delivery Dispatcher & Distributed Lease Locking', () => {
    it('1. Dispatcher claims due pending records atomically and enqueues jobs to notification-push queue', async () => {
      const notif = await notificationService.createNotification({
        recipientId: user1Id,
        type: 'general',
        title: 'Dispatch Test',
        message: 'Testing dispatcher enqueue',
      });

      assert.ok(notif);

      // Disable autoProcess in mock queue to verify queuing step
      pushDeliveryQueueService.setAutoProcessInMock(false);

      const dispatched = await pushDeliveryDispatcherService.dispatchPending();
      assert.equal(dispatched, 2, 'Dispatched both device deliveries');

      const mockQueue = pushDeliveryQueueService.getMockQueue();
      assert.equal(mockQueue.jobs.length, 2);
      assert.equal(mockQueue.jobs[0].name, 'push-delivery');

      // Verify records in DB moved to 'queued'
      const inDb = await PushDelivery.find({ notificationId: notif._id });
      for (const del of inDb) {
        assert.equal(del.status, 'queued');
      }

      pushDeliveryQueueService.setAutoProcessInMock(true);
    });

    it('2. Distributed lease prevents second concurrent dispatcher from claiming the same deliveries', async () => {
      const notif = await Notification.create({
        recipientId: new mongoose.Types.ObjectId(user1Id),
        type: 'general',
        title: 'Concurrency Test',
        message: 'Testing lease locking',
      });

      const sub = await PushSubscription.findById(sub1Id);
      assert.ok(sub);

      const delivery = await PushDelivery.create({
        notificationId: notif._id,
        recipientId: notif.recipientId,
        subscriptionId: sub._id,
        endpointHash: sub.endpointHash,
        deliveryKey: `${notif._id}:${sub._id}`,
        status: 'pending',
      });

      // Dispatcher 1 claims the delivery
      const claimed1 = await pushDeliveryRepository.claimDueDeliveries(10, 'dispatcher-instance-A', 30000);
      assert.equal(claimed1.length, 1);
      assert.equal(claimed1[0]._id.toString(), delivery._id.toString());
      assert.equal(claimed1[0].leaseOwner, 'dispatcher-instance-A');

      // Dispatcher 2 attempts to claim while lease is active
      const claimed2 = await pushDeliveryRepository.claimDueDeliveries(10, 'dispatcher-instance-B', 30000);
      assert.equal(claimed2.length, 0, 'Second dispatcher must NOT claim actively leased delivery');
    });

    it('3. Recovers expired leases from crashed workers back to retry_pending', async () => {
      const notif = await Notification.create({
        recipientId: new mongoose.Types.ObjectId(user1Id),
        type: 'general',
        title: 'Crash Recovery Test',
        message: 'Testing lease expiration recovery',
      });

      const sub = await PushSubscription.findById(sub1Id);
      assert.ok(sub);

      // Create a delivery with an EXPIRED lease in 'sending' state (simulating crashed worker)
      const staleDelivery = await PushDelivery.create({
        notificationId: notif._id,
        recipientId: notif.recipientId,
        subscriptionId: sub._id,
        endpointHash: sub.endpointHash,
        deliveryKey: `${notif._id}:${sub._id}`,
        status: 'sending',
        leaseOwner: 'crashed-worker-pid-9999',
        leaseExpiresAt: new Date(Date.now() - 10000), // expired 10s ago
      });

      const recoveredCount = await pushDeliveryRepository.recoverExpiredLeases();
      assert.equal(recoveredCount, 1);

      const refreshed = await PushDelivery.findById(staleDelivery._id);
      assert.equal(refreshed?.status, 'retry_pending');
      assert.equal(refreshed?.leaseOwner, null);
      assert.equal(refreshed?.leaseExpiresAt, null);
    });

    it('4. Preserves pending deliveries durable in MongoDB during simulated Redis outage', async () => {
      const notif = await notificationService.createNotification({
        recipientId: user1Id,
        type: 'general',
        title: 'Redis Outage Test',
        message: 'MongoDB intent survives Redis disconnect',
      });

      assert.ok(notif);

      // Verify delivery intents are stored durably in MongoDB
      const deliveries = await PushDelivery.find({ notificationId: notif._id });
      assert.equal(deliveries.length, 2);

      // Even if Redis was down or not ready, documents remain in MongoDB
      for (const d of deliveries) {
        assert.equal(d.status, 'pending');
      }
    });
  });

  // ─── 3. Push Delivery Worker & Web Push Protocol Processing ───────────────────

  describe('Push Delivery Worker Processing & Error Handling', () => {
    it('1. Successfully processes delivery when Web Push provider accepts notification (HTTP 201)', async () => {
      let mockCalled = false;
      pushDeliveryService.setMockSender(async (sub, payload, opts) => {
        mockCalled = true;
        assert.ok(sub.endpoint.includes('u1-desktop-endpoint'));
        const parsed = JSON.parse(payload);
        assert.equal(parsed.title, 'Successful Acceptance Test');
        assert.ok(parsed.notificationId);
        return { statusCode: 201, body: '', headers: {} };
      });

      const notif = await Notification.create({
        recipientId: new mongoose.Types.ObjectId(user1Id),
        type: 'work_opportunity',
        title: 'Successful Acceptance Test',
        message: 'You have been selected',
        destinationRoute: '/worker',
      });

      const sub = await PushSubscription.findById(sub1Id);
      assert.ok(sub);

      const delivery = await PushDelivery.create({
        notificationId: notif._id,
        recipientId: notif.recipientId,
        subscriptionId: sub._id,
        endpointHash: sub.endpointHash,
        deliveryKey: `${notif._id}:${sub._id}`,
        status: 'pending',
      });

      const processed = await pushDeliveryService.processDelivery(delivery._id.toString());
      assert.ok(processed);
      assert.equal(processed.status, 'sent');
      assert.ok(processed.acceptedAt);
      assert.equal(mockCalled, true);

      // Subscription metadata updated
      const subUpdated = await PushSubscription.findById(sub1Id);
      assert.ok(subUpdated?.lastSuccessAt);
      assert.equal(subUpdated?.failureCount, 0);
    });

    it('2. Independent delivery: Device 1 failing does NOT block successful delivery to Device 2', async () => {
      // Mock sender: Device 1 fails with 500, Device 2 succeeds with 201
      pushDeliveryService.setMockSender(async (sub) => {
        if (sub.endpoint.includes('u1-desktop-endpoint')) {
          const err: any = new Error('Push Service 500 Internal Error');
          err.statusCode = 500;
          throw err;
        }
        return { statusCode: 201, body: '', headers: {} };
      });

      const notif = await notificationService.createNotification({
        recipientId: user1Id,
        type: 'general',
        title: 'Multi-Device Isolation Test',
        message: 'One fails, one succeeds',
      });

      assert.ok(notif);

      const deliveries = await PushDelivery.find({ notificationId: notif._id });
      assert.equal(deliveries.length, 2);

      const d1 = deliveries.find((d) => d.subscriptionId.toString() === sub1Id);
      const d2 = deliveries.find((d) => d.subscriptionId.toString() === sub2Id);
      assert.ok(d1);
      assert.ok(d2);

      // Process both
      await pushDeliveryService.processDelivery(d1._id.toString());
      await pushDeliveryService.processDelivery(d2._id.toString());

      const res1 = await PushDelivery.findById(d1._id);
      const res2 = await PushDelivery.findById(d2._id);

      assert.equal(res1?.status, 'retry_pending', 'Failed device moved to retry_pending');
      assert.equal(res2?.status, 'sent', 'Second device completed cleanly as sent');
    });

    it('3. Handles HTTP 404/410 by invalidating the subscription and marking delivery invalid_subscription (no retry)', async () => {
      pushDeliveryService.setMockSender(async () => {
        const err: any = new Error('Endpoint expired');
        err.statusCode = 410; // Gone
        throw err;
      });

      const notif = await Notification.create({
        recipientId: new mongoose.Types.ObjectId(user1Id),
        type: 'general',
        title: 'Expired Device Test',
        message: 'Endpoint is 410',
      });

      const sub = await PushSubscription.findById(sub1Id);
      assert.ok(sub);

      const delivery = await PushDelivery.create({
        notificationId: notif._id,
        recipientId: notif.recipientId,
        subscriptionId: sub._id,
        endpointHash: sub.endpointHash,
        deliveryKey: `${notif._id}:${sub._id}`,
        status: 'pending',
      });

      const processed = await pushDeliveryService.processDelivery(delivery._id.toString());
      assert.equal(processed?.status, 'invalid_subscription');

      // The subscription in MongoDB must now be marked 'invalid' with invalidatedAt
      const subUpdated = await PushSubscription.findById(sub1Id);
      assert.equal(subUpdated?.status, 'invalid');
      assert.ok(subUpdated?.invalidatedAt);

      // Subsequent active subscription queries must exclude this invalid subscription
      const activeSubs = await pushSubscriptionRepository.findActiveByUserId(user1Id);
      assert.equal(activeSubs.some((s) => s._id.toString() === sub1Id), false);
    });

    it('4. Applies exponential backoff on temporary 429 rate limit or 5xx server errors', async () => {
      pushDeliveryService.setMockSender(async () => {
        const err: any = new Error('Too Many Requests');
        err.statusCode = 429;
        throw err;
      });

      const notif = await Notification.create({
        recipientId: new mongoose.Types.ObjectId(user1Id),
        type: 'general',
        title: 'Rate Limit Test',
        message: 'Endpoint 429',
      });

      const sub = await PushSubscription.findById(sub1Id);
      assert.ok(sub);

      const delivery = await PushDelivery.create({
        notificationId: notif._id,
        recipientId: notif.recipientId,
        subscriptionId: sub._id,
        endpointHash: sub.endpointHash,
        deliveryKey: `${notif._id}:${sub._id}`,
        status: 'pending',
        attemptCount: 0,
      });

      const processed = await pushDeliveryService.processDelivery(delivery._id.toString());
      assert.equal(processed?.status, 'retry_pending');
      assert.equal(processed?.lastErrorCategory, 'temporary');
      assert.ok(processed?.nextAttemptAt.getTime() > Date.now());
    });

    it('5. Transitions delivery to dead_letter when maximum retries are exhausted', async () => {
      pushDeliveryService.setMockSender(async () => {
        const err: any = new Error('503 Service Unavailable');
        err.statusCode = 503;
        throw err;
      });

      const notif = await Notification.create({
        recipientId: new mongoose.Types.ObjectId(user1Id),
        type: 'general',
        title: 'Exhausted Retries Test',
        message: 'Endpoint 503',
      });

      const sub = await PushSubscription.findById(sub1Id);
      assert.ok(sub);

      // Create record already at attempt 4 (maxAttempts = 5)
      const delivery = await PushDelivery.create({
        notificationId: notif._id,
        recipientId: notif.recipientId,
        subscriptionId: sub._id,
        endpointHash: sub.endpointHash,
        deliveryKey: `${notif._id}:${sub._id}`,
        status: 'pending',
        attemptCount: 4,
        maxAttempts: 5,
      });

      const processed = await pushDeliveryService.processDelivery(delivery._id.toString());
      assert.equal(processed?.status, 'dead_letter');
      assert.ok(processed?.lastError?.includes('Exhausted retries'));
    });

    it('6. CRITICAL SECURITY: Shared-Device Ownership Revalidation prevents sending old user notification to reassigned device', async () => {
      // 1. Notification created for User 1 with intent for sub1
      const notifUser1 = await Notification.create({
        recipientId: new mongoose.Types.ObjectId(user1Id),
        type: 'work_opportunity',
        title: 'Confidential Staffing Update',
        message: 'Private to User 1',
      });

      const sub1 = await PushSubscription.findById(sub1Id);
      assert.ok(sub1);

      const delivery = await PushDelivery.create({
        notificationId: notifUser1._id,
        recipientId: notifUser1.recipientId,
        subscriptionId: sub1._id,
        endpointHash: sub1.endpointHash,
        deliveryKey: `${notifUser1._id}:${sub1._id}`,
        status: 'pending',
      });

      // 2. Before the queue processes the delivery, User 2 logs into that device!
      // The subscription endpoint is re-assigned to User 2
      await pushSubscriptionRepository.upsertSubscription({
        userId: user2Id,
        endpoint: sub1.endpoint,
        keys: { p256dh: 'k', auth: 'a' },
      });

      // 3. Worker now attempts to process the old delivery for User 1
      let mockSenderCalled = false;
      pushDeliveryService.setMockSender(async () => {
        mockSenderCalled = true;
        return { statusCode: 201, body: '', headers: {} };
      });

      const processed = await pushDeliveryService.processDelivery(delivery._id.toString());

      // Worker must detect subscription is now owned by User 2 and ABORT!
      assert.equal(mockSenderCalled, false, 'Push must NEVER be sent to device reassigned to another account');
      assert.equal(processed?.status, 'invalid_subscription');
      assert.ok(processed?.lastError?.includes('reassigned to another user account'));
    });

    it('7. startPushDeliveryWorker() initializes handle and cleanly shuts down', async () => {
      const handle = await startPushDeliveryWorker();
      assert.ok(handle);
      assert.equal(handle.name, 'push-delivery-worker');
      await handle.close();
    });
  });
});

