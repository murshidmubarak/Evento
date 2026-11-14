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
import { getOperationalDateString } from '../src/modules/attendance/utils/attendance-window.util.js';
import { attendanceService } from '../src/modules/attendance/service/attendance.service.js';

describe('EventOps ERP — Check-in Finalization, Event-Day Editing, and Re-finalization', () => {
  let server: any;
  let port: number;

  let adminToken: string;
  let adminId: string;

  let managerToken: string;
  let managerId: string;

  let unauthorizedManagerToken: string;
  let unauthorizedManagerId: string;

  let clientToken: string;
  let clientId: string;

  let workerToken: string;
  let worker1Id: string;
  let worker2Id: string;
  let worker3Id: string;
  let worker4Id: string;

  let eventId: string;
  let req1Id: string;
  let req2Id: string;

  let pastEventId: string;
  let pastReqId: string;
  let pastDate: Date;
  let todayStr: string;

  const generateToken = (userId: string, role: string) => {
    return jwt.sign({ userId, role }, env.jwtSecret, { expiresIn: '1h' });
  };

  before(async () => {
    await connectDB();
    server = app.listen(0);
    port = (server.address() as any).port;

    // Safety: setup.ts ensures this runs strictly against eventops_test
    await User.deleteMany({});
    await Event.deleteMany({});
    await WorkRequirement.deleteMany({});
    await AttendanceSession.deleteMany({});
    await Attendance.deleteMany({});

    // 1. Create Users
    adminId = new mongoose.Types.ObjectId().toString();
    await User.create({
      _id: adminId,
      name: 'Admin User',
      email: 'admin_fin@example.com',
      password: 'password123',
      role: 'admin',
      isActive: true,
    });
    adminToken = generateToken(adminId, 'admin');

    managerId = new mongoose.Types.ObjectId().toString();
    await User.create({
      _id: managerId,
      name: 'Assigned Manager',
      email: 'manager_fin@example.com',
      password: 'password123',
      role: 'event_manager',
      isActive: true,
    });
    managerToken = generateToken(managerId, 'event_manager');

    unauthorizedManagerId = new mongoose.Types.ObjectId().toString();
    await User.create({
      _id: unauthorizedManagerId,
      name: 'Unauthorized Manager',
      email: 'other_fin@example.com',
      password: 'password123',
      role: 'event_manager',
      isActive: true,
    });
    unauthorizedManagerToken = generateToken(unauthorizedManagerId, 'event_manager');

    clientId = new mongoose.Types.ObjectId().toString();
    await User.create({
      _id: clientId,
      name: 'Event Client',
      email: 'client_fin@example.com',
      password: 'password123',
      role: 'client',
      isActive: true,
    });
    clientToken = generateToken(clientId, 'client');

    worker1Id = new mongoose.Types.ObjectId().toString();
    await User.create({
      _id: worker1Id,
      name: 'Worker Alpha',
      email: 'alpha@example.com',
      password: 'password123',
      role: 'worker',
      workerType: 'Cameraman / Photographer',
      isActive: true,
    });
    workerToken = generateToken(worker1Id, 'worker');

    worker2Id = new mongoose.Types.ObjectId().toString();
    await User.create({
      _id: worker2Id,
      name: 'Worker Beta',
      email: 'beta@example.com',
      password: 'password123',
      role: 'worker',
      workerType: 'Cameraman / Photographer',
      isActive: true,
    });

    worker3Id = new mongoose.Types.ObjectId().toString();
    await User.create({
      _id: worker3Id,
      name: 'Worker Gamma',
      email: 'gamma@example.com',
      password: 'password123',
      role: 'worker',
      workerType: 'Catering Boy',
      isActive: true,
    });

    worker4Id = new mongoose.Types.ObjectId().toString();
    await User.create({
      _id: worker4Id,
      name: 'Worker Delta',
      email: 'delta@example.com',
      password: 'password123',
      role: 'worker',
      workerType: 'Catering Boy',
      isActive: true,
    });

    // 2. Active Event (Today in Asia/Kolkata)
    todayStr = getOperationalDateString(new Date(), 'Asia/Kolkata');
    const todayDate = new Date(`${todayStr}T04:00:00.000Z`);
    attendanceService.setTestClock(new Date(`${todayStr}T23:59:00.000+05:30`));

    const activeEvent = await Event.create({
      title: 'Check-in Finalization Gala',
      eventType: 'Corporate',
      date: todayDate,
      startTime: '08:00',
      endTime: '17:00',
      guestCount: 100,
      status: 'confirmed',
      clientId: new mongoose.Types.ObjectId(clientId),
      eventManagerId: new mongoose.Types.ObjectId(managerId),
      location: { address: 'Grand Palace Hall' },
    });
    eventId = activeEvent._id.toString();

    // Work Requirements for Active Event
    const req1 = await WorkRequirement.create({
      eventId: activeEvent._id,
      workerType: 'Cameraman / Photographer',
      requiredCount: 2,
      reportingTime: '04:00',
      status: 'filled',
      assignedWorkers: [
        { workerId: new mongoose.Types.ObjectId(worker1Id), assignedAt: new Date() },
        { workerId: new mongoose.Types.ObjectId(worker2Id), assignedAt: new Date() },
      ],
    });
    req1Id = req1._id.toString();

    const req2 = await WorkRequirement.create({
      eventId: activeEvent._id,
      workerType: 'Catering Boy',
      requiredCount: 2,
      reportingTime: '04:00',
      status: 'filled',
      assignedWorkers: [
        { workerId: new mongoose.Types.ObjectId(worker3Id), assignedAt: new Date() },
        { workerId: new mongoose.Types.ObjectId(worker4Id), assignedAt: new Date() },
      ],
    });
    req2Id = req2._id.toString();

    // 3. Past Event (yesterday - post-event day, within 24h deadline)
    pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 1);
    const pastEvt = await Event.create({
      title: 'Past Expired Event',
      eventType: 'Wedding',
      date: pastDate,
      startTime: '08:00',
      endTime: '23:59',
      guestCount: 100,
      status: 'confirmed',
      clientId: new mongoose.Types.ObjectId(clientId),
      eventManagerId: new mongoose.Types.ObjectId(managerId),
      location: { address: 'Old Heritage Hall' },
    });
    pastEventId = pastEvt._id.toString();

    const pastReq = await WorkRequirement.create({
      eventId: pastEvt._id,
      workerType: 'Cameraman / Photographer',
      requiredCount: 2,
      reportingTime: '08:00',
      status: 'filled',
      assignedWorkers: [
        { workerId: new mongoose.Types.ObjectId(worker1Id), assignedAt: pastDate },
        { workerId: new mongoose.Types.ObjectId(worker2Id), assignedAt: pastDate },
      ],
    });
    pastReqId = pastReq._id.toString();

    await AttendanceSession.create({
      eventId: pastEvt._id,
      lifecycleStatus: 'checkin_in_progress',
    });
  });

  after(async () => {
    attendanceService.setTestClock(null);
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    await User.deleteMany({});
    await Event.deleteMany({});
    await WorkRequirement.deleteMany({});
    await AttendanceSession.deleteMany({});
    await Attendance.deleteMany({});
    await mongoose.disconnect();
  });

  describe('1. Authentication, Authorization & Ownership Validation', () => {
    it('should reject unauthenticated check-in finalization requests with 401', async () => {
      const res = await fetch(`http://localhost:${port}/api/attendance/events/${eventId}/finalize-checkin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': 'chk_unauth_test',
        },
        body: JSON.stringify({}),
      });
      assert.strictEqual(res.status, 401);
    });

    it('should reject worker and client tokens with 403', async () => {
      const workerRes = await fetch(`http://localhost:${port}/api/attendance/events/${eventId}/finalize-checkin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${workerToken}`,
          'Idempotency-Key': 'chk_worker_test',
        },
        body: JSON.stringify({}),
      });
      assert.strictEqual(workerRes.status, 403);

      const clientRes = await fetch(`http://localhost:${port}/api/attendance/events/${eventId}/finalize-checkin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${clientToken}`,
          'Idempotency-Key': 'chk_client_test',
        },
        body: JSON.stringify({}),
      });
      assert.strictEqual(clientRes.status, 403);
    });

    it('should reject unassigned event manager with 403 Forbidden', async () => {
      const res = await fetch(`http://localhost:${port}/api/attendance/events/${eventId}/finalize-checkin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${unauthorizedManagerToken}`,
          'Idempotency-Key': 'chk_unassigned_test',
        },
        body: JSON.stringify({}),
      });
      assert.strictEqual(res.status, 403);
    });

    it('should reject checkout finalization when check-in has not been finalized', async () => {
      const res = await fetch(`http://localhost:${port}/api/attendance/events/${eventId}/finalize-checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${managerToken}`,
          'Idempotency-Key': 'chk_checkout_guard_1',
        },
        body: JSON.stringify({
          actualNormalFinishTime: '17:00',
        }),
      });
      assert.strictEqual(res.status, 400);
      const json = await res.json();
      assert.match(json.message, /Check-in must be finalized before checkout/i);
    });
  });

  describe('2. Initial Check-in Finalization & Default Present Behavior', () => {
    it('should finalize check-in with default Present rule and recorded exceptions', async () => {
      // Worker 1: Marked Late at 08:30 (reporting was 08:00 -> 30 mins delay)
      // Worker 4: Marked Absent
      // Worker 2 & Worker 3: Not marked -> must default to Present / On-Time
      const res = await fetch(`http://localhost:${port}/api/attendance/events/${eventId}/finalize-checkin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${managerToken}`,
          'Idempotency-Key': 'chkin_initial_001',
        },
        body: JSON.stringify({
          lateExceptions: [{ workerId: worker1Id, actualArrivalTime: '04:30' }],
          absentExceptions: [worker4Id],
        }),
      });

      const json = await res.json();
      assert.strictEqual(res.status, 200);
      assert.strictEqual(json.success, true);
      assert.strictEqual(json.data.checkInFinalized, true);
      assert.strictEqual(json.data.totalProcessed, 4);
      assert.strictEqual(json.data.onTimeCount, 2); // worker 2, worker 3
      assert.strictEqual(json.data.lateCount, 1);   // worker 1
      assert.strictEqual(json.data.absentCount, 1); // worker 4
      assert.strictEqual(json.data.checkInRevision, 1);

      // Verify Session Document in Database
      const session = await AttendanceSession.findOne({ eventId: new mongoose.Types.ObjectId(eventId) });
      assert.ok(session);
      assert.strictEqual(session.checkInFinalized, true);
      assert.strictEqual(session.checkInChangesPending, false);
      assert.strictEqual(session.checkInRevision, 1);
      assert.strictEqual(session.checkInRevisions.length, 1);
      assert.strictEqual(session.checkInRevisions[0].revision, 1);

      // Verify Worker Records
      const w1Att = await Attendance.findOne({ eventId, workerId: worker1Id });
      assert.ok(w1Att);
      assert.strictEqual(w1Att.arrivalStatus, 'late');
      assert.strictEqual(w1Att.delayMinutes, 30);
      assert.strictEqual(w1Att.status, 'checked_in');

      const w2Att = await Attendance.findOne({ eventId, workerId: worker2Id });
      assert.ok(w2Att);
      assert.strictEqual(w2Att.arrivalStatus, 'on_time');
      assert.strictEqual(w2Att.checkInSource, 'system_default');
      assert.strictEqual(w2Att.delayMinutes, 0);
      assert.strictEqual(w2Att.status, 'checked_in');

      const w4Att = await Attendance.findOne({ eventId, workerId: worker4Id });
      assert.ok(w4Att);
      assert.strictEqual(w4Att.arrivalStatus, 'absent');
      assert.strictEqual(w4Att.status, 'absent');
      assert.strictEqual(w4Att.checkIn, null);
    });

    it('should safely return committed summary on idempotent replay of identical check-in payload', async () => {
      const res = await fetch(`http://localhost:${port}/api/attendance/events/${eventId}/finalize-checkin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${managerToken}`,
          'Idempotency-Key': 'chkin_initial_001',
        },
        body: JSON.stringify({
          lateExceptions: [{ workerId: worker1Id, actualArrivalTime: '04:30' }],
          absentExceptions: [worker4Id],
        }),
      });

      const json = await res.json();
      assert.strictEqual(res.status, 200);
      assert.strictEqual(json.success, true);
      assert.strictEqual(json.data.checkInFinalized, true);
      assert.strictEqual(json.data.checkInRevision, 1);
    });

    it('should reject check-in finalization when already finalized and no changes are pending', async () => {
      const res = await fetch(`http://localhost:${port}/api/attendance/events/${eventId}/finalize-checkin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${managerToken}`,
          'Idempotency-Key': 'chkin_different_key_no_changes',
        },
        body: JSON.stringify({}),
      });

      assert.strictEqual(res.status, 409);
      const json = await res.json();
      assert.match(json.message, /already been finalized and no changes are pending/i);
    });
  });

  describe('3. Event-Day Post-Finalization Corrections & Pending Re-finalization State', () => {
    it('should permit check-in correction on active event day and invalidate previous finalization', async () => {
      const w2Att = await Attendance.findOne({ eventId, workerId: worker2Id });
      assert.ok(w2Att);

      // Manager discovers Worker 2 was actually Late at 04:45
      const res = await fetch(`http://localhost:${port}/api/attendance/records/${w2Att._id}/correct`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${managerToken}`,
        },
        body: JSON.stringify({
          actualArrivalTime: '04:45',
          arrivalStatus: 'late',
          reason: 'Correcting Worker Beta to Late after reviewing gate entrance log.',
        }),
      });

      const json = await res.json();
      assert.strictEqual(res.status, 200);
      assert.strictEqual(json.success, true);
      assert.strictEqual(json.data.arrivalStatus, 'late');
      assert.strictEqual(json.data.delayMinutes, 45);

      // Session document must now have checkInChangesPending: true
      const session = await AttendanceSession.findOne({ eventId: new mongoose.Types.ObjectId(eventId) });
      assert.ok(session);
      assert.strictEqual(session.checkInFinalized, true);
      assert.strictEqual(session.checkInChangesPending, true);
    });

    it('should expose checkInChangesPending: true and canReFinalizeCheckIn: true in getRoster', async () => {
      const res = await fetch(`http://localhost:${port}/api/attendance/events/${eventId}/roster`, {
        headers: { Authorization: `Bearer ${managerToken}` },
      });

      const json = await res.json();
      assert.strictEqual(res.status, 200);
      assert.strictEqual(json.success, true);
      assert.strictEqual(json.data.checkInFinalized, true);
      assert.strictEqual(json.data.checkInChangesPending, true);
      assert.strictEqual(json.data.canReFinalizeCheckIn, true);
      assert.strictEqual(json.data.session.checkInChangesPending, true);
    });

    it('should block checkout finalization when check-in has pending changes', async () => {
      const res = await fetch(`http://localhost:${port}/api/attendance/events/${eventId}/finalize-checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${managerToken}`,
          'Idempotency-Key': 'chk_block_on_pending_changes',
        },
        body: JSON.stringify({
          actualNormalFinishTime: '17:00',
        }),
      });

      assert.strictEqual(res.status, 400);
      const json = await res.json();
      assert.match(json.message, /Cannot finalize checkout while check-in has pending changes/i);
    });
  });

  describe('4. Re-finalization Workflow & Revision Tracking', () => {
    it('should successfully re-finalize check-in, clear pending status, and increment revision', async () => {
      const res = await fetch(`http://localhost:${port}/api/attendance/events/${eventId}/finalize-checkin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${managerToken}`,
          'Idempotency-Key': 'chkin_refinalize_002',
        },
        body: JSON.stringify({
          reason: 'Re-finalized check-in after confirming Worker Beta gate arrival.',
          expectedRevision: 1,
        }),
      });

      const json = await res.json();
      assert.strictEqual(res.status, 200);
      assert.strictEqual(json.success, true);
      assert.strictEqual(json.data.checkInFinalized, true);
      assert.strictEqual(json.data.checkInChangesPending, false);
      assert.strictEqual(json.data.checkInRevision, 2);
      assert.strictEqual(json.data.lateCount, 2); // worker 1 and worker 2 are now late

      // Verify Session in Database
      const session = await AttendanceSession.findOne({ eventId: new mongoose.Types.ObjectId(eventId) });
      assert.ok(session);
      assert.strictEqual(session.checkInChangesPending, false);
      assert.strictEqual(session.checkInRevision, 2);
      assert.strictEqual(session.checkInRevisions.length, 2);
      assert.strictEqual(session.checkInRevisions[1].revision, 2);
    });

    it('should now allow checkout category departure and checkout finalization with updated durations', async () => {
      // 1. Record Category Departure for Cameraman at 16:00
      const depRes = await fetch(`http://localhost:${port}/api/attendance/events/${eventId}/categories/departure`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${managerToken}`,
        },
        body: JSON.stringify({
          workerType: 'Cameraman / Photographer',
          actualDepartureDate: todayStr,
          actualDepartureTime: '16:00',
        }),
      });
      assert.strictEqual(depRes.status, 200);

      // 2. Finalize Checkout
      const chkRes = await fetch(`http://localhost:${port}/api/attendance/events/${eventId}/finalize-checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${managerToken}`,
          'Idempotency-Key': 'chk_success_after_refinalize',
        },
        body: JSON.stringify({
          actualNormalFinishTime: '16:00',
        }),
      });

      assert.strictEqual(chkRes.status, 200);
      const chkJson = await chkRes.json();
      assert.strictEqual(chkJson.data.checkOutFinalized, true);

      // Verify duration for Worker 2 (arrived 04:45, departed 16:00 -> 11h 15m = 675 mins)
      const w2Att = await Attendance.findOne({ eventId, workerId: worker2Id });
      assert.ok(w2Att);
      assert.strictEqual(w2Att.durationMinutes, 675);
    });
  });

  describe('5. Post-Event Day Check-in Editing Lockout (HTTP 403)', () => {
    it('should reject check-in corrections after scheduled event day with 403 Forbidden', async () => {
      // Create an attendance record on pastEventId
      const pastAtt = await Attendance.create({
        eventId: new mongoose.Types.ObjectId(pastEventId),
        requirementId: new mongoose.Types.ObjectId(pastReqId),
        workerId: new mongoose.Types.ObjectId(worker1Id),
        workerType: 'Cameraman / Photographer',
        reportingTimeSnapshot: '08:00',
        checkIn: pastDate,
        checkInSource: 'system_default',
        arrivalStatus: 'on_time',
        delayMinutes: 0,
        status: 'checked_in',
        verificationStatus: 'pending_review',
        durationMinutes: 0,
      });

      const res = await fetch(`http://localhost:${port}/api/attendance/records/${pastAtt._id}/correct`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${managerToken}`,
        },
        body: JSON.stringify({
          actualArrivalTime: '08:30',
          arrivalStatus: 'late',
          reason: 'Attempting to edit check-in after event day has ended.',
        }),
      });

      assert.strictEqual(res.status, 403);
      const json = await res.json();
      assert.match(json.message, /Check-in editing is closed because the scheduled event day has ended/i);
    });

    it('should reject initial check-in marks after scheduled event day with 403 Forbidden', async () => {
      const res = await fetch(`http://localhost:${port}/api/attendance/events/${pastEventId}/workers/${worker2Id}/checkin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${managerToken}`,
        },
        body: JSON.stringify({
          arrivalStatus: 'late',
          actualArrivalTime: '08:30',
        }),
      });

      assert.strictEqual(res.status, 403);
      const json = await res.json();
      assert.match(json.message, /Check-in editing is closed because the scheduled event day has ended/i);
    });
  });

  describe('6. Permanent Concern and Status Lock Protection', () => {
    it('should reject check-in corrections on permanently locked attendance records with 403', async () => {
      // Lock Worker 1's record
      await Attendance.updateOne(
        { eventId, workerId: worker1Id },
        {
          $set: {
            isStatusLocked: true,
            statusLockedAt: new Date(),
            statusLockedReason: 'Late arrival verified and closed via formal concern resolution',
          },
        }
      );

      const w1Att = await Attendance.findOne({ eventId, workerId: worker1Id });
      assert.ok(w1Att);

      const res = await fetch(`http://localhost:${port}/api/attendance/records/${w1Att._id}/correct`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${managerToken}`,
        },
        body: JSON.stringify({
          arrivalStatus: 'on_time',
          reason: 'Attempting to reverse closed concern lock.',
        }),
      });

      assert.strictEqual(res.status, 403);
      const json = await res.json();
      assert.match(json.message, /Attendance record is permanently locked/i);
    });

    it('should preserve locked arrival information without modification during subsequent re-finalization', async () => {
      // Set changes pending on session
      await AttendanceSession.updateOne(
        { eventId: new mongoose.Types.ObjectId(eventId) },
        { $set: { checkInChangesPending: true } }
      );

      // Re-finalize check-in with payload that attempts to change locked worker 1
      const res = await fetch(`http://localhost:${port}/api/attendance/events/${eventId}/finalize-checkin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${managerToken}`,
          'Idempotency-Key': 'chkin_refinalize_003',
        },
        body: JSON.stringify({
          lateExceptions: [], // does not include worker 1
          expectedRevision: 2,
        }),
      });

      assert.strictEqual(res.status, 200);

      // Worker 1 must still remain Late and locked!
      const w1Att = await Attendance.findOne({ eventId, workerId: worker1Id });
      assert.ok(w1Att);
      assert.strictEqual(w1Att.arrivalStatus, 'late');
      assert.strictEqual(w1Att.isStatusLocked, true);
    });
  });

  describe('7. Absent Worker Exclusion and Checkout Clearing', () => {
    it('should completely clear checkout and set duration to 0 if a worker is changed to Absent', async () => {
      // Worker 3 is currently checked_in and has a checkout
      const w3Att = await Attendance.findOne({ eventId, workerId: worker3Id });
      assert.ok(w3Att);

      const res = await fetch(`http://localhost:${port}/api/attendance/records/${w3Att._id}/correct`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${managerToken}`,
        },
        body: JSON.stringify({
          status: 'absent',
          arrivalStatus: 'absent',
          reason: 'Worker did not report for duty; marked absent after audit.',
        }),
      });

      assert.strictEqual(res.status, 200);

      const updated = await Attendance.findOne({ eventId, workerId: worker3Id });
      assert.ok(updated);
      assert.strictEqual(updated.status, 'absent');
      assert.strictEqual(updated.arrivalStatus, 'absent');
      assert.strictEqual(updated.checkIn, null);
      assert.strictEqual(updated.checkOut, null);
      assert.strictEqual(updated.durationMinutes, 0);
      assert.strictEqual(updated.departureStatus, 'not_recorded');
    });
  });
});
