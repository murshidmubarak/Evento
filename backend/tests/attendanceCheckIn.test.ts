import './setup.js';
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import app from '../src/app.js';
import { connectDB } from '../src/config/db.js';
import { env } from '../src/config/env.js';
import { User } from '../src/modules/auth/model/user.model.js';
import { Event } from '../src/modules/events/model/event.model.js';
import { WorkRequirement } from '../src/modules/work-requirements/model/work-requirement.model.js';
import { AttendanceSession } from '../src/modules/attendance/model/attendance-session.model.js';
import { Attendance } from '../src/modules/attendance/model/attendance.model.js';

describe('Milestone 4 — Phase 4.2: Exception-Based Check-in Backend Services & APIs', () => {
  let server: any;
  let port: number;

  let adminToken: string;
  let adminId: string;

  let managerAToken: string;
  let managerAId: string;

  let managerBToken: string;
  let managerBId: string;

  let clientToken: string;
  let clientId: string;

  let workerToken: string;
  let workerId: string;

  let eventAId: string;
  let eventBId: string;
  let eventCancelledId: string;
  let eventFutureId: string;

  let worker1Id: string;
  let worker2Id: string;
  let worker3Id: string;
  let worker4Id: string;

  let reqCateringId: string;
  let reqPhotoId: string;

  const generateToken = (userId: string, role: string) => {
    return jwt.sign({ userId, role }, env.jwtSecret, { expiresIn: '1h' });
  };

  before(async () => {
    await connectDB();
    server = app.listen(0);
    port = (server.address() as any).port;

    // Clean test database
    await User.deleteMany({});
    await Event.deleteMany({});
    await WorkRequirement.deleteMany({});
    await AttendanceSession.deleteMany({});
    await Attendance.deleteMany({});

    // 1. Create Identities
    adminId = new mongoose.Types.ObjectId().toString();
    await User.create({
      _id: adminId,
      name: 'Test Admin',
      email: 'admin_att@example.com',
      password: 'password123',
      role: 'admin',
      isActive: true,
    });
    adminToken = generateToken(adminId, 'admin');

    managerAId = new mongoose.Types.ObjectId().toString();
    await User.create({
      _id: managerAId,
      name: 'Manager Alice',
      email: 'alice_att@example.com',
      password: 'password123',
      role: 'event_manager',
      isActive: true,
    });
    managerAToken = generateToken(managerAId, 'event_manager');

    managerBId = new mongoose.Types.ObjectId().toString();
    await User.create({
      _id: managerBId,
      name: 'Manager Bob',
      email: 'bob_att@example.com',
      password: 'password123',
      role: 'event_manager',
      isActive: true,
    });
    managerBToken = generateToken(managerBId, 'event_manager');

    clientId = new mongoose.Types.ObjectId().toString();
    await User.create({
      _id: clientId,
      name: 'Test Client',
      email: 'client_att@example.com',
      password: 'password123',
      role: 'client',
      isActive: true,
    });
    clientToken = generateToken(clientId, 'client');

    workerId = new mongoose.Types.ObjectId().toString();
    await User.create({
      _id: workerId,
      name: 'Test Worker',
      email: 'worker_att@example.com',
      password: 'password123',
      role: 'worker',
      isActive: true,
    });
    workerToken = generateToken(workerId, 'worker');

    // 2. Create Assigned Workers
    worker1Id = new mongoose.Types.ObjectId().toString();
    await User.create({
      _id: worker1Id,
      name: 'Worker One (On Time)',
      email: 'w1@example.com',
      password: 'password123',
      role: 'worker',
      businessId: 'WRK-001',
      isActive: true,
    });

    worker2Id = new mongoose.Types.ObjectId().toString();
    await User.create({
      _id: worker2Id,
      name: 'Worker Two (Late)',
      email: 'w2@example.com',
      password: 'password123',
      role: 'worker',
      businessId: 'WRK-002',
      isActive: true,
    });

    worker3Id = new mongoose.Types.ObjectId().toString();
    await User.create({
      _id: worker3Id,
      name: 'Worker Three (Absent)',
      email: 'w3@example.com',
      password: 'password123',
      role: 'worker',
      businessId: 'WRK-003',
      isActive: true,
    });

    worker4Id = new mongoose.Types.ObjectId().toString();
    await User.create({
      _id: worker4Id,
      name: 'Worker Four (On Time)',
      email: 'w4@example.com',
      password: 'password123',
      role: 'worker',
      businessId: 'WRK-004',
      isActive: true,
    });

    // 3. Create Events
    // Event A: Started earlier today (timing guard passes)
    const earlierToday = new Date(Date.now() - 4 * 60 * 60 * 1000); // 4 hours ago
    const eA = await Event.create({
      clientId,
      eventManagerId: managerAId,
      title: 'Grand Gala Wedding',
      eventType: 'Wedding',
      date: earlierToday,
      startTime: '08:00',
      endTime: '20:00',
      location: { address: 'Convention Hall, City' },
      guestCount: 200,
      status: 'confirmed',
    });
    eventAId = eA._id.toString();

    // Event B: Assigned to Manager B
    const eB = await Event.create({
      clientId,
      eventManagerId: managerBId,
      title: 'Corporate Summit',
      eventType: 'Corporate',
      date: earlierToday,
      startTime: '09:00',
      endTime: '17:00',
      location: { address: 'Tech Park' },
      guestCount: 50,
      status: 'confirmed',
    });
    eventBId = eB._id.toString();

    // Cancelled Event
    const eCancelled = await Event.create({
      clientId,
      eventManagerId: managerAId,
      title: 'Cancelled Birthday Party',
      eventType: 'Birthday',
      date: earlierToday,
      startTime: '10:00',
      endTime: '14:00',
      location: { address: 'City Club' },
      guestCount: 30,
      status: 'cancelled',
    });
    eventCancelledId = eCancelled._id.toString();

    // Future Event: Starts tomorrow (timing guard blocks finalization)
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const eFuture = await Event.create({
      clientId,
      eventManagerId: managerAId,
      title: 'Future Engagement Ceremony',
      eventType: 'Engagement',
      date: tomorrow,
      startTime: '10:00',
      endTime: '16:00',
      location: { address: 'Palace Hall' },
      guestCount: 150,
      status: 'confirmed',
    });
    eventFutureId = eFuture._id.toString();

    // 4. Create Work Requirements with assigned workers
    // Requirement 1: Catering (reportingTime 08:00 AM, 12h format)
    const rCatering = await WorkRequirement.create({
      eventId: eventAId,
      workerType: 'Catering Boy',
      requiredCount: 3,
      reportingTime: '08:00 AM',
      status: 'filled',
      assignedWorkers: [
        { workerId: new mongoose.Types.ObjectId(worker1Id), assignedAt: new Date() },
        { workerId: new mongoose.Types.ObjectId(worker2Id), assignedAt: new Date() },
        { workerId: new mongoose.Types.ObjectId(worker3Id), assignedAt: new Date() },
      ],
    });
    reqCateringId = rCatering._id.toString();

    // Requirement 2: Photography (reportingTime 09:30, 24h format)
    const rPhoto = await WorkRequirement.create({
      eventId: eventAId,
      workerType: 'Cameraman / Photographer',
      requiredCount: 1,
      reportingTime: '09:30',
      status: 'filled',
      assignedWorkers: [
        { workerId: new mongoose.Types.ObjectId(worker4Id), assignedAt: new Date() },
      ],
    });
    reqPhotoId = rPhoto._id.toString();

    // Future requirement for future event
    await WorkRequirement.create({
      eventId: eventFutureId,
      workerType: 'Catering Boy',
      requiredCount: 1,
      reportingTime: '10:00 AM',
      status: 'filled',
      assignedWorkers: [
        { workerId: new mongoose.Types.ObjectId(worker1Id), assignedAt: new Date() },
      ],
    });
  });

  after(async () => {
    await User.deleteMany({});
    await Event.deleteMany({});
    await WorkRequirement.deleteMany({});
    await AttendanceSession.deleteMany({});
    await Attendance.deleteMany({});
    server.close();
    await mongoose.disconnect();
  });

  beforeEach(async () => {
    await AttendanceSession.deleteMany({});
    await Attendance.deleteMany({});
  });

  // ---------------------------------------------------------------------------
  // 1. Authentication & Authorization Tests
  // ---------------------------------------------------------------------------
  describe('Authentication & Authorization', () => {
    it('returns 401 Unauthorized when Authorization header is missing', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/api/attendance/events/${eventAId}/session`);
      assert.strictEqual(res.status, 401);
      const data = (await res.json()) as any;
      assert.strictEqual(data.success, false);
      assert.ok(data.message.includes('missing'));
    });

    it('returns 403 Forbidden when Client attempts to access attendance', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/api/attendance/events/${eventAId}/session`, {
        headers: { Authorization: `Bearer ${clientToken}` },
      });
      assert.strictEqual(res.status, 403);
    });

    it('returns 403 Forbidden when Worker attempts to access attendance', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/api/attendance/events/${eventAId}/session`, {
        headers: { Authorization: `Bearer ${workerToken}` },
      });
      assert.strictEqual(res.status, 403);
    });

    it('returns 403 Forbidden when Event Manager attempts to access another manager’s event', async () => {
      // Manager B accessing Event A (assigned to Manager A)
      const res = await fetch(`http://127.0.0.1:${port}/api/attendance/events/${eventAId}/session`, {
        headers: { Authorization: `Bearer ${managerBToken}` },
      });
      assert.strictEqual(res.status, 403);
      const data = (await res.json()) as any;
      assert.ok(data.message.includes('do not have permission'));
    });

    it('allows assigned Event Manager to access their own event', async () => {
      // Manager A accessing Event A
      const res = await fetch(`http://127.0.0.1:${port}/api/attendance/events/${eventAId}/session`, {
        headers: { Authorization: `Bearer ${managerAToken}` },
      });
      assert.strictEqual(res.status, 200);
      const data = (await res.json()) as any;
      assert.strictEqual(data.success, true);
      assert.strictEqual(data.data.eventId, eventAId);
    });

    it('allows Admin to access any event attendance', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/api/attendance/events/${eventAId}/session`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      assert.strictEqual(res.status, 200);
      const data = (await res.json()) as any;
      assert.strictEqual(data.success, true);
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Session Initialization & Retrieval
  // ---------------------------------------------------------------------------
  describe('Attendance Session API (GET /api/attendance/events/:eventId/session)', () => {
    it('initializes session with checkin_in_progress on first call and retrieves existing on next', async () => {
      // First call initializes
      const res1 = await fetch(`http://127.0.0.1:${port}/api/attendance/events/${eventAId}/session`, {
        headers: { Authorization: `Bearer ${managerAToken}` },
      });
      assert.strictEqual(res1.status, 200);
      const data1 = (await res1.json()) as any;
      assert.strictEqual(data1.data.checkInFinalized, false);
      assert.strictEqual(data1.data.checkOutFinalized, false);
      assert.strictEqual(data1.data.lifecycleStatus, 'checkin_in_progress');

      // Second call returns same session
      const res2 = await fetch(`http://127.0.0.1:${port}/api/attendance/events/${eventAId}/session`, {
        headers: { Authorization: `Bearer ${managerAToken}` },
      });
      assert.strictEqual(res2.status, 200);
      const data2 = (await res2.json()) as any;
      assert.strictEqual(data2.data._id, data1.data._id);
    });

    it('handles concurrent session initialization requests safely', async () => {
      const calls = Array(4).fill(null).map(() =>
        fetch(`http://127.0.0.1:${port}/api/attendance/events/${eventAId}/session`, {
          headers: { Authorization: `Bearer ${managerAToken}` },
        }).then((r) => r.json() as Promise<any>)
      );

      const results = await Promise.all(calls);
      const firstId = results[0].data._id;
      for (const res of results) {
        assert.strictEqual(res.success, true);
        assert.strictEqual(res.data._id, firstId);
      }
    });

    it('returns 400 Bad Request for invalid event ID format', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/api/attendance/events/invalid-event-id/session`, {
        headers: { Authorization: `Bearer ${managerAToken}` },
      });
      assert.strictEqual(res.status, 400);
    });

    it('returns 404 Not Found for non-existent event', async () => {
      const nonExistentId = new mongoose.Types.ObjectId().toString();
      const res = await fetch(`http://127.0.0.1:${port}/api/attendance/events/${nonExistentId}/session`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      assert.strictEqual(res.status, 404);
    });

    it('returns 400 Bad Request when attempting attendance operations on cancelled event', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/api/attendance/events/${eventCancelledId}/session`, {
        headers: { Authorization: `Bearer ${managerAToken}` },
      });
      assert.strictEqual(res.status, 400);
      const data = (await res.json()) as any;
      assert.ok(data.message.includes('cancelled events'));
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Attendance Roster Retrieval
  // ---------------------------------------------------------------------------
  describe('Attendance Roster API (GET /api/attendance/events/:eventId/roster)', () => {
    it('retrieves complete assigned roster with accurate reporting times and defaults', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/api/attendance/events/${eventAId}/roster`, {
        headers: { Authorization: `Bearer ${managerAToken}` },
      });
      assert.strictEqual(res.status, 200);
      const data = (await res.json()) as any;

      assert.strictEqual(data.success, true);
      assert.strictEqual(data.data.eventId, eventAId);
      assert.strictEqual(data.data.totalAssigned, 4);
      assert.strictEqual(data.data.session.checkInFinalized, false);
      assert.strictEqual(data.data.canFinalizeCheckIn, true);

      // Verify all 4 workers are returned in the roster
      const roster = data.data.roster;
      assert.strictEqual(roster.length, 4);

      const w1 = roster.find((r: any) => r.workerId === worker1Id);
      assert.ok(w1);
      assert.strictEqual(w1.workerName, 'Worker One (On Time)');
      assert.strictEqual(w1.workerType, 'Catering Boy');
      assert.strictEqual(w1.reportingTime, '08:00 AM');
      assert.strictEqual(w1.status, 'not_started');
      assert.strictEqual(w1.arrivalStatus, 'unrecorded');
      assert.strictEqual(w1.checkIn, null);
      assert.strictEqual(w1.isAssigned, true);

      const w4 = roster.find((r: any) => r.workerId === worker4Id);
      assert.ok(w4);
      assert.strictEqual(w4.workerName, 'Worker Four (On Time)');
      assert.strictEqual(w4.workerType, 'Cameraman / Photographer');
      assert.strictEqual(w4.reportingTime, '09:30');
    });

    it('does not create Attendance records merely by loading the roster', async () => {
      await fetch(`http://127.0.0.1:${port}/api/attendance/events/${eventAId}/roster`, {
        headers: { Authorization: `Bearer ${managerAToken}` },
      });

      const count = await Attendance.countDocuments({ eventId: new mongoose.Types.ObjectId(eventAId) });
      assert.strictEqual(count, 0);
    });

    it('indicates canFinalizeCheckIn is false for future events where reporting time has not arrived', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/api/attendance/events/${eventFutureId}/roster`, {
        headers: { Authorization: `Bearer ${managerAToken}` },
      });
      assert.strictEqual(res.status, 200);
      const data = (await res.json()) as any;
      assert.strictEqual(data.data.canFinalizeCheckIn, false);
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Check-in Finalization & Validation
  // ---------------------------------------------------------------------------
  describe('Check-In Finalization API (POST /api/attendance/events/:eventId/finalize-checkin)', () => {
    it('rejects request when Idempotency-Key header is missing', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/api/attendance/events/${eventAId}/finalize-checkin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${managerAToken}`,
        },
        body: JSON.stringify({}),
      });
      assert.strictEqual(res.status, 400);
      const data = (await res.json()) as any;
      assert.ok(data.message.includes('Idempotency-Key'));
    });

    it('rejects worker ID not belonging to event roster in lateExceptions', async () => {
      const outsiderId = new mongoose.Types.ObjectId().toString();
      const res = await fetch(`http://127.0.0.1:${port}/api/attendance/events/${eventAId}/finalize-checkin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${managerAToken}`,
          'Idempotency-Key': 'key-wrong-worker',
        },
        body: JSON.stringify({
          lateExceptions: [{ workerId: outsiderId, actualArrivalTime: '08:45' }],
        }),
      });
      assert.strictEqual(res.status, 400);
      const data = (await res.json()) as any;
      assert.ok(data.message.includes('not in the assigned roster'));
    });

    it('rejects worker ID appearing in both lateExceptions and absentExceptions', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/api/attendance/events/${eventAId}/finalize-checkin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${managerAToken}`,
          'Idempotency-Key': 'key-overlap',
        },
        body: JSON.stringify({
          lateExceptions: [{ workerId: worker2Id, actualArrivalTime: '08:45' }],
          absentExceptions: [worker2Id],
        }),
      });
      assert.strictEqual(res.status, 400);
      const data = (await res.json()) as any;
      const hasError =
        data.message.includes('both late and absent') ||
        (data.error?.errors && data.error.errors.some((e: string) => e.includes('both late and absent')));
      assert.ok(hasError);
    });

    it('rejects late worker whose actual arrival time is earlier than or equal to reporting time', async () => {
      // Worker 2 reportingTime is 08:00 AM. Setting arrival time to 07:50 AM should be rejected.
      const res = await fetch(`http://127.0.0.1:${port}/api/attendance/events/${eventAId}/finalize-checkin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${managerAToken}`,
          'Idempotency-Key': 'key-not-late',
        },
        body: JSON.stringify({
          lateExceptions: [{ workerId: worker2Id, actualArrivalTime: '07:50 AM' }],
        }),
      });
      assert.strictEqual(res.status, 400);
      const data = (await res.json()) as any;
      assert.ok(data.message.includes('must be later than reporting time'));
    });

    it('enforces Timing Guard: rejects finalization when current time is earlier than latest reporting time', async () => {
      // eventFutureId starts tomorrow, so timing guard triggers
      const res = await fetch(`http://127.0.0.1:${port}/api/attendance/events/${eventFutureId}/finalize-checkin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${managerAToken}`,
          'Idempotency-Key': 'key-timing-guard',
        },
        body: JSON.stringify({}),
      });
      assert.strictEqual(res.status, 400);
      const data = (await res.json()) as any;
      assert.ok(data.message.includes('Cannot finalize check-in before the latest reporting time'));
    });

    it('successfully finalizes check-in with on-time defaults, late exception, and absent exception', async () => {
      const idempotencyKey = 'idemp_key_final_001';

      // 4 total workers:
      // Worker 2: Late (reporting: 08:00 AM, actual arrival: 08:35 AM -> delay 35 mins)
      // Worker 3: Absent
      // Worker 1: Default On-Time (08:00 AM)
      // Worker 4: Default On-Time (09:30 AM)
      const res = await fetch(`http://127.0.0.1:${port}/api/attendance/events/${eventAId}/finalize-checkin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${managerAToken}`,
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify({
          lateExceptions: [{ workerId: worker2Id, actualArrivalTime: '08:35 AM' }],
          absentExceptions: [worker3Id],
        }),
      });

      assert.strictEqual(res.status, 200);
      const data = (await res.json()) as any;
      assert.strictEqual(data.success, true);
      assert.strictEqual(data.data.totalProcessed, 4);
      assert.strictEqual(data.data.onTimeCount, 2);
      assert.strictEqual(data.data.lateCount, 1);
      assert.strictEqual(data.data.absentCount, 1);
      assert.strictEqual(data.data.checkInFinalized, true);

      // Verify Session Document in Database
      const session = await AttendanceSession.findOne({ eventId: new mongoose.Types.ObjectId(eventAId) });
      assert.ok(session);
      assert.strictEqual(session.checkInFinalized, true);
      assert.strictEqual(session.lifecycleStatus, 'checkin_finalized');
      assert.strictEqual(session.checkInIdempotency?.idempotencyKey, idempotencyKey);
      assert.ok(session.checkInIdempotency?.payloadHash);

      // Verify Attendance Documents in Database
      const attendances = await Attendance.find({ eventId: new mongoose.Types.ObjectId(eventAId) });
      assert.strictEqual(attendances.length, 4);

      // 1. Worker 2: Late
      const attLate = attendances.find((a) => a.workerId.toString() === worker2Id);
      assert.ok(attLate);
      assert.strictEqual(attLate.status, 'checked_in');
      assert.strictEqual(attLate.arrivalStatus, 'late');
      assert.strictEqual(attLate.checkInSource, 'manager_actual');
      assert.strictEqual(attLate.delayMinutes, 35);
      assert.ok(attLate.checkIn);
      assert.strictEqual(attLate.reportingTimeSnapshot, '08:00 AM');

      // 2. Worker 3: Absent
      const attAbsent = attendances.find((a) => a.workerId.toString() === worker3Id);
      assert.ok(attAbsent);
      assert.strictEqual(attAbsent.status, 'absent');
      assert.strictEqual(attAbsent.arrivalStatus, 'absent');
      assert.strictEqual(attAbsent.checkInSource, 'not_recorded');
      assert.ok(!attAbsent.checkIn);
      assert.strictEqual(attAbsent.delayMinutes, 0);

      // 3. Worker 1: Default On-Time
      const attOnTime1 = attendances.find((a) => a.workerId.toString() === worker1Id);
      assert.ok(attOnTime1);
      assert.strictEqual(attOnTime1.status, 'checked_in');
      assert.strictEqual(attOnTime1.arrivalStatus, 'on_time');
      assert.strictEqual(attOnTime1.checkInSource, 'system_default');
      assert.strictEqual(attOnTime1.delayMinutes, 0);
      assert.ok(attOnTime1.checkIn);

      // 4. Worker 4: Default On-Time (from Photography requirement, 09:30)
      const attOnTime4 = attendances.find((a) => a.workerId.toString() === worker4Id);
      assert.ok(attOnTime4);
      assert.strictEqual(attOnTime4.status, 'checked_in');
      assert.strictEqual(attOnTime4.arrivalStatus, 'on_time');
      assert.strictEqual(attOnTime4.checkInSource, 'system_default');
      assert.strictEqual(attOnTime4.reportingTimeSnapshot, '09:30');
    });
  });

  // ---------------------------------------------------------------------------
  // 5. Idempotency & Replay Safety Tests
  // ---------------------------------------------------------------------------
  describe('Idempotency & Replay Safety', () => {
    it('returns previously committed summary on replay with SAME key and SAME payload', async () => {
      const idempotencyKey = 'replay_test_key_100';

      const payload = {
        lateExceptions: [{ workerId: worker2Id, actualArrivalTime: '08:20 AM' }],
        absentExceptions: [worker3Id],
      };

      // 1. First execution
      const res1 = await fetch(`http://127.0.0.1:${port}/api/attendance/events/${eventAId}/finalize-checkin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${managerAToken}`,
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify(payload),
      });
      assert.strictEqual(res1.status, 200);
      const data1 = (await res1.json()) as any;

      // 2. Replay with identical key & payload (e.g. client network retry after lost connection)
      const res2 = await fetch(`http://127.0.0.1:${port}/api/attendance/events/${eventAId}/finalize-checkin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${managerAToken}`,
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify(payload),
      });
      assert.strictEqual(res2.status, 200);
      const data2 = (await res2.json()) as any;

      // Committed results must be identical
      assert.strictEqual(data2.data.totalProcessed, data1.data.totalProcessed);
      assert.strictEqual(data2.data.onTimeCount, data1.data.onTimeCount);
      assert.strictEqual(data2.data.lateCount, data1.data.lateCount);
      assert.strictEqual(data2.data.checkInFinalizedAt, data1.data.checkInFinalizedAt);

      // Verify no duplicate records created in MongoDB
      const count = await Attendance.countDocuments({ eventId: new mongoose.Types.ObjectId(eventAId) });
      assert.strictEqual(count, 4);
    });

    it('returns 409 Conflict on replay with SAME key but ALTERED payload', async () => {
      const idempotencyKey = 'replay_test_key_conflict';

      // 1. First execution
      await fetch(`http://127.0.0.1:${port}/api/attendance/events/${eventAId}/finalize-checkin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${managerAToken}`,
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify({
          lateExceptions: [{ workerId: worker2Id, actualArrivalTime: '08:25 AM' }],
        }),
      });

      // 2. Second execution with SAME key but different payload
      const resConflict = await fetch(`http://127.0.0.1:${port}/api/attendance/events/${eventAId}/finalize-checkin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${managerAToken}`,
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify({
          absentExceptions: [worker3Id],
        }),
      });
      assert.strictEqual(resConflict.status, 409);
      const data = (await resConflict.json()) as any;
      assert.ok(data.message.includes('Idempotency key collision') || data.message.includes('different payload'));
    });

    it('returns 409 Conflict when attempting to finalize check-in with a DIFFERENT key when already finalized', async () => {
      // 1. First finalization with key 1
      await fetch(`http://127.0.0.1:${port}/api/attendance/events/${eventAId}/finalize-checkin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${managerAToken}`,
          'Idempotency-Key': 'first_key_done',
        },
        body: JSON.stringify({}),
      });

      // 2. Second call with a new/different key
      const res = await fetch(`http://127.0.0.1:${port}/api/attendance/events/${eventAId}/finalize-checkin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${managerAToken}`,
          'Idempotency-Key': 'second_key_forbidden',
        },
        body: JSON.stringify({}),
      });

      assert.strictEqual(res.status, 409);
      const data = (await res.json()) as any;
      assert.ok(data.message.includes('already been finalized'));
    });
  });

  // ---------------------------------------------------------------------------
  // 6. Roster Reflection After Check-in Finalization
  // ---------------------------------------------------------------------------
  describe('Roster Reflection After Check-in Finalization', () => {
    it('roster reflects finalized attendance status, checkIn timestamps and delay minutes', async () => {
      // Finalize check-in
      await fetch(`http://127.0.0.1:${port}/api/attendance/events/${eventAId}/finalize-checkin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${managerAToken}`,
          'Idempotency-Key': 'roster_reflection_key',
        },
        body: JSON.stringify({
          lateExceptions: [{ workerId: worker2Id, actualArrivalTime: '08:40 AM' }],
          absentExceptions: [worker3Id],
        }),
      });

      // Fetch roster
      const res = await fetch(`http://127.0.0.1:${port}/api/attendance/events/${eventAId}/roster`, {
        headers: { Authorization: `Bearer ${managerAToken}` },
      });
      assert.strictEqual(res.status, 200);
      const data = (await res.json()) as any;

      assert.strictEqual(data.data.session.checkInFinalized, true);
      assert.strictEqual(data.data.canFinalizeCheckIn, false);

      const roster = data.data.roster;
      const w2 = roster.find((r: any) => r.workerId === worker2Id);
      assert.strictEqual(w2.status, 'checked_in');
      assert.strictEqual(w2.arrivalStatus, 'late');
      assert.strictEqual(w2.delayMinutes, 40);
      assert.strictEqual(w2.checkInSource, 'manager_actual');
      assert.ok(w2.checkIn);
      assert.ok(w2.attendanceId);

      const w3 = roster.find((r: any) => r.workerId === worker3Id);
      assert.strictEqual(w3.status, 'absent');
      assert.strictEqual(w3.arrivalStatus, 'absent');
      assert.strictEqual(w3.checkIn, null);

      const w1 = roster.find((r: any) => r.workerId === worker1Id);
      assert.strictEqual(w1.status, 'checked_in');
      assert.strictEqual(w1.arrivalStatus, 'on_time');
      assert.strictEqual(w1.delayMinutes, 0);
      assert.strictEqual(w1.checkInSource, 'system_default');
    });
  });
});
