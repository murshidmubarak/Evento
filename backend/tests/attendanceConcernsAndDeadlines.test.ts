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
import { AttendanceConcern } from '../src/modules/attendance/model/attendance-concern.model.js';
import { Notification } from '../src/modules/notifications/model/notification.model.js';
import {
  calculateEventCorrectionWindow,
  getOperationalDateString,
} from '../src/modules/attendance/utils/attendance-window.util.js';

describe('Milestone 4 — Prompt 2: Worker Concerns, 24h Normal Correction Window, Exceptional Corrections & Permanent Status Locking', () => {
  let server: any;
  let port: number;

  let adminToken: string;
  let adminId: string;

  let managerToken: string;
  let managerId: string;

  let otherManagerToken: string;
  let otherManagerId: string;

  let clientToken: string;
  let clientId: string;

  let worker1Token: string;
  let worker1Id: string;

  let worker2Token: string;
  let worker2Id: string;

  let worker3Token: string;
  let worker3Id: string;

  let eventId: string;
  let reqId: string;

  const generateToken = (userId: string, role: string) => {
    return jwt.sign({ userId, role }, env.jwtSecret, { expiresIn: '1h' });
  };

  before(async () => {
    await connectDB();
    server = app.listen(0);
    port = (server.address() as any).port;

    // Strict Rule 26: setup.ts ensures this runs on eventops_test
    await User.deleteMany({});
    await Event.deleteMany({});
    await WorkRequirement.deleteMany({});
    await AttendanceSession.deleteMany({});
    await Attendance.deleteMany({});
    await AttendanceConcern.deleteMany({});
    await Notification.deleteMany({});

    // 1. Users setup
    adminId = new mongoose.Types.ObjectId().toString();
    await User.create({
      _id: adminId,
      name: 'Admin User',
      email: 'admin_p2@example.com',
      password: 'password123',
      role: 'admin',
      isActive: true,
    });
    adminToken = generateToken(adminId, 'admin');

    managerId = new mongoose.Types.ObjectId().toString();
    await User.create({
      _id: managerId,
      name: 'Assigned Manager',
      email: 'manager_p2@example.com',
      password: 'password123',
      role: 'event_manager',
      isActive: true,
    });
    managerToken = generateToken(managerId, 'event_manager');

    otherManagerId = new mongoose.Types.ObjectId().toString();
    await User.create({
      _id: otherManagerId,
      name: 'Other Manager',
      email: 'other_mgr_p2@example.com',
      password: 'password123',
      role: 'event_manager',
      isActive: true,
    });
    otherManagerToken = generateToken(otherManagerId, 'event_manager');

    clientId = new mongoose.Types.ObjectId().toString();
    await User.create({
      _id: clientId,
      name: 'Event Client',
      email: 'client_p2@example.com',
      password: 'password123',
      role: 'client',
      isActive: true,
    });
    clientToken = generateToken(clientId, 'client');

    worker1Id = new mongoose.Types.ObjectId().toString();
    await User.create({
      _id: worker1Id,
      name: 'Ahmed Cameraman',
      email: 'ahmed_p2@example.com',
      password: 'password123',
      role: 'worker',
      workerType: 'Cameraman / Photographer',
      isActive: true,
    });
    worker1Token = generateToken(worker1Id, 'worker');

    worker2Id = new mongoose.Types.ObjectId().toString();
    await User.create({
      _id: worker2Id,
      name: 'Bilal Late',
      email: 'bilal_p2@example.com',
      password: 'password123',
      role: 'worker',
      workerType: 'Cameraman / Photographer',
      isActive: true,
    });
    worker2Token = generateToken(worker2Id, 'worker');

    worker3Id = new mongoose.Types.ObjectId().toString();
    await User.create({
      _id: worker3Id,
      name: 'Cyrus Absent',
      email: 'cyrus_p2@example.com',
      password: 'password123',
      role: 'worker',
      workerType: 'Cameraman / Photographer',
      isActive: true,
    });
    worker3Token = generateToken(worker3Id, 'worker');

    // Event scheduled for today
    const today = new Date();
    eventId = new mongoose.Types.ObjectId().toString();
    await Event.create({
      _id: eventId,
      clientId,
      eventManagerId: managerId,
      title: 'Global Summit Gala',
      eventType: 'Corporate',
      date: today,
      startTime: '08:00',
      endTime: '18:00',
      guestCount: 200,
      status: 'confirmed',
      location: { address: 'Tech Park, Bangalore' },
    });

    reqId = new mongoose.Types.ObjectId().toString();
    await WorkRequirement.create({
      _id: reqId,
      eventId,
      workerType: 'Cameraman / Photographer',
      requiredCount: 3,
      assignedWorkers: [
        { workerId: new mongoose.Types.ObjectId(worker1Id), assignedAt: new Date() },
        { workerId: new mongoose.Types.ObjectId(worker2Id), assignedAt: new Date() },
        { workerId: new mongoose.Types.ObjectId(worker3Id), assignedAt: new Date() },
      ],
      reportingTime: '08:00',
      status: 'filled',
    });
  });

  after(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    await AttendanceConcern.deleteMany({});
    await Attendance.deleteMany({});
    await AttendanceSession.deleteMany({});
    await WorkRequirement.deleteMany({});
    await Event.deleteMany({});
    await User.deleteMany({});
    await Notification.deleteMany({});
    await mongoose.disconnect();
  });

  // ===========================================================================
  // 1. Timezone & Window Calculation Logic Tests
  // ===========================================================================
  describe('1. Timezone & Window Calculation Engine', () => {
    it('calculates scheduledEventEndAt and 24h deadline for daytime event', () => {
      const windowInfo = calculateEventCorrectionWindow({
        date: '2026-11-09T00:00:00.000Z',
        startTime: '08:00',
        endTime: '18:00',
      });

      assert.strictEqual(windowInfo.eventOperationalDate, '2026-11-09');
      // In Asia/Kolkata (+05:30), 18:00 on 2026-11-09 is 12:30 UTC
      assert.strictEqual(windowInfo.scheduledEventEndAt.toISOString(), '2026-11-09T12:30:00.000Z');
      // Deadline is exactly 24 hours later
      assert.strictEqual(windowInfo.correctionDeadlineAt.toISOString(), '2026-11-10T12:30:00.000Z');
    });

    it('correctly handles overnight event spanning into next day', () => {
      const windowInfo = calculateEventCorrectionWindow({
        date: '2026-11-09T00:00:00.000Z',
        startTime: '20:00',
        endTime: '02:00',
      });

      assert.strictEqual(windowInfo.eventOperationalDate, '2026-11-09');
      // 02:00 on next day (2026-11-10) in IST is 20:30 UTC on 2026-11-09
      assert.strictEqual(windowInfo.scheduledEventEndAt.toISOString(), '2026-11-09T20:30:00.000Z');
      assert.strictEqual(windowInfo.correctionDeadlineAt.toISOString(), '2026-11-10T20:30:00.000Z');
    });
  });

  // ===========================================================================
  // 2. Normal Manager Correction Window Tests
  // ===========================================================================
  describe('2. Normal Manager Correction Window (§2 & §7)', () => {
    let worker1AttId: string;
    let worker2AttId: string;
    let worker3AttId: string;

    before(async () => {
      // Record initial exceptions for worker 2 (Late) and worker 3 (Absent)
      const resLate = await fetch(`http://127.0.0.1:${port}/api/attendance/events/${eventId}/workers/${worker2Id}/checkin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${managerToken}` },
        body: JSON.stringify({ arrivalStatus: 'late', actualArrivalTime: '08:45' }),
      });
      const dataLate = (await resLate.json()) as any;
      if (resLate.status !== 200) {
        console.error('resLate failed:', resLate.status, dataLate);
      }
      assert.strictEqual(resLate.status, 200);
      worker2AttId = dataLate.data.attendanceId;

      const resAbsent = await fetch(`http://127.0.0.1:${port}/api/attendance/events/${eventId}/workers/${worker3Id}/checkin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${managerToken}` },
        body: JSON.stringify({ arrivalStatus: 'absent' }),
      });
      const dataAbsent = (await resAbsent.json()) as any;
      if (resAbsent.status !== 200) {
        console.error('resAbsent failed:', resAbsent.status, dataAbsent);
      }
      assert.strictEqual(resAbsent.status, 200);
      worker3AttId = dataAbsent.data.attendanceId;

      // Finalize checkout to provision default Present record for worker 1
      const resCheckout = await fetch(`http://127.0.0.1:${port}/api/attendance/events/${eventId}/finalize-checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${managerToken}`,
          'Idempotency-Key': 'checkout_idemp_p2_1',
        },
        body: JSON.stringify({ actualNormalFinishTime: '18:00' }),
      });
      const dataCheckout = (await resCheckout.json()) as any;
      if (resCheckout.status !== 200) {
        console.error('resCheckout failed:', resCheckout.status, dataCheckout);
      }
      assert.strictEqual(resCheckout.status, 200);

      const worker1Att = await Attendance.findOne({ eventId, workerId: worker1Id });
      assert.ok(worker1Att);
      worker1AttId = worker1Att._id.toString();
    });

    it('1. Manager can change Late to Present during normal correction period', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/api/attendance/records/${worker2AttId}/correct`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${managerToken}` },
        body: JSON.stringify({
          arrivalStatus: 'on_time',
          reason: 'Worker arrived on time via main gate, sensor misread',
        }),
      });
      const json = (await res.json()) as any;
      assert.strictEqual(res.status, 200);
      assert.strictEqual(json.data.arrivalStatus, 'on_time');

      const att = await Attendance.findById(worker2AttId);
      assert.strictEqual(att?.arrivalStatus, 'on_time');
      assert.strictEqual(att?.corrections.length, 1);
    });

    it('2. Manager can change Absent to Present during normal correction period', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/api/attendance/records/${worker3AttId}/correct`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${managerToken}` },
        body: JSON.stringify({
          arrivalStatus: 'on_time',
          applyDefaultCheckout: true,
          reason: 'Worker was present at loading bay, missed morning rollcall',
        }),
      });
      const json = (await res.json()) as any;
      assert.strictEqual(res.status, 200);
      assert.strictEqual(json.data.arrivalStatus, 'on_time');
      assert.strictEqual(json.data.status, 'checked_out');
    });

    it('3. Manager can correct arrival time during normal correction period', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/api/attendance/records/${worker2AttId}/correct`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${managerToken}` },
        body: JSON.stringify({
          actualArrivalTime: '08:15',
          reason: 'Security log confirmed arrival at 08:15',
        }),
      });
      const json = (await res.json()) as any;
      assert.strictEqual(res.status, 200);
      assert.strictEqual(json.data.arrivalStatus, 'late');
      assert.strictEqual(json.data.delayMinutes, 15);
    });

    it('4. Rejects correction from an unauthorized manager (not assigned to event)', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/api/attendance/records/${worker2AttId}/correct`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${otherManagerToken}` },
        body: JSON.stringify({
          arrivalStatus: 'on_time',
          reason: 'Unauthorized attempt to modify attendance',
        }),
      });
      assert.strictEqual(res.status, 403);
    });

    it('5. Rejects normal correction after 24h deadline has expired', async () => {
      // Create past event whose deadline expired yesterday
      const pastDate = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
      const pastEvent = await Event.create({
        clientId,
        eventManagerId: managerId,
        title: 'Past Expo 2026',
        eventType: 'Corporate',
        date: pastDate,
        startTime: '09:00',
        endTime: '17:00',
        guestCount: 100,
        status: 'completed',
        location: { address: 'Old Town' },
      });

      const pastAtt = await Attendance.create({
        eventId: pastEvent._id,
        requirementId: reqId,
        workerId: worker2Id,
        workerType: 'Cameraman / Photographer',
        reportingTimeSnapshot: '09:00',
        arrivalStatus: 'late',
        status: 'checked_out',
        delayMinutes: 30,
      });

      await AttendanceSession.create({
        eventId: pastEvent._id,
        checkInFinalized: false,
        checkOutFinalized: true,
        actualNormalFinishTime: '17:00',
        lifecycleStatus: 'checkout_finalized',
      });

      const res = await fetch(`http://127.0.0.1:${port}/api/attendance/records/${pastAtt._id}/correct`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${managerToken}` },
        body: JSON.stringify({
          arrivalStatus: 'on_time',
          reason: 'Attempting correction after deadline has expired',
        }),
      });

      assert.strictEqual(res.status, 403);
      const json = (await res.json()) as any;
      assert.match(json.message, /expired/i);
    });
  });

  // ===========================================================================
  // 3. Worker Concern Submission Tests
  // ===========================================================================
  describe('3. Worker Attendance Concern Submission (§4)', () => {
    let eligibleEventId: string;
    let lateAttId: string;
    let presentAttId: string;

    before(async () => {
      // Create an event that ended 2 hours ago (within 24h window)
      const eventDate = new Date();
      const pastEvent = await Event.create({
        clientId,
        eventManagerId: managerId,
        title: 'Afternoon Gala',
        eventType: 'Wedding',
        date: eventDate,
        startTime: '08:00',
        endTime: '12:00', // Ended at 12:00 PM today
        guestCount: 150,
        status: 'confirmed',
        location: { address: 'Palace Grounds' },
      });
      eligibleEventId = pastEvent._id.toString();

      // Worker 2 is marked Late
      const attLate = await Attendance.create({
        eventId: pastEvent._id,
        requirementId: reqId,
        workerId: worker2Id,
        workerType: 'Cameraman / Photographer',
        reportingTimeSnapshot: '08:00',
        arrivalStatus: 'late',
        status: 'checked_out',
        delayMinutes: 45,
      });
      lateAttId = attLate._id.toString();

      // Worker 1 is marked On Time (Present)
      const attPresent = await Attendance.create({
        eventId: pastEvent._id,
        requirementId: reqId,
        workerId: worker1Id,
        workerType: 'Cameraman / Photographer',
        reportingTimeSnapshot: '08:00',
        arrivalStatus: 'on_time',
        status: 'checked_out',
      });
      presentAttId = attPresent._id.toString();
    });

    it('9. Eligible worker can submit concern for Late attendance within deadline', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/api/attendance/concerns`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${worker2Token}` },
        body: JSON.stringify({
          attendanceId: lateAttId,
          concernCategory: 'late_dispute',
          explanation: 'I reported at 07:55 AM at East Gate, but entry queue was delayed by security screening.',
        }),
      });

      assert.strictEqual(res.status, 201);
      const json = (await res.json()) as any;
      assert.strictEqual(json.data.status, 'open');
      assert.strictEqual(json.data.concernCategory, 'late_dispute');
      assert.strictEqual(json.data.messages.length, 1);

      // Verify attendance record was flagged with open concern
      const att = await Attendance.findById(lateAttId);
      assert.strictEqual(att?.hasOpenConcern, true);
      assert.strictEqual(att?.activeConcernId?.toString(), json.data._id);

      // Verify manager was notified
      const notif = await Notification.findOne({
        recipientId: managerId,
        type: 'attendance_concern_raised',
      });
      assert.ok(notif);
      assert.match(notif.message, /submitted an attendance concern/i);
    });

    it('10. Worker cannot submit concern before event end', async () => {
      const futureDate = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
      const futureEvent = await Event.create({
        clientId,
        eventManagerId: managerId,
        title: 'Future Conclave',
        eventType: 'Corporate',
        date: futureDate,
        startTime: '10:00',
        endTime: '18:00',
        guestCount: 50,
        status: 'confirmed',
        location: { address: 'Hall A' },
      });

      const futureAtt = await Attendance.create({
        eventId: futureEvent._id,
        requirementId: reqId,
        workerId: worker2Id,
        workerType: 'Cameraman / Photographer',
        reportingTimeSnapshot: '10:00',
        arrivalStatus: 'late',
        status: 'checked_in',
      });

      const res = await fetch(`http://127.0.0.1:${port}/api/attendance/concerns`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${worker2Token}` },
        body: JSON.stringify({
          attendanceId: futureAtt._id.toString(),
          concernCategory: 'late_dispute',
          explanation: 'Premature concern submission before event ended',
        }),
      });

      assert.strictEqual(res.status, 400);
      const json = (await res.json()) as any;
      assert.match(json.message, /after the scheduled event has ended/i);
    });

    it('11. Worker cannot submit concern after 24h deadline', async () => {
      const oldDate = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000);
      const oldEvent = await Event.create({
        clientId,
        eventManagerId: managerId,
        title: 'Expired Expo',
        eventType: 'Corporate',
        date: oldDate,
        startTime: '09:00',
        endTime: '17:00',
        guestCount: 100,
        status: 'completed',
        location: { address: 'Old Center' },
      });

      const oldAtt = await Attendance.create({
        eventId: oldEvent._id,
        requirementId: reqId,
        workerId: worker2Id,
        workerType: 'Cameraman / Photographer',
        reportingTimeSnapshot: '09:00',
        arrivalStatus: 'absent',
        status: 'absent',
      });

      const res = await fetch(`http://127.0.0.1:${port}/api/attendance/concerns`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${worker2Token}` },
        body: JSON.stringify({
          attendanceId: oldAtt._id.toString(),
          concernCategory: 'absent_dispute',
          explanation: 'Attempting to raise concern 4 days after event ended',
        }),
      });

      assert.strictEqual(res.status, 400);
      const json = (await res.json()) as any;
      assert.match(json.message, /expired/i);
    });

    it('12. Worker cannot submit concern for another worker', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/api/attendance/concerns`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${worker1Token}` },
        body: JSON.stringify({
          attendanceId: lateAttId, // Belongs to worker2
          concernCategory: 'late_dispute',
          explanation: 'Submitting concern on behalf of my colleague',
        }),
      });

      assert.strictEqual(res.status, 403);
    });

    it('13. Worker cannot submit concern for On Time (Present) status', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/api/attendance/concerns`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${worker1Token}` },
        body: JSON.stringify({
          attendanceId: presentAttId,
          concernCategory: 'time_recording_error',
          explanation: 'Disputing my on time status for no valid reason',
        }),
      });

      assert.strictEqual(res.status, 400);
      const json = (await res.json()) as any;
      assert.match(json.message, /only be raised for Late or Absent/i);
    });

    it('14. Duplicate concern submission is rejected', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/api/attendance/concerns`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${worker2Token}` },
        body: JSON.stringify({
          attendanceId: lateAttId,
          concernCategory: 'late_dispute',
          explanation: 'Second attempt to raise concern on same record',
        }),
      });

      assert.strictEqual(res.status, 409);
      const json = (await res.json()) as any;
      assert.match(json.message, /already exists/i);
    });

    it('Worker can fetch their attendance records decorated with eligibility', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/api/attendance/worker/records`, {
        headers: { Authorization: `Bearer ${worker2Token}` },
      });

      assert.strictEqual(res.status, 200);
      const json = (await res.json()) as any;
      assert.ok(Array.isArray(json.data));
      const record = json.data.find((r: any) => r.attendanceId === lateAttId);
      assert.ok(record);
      assert.strictEqual(record.hasOpenConcern, true);
      assert.strictEqual(record.eligibilityReason, 'already_open');
      assert.strictEqual(record.canRaiseConcern, false);
    });
  });

  // ===========================================================================
  // 4. Conversation Foundation & Messaging Tests
  // ===========================================================================
  describe('4. Concern Conversation Foundation (§11)', () => {
    let activeConcernId: string;

    before(async () => {
      const concern = await AttendanceConcern.findOne({ status: 'open' });
      assert.ok(concern);
      activeConcernId = concern._id.toString();
    });

    it('Manager and worker can retrieve concern thread with conversation messages', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/api/attendance/concerns/${activeConcernId}`, {
        headers: { Authorization: `Bearer ${managerToken}` },
      });

      assert.strictEqual(res.status, 200);
      const json = (await res.json()) as any;
      assert.strictEqual(json.data._id, activeConcernId);
      assert.strictEqual(json.data.messages.length, 1);
    });

    it('Manager can add a reply message to the concern thread', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/api/attendance/concerns/${activeConcernId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${managerToken}` },
        body: JSON.stringify({
          message: 'Checking East Gate security logs now. Please share badge ID.',
        }),
      });

      assert.strictEqual(res.status, 200);
      const json = (await res.json()) as any;
      assert.strictEqual(json.data.messages.length, 2);
      assert.strictEqual(json.data.messages[1].senderRole, 'event_manager');

      // Worker should have received message notification
      const notif = await Notification.findOne({
        recipientId: worker2Id,
        type: 'attendance_concern_message',
      });
      assert.ok(notif);
      assert.match(notif.message, /Checking East Gate security logs/i);
    });

    it('Worker can reply back in the thread', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/api/attendance/concerns/${activeConcernId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${worker2Token}` },
        body: JSON.stringify({ message: 'Badge ID is CAM-204.' }),
      });

      assert.strictEqual(res.status, 200);
      const json = (await res.json()) as any;
      assert.strictEqual(json.data.messages.length, 3);
    });
  });

  // ===========================================================================
  // 5. Concern Resolution & Permanent Locking Tests
  // ===========================================================================
  describe('5. Concern Resolution & Permanent Locking (§6, §7 & §12)', () => {
    let resEventId: string;
    let acceptConcernId: string;
    let acceptAttId: string;
    let rejectConcernId: string;
    let rejectAttId: string;

    before(async () => {
      // Event ended 3 hours ago
      const eventDate = new Date();
      const resEvent = await Event.create({
        clientId,
        eventManagerId: managerId,
        title: 'Spring Festival',
        eventType: 'Wedding',
        date: eventDate,
        startTime: '08:00',
        endTime: '11:00',
        guestCount: 200,
        status: 'confirmed',
        location: { address: 'Garden Hall' },
      });
      resEventId = resEvent._id.toString();

      // Session finalized checkout
      await AttendanceSession.create({
        eventId: resEvent._id,
        checkInFinalized: false,
        checkOutFinalized: true,
        actualNormalFinishTime: '11:00',
        lifecycleStatus: 'checkout_finalized',
      });

      // 1. Worker 2: Marked Absent -> raises concern
      const att1 = await Attendance.create({
        eventId: resEvent._id,
        requirementId: reqId,
        workerId: worker2Id,
        workerType: 'Cameraman / Photographer',
        reportingTimeSnapshot: '08:00',
        arrivalStatus: 'absent',
        status: 'absent',
      });
      acceptAttId = att1._id.toString();

      const concern1 = await AttendanceConcern.create({
        attendanceId: att1._id,
        eventId: resEvent._id,
        workerId: worker2Id,
        managerId,
        concernCategory: 'absent_dispute',
        explanation: 'I worked the entire morning shift from 8 AM to 11 AM.',
        status: 'open',
        messages: [{ senderId: worker2Id, senderRole: 'worker', message: 'Worked full shift', sentAt: new Date() }],
      });
      acceptConcernId = concern1._id.toString();
      await Attendance.findByIdAndUpdate(att1._id, { hasOpenConcern: true, activeConcernId: concern1._id });

      // 2. Worker 3: Marked Late -> raises concern
      const att2 = await Attendance.create({
        eventId: resEvent._id,
        requirementId: reqId,
        workerId: worker3Id,
        workerType: 'Cameraman / Photographer',
        reportingTimeSnapshot: '08:00',
        arrivalStatus: 'late',
        status: 'checked_out',
        delayMinutes: 60,
      });
      rejectAttId = att2._id.toString();

      const concern2 = await AttendanceConcern.create({
        attendanceId: att2._id,
        eventId: resEvent._id,
        workerId: worker3Id,
        managerId,
        concernCategory: 'late_dispute',
        explanation: 'Traffic delay explanation',
        status: 'open',
        messages: [{ senderId: worker3Id, senderRole: 'worker', message: 'Traffic delay', sentAt: new Date() }],
      });
      rejectConcernId = concern2._id.toString();
      await Attendance.findByIdAndUpdate(att2._id, { hasOpenConcern: true, activeConcernId: concern2._id });
    });

    it('17 & 18. Manager ACCEPTS concern: transitions Absent -> Present, updates audit, and locks record', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/api/attendance/concerns/${acceptConcernId}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${managerToken}` },
        body: JSON.stringify({
          action: 'accept',
          resultingArrivalStatus: 'on_time',
          resolutionExplanation: 'Verified with lead cameraman: worker was on duty from 8:00 AM.',
        }),
      });

      assert.strictEqual(res.status, 200);
      const json = (await res.json()) as any;
      assert.strictEqual(json.data.status, 'closed');
      assert.strictEqual(json.data.resolutionOutcome, 'accepted');
      assert.strictEqual(json.data.resultingArrivalStatus, 'on_time');

      // Verify attendance record
      const att = await Attendance.findById(acceptAttId);
      assert.ok(att);
      assert.strictEqual(att.arrivalStatus, 'on_time');
      assert.strictEqual(att.status, 'checked_out');
      assert.strictEqual(att.isStatusLocked, true);
      assert.strictEqual(att.statusLockedReason, 'concern_accepted');
      assert.strictEqual(att.hasOpenConcern, false);
      assert.strictEqual(att.corrections.length, 1);
      assert.match(att.corrections[0].reason, /Concern Accepted/i);

      // Verify worker notification
      const notif = await Notification.findOne({
        recipientId: worker2Id,
        type: 'attendance_concern_resolved',
      });
      assert.ok(notif);
      assert.match(notif.message, /ACCEPTED/i);
    });

    it('22. Manager REJECTS concern: keeps status unchanged, records explanation, and locks record', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/api/attendance/concerns/${rejectConcernId}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${managerToken}` },
        body: JSON.stringify({
          action: 'reject',
          resolutionExplanation: 'CCTV footage confirms arrival was at 09:00 AM, Late status upheld.',
        }),
      });

      assert.strictEqual(res.status, 200);
      const json = (await res.json()) as any;
      assert.strictEqual(json.data.status, 'closed');
      assert.strictEqual(json.data.resolutionOutcome, 'rejected');

      // Verify attendance record
      const att = await Attendance.findById(rejectAttId);
      assert.ok(att);
      assert.strictEqual(att.arrivalStatus, 'late'); // Status unchanged
      assert.strictEqual(att.delayMinutes, 60);
      assert.strictEqual(att.isStatusLocked, true); // Permanently locked
      assert.strictEqual(att.statusLockedReason, 'concern_rejected');
      assert.strictEqual(att.hasOpenConcern, false);
      assert.strictEqual(att.corrections.length, 0); // No correction audit record for rejected concern

      // Verify worker notification
      const notif = await Notification.findOne({
        recipientId: worker3Id,
        type: 'attendance_concern_resolved',
      });
      assert.ok(notif);
      assert.match(notif.message, /REJECTED/i);
    });

    it('25 & 26. Closed concern CANNOT be resolved again or reopened', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/api/attendance/concerns/${acceptConcernId}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${managerToken}` },
        body: JSON.stringify({
          action: 'reject',
          resolutionExplanation: 'Attempting to change decision on closed concern',
        }),
      });

      assert.strictEqual(res.status, 400);
      const json = (await res.json()) as any;
      assert.match(json.message, /already been resolved and closed/i);
    });

    it('27 & 28. No new messages can be added to closed concern', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/api/attendance/concerns/${acceptConcernId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${worker2Token}` },
        body: JSON.stringify({ message: 'Sending message to closed thread' }),
      });

      assert.strictEqual(res.status, 400);
      const json = (await res.json()) as any;
      assert.match(json.message, /closed concern/i);
    });

    it('29. Normal correction API rejects modifications to permanently locked record', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/api/attendance/records/${acceptAttId}/correct`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${managerToken}` },
        body: JSON.stringify({
          arrivalStatus: 'late',
          actualArrivalTime: '08:30',
          reason: 'Attempting normal correction on locked record',
        }),
      });

      assert.strictEqual(res.status, 403);
      const json = (await res.json()) as any;
      assert.match(json.message, /permanently locked/i);
    });

    it('30. Check-in marking API rejects modifications to permanently locked record', async () => {
      const res = await fetch(
        `http://127.0.0.1:${port}/api/attendance/events/${resEventId}/workers/${worker2Id}/checkin`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${managerToken}` },
          body: JSON.stringify({ arrivalStatus: 'absent' }),
        }
      );

      assert.strictEqual(res.status, 403);
      const json = (await res.json()) as any;
      assert.match(json.message, /permanently locked/i);
    });
  });

  // ===========================================================================
  // 6. Verification Blocking by Open Concerns Regression Tests (§13)
  // ===========================================================================
  describe('6. Attendance Verification Guard with Open Concerns (§13)', () => {
    let verifyEventId: string;
    let openConcernId: string;

    before(async () => {
      const eventDate = new Date();
      const vEvent = await Event.create({
        clientId,
        eventManagerId: managerId,
        title: 'Royal Wedding Reception',
        eventType: 'Wedding',
        date: eventDate,
        startTime: '10:00',
        endTime: '15:00',
        guestCount: 300,
        status: 'confirmed',
        location: { address: 'Palace Grounds' },
      });
      verifyEventId = vEvent._id.toString();

      // Attendance record with open concern
      const att = await Attendance.create({
        eventId: vEvent._id,
        requirementId: reqId,
        workerId: worker1Id,
        workerType: 'Cameraman / Photographer',
        reportingTimeSnapshot: '10:00',
        arrivalStatus: 'late',
        status: 'checked_out',
        checkIn: new Date(),
        checkOut: new Date(),
        durationMinutes: 300,
      });

      await AttendanceSession.create({
        eventId: vEvent._id,
        checkInFinalized: false,
        checkOutFinalized: true,
        actualNormalFinishTime: '15:00',
        lifecycleStatus: 'checkout_finalized',
      });

      const concern = await AttendanceConcern.create({
        attendanceId: att._id,
        eventId: vEvent._id,
        workerId: worker1Id,
        managerId,
        concernCategory: 'late_dispute',
        explanation: 'Reporting time dispute pending review',
        status: 'open',
      });
      openConcernId = concern._id.toString();
      await Attendance.findByIdAndUpdate(att._id, { hasOpenConcern: true, activeConcernId: concern._id });
    });

    it('45. Final verification is BLOCKED while open concerns exist', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/api/attendance/events/${verifyEventId}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${managerToken}` },
        body: JSON.stringify({ action: 'approve' }),
      });

      assert.strictEqual(res.status, 400);
      const json = (await res.json()) as any;
      assert.match(json.message, /attendance concern\(s\) remain open/i);
    });

    it('44. Final verification SUCCEEDS once the concern is resolved and closed', async () => {
      // Resolve the open concern first
      const resolveRes = await fetch(
        `http://127.0.0.1:${port}/api/attendance/concerns/${openConcernId}/resolve`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${managerToken}` },
          body: JSON.stringify({
            action: 'accept',
            resultingArrivalStatus: 'on_time',
            resolutionExplanation: 'Resolved prior to event verification approval',
          }),
        }
      );
      assert.strictEqual(resolveRes.status, 200);

      // Now attempt verification again
      const verifyRes = await fetch(
        `http://127.0.0.1:${port}/api/attendance/events/${verifyEventId}/verify`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${managerToken}` },
          body: JSON.stringify({ action: 'approve' }),
        }
      );

      assert.strictEqual(verifyRes.status, 200);
      const json = (await verifyRes.json()) as any;
      assert.strictEqual(json.data.verificationStatus, 'approved');
    });
  });

  after(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    await mongoose.disconnect();
  });
});

