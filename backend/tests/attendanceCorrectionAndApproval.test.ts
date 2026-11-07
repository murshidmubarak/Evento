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

describe('Milestone 4 — Phase 4.5: Attendance Corrections, Absence Reversal & Final Manager Approval', () => {
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

  let event1Id: string;
  let event2Id: string;

  let worker1Id: string;
  let worker2Id: string;
  let worker3Id: string;

  let attendance1Id: string;
  let attendance2Id: string;
  let attendance3Id: string;

  let reqId: string;

  const generateToken = (userId: string, role: string) => {
    return jwt.sign({ userId, role }, env.jwtSecret, { expiresIn: '1h' });
  };

  before(async () => {
    await connectDB();
    server = app.listen(0);
    port = (server.address() as any).port;

    // Guaranteed isolated test database by setup.ts
    await User.deleteMany({});
    await Event.deleteMany({});
    await WorkRequirement.deleteMany({});
    await AttendanceSession.deleteMany({});
    await Attendance.deleteMany({});

    // 1. Users
    adminId = new mongoose.Types.ObjectId().toString();
    await User.create({
      _id: adminId,
      name: 'Admin User',
      email: 'admin_p45@example.com',
      password: 'password123',
      role: 'admin',
      isActive: true,
    });
    adminToken = generateToken(adminId, 'admin');

    managerAId = new mongoose.Types.ObjectId().toString();
    await User.create({
      _id: managerAId,
      name: 'Manager Alice',
      email: 'alice_p45@example.com',
      password: 'password123',
      role: 'event_manager',
      isActive: true,
    });
    managerAToken = generateToken(managerAId, 'event_manager');

    managerBId = new mongoose.Types.ObjectId().toString();
    await User.create({
      _id: managerBId,
      name: 'Manager Bob',
      email: 'bob_p45@example.com',
      password: 'password123',
      role: 'event_manager',
      isActive: true,
    });
    managerBToken = generateToken(managerBId, 'event_manager');

    clientId = new mongoose.Types.ObjectId().toString();
    await User.create({
      _id: clientId,
      name: 'Client Clara',
      email: 'clara_p45@example.com',
      password: 'password123',
      role: 'client',
      isActive: true,
    });
    clientToken = generateToken(clientId, 'client');

    workerId = new mongoose.Types.ObjectId().toString();
    await User.create({
      _id: workerId,
      name: 'Worker Wayne',
      email: 'wayne_p45@example.com',
      password: 'password123',
      role: 'worker',
      isActive: true,
    });
    workerToken = generateToken(workerId, 'worker');

    // Additional workers
    worker1Id = new mongoose.Types.ObjectId().toString();
    await User.create({
      _id: worker1Id,
      name: 'Worker One',
      email: 'worker1_p45@example.com',
      password: 'password123',
      role: 'worker',
      workerType: 'Catering Boy',
      isActive: true,
    });

    worker2Id = new mongoose.Types.ObjectId().toString();
    await User.create({
      _id: worker2Id,
      name: 'Worker Two',
      email: 'worker2_p45@example.com',
      password: 'password123',
      role: 'worker',
      workerType: 'Catering Boy',
      isActive: true,
    });

    worker3Id = new mongoose.Types.ObjectId().toString();
    await User.create({
      _id: worker3Id,
      name: 'Worker Three',
      email: 'worker3_p45@example.com',
      password: 'password123',
      role: 'worker',
      workerType: 'Catering Boy',
      isActive: true,
    });

    // 2. Events
    const earlierToday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    event1Id = new mongoose.Types.ObjectId().toString();
    await Event.create({
      _id: event1Id,
      clientId,
      eventManagerId: managerAId,
      title: 'Grand Gala 2026',
      eventType: 'Wedding',
      date: earlierToday,
      startTime: '10:00',
      endTime: '18:00',
      guestCount: 200,
      location: {
        address: 'MG Road, Kochi',
      },
      status: 'confirmed',
    });

    event2Id = new mongoose.Types.ObjectId().toString();
    await Event.create({
      _id: event2Id,
      clientId,
      eventManagerId: managerBId,
      title: 'Bob Exclusive Gala',
      eventType: 'Corporate',
      date: earlierToday,
      startTime: '10:00',
      endTime: '18:00',
      guestCount: 150,
      location: {
        address: 'Marine Drive, Kochi',
      },
      status: 'confirmed',
    });

    // 3. Work Requirement
    reqId = new mongoose.Types.ObjectId().toString();
    await WorkRequirement.create({
      _id: reqId,
      eventId: event1Id,
      workerType: 'Catering Boy',
      requiredCount: 3,
      status: 'filled',
      assignedWorkers: [
        { workerId: new mongoose.Types.ObjectId(worker1Id), assignedAt: new Date() },
        { workerId: new mongoose.Types.ObjectId(worker2Id), assignedAt: new Date() },
        { workerId: new mongoose.Types.ObjectId(worker3Id), assignedAt: new Date() },
      ],
      reportingTime: '10:00',
      finishingTime: '18:00',
    });

    // 4. Finalize Check-in on Event 1
    // worker1: on-time (10:00)
    // worker2: late (10:30)
    // worker3: absent
    await attendanceService.finalizeCheckIn(managerAId, 'event_manager', event1Id, 'setup_p45_checkin', {
      lateExceptions: [{ workerId: worker2Id, actualArrivalTime: '10:30' }],
      absentExceptions: [worker3Id],
    });

    // 5. Finalize Checkout on Event 1
    // worker1: early departure at 17:00
    // worker2: normal checkout at 18:00
    // worker3: absent (remains absent)
    await attendanceService.finalizeCheckOut(managerAId, 'event_manager', event1Id, 'setup_p45_checkout', {
      actualNormalFinishTime: '18:00',
      earlyDepartureExceptions: [{ workerId: worker1Id, actualCheckoutTime: '17:00' }],
    });

    // Fetch the created attendance record IDs
    const att1 = await Attendance.findOne({ eventId: event1Id, workerId: worker1Id });
    attendance1Id = att1!._id.toString();

    const att2 = await Attendance.findOne({ eventId: event1Id, workerId: worker2Id });
    attendance2Id = att2!._id.toString();

    const att3 = await Attendance.findOne({ eventId: event1Id, workerId: worker3Id });
    attendance3Id = att3!._id.toString();
  });

  describe('1. Attendance Correction - Validation & Authorization', () => {
    it('should reject correction if reason is missing or less than 5 characters (HTTP 400)', async () => {
      const res = await fetch(`http://localhost:${port}/api/attendance/records/${attendance1Id}/correct`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${managerAToken}`,
        },
        body: JSON.stringify({
          reason: 'abc', // < 5 chars
          actualArrivalTime: '10:15',
        }),
      });

      assert.strictEqual(res.status, 400);
      const data = await res.json();
      assert.strictEqual(data.success, false);
      assert.ok(data.message.includes('Validation failed') || /reason/i.test(JSON.stringify(data)));
    });

    it('should reject correction if non-assigned manager attempts it (HTTP 403)', async () => {
      const res = await fetch(`http://localhost:${port}/api/attendance/records/${attendance1Id}/correct`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${managerBToken}`, // Bob is not assigned to Event 1
        },
        body: JSON.stringify({
          reason: 'Correcting worker arrival',
          actualArrivalTime: '10:15',
        }),
      });

      assert.strictEqual(res.status, 403);
      const data = await res.json();
      assert.strictEqual(data.success, false);
      assert.match(data.message, /permission/i);
    });

    it('should reject correction if worker or client attempts it (HTTP 403)', async () => {
      const resWorker = await fetch(`http://localhost:${port}/api/attendance/records/${attendance1Id}/correct`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${workerToken}`,
        },
        body: JSON.stringify({
          reason: 'Worker attempting correction',
        }),
      });
      assert.strictEqual(resWorker.status, 403);

      const resClient = await fetch(`http://localhost:${port}/api/attendance/records/${attendance1Id}/correct`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${clientToken}`,
        },
        body: JSON.stringify({
          reason: 'Client attempting correction',
        }),
      });
      assert.strictEqual(resClient.status, 403);
    });

    it('should reject correction if actual checkout time is before check-in time (HTTP 400)', async () => {
      const res = await fetch(`http://localhost:${port}/api/attendance/records/${attendance1Id}/correct`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${managerAToken}`,
        },
        body: JSON.stringify({
          reason: 'Invalid checkout before checkin',
          actualCheckoutTime: '08:00', // 08:00 is earlier than 10:00 checkin
        }),
      });

      assert.strictEqual(res.status, 400);
      const data = await res.json();
      assert.strictEqual(data.success, false);
      assert.match(data.message, /later than/i);
    });
  });

  describe('2. Attendance Correction - Timestamps & Recalculations', () => {
    it('should successfully correct check-in time and recalculate delayMinutes and arrivalStatus', async () => {
      // Worker 1 checked in at 10:00 (on_time). Manager corrects it to 10:20 (20 mins late)
      const res = await fetch(`http://localhost:${port}/api/attendance/records/${attendance1Id}/correct`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${managerAToken}`,
        },
        body: JSON.stringify({
          reason: 'Traffic jam delay confirmed by team lead',
          actualArrivalTime: '10:20', // 20 min delay past 10:00
        }),
      });

      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.strictEqual(data.data.arrivalStatus, 'late');
      assert.strictEqual(data.data.delayMinutes, 20);
      // Duration recalculation: 10:20 to 17:00 = 400 minutes
      assert.strictEqual(data.data.durationMinutes, 400);

      // Verify audit trail record
      assert.ok(data.data.corrections.length >= 1);
      const lastCorr = data.data.corrections[data.data.corrections.length - 1];
      assert.strictEqual(lastCorr.reason, 'Traffic jam delay confirmed by team lead');
      assert.strictEqual(lastCorr.previousArrivalStatus, 'on_time');
      assert.strictEqual(lastCorr.newArrivalStatus, 'late');
    });

    it('should successfully correct checkout time and recalculate duration, overtime and earlyDeparture', async () => {
      // Worker 1 currently checks out at 17:00. Correct checkout time to 19:30 (90 mins overtime past 18:00 normal finish)
      const res = await fetch(`http://localhost:${port}/api/attendance/records/${attendance1Id}/correct`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${managerAToken}`,
        },
        body: JSON.stringify({
          reason: 'Assisted catering teardown until 19:30',
          actualCheckoutTime: '19:30',
        }),
      });

      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.strictEqual(data.data.departureStatus, 'overtime');
      assert.strictEqual(data.data.earlyDepartureMinutes, 0);
      assert.strictEqual(data.data.overtimeMinutes, 90);
      // Duration from 10:20 to 19:30 = 550 minutes
      assert.strictEqual(data.data.durationMinutes, 550);

      // Check audit trail
      assert.ok(data.data.corrections.length >= 2);
      const lastCorr = data.data.corrections[data.data.corrections.length - 1];
      assert.strictEqual(lastCorr.previousDepartureStatus, 'early_departure');
      assert.strictEqual(lastCorr.newDepartureStatus, 'overtime');
    });
  });

  describe('3. Absence Reversal Workflow', () => {
    it('should reject reversing absence after checkout without either actualCheckoutTime or applyDefaultCheckout (HTTP 400)', async () => {
      const res = await fetch(`http://localhost:${port}/api/attendance/records/${attendance3Id}/correct`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${managerAToken}`,
        },
        body: JSON.stringify({
          reason: 'Worker was actually present in kitchen',
          arrivalStatus: 'on_time',
          // Neither actualCheckoutTime nor applyDefaultCheckout provided post checkout finalization
        }),
      });

      assert.strictEqual(res.status, 400);
      const data = await res.json();
      assert.strictEqual(data.success, false);
      assert.match(data.message, /checkout finalization/i);
    });

    it('should successfully reverse absence post-checkout with applyDefaultCheckout: true', async () => {
      // Worker 3 was marked absent. Reverse absence with On Time arrival and default checkout (18:00)
      const res = await fetch(`http://localhost:${port}/api/attendance/records/${attendance3Id}/correct`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${managerAToken}`,
        },
        body: JSON.stringify({
          reason: 'Worker was present in back kitchen, mistakenly marked absent',
          arrivalStatus: 'on_time',
          applyDefaultCheckout: true,
        }),
      });

      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.strictEqual(data.data.status, 'checked_out');
      assert.strictEqual(data.data.arrivalStatus, 'on_time');
      assert.strictEqual(data.data.delayMinutes, 0);
      assert.strictEqual(data.data.departureStatus, 'normal');
      assert.strictEqual(data.data.earlyDepartureMinutes, 0);
      assert.strictEqual(data.data.overtimeMinutes, 0);
      assert.strictEqual(data.data.durationMinutes, 480); // 10:00 to 18:00 = 8 hours = 480 mins
      assert.strictEqual(data.data.checkOutSource, 'system_default');
      assert.strictEqual(data.data.corrections.length, 1);
      assert.strictEqual(data.data.corrections[0].previousArrivalStatus, 'absent');
      assert.strictEqual(data.data.corrections[0].newArrivalStatus, 'on_time');
    });

    it('should successfully reverse absence post-checkout with actualCheckoutTime', async () => {
      // Create a temporary 4th worker marked absent on Event 1
      const worker4Id = new mongoose.Types.ObjectId().toString();
      await User.create({
        _id: worker4Id,
        name: 'Worker Four',
        email: 'worker4_p45@example.com',
        password: 'password123',
        role: 'worker',
        workerType: 'Catering Boy',
        isActive: true,
      });

      const att4 = await Attendance.create({
        eventId: event1Id,
        workerId: worker4Id,
        requirementId: reqId,
        workerType: 'Catering Boy',
        reportingTimeSnapshot: '10:00',
        status: 'absent',
        arrivalStatus: 'absent',
        delayMinutes: 0,
        departureStatus: 'not_recorded',
        earlyDepartureMinutes: 0,
        overtimeMinutes: 0,
        durationMinutes: 0,
        checkIn: null,
        checkInSource: 'not_recorded',
        checkOut: null,
        checkOutSource: 'not_recorded',
        verificationStatus: 'pending_review',
      });

      const res = await fetch(`http://localhost:${port}/api/attendance/records/${att4._id}/correct`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${managerAToken}`,
        },
        body: JSON.stringify({
          reason: 'Worker arrived late and left early',
          arrivalStatus: 'late',
          actualArrivalTime: '10:30', // 30 mins late
          actualCheckoutTime: '17:00', // 60 mins early
        }),
      });

      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.strictEqual(data.data.status, 'checked_out');
      assert.strictEqual(data.data.arrivalStatus, 'late');
      assert.strictEqual(data.data.delayMinutes, 30);
      assert.strictEqual(data.data.departureStatus, 'early_departure');
      assert.strictEqual(data.data.earlyDepartureMinutes, 60);
      assert.strictEqual(data.data.durationMinutes, 390); // 10:30 to 17:00 = 6.5h = 390m

      // Clean up worker 4 so our main suite has only workers 1-3
      await Attendance.deleteOne({ _id: att4._id });
      await User.deleteOne({ _id: worker4Id });
    });
  });

  describe('4. Final Verification & Approval Workflow', () => {
    it('should reject verification if check-in or check-out is not finalized (HTTP 400)', async () => {
      // Create session on Event 2 where checkout is not finalized
      await AttendanceSession.create({
        eventId: event2Id,
        reportingTime: '10:00',
        checkInFinalized: true,
        checkOutFinalized: false,
      });

      const res = await fetch(`http://localhost:${port}/api/attendance/events/${event2Id}/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${managerBToken}`,
        },
        body: JSON.stringify({
          action: 'approve',
        }),
      });

      assert.strictEqual(res.status, 400);
      const data = await res.json();
      assert.strictEqual(data.success, false);
      assert.match(data.message, /finalized before/i);
    });

    it('should reject rejection action if reason is missing or < 5 characters (HTTP 400)', async () => {
      const res = await fetch(`http://localhost:${port}/api/attendance/events/${event1Id}/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${managerAToken}`,
        },
        body: JSON.stringify({
          action: 'reject',
          rejectionReason: 'bad', // < 5 chars
        }),
      });

      assert.strictEqual(res.status, 400);
      const data = await res.json();
      assert.strictEqual(data.success, false);
      assert.ok(data.message.includes('Validation failed') || /reason/i.test(JSON.stringify(data)));
    });

    it('should reject verification if unauthorized manager attempts it (HTTP 403)', async () => {
      const res = await fetch(`http://localhost:${port}/api/attendance/events/${event1Id}/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${managerBToken}`, // Bob is not assigned to Event 1
        },
        body: JSON.stringify({
          action: 'approve',
        }),
      });

      assert.strictEqual(res.status, 403);
      const data = await res.json();
      assert.strictEqual(data.success, false);
      assert.match(data.message, /permission/i);
    });

    it('should successfully approve complete event attendance', async () => {
      // Event 1 currently has all 3 workers in checked_out status with complete records
      const res = await fetch(`http://localhost:${port}/api/attendance/events/${event1Id}/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${managerAToken}`,
        },
        body: JSON.stringify({
          action: 'approve',
        }),
      });

      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.strictEqual(data.data.verificationStatus, 'approved');
      assert.strictEqual(data.data.verifiedBy, managerAId);
      assert.ok(data.data.verifiedAt);
      assert.strictEqual(data.data.totalRecords, 3);

      // Verify in DB that all individual records are marked 'approved'
      const records = await Attendance.find({ eventId: event1Id });
      for (const rec of records) {
        assert.strictEqual(rec.verificationStatus, 'approved');
        assert.strictEqual(rec.verifiedBy?.toString(), managerAId);
        assert.ok(rec.verifiedAt);
      }
    });

    it('should automatically reset verification status to pending_review when an approved record is corrected', async () => {
      // Event 1 was approved in the previous test.
      // Now Manager A corrects Worker 2's attendance departure time to 18:30
      const res = await fetch(`http://localhost:${port}/api/attendance/records/${attendance2Id}/correct`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${managerAToken}`,
        },
        body: JSON.stringify({
          reason: 'Correcting departure time after manager review with client',
          actualCheckoutTime: '18:30', // 30 mins overtime
        }),
      });

      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);

      // Check session status in DB
      const session = await AttendanceSession.findOne({ eventId: event1Id });
      assert.strictEqual(session?.verificationStatus, 'pending_review');
      assert.ok(!session?.verifiedBy);
      assert.ok(!session?.verifiedAt);

      // Check all records in DB: all records should be reset to 'pending_review'
      const records = await Attendance.find({ eventId: event1Id });
      for (const rec of records) {
        assert.strictEqual(rec.verificationStatus, 'pending_review');
        assert.ok(!rec.verifiedBy);
        assert.ok(!rec.verifiedAt);
      }
    });

    it('should successfully reject event attendance with valid rejection reason', async () => {
      const res = await fetch(`http://localhost:${port}/api/attendance/events/${event1Id}/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${managerAToken}`,
        },
        body: JSON.stringify({
          action: 'reject',
          rejectionReason: 'Client disputed catering hours; investigation pending',
        }),
      });

      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.strictEqual(data.data.verificationStatus, 'rejected');
      assert.strictEqual(data.data.rejectionReason, 'Client disputed catering hours; investigation pending');
      assert.strictEqual(data.data.verifiedBy, managerAId);

      // Verify in DB that all records are marked 'rejected'
      const records = await Attendance.find({ eventId: event1Id });
      for (const rec of records) {
        assert.strictEqual(rec.verificationStatus, 'rejected');
      }
    });

    it('should allow Admin to approve attendance even if not assigned', async () => {
      const res = await fetch(`http://localhost:${port}/api/attendance/events/${event1Id}/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          action: 'approve',
        }),
      });

      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.strictEqual(data.data.verificationStatus, 'approved');
      assert.strictEqual(data.data.verifiedBy, adminId);
    });

    it('should return verification status in getRoster API', async () => {
      const res = await fetch(`http://localhost:${port}/api/attendance/events/${event1Id}/roster`, {
        headers: {
          Authorization: `Bearer ${managerAToken}`,
        },
      });

      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.strictEqual(data.data.session.verificationStatus, 'approved');
      assert.strictEqual(data.data.session.verifiedBy, adminId);
      assert.ok(data.data.roster.length > 0);
      for (const worker of data.data.roster) {
        assert.strictEqual(worker.verificationStatus, 'approved');
      }
    });
  });

  after(async () => {
    if (server) server.close();
    await mongoose.disconnect();
  });
});
