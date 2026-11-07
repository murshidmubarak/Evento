import './setup.js';
import { describe, it, before, after } from 'node:test';
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
import { attendanceService } from '../src/modules/attendance/service/attendance.service.js';

describe('Milestone 4 — Phase 4.4: Exception-Based Checkout Backend Services & APIs', () => {
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
  let eventCheckInPendingId: string;
  let eventOvernightId: string;

  let worker1Id: string;
  let worker2Id: string;
  let worker3Id: string;
  let worker4Id: string;

  let reqCateringId: string;
  let reqPhotoId: string;

  let worker5Id: string;
  let worker6Id: string;
  let worker7Id: string;
  let reqOvernightId: string;

  const generateToken = (userId: string, role: string) => {
    return jwt.sign({ userId, role }, env.jwtSecret, { expiresIn: '1h' });
  };

  before(async () => {
    await connectDB();
    server = app.listen(0);
    port = (server.address() as any).port;

    // Clean test database (guaranteed isolated eventops_test by setup.ts)
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
      email: 'admin_checkout@example.com',
      password: 'password123',
      role: 'admin',
      isActive: true,
    });
    adminToken = generateToken(adminId, 'admin');

    managerAId = new mongoose.Types.ObjectId().toString();
    await User.create({
      _id: managerAId,
      name: 'Manager Alice',
      email: 'alice_checkout@example.com',
      password: 'password123',
      role: 'event_manager',
      isActive: true,
    });
    managerAToken = generateToken(managerAId, 'event_manager');

    managerBId = new mongoose.Types.ObjectId().toString();
    await User.create({
      _id: managerBId,
      name: 'Manager Bob',
      email: 'bob_checkout@example.com',
      password: 'password123',
      role: 'event_manager',
      isActive: true,
    });
    managerBToken = generateToken(managerBId, 'event_manager');

    clientId = new mongoose.Types.ObjectId().toString();
    await User.create({
      _id: clientId,
      name: 'Test Client',
      email: 'client_checkout@example.com',
      password: 'password123',
      role: 'client',
      isActive: true,
    });
    clientToken = generateToken(clientId, 'client');

    workerId = new mongoose.Types.ObjectId().toString();
    await User.create({
      _id: workerId,
      name: 'Test Worker',
      email: 'worker_checkout@example.com',
      password: 'password123',
      role: 'worker',
      isActive: true,
    });
    workerToken = generateToken(workerId, 'worker');

    // 2. Create Assigned Workers
    worker1Id = new mongoose.Types.ObjectId().toString();
    await User.create({
      _id: worker1Id,
      name: 'Worker 1 (Normal)',
      email: 'w1_checkout@example.com',
      password: 'password123',
      role: 'worker',
      businessId: 'WRK-101',
      isActive: true,
    });

    worker2Id = new mongoose.Types.ObjectId().toString();
    await User.create({
      _id: worker2Id,
      name: 'Worker 2 (Early Departure)',
      email: 'w2_checkout@example.com',
      password: 'password123',
      role: 'worker',
      businessId: 'WRK-102',
      isActive: true,
    });

    worker3Id = new mongoose.Types.ObjectId().toString();
    await User.create({
      _id: worker3Id,
      name: 'Worker 3 (Absent)',
      email: 'w3_checkout@example.com',
      password: 'password123',
      role: 'worker',
      businessId: 'WRK-103',
      isActive: true,
    });

    worker4Id = new mongoose.Types.ObjectId().toString();
    await User.create({
      _id: worker4Id,
      name: 'Worker 4 (Overtime)',
      email: 'w4_checkout@example.com',
      password: 'password123',
      role: 'worker',
      businessId: 'WRK-104',
      isActive: true,
    });

    // Overnight Workers
    worker5Id = new mongoose.Types.ObjectId().toString();
    await User.create({
      _id: worker5Id,
      name: 'Worker 5 (Overnight Normal)',
      email: 'w5_checkout@example.com',
      password: 'password123',
      role: 'worker',
      businessId: 'WRK-105',
      isActive: true,
    });

    worker6Id = new mongoose.Types.ObjectId().toString();
    await User.create({
      _id: worker6Id,
      name: 'Worker 6 (Overnight Early)',
      email: 'w6_checkout@example.com',
      password: 'password123',
      role: 'worker',
      businessId: 'WRK-106',
      isActive: true,
    });

    worker7Id = new mongoose.Types.ObjectId().toString();
    await User.create({
      _id: worker7Id,
      name: 'Worker 7 (Overnight Overtime)',
      email: 'w7_checkout@example.com',
      password: 'password123',
      role: 'worker',
      businessId: 'WRK-107',
      isActive: true,
    });

    // 3. Create Events (yesterday so all scheduled reporting times have arrived)
    const earlierToday = new Date(Date.now() - 24 * 60 * 60 * 1000);
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

    const eCheckInPending = await Event.create({
      clientId,
      eventManagerId: managerAId,
      title: 'Annual Award Ceremony',
      eventType: 'Corporate',
      date: earlierToday,
      startTime: '08:00',
      endTime: '18:00',
      location: { address: 'Auditorium' },
      guestCount: 100,
      status: 'confirmed',
    });
    eventCheckInPendingId = eCheckInPending._id.toString();

    const eOvernight = await Event.create({
      clientId,
      eventManagerId: managerAId,
      title: 'Late Night Musical Concert',
      eventType: 'Reception',
      date: earlierToday,
      startTime: '18:00',
      endTime: '02:00',
      location: { address: 'Arena' },
      guestCount: 500,
      status: 'confirmed',
    });
    eventOvernightId = eOvernight._id.toString();

    // 4. Create Work Requirements
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

    const rOvernight = await WorkRequirement.create({
      eventId: eventOvernightId,
      workerType: 'Catering Boy',
      requiredCount: 3,
      reportingTime: '18:00',
      status: 'filled',
      assignedWorkers: [
        { workerId: new mongoose.Types.ObjectId(worker5Id), assignedAt: new Date() },
        { workerId: new mongoose.Types.ObjectId(worker6Id), assignedAt: new Date() },
        { workerId: new mongoose.Types.ObjectId(worker7Id), assignedAt: new Date() },
      ],
    });
    reqOvernightId = rOvernight._id.toString();

    // 5. Finalize Check-in on Event A (Worker 1 on-time, Worker 2 late 08:40 AM, Worker 3 absent, Worker 4 on-time)
    await attendanceService.finalizeCheckIn(managerAId, 'event_manager', eventAId, 'setup_checkin_event_a', {
      lateExceptions: [{ workerId: worker2Id, actualArrivalTime: '08:40 AM' }],
      absentExceptions: [worker3Id],
    });

    // 6. Finalize Check-in on Event Overnight (All on-time)
    await attendanceService.finalizeCheckIn(managerAId, 'event_manager', eventOvernightId, 'setup_checkin_overnight', {});
  });

  // ---------------------------------------------------------------------------
  // 1. Authentication & Role Authorization
  // ---------------------------------------------------------------------------
  describe('Authentication & Authorization (POST /api/attendance/events/:eventId/finalize-checkout)', () => {
    it('rejects unauthenticated requests with 401', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/api/attendance/events/${eventAId}/finalize-checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'key_auth_1' },
        body: JSON.stringify({ actualNormalFinishTime: '17:00' }),
      });
      assert.strictEqual(res.status, 401);
    });

    it('rejects client role with 403', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/api/attendance/events/${eventAId}/finalize-checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${clientToken}`,
          'Idempotency-Key': 'key_auth_2',
        },
        body: JSON.stringify({ actualNormalFinishTime: '17:00' }),
      });
      assert.strictEqual(res.status, 403);
    });

    it('rejects worker role with 403', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/api/attendance/events/${eventAId}/finalize-checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${workerToken}`,
          'Idempotency-Key': 'key_auth_3',
        },
        body: JSON.stringify({ actualNormalFinishTime: '17:00' }),
      });
      assert.strictEqual(res.status, 403);
    });

    it('rejects event manager attempting to finalize checkout on an event assigned to another manager', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/api/attendance/events/${eventAId}/finalize-checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${managerBToken}`,
          'Idempotency-Key': 'key_auth_4',
        },
        body: JSON.stringify({ actualNormalFinishTime: '17:00' }),
      });
      assert.strictEqual(res.status, 403);
      const data = (await res.json()) as any;
      assert.match(data.message, /permission/i);
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Lifecycle Preconditions
  // ---------------------------------------------------------------------------
  describe('Lifecycle Preconditions', () => {
    it('rejects checkout on cancelled events', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/api/attendance/events/${eventCancelledId}/finalize-checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${managerAToken}`,
          'Idempotency-Key': 'key_prec_1',
        },
        body: JSON.stringify({ actualNormalFinishTime: '17:00' }),
      });
      assert.strictEqual(res.status, 400);
      const data = (await res.json()) as any;
      assert.match(data.message, /cancelled/i);
    });

    it('rejects checkout if check-in has not yet been finalized', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/api/attendance/events/${eventCheckInPendingId}/finalize-checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${managerAToken}`,
          'Idempotency-Key': 'key_prec_2',
        },
        body: JSON.stringify({ actualNormalFinishTime: '17:00' }),
      });
      assert.strictEqual(res.status, 400);
      const data = (await res.json()) as any;
      assert.match(data.message, /check-in has been finalized/i);
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Payload & Finishing-Time Validation
  // ---------------------------------------------------------------------------
  describe('Payload & Finishing-Time Validation', () => {
    it('rejects missing actualNormalFinishTime', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/api/attendance/events/${eventAId}/finalize-checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${managerAToken}`,
          'Idempotency-Key': 'key_val_1',
        },
        body: JSON.stringify({}),
      });
      assert.strictEqual(res.status, 400);
    });

    it('rejects invalid actualNormalFinishTime format', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/api/attendance/events/${eventAId}/finalize-checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${managerAToken}`,
          'Idempotency-Key': 'key_val_2',
        },
        body: JSON.stringify({ actualNormalFinishTime: 'invalid-time' }),
      });
      assert.strictEqual(res.status, 400);
    });

    it('rejects requirement override for requirementId not belonging to the event', async () => {
      const foreignReqId = new mongoose.Types.ObjectId().toString();
      const res = await fetch(`http://127.0.0.1:${port}/api/attendance/events/${eventAId}/finalize-checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${managerAToken}`,
          'Idempotency-Key': 'key_val_3',
        },
        body: JSON.stringify({
          actualNormalFinishTime: '17:00',
          requirementFinishOverrides: [{ requirementId: foreignReqId, normalFinishTime: '18:00' }],
        }),
      });
      assert.strictEqual(res.status, 400);
      const data = (await res.json()) as any;
      assert.match(data.message, /does not belong to this event/i);
    });

    it('rejects duplicate requirementId in requirementFinishOverrides', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/api/attendance/events/${eventAId}/finalize-checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${managerAToken}`,
          'Idempotency-Key': 'key_val_4',
        },
        body: JSON.stringify({
          actualNormalFinishTime: '17:00',
          requirementFinishOverrides: [
            { requirementId: reqCateringId, normalFinishTime: '18:00' },
            { requirementId: reqCateringId, normalFinishTime: '19:00' },
          ],
        }),
      });
      assert.strictEqual(res.status, 400);
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Exceptions Validation
  // ---------------------------------------------------------------------------
  describe('Exceptions Validation', () => {
    it('rejects worker in earlyDepartureExceptions who was marked absent', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/api/attendance/events/${eventAId}/finalize-checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${managerAToken}`,
          'Idempotency-Key': 'key_exc_1',
        },
        body: JSON.stringify({
          actualNormalFinishTime: '17:00',
          earlyDepartureExceptions: [{ workerId: worker3Id, actualCheckoutTime: '15:00' }],
        }),
      });
      assert.strictEqual(res.status, 400);
      const data = (await res.json()) as any;
      assert.match(data.message, /marked absent/i);
    });

    it('rejects worker in overtimeExceptions who was marked absent', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/api/attendance/events/${eventAId}/finalize-checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${managerAToken}`,
          'Idempotency-Key': 'key_exc_2',
        },
        body: JSON.stringify({
          actualNormalFinishTime: '17:00',
          overtimeExceptions: [{ workerId: worker3Id, actualCheckoutTime: '19:00' }],
        }),
      });
      assert.strictEqual(res.status, 400);
      const data = (await res.json()) as any;
      assert.match(data.message, /marked absent/i);
    });

    it('rejects worker appearing in both earlyDepartureExceptions and overtimeExceptions', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/api/attendance/events/${eventAId}/finalize-checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${managerAToken}`,
          'Idempotency-Key': 'key_exc_3',
        },
        body: JSON.stringify({
          actualNormalFinishTime: '17:00',
          earlyDepartureExceptions: [{ workerId: worker1Id, actualCheckoutTime: '15:00' }],
          overtimeExceptions: [{ workerId: worker1Id, actualCheckoutTime: '19:00' }],
        }),
      });
      assert.strictEqual(res.status, 400);
      const data = (await res.json()) as any;
      assert.match(JSON.stringify(data), /cannot appear in both/i);
    });

    it('rejects duplicate worker in earlyDepartureExceptions', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/api/attendance/events/${eventAId}/finalize-checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${managerAToken}`,
          'Idempotency-Key': 'key_exc_4',
        },
        body: JSON.stringify({
          actualNormalFinishTime: '17:00',
          earlyDepartureExceptions: [
            { workerId: worker2Id, actualCheckoutTime: '15:00' },
            { workerId: worker2Id, actualCheckoutTime: '15:30' },
          ],
        }),
      });
      assert.strictEqual(res.status, 400);
    });

    it('rejects early departure checkout time that is later than or equal to applicable normal finish time', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/api/attendance/events/${eventAId}/finalize-checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${managerAToken}`,
          'Idempotency-Key': 'key_exc_5',
        },
        body: JSON.stringify({
          actualNormalFinishTime: '17:00',
          earlyDepartureExceptions: [{ workerId: worker2Id, actualCheckoutTime: '17:30' }],
        }),
      });
      assert.strictEqual(res.status, 400);
      const data = (await res.json()) as any;
      assert.match(data.message, /must be earlier than/i);
    });

    it('rejects early departure checkout time that is earlier than or equal to worker check-in time', async () => {
      // Worker 2 checked in late at 08:40 AM
      const res = await fetch(`http://127.0.0.1:${port}/api/attendance/events/${eventAId}/finalize-checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${managerAToken}`,
          'Idempotency-Key': 'key_exc_6',
        },
        body: JSON.stringify({
          actualNormalFinishTime: '17:00',
          earlyDepartureExceptions: [{ workerId: worker2Id, actualCheckoutTime: '08:30' }],
        }),
      });
      assert.strictEqual(res.status, 400);
      const data = (await res.json()) as any;
      assert.match(data.message, /must be later than/i);
    });

    it('rejects overtime checkout time that is earlier than or equal to applicable normal finish time', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/api/attendance/events/${eventAId}/finalize-checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${managerAToken}`,
          'Idempotency-Key': 'key_exc_7',
        },
        body: JSON.stringify({
          actualNormalFinishTime: '17:00',
          overtimeExceptions: [{ workerId: worker4Id, actualCheckoutTime: '16:00' }],
        }),
      });
      assert.strictEqual(res.status, 400);
      const data = (await res.json()) as any;
      assert.match(data.message, /must be later than/i);
    });
  });

  // ---------------------------------------------------------------------------
  // 5. Successful Finalization, Finishing-Time Resolution & Duration Calculations
  // ---------------------------------------------------------------------------
  describe('Successful Checkout Finalization (Event A)', () => {
    it('finalizes checkout with requirement overrides, early departure, overtime, and default checkouts', async () => {
      // Event default finish: 17:00
      // Requirement override: Photography -> 19:00
      // Worker 1: Catering -> default finish 17:00. Check-in was 08:00 AM -> Duration: 9 hours (540 mins).
      // Worker 2: Catering -> early departure at 15:30. Check-in was 08:40 AM -> Duration: 410 mins. Early departure: 90 mins.
      // Worker 3: Catering -> absent. Excluded from checkout -> Duration: 0, checkOut: null.
      // Worker 4: Photography -> overtime at 21:00. Applicable finish is 19:00. Check-in was 09:30 AM -> Overtime: 120 mins. Duration: 690 mins.
      const res = await fetch(`http://127.0.0.1:${port}/api/attendance/events/${eventAId}/finalize-checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${managerAToken}`,
          'Idempotency-Key': 'final_checkout_key_event_a',
        },
        body: JSON.stringify({
          actualNormalFinishTime: '17:00',
          requirementFinishOverrides: [{ requirementId: reqPhotoId, normalFinishTime: '19:00' }],
          earlyDepartureExceptions: [{ workerId: worker2Id, actualCheckoutTime: '15:30' }],
          overtimeExceptions: [{ workerId: worker4Id, actualCheckoutTime: '21:00' }],
        }),
      });

      assert.strictEqual(res.status, 200);
      const data = (await res.json()) as any;

      // Verify Summary counts
      const summary = data.data;
      assert.strictEqual(summary.eventId, eventAId);
      assert.strictEqual(summary.totalProcessed, 4);
      assert.strictEqual(summary.normalCheckoutCount, 1);
      assert.strictEqual(summary.earlyDepartureCount, 1);
      assert.strictEqual(summary.overtimeCount, 1);
      assert.strictEqual(summary.absentCount, 1);
      assert.strictEqual(summary.checkOutFinalized, true);
      assert.ok(summary.checkOutFinalizedAt);

      // Verify Session document
      const session = await AttendanceSession.findOne({ eventId: new mongoose.Types.ObjectId(eventAId) });
      assert.ok(session);
      assert.strictEqual(session.checkOutFinalized, true);
      assert.strictEqual(session.lifecycleStatus, 'checkout_finalized');
      assert.strictEqual(session.actualNormalFinishTime, '17:00');
      assert.strictEqual(session.requirementFinishOverrides.length, 1);
      assert.strictEqual(session.requirementFinishOverrides[0].requirementId.toString(), reqPhotoId);
      assert.strictEqual(session.requirementFinishOverrides[0].normalFinishTime, '19:00');
      assert.ok(session.requirementFinishOverrides[0].normalFinishDate);
      assert.strictEqual(session.checkOutIdempotency?.idempotencyKey, 'final_checkout_key_event_a');

      // Verify Worker 1 (Normal System Default)
      const att1 = await Attendance.findOne({ eventId: new mongoose.Types.ObjectId(eventAId), workerId: new mongoose.Types.ObjectId(worker1Id) });
      assert.ok(att1);
      assert.strictEqual(att1.status, 'checked_out');
      assert.strictEqual(att1.checkOutSource, 'system_default');
      assert.strictEqual(att1.departureStatus, 'normal');
      assert.strictEqual(att1.applicableNormalFinishTimeSnapshot, '17:00');
      assert.strictEqual(att1.earlyDepartureMinutes, 0);
      assert.strictEqual(att1.overtimeMinutes, 0);
      assert.strictEqual(att1.durationMinutes, 540); // 08:00 to 17:00 = 9h = 540 min

      // Verify Worker 2 (Early Departure)
      const att2 = await Attendance.findOne({ eventId: new mongoose.Types.ObjectId(eventAId), workerId: new mongoose.Types.ObjectId(worker2Id) });
      assert.ok(att2);
      assert.strictEqual(att2.status, 'checked_out');
      assert.strictEqual(att2.checkOutSource, 'manager_actual');
      assert.strictEqual(att2.departureStatus, 'early_departure');
      assert.strictEqual(att2.applicableNormalFinishTimeSnapshot, '17:00');
      assert.strictEqual(att2.earlyDepartureMinutes, 90); // 17:00 - 15:30 = 90 min
      assert.strictEqual(att2.overtimeMinutes, 0);
      assert.strictEqual(att2.durationMinutes, 410); // 15:30 - 08:40 = 6h 50m = 410 min

      // Verify Worker 3 (Absent Excluded)
      const att3 = await Attendance.findOne({ eventId: new mongoose.Types.ObjectId(eventAId), workerId: new mongoose.Types.ObjectId(worker3Id) });
      assert.ok(att3);
      assert.strictEqual(att3.status, 'absent');
      assert.strictEqual(att3.checkOutSource, 'not_recorded');
      assert.strictEqual(att3.departureStatus, 'not_recorded');
      assert.strictEqual(att3.checkOut, null);
      assert.strictEqual(att3.earlyDepartureMinutes, 0);
      assert.strictEqual(att3.overtimeMinutes, 0);
      assert.strictEqual(att3.durationMinutes, 0);

      // Verify Worker 4 (Overtime with Requirement Override)
      const att4 = await Attendance.findOne({ eventId: new mongoose.Types.ObjectId(eventAId), workerId: new mongoose.Types.ObjectId(worker4Id) });
      assert.ok(att4);
      assert.strictEqual(att4.status, 'checked_out');
      assert.strictEqual(att4.checkOutSource, 'manager_actual');
      assert.strictEqual(att4.departureStatus, 'overtime');
      assert.strictEqual(att4.applicableNormalFinishTimeSnapshot, '19:00'); // From Photography override
      assert.strictEqual(att4.earlyDepartureMinutes, 0);
      assert.strictEqual(att4.overtimeMinutes, 120); // 21:00 - 19:00 = 120 min
      assert.strictEqual(att4.durationMinutes, 690); // 21:00 - 09:30 = 11h 30m = 690 min
    });
  });

  // ---------------------------------------------------------------------------
  // 6. Overnight Shift Duration & Exception Calculations
  // ---------------------------------------------------------------------------
  describe('Overnight Shift Calculations (Event Overnight)', () => {
    it('accurately resolves cross-midnight shifts and calculates early departure and overtime', async () => {
      // Shift starts at 18:00 (6:00 PM).
      // Event default finish: 02:00 AM (+24h overnight).
      // Worker 5: Normal -> checkout 02:00 AM next day -> Duration: 8 hours (480 mins).
      // Worker 6: Early departure at 01:00 AM next day -> Early departure: 60 mins. Duration: 7 hours (420 mins).
      // Worker 7: Overtime at 03:30 AM next day -> Overtime: 90 mins. Duration: 9.5 hours (570 mins).
      const res = await fetch(`http://127.0.0.1:${port}/api/attendance/events/${eventOvernightId}/finalize-checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${managerAToken}`,
          'Idempotency-Key': 'overnight_checkout_key',
        },
        body: JSON.stringify({
          actualNormalFinishTime: '02:00',
          earlyDepartureExceptions: [{ workerId: worker6Id, actualCheckoutTime: '01:00' }],
          overtimeExceptions: [{ workerId: worker7Id, actualCheckoutTime: '03:30' }],
        }),
      });

      assert.strictEqual(res.status, 200);
      const data = (await res.json()) as any;
      assert.strictEqual(data.data.normalCheckoutCount, 1);
      assert.strictEqual(data.data.earlyDepartureCount, 1);
      assert.strictEqual(data.data.overtimeCount, 1);

      // Verify Worker 5 (Overnight Normal)
      const att5 = await Attendance.findOne({ eventId: new mongoose.Types.ObjectId(eventOvernightId), workerId: new mongoose.Types.ObjectId(worker5Id) });
      assert.ok(att5);
      assert.strictEqual(att5.durationMinutes, 480);
      assert.strictEqual(att5.departureStatus, 'normal');

      // Verify Worker 6 (Overnight Early Departure)
      const att6 = await Attendance.findOne({ eventId: new mongoose.Types.ObjectId(eventOvernightId), workerId: new mongoose.Types.ObjectId(worker6Id) });
      assert.ok(att6);
      assert.strictEqual(att6.earlyDepartureMinutes, 60);
      assert.strictEqual(att6.durationMinutes, 420);
      assert.strictEqual(att6.departureStatus, 'early_departure');

      // Verify Worker 7 (Overnight Overtime)
      const att7 = await Attendance.findOne({ eventId: new mongoose.Types.ObjectId(eventOvernightId), workerId: new mongoose.Types.ObjectId(worker7Id) });
      assert.ok(att7);
      assert.strictEqual(att7.overtimeMinutes, 90);
      assert.strictEqual(att7.durationMinutes, 570);
      assert.strictEqual(att7.departureStatus, 'overtime');
    });
  });

  // ---------------------------------------------------------------------------
  // 7. Idempotency & Conflict Handling
  // ---------------------------------------------------------------------------
  describe('Idempotency & Conflict Handling', () => {
    it('rejects request without Idempotency-Key header', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/api/attendance/events/${eventAId}/finalize-checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${managerAToken}`,
        },
        body: JSON.stringify({ actualNormalFinishTime: '17:00' }),
      });
      assert.strictEqual(res.status, 400);
      const data = (await res.json()) as any;
      assert.match(data.message, /idempotency-key/i);
    });

    it('returns cached committed summary for exact replay with same key and payload', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/api/attendance/events/${eventAId}/finalize-checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${managerAToken}`,
          'Idempotency-Key': 'final_checkout_key_event_a',
        },
        body: JSON.stringify({
          actualNormalFinishTime: '17:00',
          requirementFinishOverrides: [{ requirementId: reqPhotoId, normalFinishTime: '19:00' }],
          earlyDepartureExceptions: [{ workerId: worker2Id, actualCheckoutTime: '15:30' }],
          overtimeExceptions: [{ workerId: worker4Id, actualCheckoutTime: '21:00' }],
        }),
      });

      assert.strictEqual(res.status, 200);
      const data = (await res.json()) as any;
      assert.strictEqual(data.data.eventId, eventAId);
      assert.strictEqual(data.data.normalCheckoutCount, 1);
      assert.strictEqual(data.data.checkOutFinalized, true);
    });

    it('returns 409 Conflict when same key is used with altered payload (key collision)', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/api/attendance/events/${eventAId}/finalize-checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${managerAToken}`,
          'Idempotency-Key': 'final_checkout_key_event_a',
        },
        body: JSON.stringify({
          actualNormalFinishTime: '18:00', // Altered finish time
        }),
      });

      assert.strictEqual(res.status, 409);
      const data = (await res.json()) as any;
      assert.match(data.message, /idempotency key collision/i);
    });

    it('returns 409 Conflict when trying to finalize checkout with a different key on an already finalized event', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/api/attendance/events/${eventAId}/finalize-checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${managerAToken}`,
          'Idempotency-Key': 'brand_new_key_on_finalized',
        },
        body: JSON.stringify({
          actualNormalFinishTime: '17:00',
        }),
      });

      assert.strictEqual(res.status, 409);
      const data = (await res.json()) as any;
      assert.match(data.message, /already been finalized/i);
    });
  });

  // ---------------------------------------------------------------------------
  // 8. Roster Reflection After Checkout Finalization
  // ---------------------------------------------------------------------------
  describe('Roster Reflection After Checkout Finalization', () => {
    it('GET /roster returns populated checkout fields, session overrides, and requirements list', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/api/attendance/events/${eventAId}/roster`, {
        headers: { Authorization: `Bearer ${managerAToken}` },
      });

      assert.strictEqual(res.status, 200);
      const data = (await res.json()) as any;
      const body = data.data;

      // Session verification
      assert.strictEqual(body.session.checkOutFinalized, true);
      assert.strictEqual(body.session.lifecycleStatus, 'checkout_finalized');
      assert.strictEqual(body.session.actualNormalFinishTime, '17:00');
      assert.strictEqual(body.session.requirementFinishOverrides.length, 1);
      assert.strictEqual(body.session.requirementFinishOverrides[0].requirementId, reqPhotoId);

      // Requirements list verification
      assert.ok(Array.isArray(body.requirements));
      assert.strictEqual(body.requirements.length, 2);

      // Roster verification
      const roster = body.roster;
      const w1 = roster.find((r: any) => r.workerId === worker1Id);
      assert.strictEqual(w1.status, 'checked_out');
      assert.strictEqual(w1.departureStatus, 'normal');
      assert.strictEqual(w1.checkOutSource, 'system_default');
      assert.strictEqual(w1.durationMinutes, 540);

      const w2 = roster.find((r: any) => r.workerId === worker2Id);
      assert.strictEqual(w2.status, 'checked_out');
      assert.strictEqual(w2.departureStatus, 'early_departure');
      assert.strictEqual(w2.earlyDepartureMinutes, 90);
      assert.strictEqual(w2.durationMinutes, 410);

      const w3 = roster.find((r: any) => r.workerId === worker3Id);
      assert.strictEqual(w3.status, 'absent');
      assert.strictEqual(w3.departureStatus, 'not_recorded');
      assert.strictEqual(w3.checkOut, null);
      assert.strictEqual(w3.durationMinutes, 0);

      const w4 = roster.find((r: any) => r.workerId === worker4Id);
      assert.strictEqual(w4.status, 'checked_out');
      assert.strictEqual(w4.departureStatus, 'overtime');
      assert.strictEqual(w4.overtimeMinutes, 120);
      assert.strictEqual(w4.durationMinutes, 690);
    });
  });

  after(async () => {
    if (server) server.close();
    await mongoose.disconnect();
  });
});
