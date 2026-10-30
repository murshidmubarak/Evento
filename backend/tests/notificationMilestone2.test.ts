import './setup.js';
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { connectDB } from '../src/config/db.js';
import {
  notificationQueueService,
  JOB_REQUIREMENT_CANCELLATION,
  JOB_REQUIREMENT_UPDATE,
  JOB_DEADLINE_EXTENSION,
  JOB_SELECTION_COMPLETION,
} from '../src/modules/notifications/queues/notification.queue.js';
import { Notification } from '../src/modules/notifications/model/notification.model.js';
import { User } from '../src/modules/auth/model/user.model.js';
import { Event } from '../src/modules/events/model/event.model.js';
import '../src/modules/services/model/service.model.js';
import { WorkRequirement } from '../src/modules/work-requirements/model/work-requirement.model.js';
import { WorkResponse } from '../src/modules/work-requirements/model/work-response.model.js';
import { WorkerLocationHistory } from '../src/modules/work-requirements/model/worker-location-history.model.js';
import { WorkRequirementService } from '../src/modules/work-requirements/service/work-requirement.service.js';
import { workerOpportunityService } from '../src/modules/work-requirements/service/worker-opportunity.service.js';
import { workerSelectionService } from '../src/modules/worker-selection/service/worker-selection.service.js';

describe('Notification Milestone 2 — Advanced Work Requirement Lifecycle & Staffing Notifications', () => {
  let requirementService: WorkRequirementService;
  let managerId: string;
  let eventId: string;
  let assignedWorkerId: string;
  let interestedWorkerId: string;
  let eligibleWorkerId: string;
  let distantWorkerId: string;

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
    await Notification.deleteMany({});
    await User.deleteMany({});
    await Event.deleteMany({});
    await WorkRequirement.deleteMany({});
    await WorkResponse.deleteMany({});
    await WorkerLocationHistory.deleteMany({});

    // 1. Create Event Manager
    managerId = new mongoose.Types.ObjectId().toString();
    await User.create({
      _id: managerId,
      name: 'Priya Sharma (Manager)',
      email: 'manager.notif2@test.com',
      role: 'event_manager',
      isActive: true,
    });

    // 2. Create Confirmed Event in Kochi Marine Drive (lat: 9.9816, lng: 76.2799)
    const event = await Event.create({
      title: 'Grand Royal Reception 2026',
      eventType: 'Wedding',
      date: new Date(Date.now() + 86400000 * 10), // 10 days in future
      startTime: '08:00',
      endTime: '20:00',
      guestCount: 500,
      status: 'confirmed',
      clientId: new mongoose.Types.ObjectId(),
      eventManagerId: new mongoose.Types.ObjectId(managerId),
      location: {
        address: 'Marine Drive Ground, Kochi',
        lat: 9.9816,
        lng: 76.2799,
      },
    });
    eventId = event._id.toString();

    // 3. Worker 1: Assigned Worker (Chef, 2 km away)
    const wAssigned = await User.create({
      name: 'Chef Anil (Assigned)',
      email: 'anil@test.com',
      role: 'worker',
      workerType: 'Chef',
      isActive: true,
      location: {
        address: 'MG Road, Kochi',
        lat: 9.9720,
        lng: 76.2800,
        confirmedAt: new Date(Date.now() - 3600000 * 72),
      },
    });
    assignedWorkerId = wAssigned._id.toString();
    await WorkerLocationHistory.create({
      workerId: wAssigned._id,
      address: 'MG Road, Kochi',
      lat: 9.9720,
      lng: 76.2800,
      effectiveFrom: new Date(Date.now() - 3600000 * 72),
      versionId: 'v1_anil',
    });

    // 4. Worker 2: Interested Worker (Chef, 3 km away)
    const wInterested = await User.create({
      name: 'Chef Vikram (Interested)',
      email: 'vikram@test.com',
      role: 'worker',
      workerType: 'Chef',
      isActive: true,
      location: {
        address: 'Kaloor, Kochi',
        lat: 9.9980,
        lng: 76.2920,
        confirmedAt: new Date(Date.now() - 3600000 * 72),
      },
    });
    interestedWorkerId = wInterested._id.toString();
    await WorkerLocationHistory.create({
      workerId: wInterested._id,
      address: 'Kaloor, Kochi',
      lat: 9.9980,
      lng: 76.2920,
      effectiveFrom: new Date(Date.now() - 3600000 * 72),
      versionId: 'v1_vikram',
    });

    // 5. Worker 3: Eligible Worker (Chef, 4 km away, not yet expressed interest)
    const wEligible = await User.create({
      name: 'Chef David (Eligible)',
      email: 'david@test.com',
      role: 'worker',
      workerType: 'Chef',
      isActive: true,
      location: {
        address: 'Edapally, Kochi',
        lat: 10.0230,
        lng: 76.3110,
        confirmedAt: new Date(Date.now() - 3600000 * 72),
      },
    });
    eligibleWorkerId = wEligible._id.toString();
    await WorkerLocationHistory.create({
      workerId: wEligible._id,
      address: 'Edapally, Kochi',
      lat: 10.0230,
      lng: 76.3110,
      effectiveFrom: new Date(Date.now() - 3600000 * 72),
      versionId: 'v1_david',
    });

    // 6. Worker 4: Distant Worker (Chef, 120 km away in Kozhikode)
    const wDistant = await User.create({
      name: 'Chef Farhan (Distant)',
      email: 'farhan@test.com',
      role: 'worker',
      workerType: 'Chef',
      isActive: true,
      location: {
        address: 'Kozhikode Beach',
        lat: 11.2588,
        lng: 75.7804,
        confirmedAt: new Date(Date.now() - 3600000 * 72),
      },
    });
    distantWorkerId = wDistant._id.toString();
    await WorkerLocationHistory.create({
      workerId: wDistant._id,
      address: 'Kozhikode Beach',
      lat: 11.2588,
      lng: 75.7804,
      effectiveFrom: new Date(Date.now() - 3600000 * 72),
      versionId: 'v1_farhan',
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // EVENT A: WORK REQUIREMENT CANCELLATION
  // ═══════════════════════════════════════════════════════════════════════════
  describe('Event A — Work Requirement Cancellation Notifications', () => {
    it('1. Assigned Workers and active Interested Workers receive cancellation notifications', async () => {
      // Create requirement with 1 assigned worker
      const req = await WorkRequirement.create({
        eventId: new mongoose.Types.ObjectId(eventId),
        workerType: 'Chef',
        requiredCount: 3,
        reportingTime: '07:30',
        maxDistanceKm: 25,
        interestDeadlineAt: new Date(Date.now() + 86400000 * 2),
        interestPublishedAt: new Date(Date.now() - 3600000),
        status: 'cancelled',
        assignedWorkers: [
          {
            workerId: new mongoose.Types.ObjectId(assignedWorkerId),
            assignedAt: new Date(),
            distanceKm: 2.1,
            selectionRound: 1,
          },
        ],
      });

      // Record interested worker response
      await WorkResponse.create({
        requirementId: req._id,
        workerId: new mongoose.Types.ObjectId(interestedWorkerId),
        eventId: new mongoose.Types.ObjectId(eventId),
        responseStatus: 'interested',
        respondedAt: new Date(),
      });

      // Process cancellation
      const result = await notificationQueueService.processRequirementCancellation({
        requirementId: req._id.toString(),
      });

      assert.strictEqual(result.notifiedAssignedCount, 1);
      assert.strictEqual(result.notifiedInterestedCount, 1);
      assert.strictEqual(result.totalNotified, 2);

      // Verify assigned worker notification
      const assignedNotif = await Notification.findOne({
        recipientId: assignedWorkerId,
        type: 'requirement_cancelled',
      });
      assert.ok(assignedNotif, 'Assigned worker must receive cancellation notification');
      assert.strictEqual(assignedNotif.title, 'Work Requirement Cancelled');
      assert.match(assignedNotif.message, /confirmed assignment for Chef.*has been cancelled/i);
      assert.strictEqual(assignedNotif.destinationRoute, '/worker');
      assert.strictEqual(assignedNotif.resourceId, req._id.toString());

      // Verify interested worker notification
      const interestedNotif = await Notification.findOne({
        recipientId: interestedWorkerId,
        type: 'requirement_cancelled',
      });
      assert.ok(interestedNotif, 'Interested worker must receive cancellation notification');
      assert.strictEqual(interestedNotif.title, 'Work Requirement Cancelled');
      assert.match(interestedNotif.message, /requirement for Chef.*expressed interest in has been cancelled/i);
      assert.strictEqual(interestedNotif.destinationRoute, '/worker');

      // Verify unrelated eligible worker does NOT receive notification
      const eligibleNotif = await Notification.findOne({
        recipientId: eligibleWorkerId,
        type: 'requirement_cancelled',
      });
      assert.strictEqual(eligibleNotif, null, 'Unrelated eligible worker must not receive cancellation notification');
    });

    it('2. Workers who withdrew interest (not_interested) do NOT receive cancellation notifications', async () => {
      const req = await WorkRequirement.create({
        eventId: new mongoose.Types.ObjectId(eventId),
        workerType: 'Chef',
        requiredCount: 2,
        reportingTime: '07:30',
        status: 'cancelled',
        assignedWorkers: [],
      });

      // Worker withdrew interest
      await WorkResponse.create({
        requirementId: req._id,
        workerId: new mongoose.Types.ObjectId(interestedWorkerId),
        eventId: new mongoose.Types.ObjectId(eventId),
        responseStatus: 'not_interested',
        respondedAt: new Date(),
      });

      const result = await notificationQueueService.processRequirementCancellation({
        requirementId: req._id.toString(),
      });

      assert.strictEqual(result.totalNotified, 0);
      const count = await Notification.countDocuments({ type: 'requirement_cancelled' });
      assert.strictEqual(count, 0);
    });

    it('3. Deduplicates when a worker appears in both assigned and interested records', async () => {
      const req = await WorkRequirement.create({
        eventId: new mongoose.Types.ObjectId(eventId),
        workerType: 'Chef',
        requiredCount: 2,
        reportingTime: '07:30',
        status: 'cancelled',
        assignedWorkers: [
          {
            workerId: new mongoose.Types.ObjectId(assignedWorkerId),
            assignedAt: new Date(),
            distanceKm: 2.1,
            selectionRound: 1,
          },
        ],
      });

      // Even if worker is still in work_responses as interested
      await WorkResponse.create({
        requirementId: req._id,
        workerId: new mongoose.Types.ObjectId(assignedWorkerId),
        eventId: new mongoose.Types.ObjectId(eventId),
        responseStatus: 'interested',
        respondedAt: new Date(),
      });

      const result = await notificationQueueService.processRequirementCancellation({
        requirementId: req._id.toString(),
      });

      assert.strictEqual(result.totalNotified, 1);
      const userNotifs = await Notification.find({ recipientId: assignedWorkerId });
      assert.strictEqual(userNotifs.length, 1, 'Assigned worker appearing in both groups receives exactly 1 notification');
      assert.match(userNotifs[0].message, /confirmed assignment/i);
    });

    it('4. Skips processing if requirement is not in cancelled status (source of truth)', async () => {
      const req = await WorkRequirement.create({
        eventId: new mongoose.Types.ObjectId(eventId),
        workerType: 'Chef',
        requiredCount: 2,
        reportingTime: '07:30',
        status: 'open',
      });

      const result = await notificationQueueService.processRequirementCancellation({
        requirementId: req._id.toString(),
      });

      assert.strictEqual(result.totalNotified, 0);
      const count = await Notification.countDocuments({ type: 'requirement_cancelled' });
      assert.strictEqual(count, 0);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // EVENT B: WORK REQUIREMENT OPERATIONAL CHANGES (SCENARIOS A, B, C)
  // ═══════════════════════════════════════════════════════════════════════════
  describe('Event B — Work Requirement Changes (Scenarios A, B, C)', () => {
    it('1. Scenario A — Fully filled requirement notifies ONLY selected/assigned workers', async () => {
      // Requirement with 1 required, 1 assigned -> fully filled
      const req = await WorkRequirement.create({
        eventId: new mongoose.Types.ObjectId(eventId),
        workerType: 'Chef',
        requiredCount: 1,
        reportingTime: '07:00',
        maxDistanceKm: 25,
        status: 'filled',
        assignedWorkers: [
          {
            workerId: new mongoose.Types.ObjectId(assignedWorkerId),
            assignedAt: new Date(),
            distanceKm: 2.0,
            selectionRound: 1,
          },
        ],
      });

      // Another worker has interested response
      await WorkResponse.create({
        requirementId: req._id,
        workerId: new mongoose.Types.ObjectId(interestedWorkerId),
        eventId: new mongoose.Types.ObjectId(eventId),
        responseStatus: 'interested',
        respondedAt: new Date(),
      });

      const result = await notificationQueueService.processRequirementUpdate({
        requirementId: req._id.toString(),
        changedFields: {
          reportingTime: { old: '07:00', new: '08:30' },
        },
      });

      assert.strictEqual(result.scenario, 'A');
      assert.strictEqual(result.notifiedCount, 1);

      // Verify assigned worker received update notification
      const assignedNotif = await Notification.findOne({
        recipientId: assignedWorkerId,
        type: 'requirement_updated',
      });
      assert.ok(assignedNotif);
      assert.match(assignedNotif.message, /Reporting time: 07:00 -> 08:30/i);
      assert.strictEqual(assignedNotif.destinationRoute, '/worker');

      // Verify interested worker did NOT receive notification
      const interestedNotif = await Notification.findOne({
        recipientId: interestedWorkerId,
        type: 'requirement_updated',
      });
      assert.strictEqual(interestedNotif, null, 'Unselected interested worker must not be notified in Scenario A');

      // Verify eligible worker did NOT receive notification
      const eligibleNotif = await Notification.findOne({
        recipientId: eligibleWorkerId,
        type: 'requirement_updated',
      });
      assert.strictEqual(eligibleNotif, null, 'Eligible unselected worker must not be notified in Scenario A');
    });

    it('2. Scenario B — Unfilled requirement with open window notifies assigned, interested, AND eligible workers', async () => {
      // Required: 3, Assigned: 1 -> unfilled, status: open, deadline in future
      const req = await WorkRequirement.create({
        eventId: new mongoose.Types.ObjectId(eventId),
        workerType: 'Chef',
        requiredCount: 3,
        reportingTime: '07:00',
        maxDistanceKm: 25,
        interestDeadlineAt: new Date(Date.now() + 86400000 * 3),
        interestPublishedAt: new Date(Date.now() - 3600000),
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

      // Interested worker
      await WorkResponse.create({
        requirementId: req._id,
        workerId: new mongoose.Types.ObjectId(interestedWorkerId),
        eventId: new mongoose.Types.ObjectId(eventId),
        responseStatus: 'interested',
        respondedAt: new Date(),
      });

      const result = await notificationQueueService.processRequirementUpdate({
        requirementId: req._id.toString(),
        changedFields: {
          reportingTime: { old: '07:00', new: '06:30' },
          requiredCount: { old: 2, new: 3 },
        },
      });

      assert.strictEqual(result.scenario, 'B');
      // Should notify assignedWorkerId, interestedWorkerId, and eligibleWorkerId (David)
      // distantWorkerId is 120km away > 25km, so excluded
      assert.strictEqual(result.notifiedCount, 3);

      const notifs = await Notification.find({ type: 'requirement_updated' });
      assert.strictEqual(notifs.length, 3);

      const recipientIds = notifs.map((n) => n.recipientId.toString());
      assert.ok(recipientIds.includes(assignedWorkerId), 'Assigned worker must be notified');
      assert.ok(recipientIds.includes(interestedWorkerId), 'Interested worker must be notified');
      assert.ok(recipientIds.includes(eligibleWorkerId), 'Currently eligible worker must be notified');
      assert.ok(!recipientIds.includes(distantWorkerId), 'Distant worker exceeding maxDistanceKm must NOT be notified');

      // Verify multi-field changes representation
      assert.match(notifs[0].message, /Reporting time: 07:00 -> 06:30/);
      assert.match(notifs[0].message, /Required count: 2 -> 3/);
    });

    it('3. Scenario C — Unfilled requirement with closed window notifies assigned and interested workers, but NOT newly eligible workers', async () => {
      // Required: 3, Assigned: 1, deadline expired in past
      const req = await WorkRequirement.create({
        eventId: new mongoose.Types.ObjectId(eventId),
        workerType: 'Chef',
        requiredCount: 3,
        reportingTime: '07:00',
        maxDistanceKm: 25,
        interestDeadlineAt: new Date(Date.now() - 3600000), // Expired 1 hour ago
        interestPublishedAt: new Date(Date.now() - 86400000),
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

      const result = await notificationQueueService.processRequirementUpdate({
        requirementId: req._id.toString(),
        changedFields: {
          reportingTime: { old: '07:00', new: '08:00' },
        },
      });

      assert.strictEqual(result.scenario, 'C');
      assert.strictEqual(result.notifiedCount, 2);

      const notifs = await Notification.find({ type: 'requirement_updated' });
      assert.strictEqual(notifs.length, 2);
      const recipientIds = notifs.map((n) => n.recipientId.toString());
      assert.ok(recipientIds.includes(assignedWorkerId));
      assert.ok(recipientIds.includes(interestedWorkerId));
      assert.ok(!recipientIds.includes(eligibleWorkerId), 'Eligible workers must NOT be notified when window is closed');
    });

    it('4. Unchanged fields do not generate redundant notifications', async () => {
      const req = await WorkRequirement.create({
        eventId: new mongoose.Types.ObjectId(eventId),
        workerType: 'Chef',
        requiredCount: 2,
        reportingTime: '07:00',
        status: 'open',
      });

      const result = await notificationQueueService.processRequirementUpdate({
        requirementId: req._id.toString(),
        changedFields: {},
      });

      assert.strictEqual(result.notifiedCount, 0);
      const count = await Notification.countDocuments({ type: 'requirement_updated' });
      assert.strictEqual(count, 0);
    });

    it('5. Duplicate recipients receive only one notification per logical update', async () => {
      const req = await WorkRequirement.create({
        eventId: new mongoose.Types.ObjectId(eventId),
        workerType: 'Chef',
        requiredCount: 3,
        reportingTime: '07:00',
        maxDistanceKm: 25,
        interestDeadlineAt: new Date(Date.now() + 86400000),
        interestPublishedAt: new Date(Date.now() - 3600000),
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

      // Worker is assigned AND in work_responses
      await WorkResponse.create({
        requirementId: req._id,
        workerId: new mongoose.Types.ObjectId(assignedWorkerId),
        eventId: new mongoose.Types.ObjectId(eventId),
        responseStatus: 'interested',
        respondedAt: new Date(),
      });

      const enqueuedAt = new Date().toISOString();
      const result = await notificationQueueService.processRequirementUpdate({
        requirementId: req._id.toString(),
        changedFields: { reportingTime: { old: '07:00', new: '09:00' } },
        enqueuedAt,
      });

      const assignedNotifs = await Notification.find({
        recipientId: assignedWorkerId,
        type: 'requirement_updated',
      });
      assert.strictEqual(assignedNotifs.length, 1, 'Assigned worker appearing in multiple groups must receive exactly 1 notification');

      // Idempotency: re-running with the same enqueuedAt does not duplicate
      await notificationQueueService.processRequirementUpdate({
        requirementId: req._id.toString(),
        changedFields: { reportingTime: { old: '07:00', new: '09:00' } },
        enqueuedAt,
      });

      const reCheck = await Notification.find({
        recipientId: assignedWorkerId,
        type: 'requirement_updated',
      });
      assert.strictEqual(reCheck.length, 1, 'Re-running update must be idempotent');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // EVENT C: DEADLINE EXTENSION NOTIFICATIONS
  // ═══════════════════════════════════════════════════════════════════════════
  describe('Event C — Deadline Extension Notifications', () => {
    it('1. Existing interested Workers and other currently eligible Workers receive extension notifications', async () => {
      const newDeadline = new Date(Date.now() + 86400000 * 5);
      const req = await WorkRequirement.create({
        eventId: new mongoose.Types.ObjectId(eventId),
        workerType: 'Chef',
        requiredCount: 3,
        reportingTime: '08:00',
        maxDistanceKm: 25,
        interestDeadlineAt: newDeadline,
        interestPublishedAt: new Date(Date.now() - 86400000), // Original cutoff preserved!
        selectionRound: 2,
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

      // Interested worker from round 1
      await WorkResponse.create({
        requirementId: req._id,
        workerId: new mongoose.Types.ObjectId(interestedWorkerId),
        eventId: new mongoose.Types.ObjectId(eventId),
        responseStatus: 'interested',
        respondedAt: new Date(),
      });

      const result = await notificationQueueService.processDeadlineExtension({
        requirementId: req._id.toString(),
        selectionRound: 2,
        newDeadline: newDeadline.toISOString(),
      });

      // Notifies interestedWorkerId and eligibleWorkerId (David)
      // Excludes assignedWorkerId (not a new candidate)
      // Excludes distantWorkerId (120 km > 25 km)
      assert.strictEqual(result.notifiedCount, 2);

      const notifs = await Notification.find({ type: 'deadline_extended' });
      assert.strictEqual(notifs.length, 2);

      const recipientIds = notifs.map((n) => n.recipientId.toString());
      assert.ok(recipientIds.includes(interestedWorkerId), 'Interested worker must be notified');
      assert.ok(recipientIds.includes(eligibleWorkerId), 'Eligible worker must be notified');
      assert.ok(!recipientIds.includes(assignedWorkerId), 'Assigned worker must NOT be treated as new candidate');
      assert.ok(!recipientIds.includes(distantWorkerId), 'Distant worker must NOT be notified');

      assert.strictEqual(notifs[0].title, 'Work Requirement Deadline Extended');
      assert.match(notifs[0].message, /interest deadline for Chef.*has been extended/i);
      assert.strictEqual(notifs[0].destinationRoute, '/worker');
      assert.strictEqual(notifs[0].resourceId, req._id.toString());
    });

    it('2. Preserves original publication cutoff timestamp and historical location rules', async () => {
      const originalCutoff = new Date(Date.now() - 3600000 * 24); // 24h ago
      const newDeadline = new Date(Date.now() + 86400000 * 4);

      const req = await WorkRequirement.create({
        eventId: new mongoose.Types.ObjectId(eventId),
        workerType: 'Chef',
        requiredCount: 2,
        reportingTime: '08:00',
        maxDistanceKm: 25,
        interestDeadlineAt: newDeadline,
        interestPublishedAt: originalCutoff,
        selectionRound: 2,
        status: 'open',
        assignedWorkers: [],
      });

      // Create a worker who moved nearby TODAY but was far away at originalCutoff
      const wManipulator = await User.create({
        name: 'Chef Manipulator',
        email: 'manip@test.com',
        role: 'worker',
        workerType: 'Chef',
        isActive: true,
        location: {
          address: 'Kochi (New)',
          lat: 9.9800,
          lng: 76.2800,
          confirmedAt: new Date(),
        },
      });
      // At original cutoff, they were in Delhi (2000 km away)
      await WorkerLocationHistory.create({
        workerId: wManipulator._id,
        address: 'Delhi',
        lat: 28.6139,
        lng: 77.2090,
        effectiveFrom: new Date(Date.now() - 3600000 * 48),
        versionId: 'v1_delhi',
      });

      const result = await notificationQueueService.processDeadlineExtension({
        requirementId: req._id.toString(),
        selectionRound: 2,
        newDeadline: newDeadline.toISOString(),
      });

      const manipulatorNotif = await Notification.findOne({
        recipientId: wManipulator._id.toString(),
        type: 'deadline_extended',
      });
      assert.strictEqual(manipulatorNotif, null, 'Worker who was far away at original cutoff must NOT be eligible on extension');
    });

    it('3. Duplicate processing does not create duplicate extension notifications', async () => {
      const newDeadline = new Date(Date.now() + 86400000 * 2);
      const req = await WorkRequirement.create({
        eventId: new mongoose.Types.ObjectId(eventId),
        workerType: 'Chef',
        requiredCount: 2,
        reportingTime: '08:00',
        maxDistanceKm: 25,
        interestDeadlineAt: newDeadline,
        interestPublishedAt: new Date(Date.now() - 3600000),
        selectionRound: 2,
        status: 'open',
        assignedWorkers: [],
      });

      await WorkResponse.create({
        requirementId: req._id,
        workerId: new mongoose.Types.ObjectId(interestedWorkerId),
        eventId: new mongoose.Types.ObjectId(eventId),
        responseStatus: 'interested',
        respondedAt: new Date(),
      });

      // Run 1
      await notificationQueueService.processDeadlineExtension({
        requirementId: req._id.toString(),
        selectionRound: 2,
        newDeadline: newDeadline.toISOString(),
      });

      // Run 2 (duplicate/retry)
      await notificationQueueService.processDeadlineExtension({
        requirementId: req._id.toString(),
        selectionRound: 2,
        newDeadline: newDeadline.toISOString(),
      });

      const notifs = await Notification.find({
        recipientId: interestedWorkerId,
        type: 'deadline_extended',
      });
      assert.strictEqual(notifs.length, 1, 'Duplicate processing must not create duplicate notifications');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // EVENT D: UNFILLED STAFFING NOTIFICATIONS
  // ═══════════════════════════════════════════════════════════════════════════
  describe('Event D — Unfilled Staffing Notifications to Responsible Event Manager', () => {
    it('1. Event Manager receives "Staffing Requirement Still Unfilled" when vacancies remain', async () => {
      // Required: 3, Assigned: 1 -> remaining: 2
      const req = await WorkRequirement.create({
        eventId: new mongoose.Types.ObjectId(eventId),
        workerType: 'Chef',
        requiredCount: 3,
        reportingTime: '08:00',
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

      const result = await notificationQueueService.processSelectionCompletion({
        requirementId: req._id.toString(),
        selectionRound: 1,
        newlySelectedWorkerIds: [assignedWorkerId],
      });

      assert.strictEqual(result.managerNotified, true);
      assert.strictEqual(result.isUnfilledAlert, true);

      const managerNotif = await Notification.findOne({
        recipientId: managerId,
        type: 'staffing_unfilled',
      });
      assert.ok(managerNotif, 'Manager must receive staffing_unfilled notification');
      assert.strictEqual(managerNotif.title, 'Staffing Requirement Still Unfilled');
      assert.match(managerNotif.message, /Required: 3, Assigned: 1, Remaining: 2/);
      assert.strictEqual(managerNotif.destinationRoute, `/manager/events/${eventId}`);
      assert.strictEqual(managerNotif.resourceId, req._id.toString());
      assert.strictEqual(managerNotif.metadata?.remaining, 2);
    });

    it('2. Fully filled requirements do NOT receive unfilled alerts', async () => {
      // Required: 2, Assigned: 2 -> remaining: 0, status: 'filled'
      const req = await WorkRequirement.create({
        eventId: new mongoose.Types.ObjectId(eventId),
        workerType: 'Chef',
        requiredCount: 2,
        reportingTime: '08:00',
        selectionRound: 1,
        status: 'filled',
        assignedWorkers: [
          {
            workerId: new mongoose.Types.ObjectId(assignedWorkerId),
            assignedAt: new Date(),
            distanceKm: 2.0,
            selectionRound: 1,
          },
          {
            workerId: new mongoose.Types.ObjectId(interestedWorkerId),
            assignedAt: new Date(),
            distanceKm: 3.0,
            selectionRound: 1,
          },
        ],
      });

      const result = await notificationQueueService.processSelectionCompletion({
        requirementId: req._id.toString(),
        selectionRound: 1,
        newlySelectedWorkerIds: [assignedWorkerId, interestedWorkerId],
      });

      assert.strictEqual(result.managerNotified, true);
      assert.strictEqual(result.isUnfilledAlert, false);

      const unfilledNotif = await Notification.findOne({
        recipientId: managerId,
        type: 'staffing_unfilled',
      });
      assert.strictEqual(unfilledNotif, null, 'Fully filled requirement must NOT receive unfilled alert');

      const summaryNotif = await Notification.findOne({
        recipientId: managerId,
        type: 'selection_summary',
      });
      assert.ok(summaryNotif);
      assert.strictEqual(summaryNotif.title, 'Worker selection complete');
      assert.match(summaryNotif.message, /All 2 position\(s\) have been filled/);
    });

    it('3. Subsequent legitimate rounds generate distinct outcome notifications', async () => {
      // Round 1
      const req = await WorkRequirement.create({
        eventId: new mongoose.Types.ObjectId(eventId),
        workerType: 'Chef',
        requiredCount: 3,
        reportingTime: '08:00',
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

      await notificationQueueService.processSelectionCompletion({
        requirementId: req._id.toString(),
        selectionRound: 1,
      });

      // Round 2 after extension
      await WorkRequirement.findByIdAndUpdate(req._id, {
        selectionRound: 2,
        $push: {
          assignedWorkers: {
            workerId: new mongoose.Types.ObjectId(interestedWorkerId),
            assignedAt: new Date(),
            distanceKm: 3.0,
            selectionRound: 2,
          },
        },
      });

      await notificationQueueService.processSelectionCompletion({
        requirementId: req._id.toString(),
        selectionRound: 2,
      });

      const round1Alert = await Notification.findOne({
        recipientId: managerId,
        deduplicationKey: `staffing_unfilled_${req._id}_round1_${managerId}`,
      });
      const round2Alert = await Notification.findOne({
        recipientId: managerId,
        deduplicationKey: `staffing_unfilled_${req._id}_round2_${managerId}`,
      });

      assert.ok(round1Alert, 'Round 1 alert exists');
      assert.ok(round2Alert, 'Round 2 alert exists');
      assert.match(round1Alert.message, /Remaining: 2/);
      assert.match(round2Alert.message, /Remaining: 1/);
    });

    it('4. Stale selection round jobs do NOT produce notifications', async () => {
      const req = await WorkRequirement.create({
        eventId: new mongoose.Types.ObjectId(eventId),
        workerType: 'Chef',
        requiredCount: 3,
        reportingTime: '08:00',
        selectionRound: 2, // Current round is 2
        status: 'open',
        assignedWorkers: [],
      });

      // Job specifies round 1
      const result = await notificationQueueService.processSelectionCompletion({
        requirementId: req._id.toString(),
        selectionRound: 1,
      });

      assert.strictEqual(result.managerNotified, false);
      const count = await Notification.countDocuments({ recipientId: managerId });
      assert.strictEqual(count, 0);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // END-TO-END WORK REQUIREMENT SERVICE INTEGRATION
  // ═══════════════════════════════════════════════════════════════════════════
  describe('End-to-End WorkRequirementService Integration', () => {
    it('1. cancelRequirement enqueues cancellation and dispatches notifications', async () => {
      const req = await requirementService.createRequirement(managerId, eventId, {
        workerType: 'Chef',
        requiredCount: 2,
        reportingTime: '08:00',
        maxDistanceKm: 25,
        interestDeadlineAt: new Date(Date.now() + 86400000 * 2),
      });

      // Transition to open
      await requirementService.updateRequirement(managerId, req._id.toString(), { status: 'open' });

      // Add assigned worker directly to DB
      await WorkRequirement.findByIdAndUpdate(req._id, {
        assignedWorkers: [
          {
            workerId: new mongoose.Types.ObjectId(assignedWorkerId),
            assignedAt: new Date(),
            distanceKm: 2.0,
            selectionRound: 1,
          },
        ],
      });

      // Add interested worker
      await WorkResponse.create({
        requirementId: req._id,
        workerId: new mongoose.Types.ObjectId(interestedWorkerId),
        eventId: new mongoose.Types.ObjectId(eventId),
        responseStatus: 'interested',
        respondedAt: new Date(),
      });

      // Cancel requirement
      await requirementService.cancelRequirement(managerId, req._id.toString());

      // Check mock queue received cancellation job
      const mockQueue = notificationQueueService.getMockQueue();
      const cancelJob = mockQueue.jobs.find((j) => j.name === JOB_REQUIREMENT_CANCELLATION);
      assert.ok(cancelJob, 'Cancellation job must be enqueued');
      assert.strictEqual(cancelJob.data.requirementId, req._id.toString());

      // Wait for immediate async processing in mock mode
      await new Promise((resolve) => setTimeout(resolve, 50));

      const notifs = await Notification.find({ type: 'requirement_cancelled' });
      assert.strictEqual(notifs.length, 2);
    });

    it('2. extendDeadline enqueues deadline extension and preserves assigned workers', async () => {
      const initialDeadline = new Date(Date.now() - 3600000); // 1h ago
      const req = await WorkRequirement.create({
        eventId: new mongoose.Types.ObjectId(eventId),
        workerType: 'Chef',
        requiredCount: 3,
        reportingTime: '08:00',
        maxDistanceKm: 25,
        interestDeadlineAt: initialDeadline,
        interestPublishedAt: new Date(Date.now() - 3600000 * 24),
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

      // Extend deadline
      const futureDeadline = new Date(Date.now() + 86400000 * 5);
      const updated = await requirementService.extendDeadline(
        managerId,
        req._id.toString(),
        futureDeadline.toISOString()
      );

      // Verify assigned worker is strictly preserved
      assert.strictEqual(updated.assignedWorkers.length, 1);
      assert.strictEqual(updated.assignedWorkers[0].workerId.toString(), assignedWorkerId);
      assert.strictEqual(updated.selectionRound, 2);

      // Verify extension job enqueued
      const mockQueue = notificationQueueService.getMockQueue();
      const extJob = mockQueue.jobs.find((j) => j.name === JOB_DEADLINE_EXTENSION);
      assert.ok(extJob, 'Deadline extension job must be enqueued');
      assert.strictEqual(extJob.data.selectionRound, 2);
    });

    it('3. updateRequirement on open requirement enqueues material update notifications', async () => {
      const req = await WorkRequirement.create({
        eventId: new mongoose.Types.ObjectId(eventId),
        workerType: 'Chef',
        requiredCount: 2,
        reportingTime: '08:00',
        maxDistanceKm: 25,
        interestDeadlineAt: new Date(Date.now() + 86400000 * 2),
        interestPublishedAt: new Date(Date.now() - 3600000),
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

      // Update reporting time
      await requirementService.updateRequirement(managerId, req._id.toString(), {
        reportingTime: '09:30',
      });

      const mockQueue = notificationQueueService.getMockQueue();
      const updateJob = mockQueue.jobs.find((j) => j.name === JOB_REQUIREMENT_UPDATE);
      assert.ok(updateJob, 'Requirement update job must be enqueued');
      assert.strictEqual(updateJob.data.changedFields.reportingTime.old, '08:00');
      assert.strictEqual(updateJob.data.changedFields.reportingTime.new, '09:30');

      // Wait for mock job processing before test suite teardown
      await new Promise((resolve) => setTimeout(resolve, 60));
    });
  });
});
