import './setup.js';
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { io as ClientSocket, type Socket as ClientSocketType } from 'socket.io-client';

import app from '../src/app.js';
import { env } from '../src/config/env.js';
import { connectDB } from '../src/config/db.js';
import { initSocketServer, closeSocketServer } from '../src/sockets/socket.server.js';
import { notificationTransport } from '../src/sockets/notification-transport.js';
import { Notification } from '../src/modules/notifications/model/notification.model.js';
import { notificationService } from '../src/modules/notifications/service/notification.service.js';
import { User } from '../src/modules/auth/model/user.model.js';
import { Event } from '../src/modules/events/model/event.model.js';
import { WorkRequirement } from '../src/modules/work-requirements/model/work-requirement.model.js';
import { WorkResponse } from '../src/modules/work-requirements/model/work-response.model.js';
import { WorkerLocationHistory } from '../src/modules/work-requirements/model/worker-location-history.model.js';
import { WorkRequirementService } from '../src/modules/work-requirements/service/work-requirement.service.js';
import { workerSelectionService } from '../src/modules/worker-selection/service/worker-selection.service.js';

describe('Milestone 1 — Persistent Notifications, Socket.IO, and Core Business Integration', () => {
  let server: http.Server;
  let port: number;
  let socketUrl: string;

  let managerToken: string;
  let managerId: string;

  let worker1Token: string;
  let worker1Id: string;

  let worker2Token: string;
  let worker2Id: string;

  let workRequirementService: WorkRequirementService;

  const generateToken = (userId: string, role: string) => {
    return jwt.sign({ userId, role }, env.jwtSecret, { expiresIn: '2h' });
  };

  before(async () => {
    await connectDB();

    server = http.createServer(app);
    initSocketServer(server);

    await new Promise<void>((resolve) => {
      server.listen(0, () => {
        port = (server.address() as any).port;
        socketUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });

    workRequirementService = new WorkRequirementService();

    managerId = new mongoose.Types.ObjectId().toString();
    worker1Id = new mongoose.Types.ObjectId().toString();
    worker2Id = new mongoose.Types.ObjectId().toString();

    managerToken = generateToken(managerId, 'event_manager');
    worker1Token = generateToken(worker1Id, 'worker');
    worker2Token = generateToken(worker2Id, 'worker');
  });

  after(async () => {
    await closeSocketServer();
    await notificationTransport.close();
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  });

  beforeEach(async () => {
    await Notification.deleteMany({});
    await User.deleteMany({});
    await Event.deleteMany({});
    await WorkRequirement.deleteMany({});
    await WorkResponse.deleteMany({});
    await WorkerLocationHistory.deleteMany({});
  });

  // ───────────────────────────────────────────────────────────────────────────
  // PART 1: Notification Model, Storage, & Deduplication
  // ───────────────────────────────────────────────────────────────────────────
  describe('Part 1: Persistent Storage & Deduplication', () => {
    it('1. Successfully persists a notification with correct fields and unread state', async () => {
      const notif = await notificationService.createNotification({
        recipientId: worker1Id,
        type: 'work_opportunity',
        title: 'New catering opportunity',
        message: 'A new requirement matching your skills has been announced.',
        resourceType: 'work_requirement',
        resourceId: new mongoose.Types.ObjectId().toString(),
        destinationRoute: '/worker',
        deduplicationKey: `dedup_${worker1Id}_1`,
      });

      assert.ok(notif);
      assert.strictEqual(notif.recipientId.toString(), worker1Id);
      assert.strictEqual(notif.isRead, false);
      assert.strictEqual(notif.title, 'New catering opportunity');
      assert.strictEqual(notif.destinationRoute, '/worker');

      const found = await Notification.findById(notif._id);
      assert.ok(found);
      assert.strictEqual(found?.isRead, false);
    });

    it('2. Enforces deduplication key to prevent duplicate records', async () => {
      const key = `dedup_unique_key_${Date.now()}`;

      const first = await notificationService.createNotification({
        recipientId: worker1Id,
        type: 'assignment_confirmed',
        title: 'Assignment Confirmed',
        message: 'First attempt',
        deduplicationKey: key,
      });

      const second = await notificationService.createNotification({
        recipientId: worker1Id,
        type: 'assignment_confirmed',
        title: 'Assignment Confirmed (retry)',
        message: 'Second attempt with identical deduplicationKey',
        deduplicationKey: key,
      });

      assert.ok(first);
      assert.ok(second);
      assert.strictEqual(first._id.toString(), second._id.toString());

      const count = await Notification.countDocuments({ deduplicationKey: key });
      assert.strictEqual(count, 1);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // PART 2: Authenticated Notification REST APIs
  // ───────────────────────────────────────────────────────────────────────────
  describe('Part 2: Notification REST APIs', () => {
    it('1. GET /api/notifications requires authentication', async () => {
      const res = await request(app).get('/api/notifications');
      assert.strictEqual(res.status, 401);
    });

    it('2. GET /api/notifications returns paginated results and unreadCount newest-first', async () => {
      // Create 3 notifications for worker 1 with distinct timestamps
      await notificationService.createNotification({
        recipientId: worker1Id,
        type: 'general',
        title: 'Notice 1',
        message: 'First oldest message',
      });
      await new Promise((r) => setTimeout(r, 20));
      await notificationService.createNotification({
        recipientId: worker1Id,
        type: 'general',
        title: 'Notice 2',
        message: 'Second message',
      });
      await new Promise((r) => setTimeout(r, 20));
      await notificationService.createNotification({
        recipientId: worker1Id,
        type: 'general',
        title: 'Notice 3',
        message: 'Third newest message',
      });

      // Also create a notification for worker 2
      await notificationService.createNotification({
        recipientId: worker2Id,
        type: 'general',
        title: 'Worker 2 Notice',
        message: 'Should not leak to Worker 1',
      });

      const res = await request(app)
        .get('/api/notifications?page=1&limit=2')
        .set('Authorization', `Bearer ${worker1Token}`);

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.data.notifications.length, 2);
      assert.strictEqual(res.body.data.unreadCount, 3);
      assert.strictEqual(res.body.data.pagination.total, 3);
      assert.strictEqual(res.body.data.pagination.totalPages, 2);

      // Verify newest first: Notice 3, then Notice 2
      assert.strictEqual(res.body.data.notifications[0].title, 'Notice 3');
      assert.strictEqual(res.body.data.notifications[1].title, 'Notice 2');
    });

    it('3. PATCH /api/notifications/:id/read marks notification as read and enforces recipient ownership', async () => {
      const notif = await notificationService.createNotification({
        recipientId: worker1Id,
        type: 'work_opportunity',
        title: 'Opportunity',
        message: 'Check this out',
      });

      // Worker 2 attempts to mark Worker 1's notification as read -> must fail (404)
      const attackerRes = await request(app)
        .patch(`/api/notifications/${notif!._id}/read`)
        .set('Authorization', `Bearer ${worker2Token}`);
      assert.strictEqual(attackerRes.status, 404);

      // Verify still unread
      const verifyDoc = await Notification.findById(notif!._id);
      assert.strictEqual(verifyDoc?.isRead, false);

      // Legitimate recipient marks as read
      const legitRes = await request(app)
        .patch(`/api/notifications/${notif!._id}/read`)
        .set('Authorization', `Bearer ${worker1Token}`);

      assert.strictEqual(legitRes.status, 200);
      assert.strictEqual(legitRes.body.data.isRead, true);
      assert.ok(legitRes.body.data.readAt);
    });

    it('4. PATCH /api/notifications/read-all marks all unread notifications of caller as read', async () => {
      await notificationService.createNotification({
        recipientId: worker1Id,
        type: 'general',
        title: 'W1 Msg 1',
        message: 'Text',
      });
      await notificationService.createNotification({
        recipientId: worker1Id,
        type: 'general',
        title: 'W1 Msg 2',
        message: 'Text',
      });
      await notificationService.createNotification({
        recipientId: worker2Id,
        type: 'general',
        title: 'W2 Msg 1',
        message: 'Text',
      });

      const res = await request(app)
        .patch('/api/notifications/read-all')
        .set('Authorization', `Bearer ${worker1Token}`);

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.data.modifiedCount, 2);

      // Worker 1 unread count is 0
      const w1Unread = await notificationService.getUnreadCount(worker1Id);
      assert.strictEqual(w1Unread, 0);

      // Worker 2 notification remains unread
      const w2Unread = await notificationService.getUnreadCount(worker2Id);
      assert.strictEqual(w2Unread, 1);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // PART 3: Socket.IO Authentication & User Isolation
  // ───────────────────────────────────────────────────────────────────────────
  describe('Part 3: Socket.IO Real-time Delivery & User Isolation', () => {
    it('1. Rejects socket connection without token or with invalid token', async () => {
      let errorReceived: any = null;

      await new Promise<void>((resolve) => {
        const client = ClientSocket(socketUrl, {
          auth: { token: 'invalid_token_xyz' },
          transports: ['websocket'],
          reconnection: false,
        });

        client.on('connect_error', (err) => {
          errorReceived = err.message;
          client.disconnect();
          resolve();
        });

        client.on('connect', () => {
          client.disconnect();
          resolve();
        });
      });

      assert.ok(errorReceived && errorReceived.includes('Authentication error'));
    });

    it('2. Connects with valid token and receives real-time notification isolated to own room', async () => {
      let client1: ClientSocketType | null = null;
      let client2: ClientSocketType | null = null;

      const receivedByWorker1: any[] = [];
      const receivedByWorker2: any[] = [];

      // Connect Worker 1 client
      await new Promise<void>((resolve) => {
        client1 = ClientSocket(socketUrl, {
          auth: { token: worker1Token },
          transports: ['websocket'],
        });
        client1.on('connect', () => resolve());
        client1.on('notification', (payload) => {
          receivedByWorker1.push(payload);
        });
      });

      // Connect Worker 2 client
      await new Promise<void>((resolve) => {
        client2 = ClientSocket(socketUrl, {
          auth: { token: worker2Token },
          transports: ['websocket'],
        });
        client2.on('connect', () => resolve());
        client2.on('notification', (payload) => {
          receivedByWorker2.push(payload);
        });
      });

      // Send notification targeted only to Worker 1
      await notificationService.createNotification({
        recipientId: worker1Id,
        type: 'work_opportunity',
        title: 'Exclusive for Worker 1',
        message: 'This message must not reach Worker 2',
      });

      // Wait a moment for socket event dispatch
      await new Promise((r) => setTimeout(r, 100));

      assert.strictEqual(receivedByWorker1.length, 1);
      assert.strictEqual(receivedByWorker1[0].title, 'Exclusive for Worker 1');

      // Worker 2 must have received ZERO notifications
      assert.strictEqual(receivedByWorker2.length, 0);

      client1?.disconnect();
      client2?.disconnect();
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // PART 4: Business Workflow A — Work Requirement Opportunity Announcements
  // ───────────────────────────────────────────────────────────────────────────
  describe('Part 4: Work Requirement Opportunity Announcements', () => {
    it('1. Generates announcements only after transitioning to open, notifying genuinely eligible workers only', async () => {
      // Event venue in Kochi (9.9312, 76.2673)
      const eventDate = new Date(Date.now() + 86400000 * 5);
      const event = await Event.create({
        title: 'Grand Tech Expo 2026',
        eventType: 'Corporate',
        date: eventDate,
        startTime: '10:00',
        endTime: '18:00',
        guestCount: 500,
        status: 'confirmed',
        clientId: new mongoose.Types.ObjectId(),
        eventManagerId: new mongoose.Types.ObjectId(managerId),
        location: {
          address: 'Kochi Convention Centre',
          lat: 9.9312,
          lng: 76.2673,
        },
      });

      // Eligible Worker: Catering Boy, 2 km away (9.9400, 76.2750), active, confirmed location
      const eligibleWorker = await User.create({
        name: 'Rahim Worker',
        email: 'rahim@eventops.com',
        role: 'worker',
        workerType: 'Catering Boy',
        isActive: true,
        location: {
          address: 'Marine Drive, Kochi',
          lat: 9.9400,
          lng: 76.2750,
          confirmedAt: new Date(),
        },
      });
      // Stash location history version for publication cutoff
      await WorkerLocationHistory.create({
        workerId: eligibleWorker._id,
        address: 'Marine Drive, Kochi',
        lat: 9.9400,
        lng: 76.2750,
        effectiveFrom: new Date(Date.now() - 3600000),
        versionId: 'v1_rahim',
      });

      // Ineligible Worker A: Wrong workerType ('Chef' instead of 'Catering Boy')
      const wrongTypeWorker = await User.create({
        name: 'Chef Anil',
        email: 'anil@eventops.com',
        role: 'worker',
        workerType: 'Chef',
        isActive: true,
        location: {
          address: 'Kochi',
          lat: 9.9400,
          lng: 76.2750,
          confirmedAt: new Date(),
        },
      });

      // Ineligible Worker B: Distant worker (180 km away in Trivandrum)
      const farWorker = await User.create({
        name: 'Far Worker',
        email: 'far@eventops.com',
        role: 'worker',
        workerType: 'Catering Boy',
        isActive: true,
        location: {
          address: 'Trivandrum',
          lat: 8.5241,
          lng: 76.9366,
          confirmedAt: new Date(),
        },
      });

      // Create draft requirement
      const draftReq = await workRequirementService.createRequirement(managerId, event._id.toString(), {
        workerType: 'Catering Boy' as any,
        requiredCount: 2,
        reportingTime: '09:00',
        maxDistanceKm: 15,
        interestDeadlineAt: new Date(Date.now() + 86400000 * 2),
      });

      assert.strictEqual(draftReq.status, 'draft');

      // Verify NO notifications generated while draft
      let notifs = await Notification.find({ resourceId: draftReq._id.toString() });
      assert.strictEqual(notifs.length, 0);

      // Transition requirement to open
      const openedReq = await workRequirementService.updateRequirement(managerId, draftReq._id.toString(), {
        status: 'open',
      });
      assert.strictEqual(openedReq.status, 'open');

      // Allow background announcement generation
      await new Promise((r) => setTimeout(r, 200));

      notifs = await Notification.find({ resourceId: draftReq._id.toString() });

      // Exactly ONE notification created: for Rahim Worker
      assert.strictEqual(notifs.length, 1);
      assert.strictEqual(notifs[0].recipientId.toString(), eligibleWorker._id.toString());
      assert.strictEqual(notifs[0].type, 'work_opportunity');
      assert.strictEqual(notifs[0].destinationRoute, '/worker');
      assert.ok(notifs[0].title.includes('opportunity'));

      // Check wrong type and distant workers received nothing
      const wrongTypeNotifs = await Notification.find({ recipientId: wrongTypeWorker._id });
      assert.strictEqual(wrongTypeNotifs.length, 0);

      const farNotifs = await Notification.find({ recipientId: farWorker._id });
      assert.strictEqual(farNotifs.length, 0);
    });

    it('2. Repeated update does not trigger duplicate announcements (idempotency)', async () => {
      const eventDate = new Date(Date.now() + 86400000 * 5);
      const event = await Event.create({
        title: 'Expo 2026',
        eventType: 'Corporate',
        date: eventDate,
        startTime: '10:00',
        endTime: '18:00',
        guestCount: 200,
        status: 'confirmed',
        clientId: new mongoose.Types.ObjectId(),
        eventManagerId: new mongoose.Types.ObjectId(managerId),
        location: { address: 'Venue', lat: 9.9312, lng: 76.2673 },
      });

      const worker = await User.create({
        name: 'Worker Near',
        email: 'near@eventops.com',
        role: 'worker',
        workerType: 'Host',
        isActive: true,
        location: { address: 'Near Venue', lat: 9.932, lng: 76.268, confirmedAt: new Date() },
      });
      await WorkerLocationHistory.create({
        workerId: worker._id,
        address: 'Near Venue',
        lat: 9.932,
        lng: 76.268,
        effectiveFrom: new Date(Date.now() - 3600000),
        versionId: 'v1_host',
      });

      const draftReq = await workRequirementService.createRequirement(managerId, event._id.toString(), {
        workerType: 'Host' as any,
        requiredCount: 1,
        reportingTime: '10:00',
        maxDistanceKm: 10,
        interestDeadlineAt: new Date(Date.now() + 86400000 * 2),
      });

      // First open transition
      await workRequirementService.updateRequirement(managerId, draftReq._id.toString(), {
        status: 'open',
      });
      await new Promise((r) => setTimeout(r, 150));

      const count1 = await Notification.countDocuments({ recipientId: worker._id });
      assert.strictEqual(count1, 1);

      // Attempt repeated update (e.g. updating description without status change)
      await workRequirementService.updateRequirement(managerId, draftReq._id.toString(), {
        description: 'Updated event description',
      }).catch(() => {}); // might be rejected if non-draft edits blocked
      await new Promise((r) => setTimeout(r, 150));

      const count2 = await Notification.countDocuments({ recipientId: worker._id });
      assert.strictEqual(count2, 1);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // PART 5: Business Workflow B — Assignment Selection & Manager Summary
  // ───────────────────────────────────────────────────────────────────────────
  describe('Part 5: Worker Selection & Assignment Confirmation', () => {
    it('1. Creates assignment confirmation for selected worker and summary for Event Manager', async () => {
      const eventDate = new Date(Date.now() + 86400000 * 4);
      const event = await Event.create({
        title: 'Festival 2026',
        eventType: 'Wedding',
        date: eventDate,
        startTime: '10:00',
        endTime: '18:00',
        guestCount: 200,
        status: 'confirmed',
        clientId: new mongoose.Types.ObjectId(),
        eventManagerId: new mongoose.Types.ObjectId(managerId),
        location: { address: 'Main Arena', lat: 9.9312, lng: 76.2673 },
      });

      const selectedWorker = await User.create({
        name: 'Selected Chef',
        email: 'sel.chef@eventops.com',
        role: 'worker',
        workerType: 'Chef',
        isActive: true,
        location: { address: 'Arena Road', lat: 9.935, lng: 76.27, confirmedAt: new Date() },
      });
      await WorkerLocationHistory.create({
        workerId: selectedWorker._id,
        address: 'Arena Road',
        lat: 9.935,
        lng: 76.27,
        effectiveFrom: new Date(Date.now() - 86400000),
        versionId: 'v1_chef',
      });

      const req = await WorkRequirement.create({
        eventId: event._id,
        workerType: 'Chef',
        requiredCount: 2,
        reportingTime: '11:00',
        maxDistanceKm: 20,
        status: 'open',
        selectionRound: 1,
        interestDeadlineAt: new Date(Date.now() - 1000), // deadline expired
        interestPublishedAt: new Date(Date.now() - 7200000),
        assignedWorkers: [],
      });

      // Submit interest response
      await WorkResponse.create({
        requirementId: req._id,
        workerId: selectedWorker._id,
        eventId: event._id,
        responseStatus: 'interested',
        respondedAt: new Date(),
        locationSnapshot: {
          lat: 9.935,
          lng: 76.27,
          distanceKm: 0.5,
          versionId: 'v1_chef',
        },
      });

      // Run selection
      const result = await workerSelectionService.executeSelection(req._id.toString(), 1);

      assert.strictEqual(result.newlySelectedCount, 1);
      assert.strictEqual(result.remainingCount, 1); // 1 remaining of 2 required

      await new Promise((r) => setTimeout(r, 150));

      // 1. Selected Worker received assignment confirmed notification
      const workerNotifs = await Notification.find({ recipientId: selectedWorker._id });
      assert.strictEqual(workerNotifs.length, 1);
      assert.strictEqual(workerNotifs[0].type, 'assignment_confirmed');
      assert.strictEqual(workerNotifs[0].title, 'Assignment confirmed');
      assert.strictEqual(workerNotifs[0].destinationRoute, '/worker');
      assert.ok(workerNotifs[0].message.includes('Festival 2026'));

      // 2. Event Manager received worker selection summary notification
      const managerNotifs = await Notification.find({ recipientId: managerId });
      assert.strictEqual(managerNotifs.length, 1);
      assert.strictEqual(managerNotifs[0].type, 'selection_summary');
      assert.strictEqual(managerNotifs[0].title, 'Worker selection complete');
      assert.ok(managerNotifs[0].message.includes('1 assigned, 1 position(s) remain unfilled'));
      assert.strictEqual(managerNotifs[0].destinationRoute, `/manager/events/${event._id.toString()}`);
    });
  });
});
