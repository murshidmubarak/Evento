import './setup.js';
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { connectDB } from '../src/config/db.js';
import { env } from '../src/config/env.js';
import {
  notificationQueueService,
  RequirementAnnouncementJobData,
  SelectionCompletionJobData,
} from '../src/modules/notifications/queues/notification.queue.js';
import {
  startNotificationWorker,
  NotificationWorkerHandle,
} from '../src/workers/notificationWorker.js';
import { UnifiedWorker } from '../src/workers/worker.js';
import { Notification } from '../src/modules/notifications/model/notification.model.js';
import { User } from '../src/modules/auth/model/user.model.js';
import { Event } from '../src/modules/events/model/event.model.js';
import { WorkRequirement } from '../src/modules/work-requirements/model/work-requirement.model.js';
import { WorkResponse } from '../src/modules/work-requirements/model/work-response.model.js';
import { WorkerLocationHistory } from '../src/modules/work-requirements/model/worker-location-history.model.js';
import { notificationTransport } from '../src/sockets/notification-transport.js';

describe('Dedicated BullMQ Notification Queue & Unified Worker Processing', () => {
  let managerId: string;
  let eventId: string;
  let workerChefId: string;
  let workerCateringBoyId: string;
  let workerFarId: string;

  before(async () => {
    await connectDB();
    notificationQueueService.setMockMode(true);
  });

  beforeEach(async () => {
    if (mongoose.connection.readyState === 0) {
      await connectDB();
    }
    notificationQueueService.setMockMode(true);

    // Clean test database tables
    await Notification.deleteMany({});
    await User.deleteMany({});
    await Event.deleteMany({});
    await WorkRequirement.deleteMany({});
    await WorkResponse.deleteMany({});
    await WorkerLocationHistory.deleteMany({});

    // Setup base event and users
    managerId = new mongoose.Types.ObjectId().toString();

    await User.create({
      _id: managerId,
      name: 'Test Event Manager',
      email: 'manager@test.com',
      role: 'event_manager',
      isActive: true,
    });

    const event = await Event.create({
      title: 'Grand Gala 2026',
      eventType: 'Corporate',
      date: new Date(Date.now() + 86400000 * 7),
      startTime: '10:00',
      endTime: '18:00',
      guestCount: 300,
      status: 'confirmed',
      clientId: new mongoose.Types.ObjectId(),
      eventManagerId: new mongoose.Types.ObjectId(managerId),
      location: {
        address: 'Kochi Marine Drive',
        lat: 9.9816,
        lng: 76.2799,
      },
    });
    eventId = event._id.toString();

    // Worker 1: Catering Boy nearby (3 km away)
    const workerCatering = await User.create({
      name: 'Salim Catering',
      email: 'salim@test.com',
      role: 'worker',
      workerType: 'Catering Boy',
      isActive: true,
      location: {
        address: 'MG Road, Kochi',
        lat: 9.9720,
        lng: 76.2800,
        confirmedAt: new Date(),
      },
    });
    workerCateringBoyId = workerCatering._id.toString();
    await WorkerLocationHistory.create({
      workerId: workerCatering._id,
      address: 'MG Road, Kochi',
      lat: 9.9720,
      lng: 76.2800,
      effectiveFrom: new Date(Date.now() - 3600000),
      versionId: 'v1_salim',
    });

    // Worker 2: Chef nearby (4 km away)
    const workerChef = await User.create({
      name: 'Babu Chef',
      email: 'babu@test.com',
      role: 'worker',
      workerType: 'Chef',
      isActive: true,
      location: {
        address: 'Kaloor, Kochi',
        lat: 9.9980,
        lng: 76.2920,
        confirmedAt: new Date(),
      },
    });
    workerChefId = workerChef._id.toString();
    await WorkerLocationHistory.create({
      workerId: workerChef._id,
      address: 'Kaloor, Kochi',
      lat: 9.9980,
      lng: 76.2920,
      effectiveFrom: new Date(Date.now() - 3600000),
      versionId: 'v1_babu',
    });

    // Worker 3: Catering Boy far away (150 km away)
    const workerFar = await User.create({
      name: 'Far Away Worker',
      email: 'far@test.com',
      role: 'worker',
      workerType: 'Catering Boy',
      isActive: true,
      location: {
        address: 'Kozhikode',
        lat: 11.2588,
        lng: 75.7804,
        confirmedAt: new Date(),
      },
    });
    workerFarId = workerFar._id.toString();
    await WorkerLocationHistory.create({
      workerId: workerFar._id,
      address: 'Kozhikode',
      lat: 11.2588,
      lng: 75.7804,
      effectiveFrom: new Date(Date.now() - 3600000),
      versionId: 'v1_far',
    });
  });

  after(async () => {
    await notificationQueueService.close();
    await notificationTransport.close();
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  // PART 1: Queue Configuration & Worker Registration
  // ───────────────────────────────────────────────────────────────────────────
  describe('Part 1: Queue Configuration & Unified Worker Integration', () => {
    it('1. Dedicated notification queue has queue name notification-processing and worker concurrency 3', () => {
      assert.strictEqual(
        notificationQueueService.getQueueName(),
        'notification-processing',
        'Queue name must be notification-processing'
      );
      assert.strictEqual(
        notificationQueueService.getConcurrency(),
        3,
        'Concurrency must be 3 for bounded batch delivery'
      );
      assert.strictEqual(
        notificationQueueService.getMaxRetries(),
        3,
        'Default max retries must be 3'
      );
    });

    it('2. UnifiedWorker orchestrator registers Notification Worker as default worker #3', () => {
      const unifiedWorker = new UnifiedWorker();
      const registrations = unifiedWorker.getRegisteredWorkers();

      assert.strictEqual(registrations.length, 3, 'Must have 3 default workers registered');
      assert.strictEqual(registrations[0].name, 'Payment Reminder Worker');
      assert.strictEqual(registrations[1].name, 'Worker Selection Worker');
      assert.strictEqual(registrations[2].name, 'Notification Worker');
    });

    it('3. startNotificationWorker() returns active handle and cleanly closes', async () => {
      const handle: NotificationWorkerHandle = await startNotificationWorker();
      assert.ok(handle);
      assert.strictEqual(handle.name, 'notification-worker');
      await handle.close();
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // PART 2: Work Requirement Announcement Processing
  // ───────────────────────────────────────────────────────────────────────────
  describe('Part 2: Work Requirement Announcement Background Processing', () => {
    it('1. Correctly processes requirement-announcement job for genuinely eligible workers only', async () => {
      // Create open requirement for Catering Boy with maxDistance 15km
      const requirement = await WorkRequirement.create({
        eventId: new mongoose.Types.ObjectId(eventId),
        workerType: 'Catering Boy',
        requiredCount: 2,
        reportingTime: '08:30 AM',
        maxDistanceKm: 15,
        status: 'open',
        selectionRound: 1,
        interestPublishedAt: new Date(),
        interestDeadlineAt: new Date(Date.now() + 86400000),
      });

      // Enqueue announcement job via service producer
      const jobData: RequirementAnnouncementJobData = {
        requirementId: requirement._id.toString(),
        publishedAt: requirement.interestPublishedAt!.toISOString(),
      };

      const result = await notificationQueueService.processRequirementAnnouncements(jobData);

      assert.strictEqual(result.eligibleCount, 1, 'Only 1 eligible catering worker within 15 km');
      assert.strictEqual(result.notifiedCount, 1, '1 notification saved and emitted');

      // Verify notification in DB
      const notifs = await Notification.find({ resourceId: requirement._id.toString() });
      assert.strictEqual(notifs.length, 1);
      assert.strictEqual(notifs[0].recipientId.toString(), workerCateringBoyId);
      assert.strictEqual(notifs[0].type, 'work_opportunity');
      assert.strictEqual(notifs[0].destinationRoute, '/worker');
      assert.ok(notifs[0].title.includes('opportunity'));

      // Chef and Far worker must have 0 notifications
      const chefNotifs = await Notification.find({ recipientId: workerChefId });
      assert.strictEqual(chefNotifs.length, 0);

      const farNotifs = await Notification.find({ recipientId: workerFarId });
      assert.strictEqual(farNotifs.length, 0);
    });

    it('2. Skips announcement processing if requirement is in draft or cancelled state (persisted source of truth)', async () => {
      // Create draft requirement
      const draftReq = await WorkRequirement.create({
        eventId: new mongoose.Types.ObjectId(eventId),
        workerType: 'Catering Boy',
        requiredCount: 2,
        reportingTime: '08:30 AM',
        maxDistanceKm: 15,
        status: 'draft',
        selectionRound: 1,
        interestPublishedAt: new Date(),
        interestDeadlineAt: new Date(Date.now() + 86400000),
      });

      const result = await notificationQueueService.processRequirementAnnouncements({
        requirementId: draftReq._id.toString(),
        publishedAt: new Date().toISOString(),
      });

      assert.strictEqual(result.eligibleCount, 0);
      assert.strictEqual(result.notifiedCount, 0);

      // Check 0 notifications created
      const notifs = await Notification.find({ resourceId: draftReq._id.toString() });
      assert.strictEqual(notifs.length, 0);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // PART 3: Worker Selection Completion Processing
  // ───────────────────────────────────────────────────────────────────────────
  describe('Part 3: Worker Selection Completion Background Processing', () => {
    it('1. Dispatches assignment_confirmed to selected workers and selection_summary to manager', async () => {
      // Create requirement with assigned worker
      const requirement = await WorkRequirement.create({
        eventId: new mongoose.Types.ObjectId(eventId),
        workerType: 'Catering Boy',
        requiredCount: 2,
        reportingTime: '08:30 AM',
        maxDistanceKm: 15,
        status: 'filled',
        selectionRound: 1,
        assignedWorkers: [
          {
            workerId: new mongoose.Types.ObjectId(workerCateringBoyId),
            assignedAt: new Date(),
            distanceKm: 3.2,
            distanceScore: 4.8,
            selectionRound: 1,
          },
        ],
      });

      const jobData: SelectionCompletionJobData = {
        requirementId: requirement._id.toString(),
        selectionRound: 1,
        newlySelectedWorkerIds: [workerCateringBoyId],
        totalAssignedCount: 1,
        requiredCount: 2,
        status: 'filled',
      };

      const result = await notificationQueueService.processSelectionCompletion(jobData);

      assert.strictEqual(result.selectedWorkerCount, 1);
      assert.strictEqual(result.managerNotified, true);

      // Verify worker notification
      const workerNotif = await Notification.findOne({
        recipientId: workerCateringBoyId,
        type: 'assignment_confirmed',
      });
      assert.ok(workerNotif);
      assert.strictEqual(workerNotif.resourceId, requirement._id.toString());
      assert.strictEqual(workerNotif.destinationRoute, '/worker');
      assert.ok(workerNotif.title.includes('Assignment confirmed'));

      // Verify manager notification
      const managerNotif = await Notification.findOne({
        recipientId: managerId,
        type: 'selection_summary',
      });
      assert.ok(managerNotif);
      assert.strictEqual(managerNotif.resourceId, requirement._id.toString());
      assert.strictEqual(managerNotif.destinationRoute, `/manager/events/${eventId}`);
      assert.ok(managerNotif.title.includes('Worker selection complete'));
    });

    it('2. Skips selection completion processing if selectionRound has advanced (stale round safety)', async () => {
      // Requirement is at round 2
      const requirement = await WorkRequirement.create({
        eventId: new mongoose.Types.ObjectId(eventId),
        workerType: 'Catering Boy',
        requiredCount: 2,
        reportingTime: '08:30 AM',
        status: 'open',
        selectionRound: 2,
      });

      // Old round 1 job arrives
      const result = await notificationQueueService.processSelectionCompletion({
        requirementId: requirement._id.toString(),
        selectionRound: 1,
        newlySelectedWorkerIds: [workerCateringBoyId],
        totalAssignedCount: 1,
        requiredCount: 2,
        status: 'open',
      });

      assert.strictEqual(result.selectedWorkerCount, 0);
      assert.strictEqual(result.managerNotified, false);

      // No notifications created for stale round
      const notifs = await Notification.find({ resourceId: requirement._id.toString() });
      assert.strictEqual(notifs.length, 0);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // PART 4: Idempotency, Retries & Startup Recovery
  // ───────────────────────────────────────────────────────────────────────────
  describe('Part 4: Deduplication, Idempotency & Startup Recovery', () => {
    it('1. DeduplicationKey guarantees exact-once persistence across multiple identical processing attempts', async () => {
      const requirement = await WorkRequirement.create({
        eventId: new mongoose.Types.ObjectId(eventId),
        workerType: 'Catering Boy',
        requiredCount: 1,
        reportingTime: '09:00 AM',
        maxDistanceKm: 15,
        status: 'open',
        selectionRound: 1,
        interestPublishedAt: new Date(),
        interestDeadlineAt: new Date(Date.now() + 86400000),
      });

      const jobData: RequirementAnnouncementJobData = {
        requirementId: requirement._id.toString(),
        publishedAt: requirement.interestPublishedAt!.toISOString(),
      };

      // Process attempt 1
      const res1 = await notificationQueueService.processRequirementAnnouncements(jobData);
      assert.strictEqual(res1.notifiedCount, 1);

      // Process attempt 2 (simulating retry or duplicate job delivery)
      const res2 = await notificationQueueService.processRequirementAnnouncements(jobData);
      assert.strictEqual(res2.notifiedCount, 1);

      // Total count in database must remain exactly 1
      const count = await Notification.countDocuments({ resourceId: requirement._id.toString() });
      assert.strictEqual(count, 1, 'Duplicate processing must not create second notification record');
    });

    it('2. scanAndRecoverPendingNotifications() discovers and recovers pending announcements', async () => {
      // Create an open requirement that missed its announcement job during an unexpected restart
      const pendingReq = await WorkRequirement.create({
        eventId: new mongoose.Types.ObjectId(eventId),
        workerType: 'Catering Boy',
        requiredCount: 2,
        reportingTime: '08:00 AM',
        maxDistanceKm: 15,
        status: 'open',
        selectionRound: 1,
        interestPublishedAt: new Date(Date.now() - 60000), // published 1 min ago
        interestDeadlineAt: new Date(Date.now() + 86400000),
      });

      // Verify no notifications currently exist
      const beforeCount = await Notification.countDocuments({ resourceId: pendingReq._id.toString() });
      assert.strictEqual(beforeCount, 0);

      // Run recovery scanner (simulating worker restart)
      const recovered = await notificationQueueService.scanAndRecoverPendingNotifications();
      assert.ok(recovered >= 1, 'Should recover at least 1 pending task');

      // Check notification is now persisted
      const afterNotifs = await Notification.find({ resourceId: pendingReq._id.toString() });
      assert.strictEqual(afterNotifs.length, 1);
      assert.strictEqual(afterNotifs[0].recipientId.toString(), workerCateringBoyId);
    });
  });
});
