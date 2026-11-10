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

describe('Milestone 4 — Attendance Workflow Refinement: Category Finish Times, Immediate Check-in & Corrections', () => {
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
  let req1Id: string; // cameraman: 09:00
  let req2Id: string; // catering_boy: 20:00 (overnight shift)

  const generateToken = (userId: string, role: string) => {
    return jwt.sign({ userId, role }, env.jwtSecret, { expiresIn: '1h' });
  };

  before(async () => {
    await connectDB();
    server = app.listen(0);
    port = (server.address() as any).port;

    // Safety: setup.ts ensures this is strictly eventops_test
    await User.deleteMany({});
    await Event.deleteMany({});
    await WorkRequirement.deleteMany({});
    await AttendanceSession.deleteMany({});
    await Attendance.deleteMany({});
    await Notification.deleteMany({});

    // 1. Users
    adminId = new mongoose.Types.ObjectId().toString();
    await User.create({
      _id: adminId,
      name: 'Admin User',
      email: 'admin_cat@example.com',
      password: 'password123',
      role: 'admin',
      isActive: true,
    });
    adminToken = generateToken(adminId, 'admin');

    managerId = new mongoose.Types.ObjectId().toString();
    await User.create({
      _id: managerId,
      name: 'Assigned Manager',
      email: 'manager_cat@example.com',
      password: 'password123',
      role: 'event_manager',
      isActive: true,
    });
    managerToken = generateToken(managerId, 'event_manager');

    unauthorizedManagerId = new mongoose.Types.ObjectId().toString();
    await User.create({
      _id: unauthorizedManagerId,
      name: 'Other Manager',
      email: 'other_mgr@example.com',
      password: 'password123',
      role: 'event_manager',
      isActive: true,
    });
    unauthorizedManagerToken = generateToken(unauthorizedManagerId, 'event_manager');

    clientId = new mongoose.Types.ObjectId().toString();
    await User.create({
      _id: clientId,
      name: 'Event Client',
      email: 'client_cat@example.com',
      password: 'password123',
      role: 'client',
      isActive: true,
    });
    clientToken = generateToken(clientId, 'client');

    // 4 Workers: 2 cameramen, 2 catering_boys
    worker1Id = new mongoose.Types.ObjectId().toString();
    await User.create({
      _id: worker1Id,
      name: 'Ahmed Cameraman',
      email: 'ahmed@example.com',
      password: 'password123',
      role: 'worker',
      workerType: 'Cameraman / Photographer',
      isActive: true,
    });
    workerToken = generateToken(worker1Id, 'worker');

    worker2Id = new mongoose.Types.ObjectId().toString();
    await User.create({
      _id: worker2Id,
      name: 'Bilal Cameraman',
      email: 'bilal@example.com',
      password: 'password123',
      role: 'worker',
      workerType: 'Cameraman / Photographer',
      isActive: true,
    });

    worker3Id = new mongoose.Types.ObjectId().toString();
    await User.create({
      _id: worker3Id,
      name: 'Cyrus Catering',
      email: 'cyrus@example.com',
      password: 'password123',
      role: 'worker',
      workerType: 'Catering Boy',
      isActive: true,
    });

    worker4Id = new mongoose.Types.ObjectId().toString();
    await User.create({
      _id: worker4Id,
      name: 'Danish Catering',
      email: 'danish@example.com',
      password: 'password123',
      role: 'worker',
      workerType: 'Catering Boy',
      isActive: true,
    });

    // Event scheduled for today
    const today = new Date();

    eventId = new mongoose.Types.ObjectId().toString();
    await Event.create({
      _id: eventId,
      clientId,
      eventManagerId: managerId,
      title: 'Grand Tech Summit 2026',
      eventType: 'Wedding',
      date: today,
      startTime: '08:00',
      endTime: '23:00',
      guestCount: 300,
      status: 'confirmed',
      location: {
        address: 'MG Road, Bangalore',
      },
    });

    // Work Requirements:
    // Req 1: Cameraman / Photographer, reporting 08:00
    req1Id = new mongoose.Types.ObjectId().toString();
    await WorkRequirement.create({
      _id: req1Id,
      eventId,
      workerType: 'Cameraman / Photographer',
      requiredCount: 2,
      assignedWorkers: [
        { workerId: new mongoose.Types.ObjectId(worker1Id), assignedAt: new Date() },
        { workerId: new mongoose.Types.ObjectId(worker2Id), assignedAt: new Date() },
      ],
      reportingTime: '08:00',
      status: 'filled',
    });

    // Req 2: Catering Boy, reporting 09:00 (evening/overnight)
    req2Id = new mongoose.Types.ObjectId().toString();
    await WorkRequirement.create({
      _id: req2Id,
      eventId,
      workerType: 'Catering Boy',
      requiredCount: 2,
      assignedWorkers: [
        { workerId: new mongoose.Types.ObjectId(worker3Id), assignedAt: new Date() },
        { workerId: new mongoose.Types.ObjectId(worker4Id), assignedAt: new Date() },
      ],
      reportingTime: '09:00',
      status: 'filled',
    });
  });

  after(async () => {
    if (server) server.close();
    await mongoose.disconnect();
  });

  // =========================================================================
  // Requirement B: Individual Immediate Check-in Persistence
  // =========================================================================
  describe('Requirement B: Immediate Check-in Persistence', () => {
    it('should reject unauthenticated request to record worker check-in', async () => {
      const res = await fetch(
        `http://localhost:${port}/api/attendance/events/${eventId}/workers/${worker1Id}/checkin`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ arrivalStatus: 'on_time' }),
        }
      );
      assert.strictEqual(res.status, 401);
    });

    it('should reject unauthorized role (client) from recording check-in', async () => {
      const res = await fetch(
        `http://localhost:${port}/api/attendance/events/${eventId}/workers/${worker1Id}/checkin`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${clientToken}`,
          },
          body: JSON.stringify({ arrivalStatus: 'on_time' }),
        }
      );
      assert.strictEqual(res.status, 403);
    });

    it('should reject unassigned event manager from recording check-in', async () => {
      const res = await fetch(
        `http://localhost:${port}/api/attendance/events/${eventId}/workers/${worker1Id}/checkin`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${unauthorizedManagerToken}`,
          },
          body: JSON.stringify({ arrivalStatus: 'on_time' }),
        }
      );
      assert.strictEqual(res.status, 403);
    });

    it('should reject recording check-in before the scheduled event day (future event)', async () => {
      const futureDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
      const futureEventId = new mongoose.Types.ObjectId().toString();
      await Event.create({
        _id: futureEventId,
        clientId,
        eventManagerId: managerId,
        title: 'Future Gala',
        eventType: 'Wedding',
        date: futureDate,
        startTime: '10:00',
        endTime: '18:00',
        guestCount: 150,
        status: 'confirmed',
        location: { address: 'Future Hall' },
      });
      await WorkRequirement.create({
        _id: new mongoose.Types.ObjectId().toString(),
        eventId: futureEventId,
        workerType: 'Cameraman / Photographer',
        requiredCount: 1,
        assignedWorkers: [{ workerId: new mongoose.Types.ObjectId(worker1Id), assignedAt: new Date() }],
        reportingTime: '10:00',
        status: 'filled',
      });

      const res = await fetch(
        `http://localhost:${port}/api/attendance/events/${futureEventId}/workers/${worker1Id}/checkin`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${managerToken}`,
          },
          body: JSON.stringify({ arrivalStatus: 'late', actualArrivalTime: '10:30' }),
        }
      );
      assert.strictEqual(res.status, 400);
      const json = await res.json();
      assert.match(json.message, /scheduled event day/i);
    });

    it('should reject recording initial check-in after the scheduled event day (past event)', async () => {
      const pastDate = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
      const pastEventId = new mongoose.Types.ObjectId().toString();
      await Event.create({
        _id: pastEventId,
        clientId,
        eventManagerId: managerId,
        title: 'Past Gala',
        eventType: 'Wedding',
        date: pastDate,
        startTime: '10:00',
        endTime: '18:00',
        guestCount: 150,
        status: 'confirmed',
        location: { address: 'Past Hall' },
      });
      await WorkRequirement.create({
        _id: new mongoose.Types.ObjectId().toString(),
        eventId: pastEventId,
        workerType: 'Cameraman / Photographer',
        requiredCount: 1,
        assignedWorkers: [{ workerId: new mongoose.Types.ObjectId(worker1Id), assignedAt: new Date() }],
        reportingTime: '10:00',
        status: 'filled',
      });

      const res = await fetch(
        `http://localhost:${port}/api/attendance/events/${pastEventId}/workers/${worker1Id}/checkin`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${managerToken}`,
          },
          body: JSON.stringify({ arrivalStatus: 'absent' }),
        }
      );
      assert.strictEqual(res.status, 400);
      const json = await res.json();
      assert.match(json.message, /event day has passed/i);
    });

    it('should validate arrivalStatus payload (missing or invalid)', async () => {
      const res = await fetch(
        `http://localhost:${port}/api/attendance/events/${eventId}/workers/${worker1Id}/checkin`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${managerToken}`,
          },
          body: JSON.stringify({ arrivalStatus: 'invalid_status' }),
        }
      );
      assert.strictEqual(res.status, 400);
    });

    it('should require actualArrivalTime when arrivalStatus is late', async () => {
      const res = await fetch(
        `http://localhost:${port}/api/attendance/events/${eventId}/workers/${worker1Id}/checkin`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${managerToken}`,
          },
          body: JSON.stringify({ arrivalStatus: 'late' }),
        }
      );
      assert.strictEqual(res.status, 400);
      const data = await res.json();
      assert.ok(
        (data.error?.errors && data.error.errors.some((e: string) => /actualArrivalTime is required/i.test(e))) ||
        /actualArrivalTime is required/i.test(data.message)
      );
    });

    it('should immediately record worker1 as Present / On Time into MongoDB', async () => {
      const res = await fetch(
        `http://localhost:${port}/api/attendance/events/${eventId}/workers/${worker1Id}/checkin`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${managerToken}`,
          },
          body: JSON.stringify({ arrivalStatus: 'on_time' }),
        }
      );

      assert.strictEqual(res.status, 200);
      const json = await res.json();
      assert.strictEqual(json.success, true);
      assert.strictEqual(json.data.arrivalStatus, 'on_time');
      assert.strictEqual(json.data.status, 'checked_in');
      assert.strictEqual(json.data.checkInSource, 'system_default');
      assert.strictEqual(json.data.delayMinutes, 0);

      // Verify directly from MongoDB
      const doc = await Attendance.findOne({ eventId, workerId: worker1Id });
      assert.ok(doc);
      assert.strictEqual(doc.arrivalStatus, 'on_time');
      assert.strictEqual(doc.status, 'checked_in');
      assert.ok(doc.checkIn);
    });

    it('should immediately record worker2 as Late with 30m delay', async () => {
      const res = await fetch(
        `http://localhost:${port}/api/attendance/events/${eventId}/workers/${worker2Id}/checkin`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${managerToken}`,
          },
          body: JSON.stringify({
            arrivalStatus: 'late',
            actualArrivalTime: '08:30',
          }),
        }
      );

      assert.strictEqual(res.status, 200);
      const json = await res.json();
      assert.strictEqual(json.success, true);
      assert.strictEqual(json.data.arrivalStatus, 'late');
      assert.strictEqual(json.data.status, 'checked_in');
      assert.strictEqual(json.data.checkInSource, 'manager_actual');
      assert.strictEqual(json.data.delayMinutes, 30);

      // Verify from MongoDB
      const doc = await Attendance.findOne({ eventId, workerId: worker2Id });
      assert.ok(doc);
      assert.strictEqual(doc.arrivalStatus, 'late');
      assert.strictEqual(doc.delayMinutes, 30);

      // Verify notification created for worker2
      const notif2 = await Notification.findOne({
        recipientId: worker2Id,
      });
      assert.ok(notif2, 'Notification for worker2 (Late) should be created');
      assert.strictEqual(notif2.type, 'attendance_marked_late');
      assert.match(notif2.title, /attendance update/i);
      assert.match(notif2.message, /marked LATE/i);
    });

    it('should immediately record worker3 as Absent', async () => {
      const res = await fetch(
        `http://localhost:${port}/api/attendance/events/${eventId}/workers/${worker3Id}/checkin`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${managerToken}`,
          },
          body: JSON.stringify({ arrivalStatus: 'absent' }),
        }
      );

      assert.strictEqual(res.status, 200);
      const json = await res.json();
      assert.strictEqual(json.success, true);
      assert.strictEqual(json.data.arrivalStatus, 'absent');
      assert.strictEqual(json.data.status, 'absent');
      assert.strictEqual(json.data.checkIn, null);

      // Verify from MongoDB
      const doc = await Attendance.findOne({ eventId, workerId: worker3Id });
      assert.ok(doc);
      assert.strictEqual(doc.status, 'absent');
      assert.strictEqual(doc.checkIn, null);

      // Verify notification created for worker3
      const notif3 = await Notification.findOne({
        recipientId: worker3Id,
      });
      assert.ok(notif3, 'Notification for worker3 (Absent) should be created');
      assert.strictEqual(notif3.type, 'attendance_marked_absent');
      assert.match(notif3.title, /attendance update/i);
      assert.match(notif3.message, /marked ABSENT/i);
    });

    it('should reject check-in API for existing record and allow updating via correction API without duplicating', async () => {
      // 1. Calling initial check-in API on an existing record must be rejected (400 Bad Request)
      const rejectRes = await fetch(
        `http://localhost:${port}/api/attendance/events/${eventId}/workers/${worker2Id}/checkin`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${managerToken}`,
          },
          body: JSON.stringify({
            arrivalStatus: 'late',
            actualArrivalTime: '08:45',
          }),
        }
      );

      assert.strictEqual(rejectRes.status, 400);
      const rejectJson = await rejectRes.json();
      assert.match(rejectJson.message, /already exists for this worker/i);
      assert.match(rejectJson.message, /Use the correction API/i);

      // 2. Fetch existing attendance record ID for worker2
      const existingAtt = await Attendance.findOne({ eventId, workerId: worker2Id });
      assert.ok(existingAtt);

      // 3. Updating existing attendance record via correction API succeeds
      const res = await fetch(
        `http://localhost:${port}/api/attendance/records/${existingAtt._id}/correct`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${managerToken}`,
          },
          body: JSON.stringify({
            arrivalStatus: 'late',
            actualArrivalTime: '08:45',
            reason: 'Manager updated late arrival timestamp',
          }),
        }
      );

      assert.strictEqual(res.status, 200);
      const json = await res.json();
      assert.strictEqual(json.data.delayMinutes, 45);

      // Confirm only 1 record exists for worker2
      const count = await Attendance.countDocuments({ eventId, workerId: worker2Id });
      assert.strictEqual(count, 1);
    });

    it('should return already-saved check-in records in getRoster API', async () => {
      const res = await fetch(`http://localhost:${port}/api/attendance/events/${eventId}/roster`, {
        headers: { Authorization: `Bearer ${managerToken}` },
      });

      assert.strictEqual(res.status, 200);
      const json = await res.json();
      assert.strictEqual(json.success, true);
      const rMap = new Map(json.data.roster.map((r: any) => [r.workerId, r]));

      assert.strictEqual((rMap.get(worker1Id) as any).arrivalStatus, 'on_time');
      assert.strictEqual((rMap.get(worker2Id) as any).arrivalStatus, 'late');
      assert.strictEqual((rMap.get(worker3Id) as any).arrivalStatus, 'absent');
      // worker4 was not individually confirmed yet
      assert.strictEqual((rMap.get(worker4Id) as any).attendanceId, null);
    });

    it('should finalize check-in, preserving saved records and applying default On Time to worker4', async () => {
      const res = await fetch(`http://localhost:${port}/api/attendance/events/${eventId}/finalize-checkin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${managerToken}`,
          'Idempotency-Key': 'chk_test_batch_1',
        },
        body: JSON.stringify({}),
      });

      assert.strictEqual(res.status, 200);
      const json = await res.json();
      assert.strictEqual(json.data.totalProcessed, 4);
      assert.strictEqual(json.data.onTimeCount, 2); // worker1 and worker4
      assert.strictEqual(json.data.lateCount, 1); // worker2
      assert.strictEqual(json.data.absentCount, 1); // worker3
      assert.strictEqual(json.data.checkInFinalized, true);

      // Check session
      const sess = await AttendanceSession.findOne({ eventId });
      assert.ok(sess);
      assert.strictEqual(sess.checkInFinalized, true);

      // Confirm worker4 is now saved as On Time
      const doc4 = await Attendance.findOne({ eventId, workerId: worker4Id });
      assert.ok(doc4);
      assert.strictEqual(doc4.arrivalStatus, 'on_time');
      assert.strictEqual(doc4.checkInSource, 'system_default');
    });

    it('should reject individual check-in once check-in has been finalized', async () => {
      const res = await fetch(
        `http://localhost:${port}/api/attendance/events/${eventId}/workers/${worker1Id}/checkin`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${managerToken}`,
          },
          body: JSON.stringify({ arrivalStatus: 'late', actualArrivalTime: '08:15' }),
        }
      );

      assert.strictEqual(res.status, 400);
      const json = await res.json();
      assert.match(json.message, /check-in has already been finalized|already exists for this worker/i);
    });
  });

  // =========================================================================
  // Requirement A: Category-wise Normal Finishing Time & Checkout
  // =========================================================================
  describe('Requirement A: Category-wise Finishing Times & Checkout', () => {
    it('should validate category finish times (invalid time format)', async () => {
      const res = await fetch(`http://localhost:${port}/api/attendance/events/${eventId}/finalize-checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${managerToken}`,
          'Idempotency-Key': 'chkout_err_1',
        },
        body: JSON.stringify({
          categoryFinishTimes: [
            { workerType: 'Cameraman / Photographer', normalFinishTime: '25:99' },
          ],
        }),
      });

      assert.strictEqual(res.status, 400);
      const json = await res.json();
      assert.match(json.message, /invalid time string|validation failed/i);
    });

    it('should finalize checkout with category-wise finishing times and handle overnight shift', async () => {
      // Cameraman / Photographer finishes at 16:00 (day shift, started 08:00)
      // Catering Boy finishes at 02:00 (overnight shift, started 09:00 -> finMins (120) <= repMins (540))
      // worker2 (Cameraman / Photographer) has early departure at 15:00 (1 hour early)
      const res = await fetch(`http://localhost:${port}/api/attendance/events/${eventId}/finalize-checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${managerToken}`,
          'Idempotency-Key': 'chkout_cat_final_1',
        },
        body: JSON.stringify({
          categoryFinishTimes: [
            { workerType: 'Cameraman / Photographer', normalFinishTime: '16:00' },
            { workerType: 'Catering Boy', normalFinishTime: '02:00' },
          ],
          earlyDepartureExceptions: [
            { workerId: worker2Id, actualCheckoutTime: '15:00' },
          ],
        }),
      });

      assert.strictEqual(res.status, 200);
      const json = await res.json();
      assert.strictEqual(json.success, true);
      assert.strictEqual(json.data.checkOutFinalized, true);

      // Verify AttendanceSession stores categoryFinishTimes
      const session = await AttendanceSession.findOne({ eventId });
      assert.ok(session);
      assert.strictEqual(session.checkOutFinalized, true);
      assert.ok(session.categoryFinishTimes && session.categoryFinishTimes.length === 2);

      const catMap = new Map(session.categoryFinishTimes.map((c: any) => [c.workerType, c]));
      assert.strictEqual((catMap.get('Cameraman / Photographer') as any).normalFinishTime, '16:00');
      assert.strictEqual((catMap.get('Catering Boy') as any).normalFinishTime, '02:00');

      // Verify worker1 (cameraman)
      const att1 = await Attendance.findOne({ eventId, workerId: worker1Id });
      assert.ok(att1);
      assert.strictEqual(att1.applicableNormalFinishTimeSnapshot, '16:00');
      assert.strictEqual(att1.departureStatus, 'normal');
      assert.strictEqual(att1.earlyDepartureMinutes, 0);
      assert.strictEqual(att1.overtimeMinutes, 0);
      // duration: 08:00 to 16:00 = 8 hours = 480 minutes
      assert.strictEqual(att1.durationMinutes, 480);

      // Verify worker2 (cameraman, early at 15:00)
      const att2 = await Attendance.findOne({ eventId, workerId: worker2Id });
      assert.ok(att2);
      assert.strictEqual(att2.applicableNormalFinishTimeSnapshot, '16:00');
      assert.strictEqual(att2.departureStatus, 'early_departure');
      assert.strictEqual(att2.earlyDepartureMinutes, 60);
      // duration: 08:45 to 15:00 = 6h 15m = 375 minutes
      assert.strictEqual(att2.durationMinutes, 375);

      // Verify worker4 (catering_boy, overnight 09:00 to 02:00 next day)
      const att4 = await Attendance.findOne({ eventId, workerId: worker4Id });
      assert.ok(att4);
      assert.strictEqual(att4.applicableNormalFinishTimeSnapshot, '02:00');
      assert.strictEqual(att4.departureStatus, 'normal');
      // duration: 09:00 to 02:00 = 17 hours = 1020 minutes
      assert.strictEqual(att4.durationMinutes, 1020);
      // Check-out date is later than check-in date (+24 hours rollover)
      assert.ok(att4.checkOut! > att4.checkIn!);

      // Verify worker3 (absent) was not checked out
      const att3 = await Attendance.findOne({ eventId, workerId: worker3Id });
      assert.ok(att3);
      assert.strictEqual(att3.status, 'absent');
      assert.strictEqual(att3.checkOut || null, null);
    });

    it('should directly finalize checkout without prior check-in finalization, automatically defaulting unmarked workers to On Time', async () => {
      const directEventId = new mongoose.Types.ObjectId().toString();
      await Event.create({
        _id: directEventId,
        clientId,
        eventManagerId: managerId,
        title: 'Direct Checkout Event',
        eventType: 'Wedding',
        date: new Date(),
        startTime: '09:00',
        endTime: '17:00',
        guestCount: 100,
        status: 'confirmed',
        location: { address: 'Direct Hall' },
      });

      const workerA = new mongoose.Types.ObjectId().toString();
      const workerB = new mongoose.Types.ObjectId().toString();
      await User.create([
        { _id: workerA, name: 'Worker A', email: 'workerA@example.com', password: 'password123', role: 'worker', workerType: 'Chef', isActive: true },
        { _id: workerB, name: 'Worker B', email: 'workerB@example.com', password: 'password123', role: 'worker', workerType: 'Chef', isActive: true },
      ]);

      await WorkRequirement.create({
        _id: new mongoose.Types.ObjectId().toString(),
        eventId: directEventId,
        workerType: 'Chef',
        requiredCount: 2,
        assignedWorkers: [
          { workerId: new mongoose.Types.ObjectId(workerA), assignedAt: new Date() },
          { workerId: new mongoose.Types.ObjectId(workerB), assignedAt: new Date() },
        ],
        reportingTime: '09:00',
        status: 'filled',
      });

      // Mark only workerA as Late (Worker B remains unmarked)
      const lateRes = await fetch(
        `http://localhost:${port}/api/attendance/events/${directEventId}/workers/${workerA}/checkin`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${managerToken}`,
          },
          body: JSON.stringify({ arrivalStatus: 'late', actualArrivalTime: '09:20' }),
        }
      );
      assert.strictEqual(lateRes.status, 200);

      // Finalize checkout directly without calling finalize-checkin
      const checkoutRes = await fetch(
        `http://localhost:${port}/api/attendance/events/${directEventId}/finalize-checkout`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${managerToken}`,
            'Idempotency-Key': 'chkout_direct_1',
          },
          body: JSON.stringify({
            categoryFinishTimes: [{ workerType: 'Chef', normalFinishTime: '17:00' }],
          }),
        }
      );

      assert.strictEqual(checkoutRes.status, 200);
      const checkoutJson = await checkoutRes.json();
      assert.strictEqual(checkoutJson.success, true);
      assert.strictEqual(checkoutJson.data.checkOutFinalized, true);

      // Verify session
      const directSession = await AttendanceSession.findOne({ eventId: directEventId });
      assert.ok(directSession);
      assert.strictEqual(directSession.checkOutFinalized, true);

      // Worker A was late
      const attA = await Attendance.findOne({ eventId: directEventId, workerId: workerA });
      assert.ok(attA);
      assert.strictEqual(attA.arrivalStatus, 'late');
      assert.strictEqual(attA.status, 'checked_out');

      // Worker B was unmarked -> automatically defaulted to on_time / system_default
      const attB = await Attendance.findOne({ eventId: directEventId, workerId: workerB });
      assert.ok(attB);
      assert.strictEqual(attB.arrivalStatus, 'on_time');
      assert.strictEqual(attB.checkInSource, 'system_default');
      assert.strictEqual(attB.status, 'checked_out');
      assert.strictEqual(attB.durationMinutes, 480); // 09:00 to 17:00 = 8h = 480m
    });
  });

  // =========================================================================
  // Requirement C & D & E & F: Corrections, History, Invalidation & Transitions
  // =========================================================================
  describe('Requirements C, D, E & F: Corrections, Audit History and Approval Invalidation', () => {
    it('should first approve the attendance session as admin', async () => {
      const res = await fetch(`http://localhost:${port}/api/attendance/events/${eventId}/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ action: 'approve' }),
      });

      assert.strictEqual(res.status, 200);
      const json = await res.json();
      assert.strictEqual(json.data.verificationStatus, 'approved');

      const sess = await AttendanceSession.findOne({ eventId });
      assert.strictEqual(sess?.verificationStatus, 'approved');
      assert.strictEqual(sess?.verifiedBy?.toString(), adminId);
    });

    it('should transition worker1 (Present) -> Absent via correction and invalidate approval', async () => {
      const att1 = await Attendance.findOne({ eventId, workerId: worker1Id });
      assert.ok(att1);

      const res = await fetch(`http://localhost:${port}/api/attendance/records/${att1._id}/correct`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${managerToken}`,
        },
        body: JSON.stringify({
          arrivalStatus: 'absent',
          reason: 'Worker left premise before shift started and did not actually participate.',
        }),
      });

      assert.strictEqual(res.status, 200);
      const json = await res.json();
      assert.strictEqual(json.success, true);
      assert.strictEqual(json.data.status, 'absent');
      assert.strictEqual(json.data.arrivalStatus, 'absent');
      assert.strictEqual(json.data.checkIn, null);
      assert.strictEqual(json.data.checkOut, null);
      assert.strictEqual(json.data.durationMinutes, 0);

      // Verify immutable correction log
      assert.ok(json.data.corrections && json.data.corrections.length > 0);
      const lastCorr = json.data.corrections[json.data.corrections.length - 1];
      assert.strictEqual(lastCorr.reason, 'Worker left premise before shift started and did not actually participate.');
      assert.strictEqual(lastCorr.previousArrivalStatus, 'on_time');
      assert.strictEqual(lastCorr.newArrivalStatus, 'absent');
      assert.strictEqual(lastCorr.modifiedBy, managerId);

      // Verify Approval Invalidation on session and records
      const updatedSess = await AttendanceSession.findOne({ eventId });
      assert.strictEqual(updatedSess?.verificationStatus, 'pending_review');
      assert.ok(!updatedSess?.verifiedBy);
      assert.ok(!updatedSess?.verifiedAt);

      const updatedAtt1 = await Attendance.findById(att1._id);
      assert.strictEqual(updatedAtt1?.verificationStatus, 'pending_review');
    });

    it('should transition worker3 (Absent) -> Present via correction and recalculate metrics', async () => {
      const att3 = await Attendance.findOne({ eventId, workerId: worker3Id });
      assert.ok(att3);

      const res = await fetch(`http://localhost:${port}/api/attendance/records/${att3._id}/correct`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${managerToken}`,
        },
        body: JSON.stringify({
          arrivalStatus: 'on_time',
          applyDefaultCheckout: true,
          reason: 'Worker was wrongly marked absent; verified presence via venue CCTV.',
        }),
      });

      assert.strictEqual(res.status, 200);
      const json = await res.json();
      assert.strictEqual(json.success, true);
      assert.strictEqual(json.data.status, 'checked_out');
      assert.strictEqual(json.data.arrivalStatus, 'on_time');
      assert.strictEqual(json.data.checkInSource, 'manager_actual');
      assert.strictEqual(json.data.checkOutSource, 'system_default');
      assert.ok(json.data.checkIn);
      assert.ok(json.data.checkOut);
      // catering_boy shift: 09:00 to 02:00 = 1020 mins
      assert.strictEqual(json.data.durationMinutes, 1020);

      // Check corrections history
      assert.ok(json.data.corrections.length >= 1);
      const last = json.data.corrections[json.data.corrections.length - 1];
      assert.strictEqual(last.previousStatus, 'absent');
      assert.strictEqual(last.newStatus, 'checked_out');
    });

    it('should transition worker2 (Late 08:45) -> Late 08:15 via correction and recalculate delay and duration', async () => {
      const att2 = await Attendance.findOne({ eventId, workerId: worker2Id });
      assert.ok(att2);

      const res = await fetch(`http://localhost:${port}/api/attendance/records/${att2._id}/correct`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${managerToken}`,
        },
        body: JSON.stringify({
          arrivalStatus: 'late',
          actualArrivalTime: '08:15',
          reason: 'Correcting arrival time after reviewing entry register.',
        }),
      });

      assert.strictEqual(res.status, 200);
      const json = await res.json();
      assert.strictEqual(json.success, true);
      assert.strictEqual(json.data.arrivalStatus, 'late');
      assert.strictEqual(json.data.delayMinutes, 15); // 08:00 -> 08:15 = 15m
      // checkout was 15:00 -> 08:15 to 15:00 = 6h 45m = 405 mins
      assert.strictEqual(json.data.durationMinutes, 405);
    });

    it('should return updated categoryFinishTimes and invalidation state in getRoster', async () => {
      const res = await fetch(`http://localhost:${port}/api/attendance/events/${eventId}/roster`, {
        headers: { Authorization: `Bearer ${managerToken}` },
      });

      assert.strictEqual(res.status, 200);
      const json = await res.json();
      assert.strictEqual(json.success, true);
      assert.strictEqual(json.data.session.verificationStatus, 'pending_review');
      assert.ok(json.data.session.categoryFinishTimes.length === 2);
    });
  });
});

