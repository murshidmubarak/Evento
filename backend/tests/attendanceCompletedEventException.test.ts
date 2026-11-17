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

describe('Attendance Completed Event Exception & Event-Day Window Rules', () => {
  let server: any;
  let port: number;

  let managerToken: string;
  let managerId: string;

  let worker1Id: string;
  let worker2Id: string;

  let completedTodayEventId: string;
  let reqTodayId: string;

  let completedPastEventId: string;
  let reqPastId: string;

  let completedOvernightEventId: string;
  let reqOvernightId: string;

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

    managerId = new mongoose.Types.ObjectId().toString();
    await User.create({
      _id: managerId,
      name: 'Manager Arjun',
      email: 'manager_comp_ex@eventops.local',
      password: 'password123',
      role: 'event_manager',
      isActive: true,
    });
    managerToken = generateToken(managerId, 'event_manager');

    worker1Id = new mongoose.Types.ObjectId().toString();
    await User.create({
      _id: worker1Id,
      name: 'Worker 1 Dev',
      email: 'w1_comp_ex@eventops.local',
      password: 'password123',
      role: 'worker',
      workerType: 'Cameraman / Photographer',
      isActive: true,
    });

    worker2Id = new mongoose.Types.ObjectId().toString();
    await User.create({
      _id: worker2Id,
      name: 'Worker 2 Esha',
      email: 'w2_comp_ex@eventops.local',
      password: 'password123',
      role: 'worker',
      workerType: 'Cameraman / Photographer',
      isActive: true,
    });

    todayStr = getOperationalDateString(new Date(), 'Asia/Kolkata');
    const [y, m, d] = todayStr.split('-').map(Number);
    const todayDate = new Date(`${todayStr}T04:00:00.000Z`);

    // Lock service clock to late evening on todayStr so reporting times are guaranteed to have passed
    attendanceService.setTestClock(new Date(`${todayStr}T23:59:00.000+05:30`));

    // 1. Completed Event on Event Day (Today)
    const evToday = await Event.create({
      title: 'Completed Gala Today',
      description: 'Completed event on event day',
      eventType: 'Corporate',
      date: todayDate,
      startTime: '08:00',
      endTime: '14:00',
      guestCount: 50,
      eventManagerId: managerId,
      clientId: new mongoose.Types.ObjectId().toString(),
      status: 'completed',
      location: { address: 'Convention Center, Kochi' },
    });
    completedTodayEventId = evToday._id.toString();

    const reqToday = await WorkRequirement.create({
      eventId: evToday._id,
      workerType: 'Cameraman / Photographer',
      requiredCount: 2,
      reportingTime: '08:00',
      status: 'filled',
      assignedWorkers: [
        { workerId: new mongoose.Types.ObjectId(worker1Id), assignedAt: new Date() },
        { workerId: new mongoose.Types.ObjectId(worker2Id), assignedAt: new Date() },
      ],
    });
    reqTodayId = reqToday._id.toString();

    // 2. Completed Event Past Event Day (3 days ago)
    const pastDate = new Date(Date.UTC(y, m - 1, d - 3, 0, 0, 0, 0));
    const evPast = await Event.create({
      title: 'Completed Gala 3 Days Ago',
      description: 'Completed event well in the past',
      eventType: 'Corporate',
      date: pastDate,
      startTime: '08:00',
      endTime: '14:00',
      guestCount: 50,
      eventManagerId: managerId,
      clientId: new mongoose.Types.ObjectId().toString(),
      status: 'completed',
      location: { address: 'Old Center, Kochi' },
    });
    completedPastEventId = evPast._id.toString();

    const reqPast = await WorkRequirement.create({
      eventId: evPast._id,
      workerType: 'Cameraman / Photographer',
      requiredCount: 1,
      reportingTime: '08:00',
      status: 'filled',
      assignedWorkers: [{ workerId: new mongoose.Types.ObjectId(worker1Id), assignedAt: new Date() }],
    });
    reqPastId = reqPast._id.toString();

    // 3. Completed Overnight Event: starts yesterday, scheduled finish 04:00 AM today
    const yesterdayDate = new Date(Date.UTC(y, m - 1, d - 1, 0, 0, 0, 0));
    const evOvernight = await Event.create({
      title: 'Completed Overnight Event',
      description: 'Overnight event crossing midnight into today',
      eventType: 'Corporate',
      date: yesterdayDate,
      startTime: '20:00',
      endTime: '04:00',
      guestCount: 100,
      eventManagerId: managerId,
      clientId: new mongoose.Types.ObjectId().toString(),
      status: 'completed',
      location: { address: 'Open Grounds, Kochi' },
    });
    completedOvernightEventId = evOvernight._id.toString();

    const reqOvernight = await WorkRequirement.create({
      eventId: evOvernight._id,
      workerType: 'Cameraman / Photographer',
      requiredCount: 1,
      reportingTime: '20:00',
      status: 'filled',
      assignedWorkers: [{ workerId: new mongoose.Types.ObjectId(worker1Id), assignedAt: new Date() }],
    });
    reqOvernightId = reqOvernight._id.toString();
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

  describe('1. Completed Event on Event Day Exception', () => {
    it('GET /roster permits check-in editing and checkout modification on event day', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/api/attendance/events/${completedTodayEventId}/roster`, {
        headers: { Authorization: `Bearer ${managerToken}` },
      });
      assert.strictEqual(res.status, 200);
      const json = (await res.json()) as any;
      assert.strictEqual(json.data.canFinalizeCheckIn, true);
      assert.strictEqual(json.data.canEditCheckIn, true);
    });

    it('POST /finalize-checkin succeeds on completed event when on event day', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/api/attendance/events/${completedTodayEventId}/finalize-checkin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${managerToken}`,
          'Idempotency-Key': 'completed_today_finalize_key',
        },
        body: JSON.stringify({
          lateExceptions: [],
          absentExceptions: [],
        }),
      });
      assert.strictEqual(res.status, 200);
      const json = (await res.json()) as any;
      assert.strictEqual(json.data.checkInFinalized, true);
    });

    it('POST /finalize-checkout succeeds on completed event when on event day', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/api/attendance/events/${completedTodayEventId}/finalize-checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${managerToken}`,
          'Idempotency-Key': 'completed_today_checkout_key',
        },
        body: JSON.stringify({
          actualNormalFinishTime: '14:00',
        }),
      });
      assert.strictEqual(res.status, 200);
      const json = (await res.json()) as any;
      assert.strictEqual(json.data.checkOutFinalized, true);
    });
  });

  describe('2. Completed Event Past Event Day Lockout', () => {
    it('POST /finalize-checkin is rejected with 400 Bad Request on past completed event', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/api/attendance/events/${completedPastEventId}/finalize-checkin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${managerToken}`,
          'Idempotency-Key': 'past_completed_finalize_key',
        },
        body: JSON.stringify({
          lateExceptions: [],
          absentExceptions: [],
        }),
      });
      assert.strictEqual(res.status, 400);
      const json = (await res.json()) as any;
      assert.match(json.message, /cannot be finalized on completed events/i);
    });

    it('POST /finalize-checkout is rejected with 400 Bad Request on past completed event', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/api/attendance/events/${completedPastEventId}/finalize-checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${managerToken}`,
          'Idempotency-Key': 'past_completed_checkout_key',
        },
        body: JSON.stringify({
          actualNormalFinishTime: '14:00',
        }),
      });
      assert.strictEqual(res.status, 400);
      const json = (await res.json()) as any;
      assert.match(json.message, /cannot be finalized on completed events after the event day/i);
    });
  });

  describe('3. Completed Overnight Event Cross-Midnight Extension', () => {
    it('permits checkout finalization on day 2 for an overnight event crossing midnight', async () => {
      // First finalize check-in for the overnight event
      const checkInRes = await fetch(`http://127.0.0.1:${port}/api/attendance/events/${completedOvernightEventId}/finalize-checkin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${managerToken}`,
          'Idempotency-Key': 'overnight_completed_checkin_key',
        },
        body: JSON.stringify({
          lateExceptions: [],
          absentExceptions: [],
        }),
      });
      assert.strictEqual(checkInRes.status, 200);

      // Now finalize checkout
      const checkOutRes = await fetch(`http://127.0.0.1:${port}/api/attendance/events/${completedOvernightEventId}/finalize-checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${managerToken}`,
          'Idempotency-Key': 'overnight_completed_checkout_key',
        },
        body: JSON.stringify({
          actualNormalFinishTime: '04:00',
        }),
      });
      assert.strictEqual(checkOutRes.status, 200);
      const json = (await checkOutRes.json()) as any;
      assert.strictEqual(json.data.checkOutFinalized, true);
    });
  });
});
