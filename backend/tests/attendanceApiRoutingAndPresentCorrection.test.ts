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
import { Notification } from '../src/modules/notifications/model/notification.model.js';
import { AttendanceConcern } from '../src/modules/attendance/model/attendance-concern.model.js';
import { getOperationalDateString } from '../src/modules/attendance/utils/attendance-window.util.js';

describe('Milestone 4 — API Routing for Existing Records & Change to Present Option', () => {
  let server: any;
  let port: number;

  let adminToken: string;
  let adminId: string;

  let managerToken: string;
  let managerId: string;

  let unauthorizedManagerToken: string;
  let unauthorizedManagerId: string;

  let worker1Token: string;
  let worker1Id: string;
  let worker2Id: string;
  let worker3Id: string;
  let worker4Id: string;

  let eventId: string;
  let completedEventId: string;
  let req1Id: string; // 09:00
  let req2Id: string; // 10:00

  const generateToken = (userId: string, role: string) => {
    return jwt.sign({ userId, role }, env.jwtSecret, { expiresIn: '1h' });
  };

  before(async () => {
    await connectDB();
    server = app.listen(0);
    port = (server.address() as any).port;

    // Strict test DB isolation guard in setup.ts ensures this is eventops_test
    await User.deleteMany({});
    await Event.deleteMany({});
    await WorkRequirement.deleteMany({});
    await AttendanceSession.deleteMany({});
    await Attendance.deleteMany({});
    await Notification.deleteMany({});
    await AttendanceConcern.deleteMany({});

    // 1. Create Users
    adminId = new mongoose.Types.ObjectId().toString();
    await User.create({
      _id: adminId,
      name: 'Super Admin',
      email: 'admin_route@eventops.local',
      password: 'password123',
      role: 'admin',
      isActive: true,
    });
    adminToken = generateToken(adminId, 'admin');

    managerId = new mongoose.Types.ObjectId().toString();
    await User.create({
      _id: managerId,
      name: 'Event Manager Alpha',
      email: 'manager_route@eventops.local',
      password: 'password123',
      role: 'event_manager',
      isActive: true,
    });
    managerToken = generateToken(managerId, 'event_manager');

    unauthorizedManagerId = new mongoose.Types.ObjectId().toString();
    await User.create({
      _id: unauthorizedManagerId,
      name: 'Unassigned Manager Beta',
      email: 'unauth_route@eventops.local',
      password: 'password123',
      role: 'event_manager',
      isActive: true,
    });
    unauthorizedManagerToken = generateToken(unauthorizedManagerId, 'event_manager');

    worker1Id = new mongoose.Types.ObjectId().toString();
    await User.create({
      _id: worker1Id,
      name: 'Worker 1 Ahmed',
      email: 'w1_route@eventops.local',
      password: 'password123',
      role: 'worker',
      workerType: 'Cameraman / Photographer',
      isActive: true,
    });
    worker1Token = generateToken(worker1Id, 'worker');

    worker2Id = new mongoose.Types.ObjectId().toString();
    await User.create({
      _id: worker2Id,
      name: 'Worker 2 Bilal',
      email: 'w2_route@eventops.local',
      password: 'password123',
      role: 'worker',
      workerType: 'Cameraman / Photographer',
      isActive: true,
    });

    worker3Id = new mongoose.Types.ObjectId().toString();
    await User.create({
      _id: worker3Id,
      name: 'Worker 3 Chitra',
      email: 'w3_route@eventops.local',
      password: 'password123',
      role: 'worker',
      workerType: 'Catering Supervisor',
      isActive: true,
    });

    worker4Id = new mongoose.Types.ObjectId().toString();
    await User.create({
      _id: worker4Id,
      name: 'Worker 4 Dinesh',
      email: 'w4_route@eventops.local',
      password: 'password123',
      role: 'worker',
      workerType: 'Catering Supervisor',
      isActive: true,
    });

    // 2. Active Event (Today in IST, status: 'confirmed')
    const now = new Date();
    const todayStr = getOperationalDateString(now, 'Asia/Kolkata');
    const [y, m, d] = todayStr.split('-').map(Number);
    const eventDate = new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));

    const activeEv = await Event.create({
      title: 'Grand Annual Gala 2026',
      description: 'Annual corporate gathering',
      eventType: 'Corporate',
      date: eventDate,
      startTime: '09:00',
      endTime: '18:00',
      guestCount: 150,
      eventManagerId: managerId,
      clientId: new mongoose.Types.ObjectId().toString(),
      status: 'confirmed',
      location: { address: 'Tech Park Center, Kochi' },
    });
    eventId = activeEv._id.toString();

    // 3. Work Requirements
    const req1 = await WorkRequirement.create({
      eventId: activeEv._id,
      workerType: 'Cameraman / Photographer',
      requiredCount: 2,
      reportingTime: '09:00',
      status: 'filled',
      assignedWorkers: [
        { workerId: new mongoose.Types.ObjectId(worker1Id), assignedAt: now },
        { workerId: new mongoose.Types.ObjectId(worker2Id), assignedAt: now },
      ],
    });
    req1Id = req1._id.toString();

    const req2 = await WorkRequirement.create({
      eventId: activeEv._id,
      workerType: 'Catering Supervisor',
      requiredCount: 2,
      reportingTime: '10:00',
      status: 'filled',
      assignedWorkers: [
        { workerId: new mongoose.Types.ObjectId(worker3Id), assignedAt: now },
        { workerId: new mongoose.Types.ObjectId(worker4Id), assignedAt: now },
      ],
    });
    req2Id = req2._id.toString();

    // 4. Completed Event (Scheduled today, but event.status = 'completed')
    const compEv = await Event.create({
      title: 'Morning Symposium Completed',
      description: 'Morning symposium session',
      eventType: 'Corporate',
      date: eventDate,
      startTime: '07:00',
      endTime: '12:00',
      guestCount: 80,
      eventManagerId: managerId,
      clientId: new mongoose.Types.ObjectId().toString(),
      status: 'completed',
      location: { address: 'Auditorium Hall, Kochi' },
    });
    completedEventId = compEv._id.toString();

    await WorkRequirement.create({
      eventId: compEv._id,
      workerType: 'Cameraman / Photographer',
      requiredCount: 1,
      reportingTime: '07:00',
      status: 'filled',
      assignedWorkers: [{ workerId: new mongoose.Types.ObjectId(worker1Id), assignedAt: now }],
    });

    await AttendanceSession.create({
      eventId: compEv._id,
      lifecycleStatus: 'checkout_finalized',
      checkInFinalized: true,
      checkOutFinalized: true,
      actualNormalFinishTime: '12:00',
    });
  });

  after(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    await User.deleteMany({});
    await Event.deleteMany({});
    await WorkRequirement.deleteMany({});
    await AttendanceSession.deleteMany({});
    await Attendance.deleteMany({});
    await Notification.deleteMany({});
    await AttendanceConcern.deleteMany({});
    await mongoose.disconnect();
  });

  // ===========================================================================
  // SECTION 1: Initial Exception Marking (Unrecorded Workers)
  // ===========================================================================
  describe('1. Initial Exception Marking (recordWorkerCheckIn)', () => {
    it('Item 1: should record initial Late exception on unrecorded worker1', async () => {
      const res = await fetch(
        `http://localhost:${port}/api/attendance/events/${eventId}/workers/${worker1Id}/checkin`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${managerToken}`,
          },
          body: JSON.stringify({
            arrivalStatus: 'late',
            actualArrivalTime: '09:40',
          }),
        }
      );

      assert.strictEqual(res.status, 200);
      const json = await res.json();
      assert.strictEqual(json.success, true);
      assert.strictEqual(json.data.arrivalStatus, 'late');
      assert.strictEqual(json.data.status, 'checked_in');
      assert.strictEqual(json.data.delayMinutes, 40);
      assert.strictEqual(json.data.checkInSource, 'manager_actual');

      // Check DB
      const att = await Attendance.findOne({ eventId, workerId: worker1Id });
      assert.ok(att);
      assert.strictEqual(att.arrivalStatus, 'late');
      assert.strictEqual(att.delayMinutes, 40);
    });

    it('Item 2: should record initial Absent exception on unrecorded worker2', async () => {
      const res = await fetch(
        `http://localhost:${port}/api/attendance/events/${eventId}/workers/${worker2Id}/checkin`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${managerToken}`,
          },
          body: JSON.stringify({
            arrivalStatus: 'absent',
            status: 'absent',
          }),
        }
      );

      assert.strictEqual(res.status, 200);
      const json = await res.json();
      assert.strictEqual(json.success, true);
      assert.strictEqual(json.data.arrivalStatus, 'absent');
      assert.strictEqual(json.data.status, 'absent');
      assert.strictEqual(json.data.checkIn, null);

      // Check DB
      const att = await Attendance.findOne({ eventId, workerId: worker2Id });
      assert.ok(att);
      assert.strictEqual(att.arrivalStatus, 'absent');
      assert.strictEqual(att.status, 'absent');
    });
  });

  // ===========================================================================
  // SECTION 2: API Routing Distinction (Items 3 & 4)
  // ===========================================================================
  describe('2. API Routing Distinction: Initial Check-In vs Existing Record Correction', () => {
    it('Item 3: calling recordWorkerCheckIn on worker1 (already Late) must be rejected with 400 Bad Request', async () => {
      const res = await fetch(
        `http://localhost:${port}/api/attendance/events/${eventId}/workers/${worker1Id}/checkin`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${managerToken}`,
          },
          body: JSON.stringify({
            arrivalStatus: 'late',
            actualArrivalTime: '09:50',
          }),
        }
      );

      assert.strictEqual(res.status, 400);
      const json = await res.json();
      assert.strictEqual(json.success, false);
      assert.match(json.message, /Attendance record already exists for this worker/i);
      assert.match(json.message, /Use the correction API/i);
    });

    it('Item 3b: calling recordWorkerCheckIn on worker2 (already Absent) must be rejected with 400 Bad Request', async () => {
      const res = await fetch(
        `http://localhost:${port}/api/attendance/events/${eventId}/workers/${worker2Id}/checkin`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${managerToken}`,
          },
          body: JSON.stringify({
            arrivalStatus: 'absent',
          }),
        }
      );

      assert.strictEqual(res.status, 400);
      const json = await res.json();
      assert.strictEqual(json.success, false);
      assert.match(json.message, /Attendance record already exists for this worker/i);
      assert.match(json.message, /Use the correction API/i);
    });

    it('Item 4: modifying existing worker1 record via correctAttendance PATCH succeeds', async () => {
      const att = await Attendance.findOne({ eventId, workerId: worker1Id });
      assert.ok(att);

      const res = await fetch(`http://localhost:${port}/api/attendance/records/${att._id}/correct`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${managerToken}`,
        },
        body: JSON.stringify({
          arrivalStatus: 'late',
          actualArrivalTime: '09:55',
          reason: 'Manager adjusted arrival time based on gate log verification',
        }),
      });

      assert.strictEqual(res.status, 200);
      const json = await res.json();
      assert.strictEqual(json.success, true);
      assert.strictEqual(json.data.delayMinutes, 55);

      const updated = await Attendance.findById(att._id);
      assert.strictEqual(updated?.delayMinutes, 55);
      assert.strictEqual(updated?.corrections.length, 1);
      assert.strictEqual(updated?.corrections[0].reason, 'Manager adjusted arrival time based on gate log verification');
    });
  });

  // ===========================================================================
  // SECTION 3: Completed Event Restrictions vs Corrections (Items 5 & 6)
  // ===========================================================================
  describe('3. Completed Event Rules', () => {
    it('Item 5: recordWorkerCheckIn on a completed event is rejected with 400 Bad Request', async () => {
      const res = await fetch(
        `http://localhost:${port}/api/attendance/events/${completedEventId}/workers/${worker1Id}/checkin`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${managerToken}`,
          },
          body: JSON.stringify({
            arrivalStatus: 'late',
            actualArrivalTime: '07:30',
          }),
        }
      );

      assert.strictEqual(res.status, 400);
      const json = await res.json();
      assert.strictEqual(json.success, false);
      assert.match(json.message, /Attendance check-in cannot be recorded on completed events/i);
    });

    it('Item 6: updating an existing attendance record on a completed event via correctAttendance succeeds within 24h deadline', async () => {
      // Seed an existing attendance record on the completed event (simulating check-in or checkout completion)
      const existingCompAtt = await Attendance.create({
        eventId: completedEventId,
        workerId: worker1Id,
        requirementId: req1Id,
        workerType: 'Cameraman / Photographer',
        reportingTimeSnapshot: '07:00',
        arrivalStatus: 'late',
        status: 'checked_in',
        checkIn: new Date(),
        checkInSource: 'manager_actual',
        delayMinutes: 30,
        departureStatus: 'not_recorded',
        verificationStatus: 'pending_review',
        corrections: [],
      });

      const res = await fetch(`http://localhost:${port}/api/attendance/records/${existingCompAtt._id}/correct`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${managerToken}`,
        },
        body: JSON.stringify({
          arrivalStatus: 'on_time',
          reason: 'Post-event log review shows worker arrived before gate opening',
        }),
      });

      assert.strictEqual(res.status, 200);
      const json = await res.json();
      assert.strictEqual(json.success, true);
      assert.strictEqual(json.data.arrivalStatus, 'on_time');
      assert.strictEqual(json.data.delayMinutes, 0);

      const updated = await Attendance.findById(existingCompAtt._id);
      assert.strictEqual(updated?.arrivalStatus, 'on_time');
      assert.strictEqual(updated?.delayMinutes, 0);
      assert.strictEqual(updated?.corrections.length, 1);
    });
  });

  // ===========================================================================
  // SECTION 4: Change to Present Option (Items 7, 8, 9, 10, 11, 12)
  // ===========================================================================
  describe('4. Change to Present Correction Workflow', () => {
    it('Item 7 & 9: Late -> Present correction sets arrivalStatus on_time, delayMinutes 0, reporting time checkIn, and appends audit', async () => {
      // worker1 is currently Late (55m delay). Correct worker1 to Present (on_time).
      const att = await Attendance.findOne({ eventId, workerId: worker1Id });
      assert.ok(att);

      const res = await fetch(`http://localhost:${port}/api/attendance/records/${att._id}/correct`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${managerToken}`,
        },
        body: JSON.stringify({
          arrivalStatus: 'on_time',
          reason: 'Worker arrived on time at 09:00, gate log confirms on-time presence',
        }),
      });

      assert.strictEqual(res.status, 200);
      const json = await res.json();
      assert.strictEqual(json.success, true);
      assert.strictEqual(json.data.arrivalStatus, 'on_time');
      assert.strictEqual(json.data.status, 'checked_in');
      assert.strictEqual(json.data.delayMinutes, 0);
      assert.strictEqual(json.data.checkInSource, 'system_default');

      // Verify checkIn matches 09:00 reporting time on event date
      const updated = await Attendance.findById(att._id);
      assert.ok(updated);
      assert.strictEqual(updated.arrivalStatus, 'on_time');
      assert.strictEqual(updated.delayMinutes, 0);

      const checkInDate = new Date(updated.checkIn!);
      assert.strictEqual(checkInDate.getUTCHours(), 9);
      assert.strictEqual(checkInDate.getUTCMinutes(), 0);

      // Verify correction history audit trail
      assert.strictEqual(updated.corrections.length, 2);
      const latestCorrection = updated.corrections[updated.corrections.length - 1];
      assert.strictEqual(latestCorrection.reason, 'Worker arrived on time at 09:00, gate log confirms on-time presence');
      assert.strictEqual(latestCorrection.modifiedBy.toString(), managerId);
      assert.strictEqual(latestCorrection.previousArrivalStatus, 'late');
      assert.strictEqual(latestCorrection.newArrivalStatus, 'on_time');

    });

    it('Item 8 & 10: Absent -> Present correction sets on_time, status checked_in, clears absence, and sets reporting time', async () => {
      // worker2 is currently Absent. Correct worker2 to Present (on_time).
      const att = await Attendance.findOne({ eventId, workerId: worker2Id });
      assert.ok(att);
      assert.strictEqual(att.status, 'absent');
      assert.strictEqual(att.arrivalStatus, 'absent');

      const res = await fetch(`http://localhost:${port}/api/attendance/records/${att._id}/correct`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${managerToken}`,
        },
        body: JSON.stringify({
          arrivalStatus: 'on_time',
          reason: 'Worker was mistakenly marked absent; was on site and performed duties',
        }),
      });

      assert.strictEqual(res.status, 200);
      const json = await res.json();
      assert.strictEqual(json.success, true);
      assert.strictEqual(json.data.arrivalStatus, 'on_time');
      assert.strictEqual(json.data.status, 'checked_in');
      assert.strictEqual(json.data.delayMinutes, 0);

      const updated = await Attendance.findById(att._id);
      assert.ok(updated);
      assert.strictEqual(updated.status, 'checked_in');
      assert.strictEqual(updated.arrivalStatus, 'on_time');
      assert.strictEqual(updated.delayMinutes, 0);
      assert.ok(updated.checkIn !== null);

      const checkInDate = new Date(updated.checkIn!);
      assert.strictEqual(checkInDate.getUTCHours(), 9);
      assert.strictEqual(checkInDate.getUTCMinutes(), 0);

      assert.strictEqual(updated.corrections.length, 1);
      assert.strictEqual(updated.corrections[0].previousStatus, 'absent');
      assert.strictEqual(updated.corrections[0].newStatus, 'checked_in');
    });

    it('Item 10b: Absent -> Present with applyDefaultCheckout when session is finalized also sets checkout details', async () => {
      // Simulate an event that has checkout finalized with category finish times
      let session = await AttendanceSession.findOne({ eventId });
      if (!session) {
        session = await AttendanceSession.create({
          eventId,
          lifecycleStatus: 'checkout_finalized',
          checkOutFinalized: true,
          checkOutFinalizedAt: new Date(),
          actualNormalFinishTime: '18:00',
        });
      } else {
        session.checkOutFinalized = true;
        session.checkOutFinalizedAt = new Date();
        session.actualNormalFinishTime = '18:00';
        await session.save();
      }

      // Create an absent record for worker3
      const att3 = await Attendance.create({
        eventId,
        workerId: worker3Id,
        requirementId: req2Id,
        workerType: 'Catering Supervisor',
        reportingTimeSnapshot: '10:00',
        arrivalStatus: 'absent',
        status: 'absent',
        delayMinutes: 0,
        departureStatus: 'not_recorded',
        verificationStatus: 'pending_review',
        corrections: [],
      });

      const res = await fetch(`http://localhost:${port}/api/attendance/records/${att3._id}/correct`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${managerToken}`,
        },
        body: JSON.stringify({
          arrivalStatus: 'on_time',
          applyDefaultCheckout: true,
          reason: 'Correcting absent worker to present after checkout finalized',
        }),
      });

      assert.strictEqual(res.status, 200);
      const json = await res.json();
      assert.strictEqual(json.success, true);
      assert.strictEqual(json.data.arrivalStatus, 'on_time');
      assert.strictEqual(json.data.status, 'checked_out');
      assert.strictEqual(json.data.departureStatus, 'normal');

      const updated3 = await Attendance.findById(att3._id);
      assert.ok(updated3);
      assert.strictEqual(updated3.status, 'checked_out');
      assert.strictEqual(updated3.arrivalStatus, 'on_time');
      assert.strictEqual(updated3.departureStatus, 'normal');
      assert.ok(updated3.checkIn !== null);
      assert.ok(updated3.checkOut !== null);
      assert.ok(updated3.durationMinutes > 0);
    });
  });

  // ===========================================================================
  // SECTION 5: Deadline & Locking Rules (Items 13, 14, 15, 16)
  // ===========================================================================
  describe('5. Deadline, Locking & Concern Resolution Restrictions', () => {
    it('Item 13 & 14: normal correction fails after 24h deadline if no open concern exists', async () => {
      // Create past event whose deadline has passed (e.g. 5 days ago)
      const pastDate = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
      const expiredEvent = await Event.create({
        title: 'Old Conference Expired',
        description: 'Past event',
        eventType: 'Corporate',
        date: pastDate,
        startTime: '09:00',
        endTime: '17:00',
        guestCount: 50,
        eventManagerId: managerId,
        clientId: new mongoose.Types.ObjectId().toString(),
        status: 'completed',
        location: { address: 'Old Hall, Kochi' },
      });

      const expiredAtt = await Attendance.create({
        eventId: expiredEvent._id,
        workerId: worker4Id,
        requirementId: req2Id,
        workerType: 'Catering Supervisor',
        reportingTimeSnapshot: '10:00',
        arrivalStatus: 'late',
        status: 'checked_out',
        checkIn: pastDate,
        delayMinutes: 20,
        departureStatus: 'normal',
        verificationStatus: 'pending_review',
        corrections: [],
      });

      const res = await fetch(`http://localhost:${port}/api/attendance/records/${expiredAtt._id}/correct`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${managerToken}`,
        },
        body: JSON.stringify({
          arrivalStatus: 'on_time',
          reason: 'Attempting normal correction after 24h deadline without concern',
        }),
      });

      assert.strictEqual(res.status, 403);
      const json = await res.json();
      assert.strictEqual(json.success, false);
      assert.match(json.message, /correction period has expired|deadline/i);
    });

    it('Item 15: correction on permanently locked record is rejected with 403 Forbidden', async () => {
      // Mark an attendance record as permanently locked
      const lockedAtt = await Attendance.create({
        eventId,
        workerId: worker4Id,
        requirementId: req2Id,
        workerType: 'Catering Supervisor',
        reportingTimeSnapshot: '10:00',
        arrivalStatus: 'late',
        status: 'checked_out',
        checkIn: new Date(),
        delayMinutes: 15,
        departureStatus: 'normal',
        isStatusLocked: true,
        statusLockedAt: new Date(),
        statusLockedReason: 'Concern resolved and permanently locked',
        verificationStatus: 'approved',
        corrections: [],
      });

      const res = await fetch(`http://localhost:${port}/api/attendance/records/${lockedAtt._id}/correct`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${managerToken}`,
        },
        body: JSON.stringify({
          arrivalStatus: 'on_time',
          reason: 'Attempting to modify locked attendance record',
        }),
      });

      assert.strictEqual(res.status, 403);
      const json = await res.json();
      assert.strictEqual(json.success, false);
      assert.match(json.message, /locked and cannot be modified/i);
    });

    it('Item 17: unauthorized manager cannot correct attendance records (403 Forbidden)', async () => {
      const att = await Attendance.findOne({ eventId, workerId: worker1Id });
      assert.ok(att);

      const res = await fetch(`http://localhost:${port}/api/attendance/records/${att._id}/correct`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${unauthorizedManagerToken}`,
        },
        body: JSON.stringify({
          arrivalStatus: 'on_time',
          reason: 'Unauthorized manager attempt',
        }),
      });

      assert.strictEqual(res.status, 403);
      const json = await res.json();
      assert.strictEqual(json.success, false);
      assert.match(json.message, /permission/i);
    });
  });

  after(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    await mongoose.disconnect();
  });
});
