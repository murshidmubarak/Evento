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

describe('EventOps ERP — Independent Category-Wise Check-in Confirmation and Checkout Eligibility', () => {
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
  let workerA1Id: string; // Category A: Cameraman / Photographer
  let workerA2Id: string; // Category A: Cameraman / Photographer
  let workerB1Id: string; // Category B: Catering Boy
  let workerB2Id: string; // Category B: Catering Boy (Late check-in)

  let eventId: string;
  let reqAId: string;
  let reqBId: string;

  let pastEventId: string;
  let pastReqId: string;
  let todayStr: string;

  const generateToken = (userId: string, role: string) => {
    return jwt.sign({ userId, role }, env.jwtSecret, { expiresIn: '1h' });
  };

  before(async () => {
    await connectDB();
    server = app.listen(0);
    port = (server.address() as any).port;

    // Safety guard enforces this runs strictly against eventops_test
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
      email: 'other_cat@example.com',
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

    workerA1Id = new mongoose.Types.ObjectId().toString();
    await User.create({
      _id: workerA1Id,
      name: 'Photographer 1',
      email: 'photo1@example.com',
      password: 'password123',
      role: 'worker',
      workerType: 'Cameraman / Photographer',
      isActive: true,
    });
    workerToken = generateToken(workerA1Id, 'worker');

    workerA2Id = new mongoose.Types.ObjectId().toString();
    await User.create({
      _id: workerA2Id,
      name: 'Photographer 2',
      email: 'photo2@example.com',
      password: 'password123',
      role: 'worker',
      workerType: 'Cameraman / Photographer',
      isActive: true,
    });

    workerB1Id = new mongoose.Types.ObjectId().toString();
    await User.create({
      _id: workerB1Id,
      name: 'Caterer 1',
      email: 'cater1@example.com',
      password: 'password123',
      role: 'worker',
      workerType: 'Catering Boy',
      isActive: true,
    });

    workerB2Id = new mongoose.Types.ObjectId().toString();
    await User.create({
      _id: workerB2Id,
      name: 'Caterer 2 (Late Arrival)',
      email: 'cater2@example.com',
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
      title: 'Independence Gala Event',
      eventType: 'Corporate',
      date: todayDate,
      startTime: '08:00',
      endTime: '18:00',
      guestCount: 200,
      status: 'confirmed',
      clientId: new mongoose.Types.ObjectId(clientId),
      eventManagerId: new mongoose.Types.ObjectId(managerId),
      location: { address: 'Grand Ballroom' },
    });
    eventId = activeEvent._id.toString();

    // Requirements
    const reqA = await WorkRequirement.create({
      eventId: activeEvent._id,
      workerType: 'Cameraman / Photographer',
      requiredCount: 2,
      reportingTime: '04:00',
      status: 'filled',
      assignedWorkers: [
        { workerId: new mongoose.Types.ObjectId(workerA1Id), assignedAt: new Date() },
        { workerId: new mongoose.Types.ObjectId(workerA2Id), assignedAt: new Date() },
      ],
    });
    reqAId = reqA._id.toString();

    const reqB = await WorkRequirement.create({
      eventId: activeEvent._id,
      workerType: 'Catering Boy',
      requiredCount: 2,
      reportingTime: '05:00',
      status: 'filled',
      assignedWorkers: [
        { workerId: new mongoose.Types.ObjectId(workerB1Id), assignedAt: new Date() },
        { workerId: new mongoose.Types.ObjectId(workerB2Id), assignedAt: new Date() },
      ],
    });
    reqBId = reqB._id.toString();

    // 3. Past Event (Operational date yesterday)
    const yesterday = new Date(Date.now() - 48 * 60 * 60 * 1000);
    const pastStr = getOperationalDateString(yesterday, 'Asia/Kolkata');
    const pastDate = new Date(`${pastStr}T04:00:00.000Z`);

    const pastEvent = await Event.create({
      title: 'Past Gala Event',
      eventType: 'Corporate',
      date: pastDate,
      startTime: '08:00',
      endTime: '16:00',
      guestCount: 100,
      status: 'confirmed',
      clientId: new mongoose.Types.ObjectId(clientId),
      eventManagerId: new mongoose.Types.ObjectId(managerId),
      location: { address: 'Old Heritage Hall' },
    });
    pastEventId = pastEvent._id.toString();

    const pastReq = await WorkRequirement.create({
      eventId: pastEvent._id,
      workerType: 'Catering Boy',
      requiredCount: 1,
      reportingTime: '08:00',
      status: 'filled',
      assignedWorkers: [{ workerId: new mongoose.Types.ObjectId(workerB1Id), assignedAt: new Date() }],
    });
    pastReqId = pastReq._id.toString();
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

  // ---------------------------------------------------------------------------
  // 1. Initial State & Roster Inspection
  // ---------------------------------------------------------------------------
  describe('1. Initial State & Roster Inspection', () => {
    it('returns both worker categories with unconfirmed check-in status and locked checkout', async () => {
      const res = await fetch(`http://localhost:${port}/api/attendance/events/${eventId}/roster`, {
        headers: { Authorization: `Bearer ${managerToken}` },
      });
      assert.strictEqual(res.status, 200);
      const resJson = await res.json();
      assert.strictEqual(resJson.success, true);

      const rosterData = resJson.data;
      assert.strictEqual(rosterData.categorySummaries.length, 2);

      const catA = rosterData.categorySummaries.find((c: any) => c.workerType === 'Cameraman / Photographer');
      const catB = rosterData.categorySummaries.find((c: any) => c.workerType === 'Catering Boy');

      assert.ok(catA);
      assert.ok(catB);
      assert.strictEqual(catA.checkInFinalized, false);
      assert.strictEqual(catB.checkInFinalized, false);
      // Checkout is locked because check-in is not yet confirmed
      assert.strictEqual(catA.canModifyCheckout, false);
      assert.strictEqual(catB.canModifyCheckout, false);
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Authorization and Access Control
  // ---------------------------------------------------------------------------
  describe('2. Authorization and Security Controls', () => {
    it('rejects unauthenticated category check-in confirmation with 401', async () => {
      const res = await fetch(
        `http://localhost:${port}/api/attendance/events/${eventId}/categories/Cameraman%20%2F%20Photographer/finalize-checkin`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': 'auth_key_1',
          },
          body: JSON.stringify({}),
        }
      );
      assert.strictEqual(res.status, 401);
    });

    it('rejects worker role with 403 Forbidden', async () => {
      const res = await fetch(
        `http://localhost:${port}/api/attendance/events/${eventId}/categories/Cameraman%20%2F%20Photographer/finalize-checkin`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': 'auth_key_2',
            Authorization: `Bearer ${workerToken}`,
          },
          body: JSON.stringify({}),
        }
      );
      assert.strictEqual(res.status, 403);
    });

    it('rejects client role with 403 Forbidden', async () => {
      const res = await fetch(
        `http://localhost:${port}/api/attendance/events/${eventId}/categories/Cameraman%20%2F%20Photographer/finalize-checkin`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': 'auth_key_3',
            Authorization: `Bearer ${clientToken}`,
          },
          body: JSON.stringify({}),
        }
      );
      assert.strictEqual(res.status, 403);
    });

    it('rejects unassigned manager with 403 Forbidden', async () => {
      const res = await fetch(
        `http://localhost:${port}/api/attendance/events/${eventId}/categories/Cameraman%20%2F%20Photographer/finalize-checkin`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': 'auth_key_4',
            Authorization: `Bearer ${unauthorizedManagerToken}`,
          },
          body: JSON.stringify({}),
        }
      );
      assert.strictEqual(res.status, 403);
    });

    it('rejects confirmation when Idempotency-Key header is missing with 400', async () => {
      const res = await fetch(
        `http://localhost:${port}/api/attendance/events/${eventId}/categories/Cameraman%20%2F%20Photographer/finalize-checkin`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${managerToken}`,
          },
          body: JSON.stringify({}),
        }
      );
      assert.strictEqual(res.status, 400);
      const data = await res.json();
      assert.match(data.message, /Idempotency-Key/i);
    });

    it('rejects confirmation for an invalid / unassigned worker category with 400', async () => {
      const res = await fetch(
        `http://localhost:${port}/api/attendance/events/${eventId}/categories/Chef/finalize-checkin`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': 'cat_invalid_key',
            Authorization: `Bearer ${managerToken}`,
          },
          body: JSON.stringify({}),
        }
      );
      assert.strictEqual(res.status, 400);
      const data = await res.json();
      assert.match(data.message, /not required for this event|No assigned workers found/i);
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Category A Check-in Confirmation and Checkout Independence
  // ---------------------------------------------------------------------------
  describe('3. Category A Check-in Confirmation and Independent Checkout Unlocking', () => {
    it('confirms Category A (Cameraman / Photographer) check-in successfully', async () => {
      const res = await fetch(
        `http://localhost:${port}/api/attendance/events/${eventId}/categories/Cameraman%20%2F%20Photographer/finalize-checkin`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': 'catA_conf_key_1',
            Authorization: `Bearer ${managerToken}`,
          },
          body: JSON.stringify({}),
        }
      );
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.strictEqual(data.data.workerType, 'Cameraman / Photographer');
      assert.strictEqual(data.data.checkInFinalized, true);
      assert.strictEqual(data.data.checkInChangesPending, false);
      assert.strictEqual(data.data.checkInRevision, 1);
      assert.strictEqual(data.data.totalProcessed, 2);
      assert.strictEqual(data.data.onTimeCount, 2);
    });

    it('confirms Category A is now unlocked for checkout while Category B remains locked', async () => {
      const res = await fetch(`http://localhost:${port}/api/attendance/events/${eventId}/roster`, {
        headers: { Authorization: `Bearer ${managerToken}` },
      });
      assert.strictEqual(res.status, 200);
      const resJson = await res.json();
      const rosterData = resJson.data;

      const catA = rosterData.categorySummaries.find((c: any) => c.workerType === 'Cameraman / Photographer');
      const catB = rosterData.categorySummaries.find((c: any) => c.workerType === 'Catering Boy');

      assert.strictEqual(catA.checkInFinalized, true);
      assert.strictEqual(catA.checkInChangesPending, false);
      assert.strictEqual(catA.canModifyCheckout, true); // Category A is unlocked!

      assert.strictEqual(catB.checkInFinalized, false);
      assert.strictEqual(catB.checkInChangesPending, false);
      assert.strictEqual(catB.canModifyCheckout, false); // Category B remains locked!
    });

    it('rejects recording category departure for unconfirmed Category B with 400 Bad Request', async () => {
      const res = await fetch(`http://localhost:${port}/api/attendance/events/${eventId}/categories/departure`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${managerToken}`,
        },
        body: JSON.stringify({
          workerType: 'Catering Boy',
          actualDepartureDate: todayStr,
          actualDepartureTime: '17:00',
        }),
      });
      assert.strictEqual(res.status, 400);
      const data = await res.json();
      assert.match(data.message, /Check-in for category 'Catering Boy' must be confirmed before recording checkout/i);
    });

    it('rejects recording individual checkout exception for unconfirmed Category B worker with 400 Bad Request', async () => {
      // First, create check-in record for Worker B1 so the worker has an attendance record
      await fetch(`http://localhost:${port}/api/attendance/events/${eventId}/workers/${workerB1Id}/checkin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${managerToken}`,
        },
        body: JSON.stringify({
          arrivalStatus: 'on_time',
        }),
      });

      // Now attempt checkout exception on Worker B1 whose category is still unconfirmed
      const res = await fetch(
        `http://localhost:${port}/api/attendance/events/${eventId}/workers/${workerB1Id}/checkout-exception`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${managerToken}`,
          },
          body: JSON.stringify({
            actualDepartureDate: todayStr,
            actualDepartureTime: '16:00',
            reason: 'Leaving early for medical appointment',
          }),
        }
      );
      assert.strictEqual(res.status, 400);
      const data = await res.json();
      assert.match(data.message, /Check-in for category 'Catering Boy' must be confirmed before recording checkout exceptions/i);
    });

    it('successfully records category actual departure for confirmed Category A', async () => {
      const res = await fetch(`http://localhost:${port}/api/attendance/events/${eventId}/categories/departure`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${managerToken}`,
        },
        body: JSON.stringify({
          workerType: 'Cameraman / Photographer',
          actualDepartureDate: todayStr,
          actualDepartureTime: '17:00',
        }),
      });
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.strictEqual(data.data.workerType, 'Cameraman / Photographer');
      assert.strictEqual(data.data.actualDepartureTime, '17:00');
    });

    it('verifies Category A workers inherited category-default checkout without modifying Category B workers', async () => {
      const res = await fetch(`http://localhost:${port}/api/attendance/events/${eventId}/roster`, {
        headers: { Authorization: `Bearer ${managerToken}` },
      });
      assert.strictEqual(res.status, 200);
      const resJson = await res.json();
      const rosterData = resJson.data;

      const workerA1 = rosterData.roster.find((w: any) => w.workerId === workerA1Id);
      const workerB1 = rosterData.roster.find((w: any) => w.workerId === workerB1Id);

      assert.ok(workerA1.checkOut);
      assert.strictEqual(workerA1.checkOutSource, 'category_default');
      assert.strictEqual(workerA1.departureStatus, 'normal');

      assert.strictEqual(workerB1.checkOut, null);
      assert.strictEqual(workerB1.checkOutSource, 'not_recorded');
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Idempotency on Category Check-in Confirmation
  // ---------------------------------------------------------------------------
  describe('4. Category Confirmation Idempotency Handling', () => {
    it('replays identical summary when same Idempotency-Key and payload are submitted', async () => {
      const res = await fetch(
        `http://localhost:${port}/api/attendance/events/${eventId}/categories/Cameraman%20%2F%20Photographer/finalize-checkin`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': 'catA_conf_key_1', // Same key as earlier
            Authorization: `Bearer ${managerToken}`,
          },
          body: JSON.stringify({}),
        }
      );
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.strictEqual(data.data.checkInRevision, 1);
    });

    it('returns 409 Conflict when same Idempotency-Key is reused with different payload', async () => {
      const res = await fetch(
        `http://localhost:${port}/api/attendance/events/${eventId}/categories/Cameraman%20%2F%20Photographer/finalize-checkin`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': 'catA_conf_key_1',
            Authorization: `Bearer ${managerToken}`,
          },
          body: JSON.stringify({
            reason: 'Different reason submitted',
          }),
        }
      );
      assert.strictEqual(res.status, 409);
      const data = await res.json();
      assert.match(data.message, /Idempotency key collision/i);
    });

    it('returns 409 Conflict when a different key is submitted but no changes are pending', async () => {
      const res = await fetch(
        `http://localhost:${port}/api/attendance/events/${eventId}/categories/Cameraman%20%2F%20Photographer/finalize-checkin`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': 'catA_different_key',
            Authorization: `Bearer ${managerToken}`,
          },
          body: JSON.stringify({}),
        }
      );
      assert.strictEqual(res.status, 409);
      const data = await res.json();
      assert.match(data.message, /already been confirmed and no changes are pending/i);
    });
  });

  // ---------------------------------------------------------------------------
  // 5. Invalidation Scoping: Post-Confirmation Edit on Category A Worker
  // ---------------------------------------------------------------------------
  describe('5. Scoped Category Invalidation and Re-finalization', () => {
    it('modifies check-in for Worker A1 to late; strictly invalidates Category A while leaving Category B unaffected', async () => {
      const wA1Att = await Attendance.findOne({ eventId, workerId: workerA1Id });
      assert.ok(wA1Att);

      const res = await fetch(`http://localhost:${port}/api/attendance/records/${wA1Att._id}/correct`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${managerToken}`,
        },
        body: JSON.stringify({
          actualArrivalTime: '04:30',
          arrivalStatus: 'late',
          reason: 'Worker arrived 30 minutes late due to traffic',
        }),
      });
      assert.strictEqual(res.status, 200);

      const rosterRes = await fetch(`http://localhost:${port}/api/attendance/events/${eventId}/roster`, {
        headers: { Authorization: `Bearer ${managerToken}` },
      });
      const rosterData = (await rosterRes.json()).data;

      const catA = rosterData.categorySummaries.find((c: any) => c.workerType === 'Cameraman / Photographer');
      const catB = rosterData.categorySummaries.find((c: any) => c.workerType === 'Catering Boy');

      // Category A must now have checkInChangesPending: true
      assert.strictEqual(catA.checkInFinalized, true);
      assert.strictEqual(catA.checkInChangesPending, true);

      // Category B must remain unconfirmed and unchanged
      assert.strictEqual(catB.checkInFinalized, false);
      assert.strictEqual(catB.checkInChangesPending, false);
    });

    it('rejects departure update for Category A while checkInChangesPending is true', async () => {
      const res = await fetch(`http://localhost:${port}/api/attendance/events/${eventId}/categories/departure`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${managerToken}`,
        },
        body: JSON.stringify({
          workerType: 'Cameraman / Photographer',
          actualDepartureDate: todayStr,
          actualDepartureTime: '17:30',
        }),
      });
      assert.strictEqual(res.status, 400);
      const data = await res.json();
      assert.match(data.message, /pending re-confirmation for category 'Cameraman \/ Photographer'/i);
    });

    it('successfully re-finalizes Category A (Revision 2), clearing checkInChangesPending and re-unlocking checkout', async () => {
      const res = await fetch(
        `http://localhost:${port}/api/attendance/events/${eventId}/categories/Cameraman%20%2F%20Photographer/finalize-checkin`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': 'catA_refinalize_key_2',
            Authorization: `Bearer ${managerToken}`,
          },
          body: JSON.stringify({
            reason: 'Re-confirming check-in after recording 30m delay for Worker A1',
          }),
        }
      );
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.strictEqual(data.data.checkInRevision, 2);
      assert.strictEqual(data.data.checkInChangesPending, false);
      assert.strictEqual(data.data.lateCount, 1);
      assert.strictEqual(data.data.onTimeCount, 1);

      // Now category departure can be updated again
      const depRes = await fetch(`http://localhost:${port}/api/attendance/events/${eventId}/categories/departure`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${managerToken}`,
        },
        body: JSON.stringify({
          workerType: 'Cameraman / Photographer',
          actualDepartureDate: todayStr,
          actualDepartureTime: '17:30',
        }),
      });
      assert.strictEqual(depRes.status, 200);
    });
  });

  // ---------------------------------------------------------------------------
  // 6. Partial Category Eligibility & Chronology Enforcement
  // ---------------------------------------------------------------------------
  describe('6. Partial Category Eligibility & Chronology Enforcement', () => {
    it('confirms Category B with Worker B2 marked Late at 17:30', async () => {
      const res = await fetch(
        `http://localhost:${port}/api/attendance/events/${eventId}/categories/Catering%20Boy/finalize-checkin`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': 'catB_conf_key_1',
            Authorization: `Bearer ${managerToken}`,
          },
          body: JSON.stringify({
            lateExceptions: [
              {
                workerId: workerB2Id,
                actualArrivalTime: '17:30',
              },
            ],
          }),
        }
      );
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.strictEqual(data.data.checkInFinalized, true);
      assert.strictEqual(data.data.lateCount, 1);
      assert.strictEqual(data.data.onTimeCount, 1);
    });

    it('records Category B departure at 17:00; Worker B1 receives default checkout while late Worker B2 is safely excluded (pending overtime)', async () => {
      const res = await fetch(`http://localhost:${port}/api/attendance/events/${eventId}/categories/departure`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${managerToken}`,
        },
        body: JSON.stringify({
          workerType: 'Catering Boy',
          actualDepartureDate: todayStr,
          actualDepartureTime: '17:00',
        }),
      });
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);

      // Verify roster
      const rosterRes = await fetch(`http://localhost:${port}/api/attendance/events/${eventId}/roster`, {
        headers: { Authorization: `Bearer ${managerToken}` },
      });
      const rosterData = (await rosterRes.json()).data;

      const workerB1 = rosterData.roster.find((w: any) => w.workerId === workerB1Id);
      const workerB2 = rosterData.roster.find((w: any) => w.workerId === workerB2Id);
      const catB = rosterData.categorySummaries.find((c: any) => c.workerType === 'Catering Boy');

      // Worker B1 checked in at 05:00 < 17:00 -> successfully received category default checkout
      assert.ok(workerB1.checkOut);
      assert.strictEqual(workerB1.checkOutSource, 'category_default');

      // Worker B2 checked in at 17:30 >= 17:00 -> category departure was NOT applied to prevent chronological anomaly
      assert.strictEqual(workerB2.checkOut, null);
      assert.strictEqual(workerB2.checkOutSource, 'not_recorded');
      assert.strictEqual(workerB2.ineligibleForCategoryCheckout, true);

      // Summary flags ineligible overtime required
      assert.strictEqual(catB.ineligibleOvertimeRequiredCount, 1);
    });

    it('rejects recording individual checkout exception for Worker B2 if departure time <= check-in time (17:15 <= 17:30)', async () => {
      const res = await fetch(
        `http://localhost:${port}/api/attendance/events/${eventId}/workers/${workerB2Id}/checkout-exception`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${managerToken}`,
          },
          body: JSON.stringify({
            actualDepartureDate: todayStr,
            actualDepartureTime: '17:15',
            reason: 'Attempted invalid checkout before checkin',
          }),
        }
      );
      assert.strictEqual(res.status, 400);
      const data = await res.json();
      assert.match(data.message, /must be strictly later than/i);
    });

    it('successfully records individual overtime exception for Worker B2 at 18:30 (> 17:30)', async () => {
      const res = await fetch(
        `http://localhost:${port}/api/attendance/events/${eventId}/workers/${workerB2Id}/checkout-exception`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${managerToken}`,
          },
          body: JSON.stringify({
            actualDepartureDate: todayStr,
            actualDepartureTime: '18:30',
            reason: 'Completed extended late-shift overtime',
          }),
        }
      );
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.ok(data.data.checkOut);
      assert.strictEqual(data.data.departureStatus, 'overtime');

      const updatedB2 = await Attendance.findOne({ eventId, workerId: workerB2Id });
      assert.ok(updatedB2);
      assert.strictEqual(updatedB2.checkOutSource, 'individual_exception');
      assert.strictEqual(updatedB2.departureStatus, 'overtime');
    });
  });

  // ---------------------------------------------------------------------------
  // 7. Dynamic Reclassification on Category Departure Update
  // ---------------------------------------------------------------------------
  describe('7. Dynamic Departure Reclassification', () => {
    it('preserves individual exception timestamp while dynamically reclassifying early/overtime status against updated category departure', async () => {
      // 1. Record Worker A2 exception at 17:15 (Category A departure is currently 17:30)
      // At 17:15 vs 17:30 category departure, Worker A2 is Early Departure (-15 min)
      const excRes = await fetch(
        `http://localhost:${port}/api/attendance/events/${eventId}/workers/${workerA2Id}/checkout-exception`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${managerToken}`,
          },
          body: JSON.stringify({
            actualDepartureDate: todayStr,
            actualDepartureTime: '17:15',
            reason: 'Left early for scheduled equipment return',
          }),
        }
      );
      assert.strictEqual(excRes.status, 200);
      const excData = await excRes.json();
      assert.ok(excData.data.checkOut);
      assert.strictEqual(excData.data.departureStatus, 'early_departure');
      assert.strictEqual(excData.data.earlyDepartureMinutes, 15);

      // 2. Manager changes Category A actual departure from 17:30 down to 17:00
      // Now Category departure is 17:00. Worker A2 departed at 17:15!
      // Worker A2 must now automatically reclassify to Overtime (+15 min) while retaining 17:15 timestamp!
      const updateDepRes = await fetch(`http://localhost:${port}/api/attendance/events/${eventId}/categories/departure`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${managerToken}`,
        },
        body: JSON.stringify({
          workerType: 'Cameraman / Photographer',
          actualDepartureDate: todayStr,
          actualDepartureTime: '17:00',
        }),
      });
      assert.strictEqual(updateDepRes.status, 200);

      // 3. Inspect Worker A2 attendance record
      const attA2 = await Attendance.findOne({ eventId, workerId: workerA2Id });
      assert.ok(attA2);
      assert.strictEqual(attA2.checkOutSource, 'individual_exception');
      assert.strictEqual(attA2.departureStatus, 'overtime');
      assert.strictEqual(attA2.overtimeMinutes, 15);
      assert.strictEqual(attA2.earlyDepartureMinutes, 0);
    });
  });

  // ---------------------------------------------------------------------------
  // 8. Closed Concerns: Permanent Lock on Arrival
  // ---------------------------------------------------------------------------
  describe('8. Closed Concern Arrival Lock Integrity', () => {
    it('permanently prevents arrival modification on worker with closed Late/Absent concern, while permitting checkout updates within window', async () => {
      // Create closed concern lock on Worker A1
      await Attendance.findOneAndUpdate(
        { eventId, workerId: workerA1Id },
        { isStatusLocked: true, arrivalStatus: 'late', status: 'checked_in' }
      );

      // 1. Attempting check-in correction on locked worker fails with 403 Forbidden
      const wA1Att = await Attendance.findOne({ eventId, workerId: workerA1Id });
      assert.ok(wA1Att);

      const correctRes = await fetch(`http://localhost:${port}/api/attendance/records/${wA1Att._id}/correct`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${managerToken}`,
        },
        body: JSON.stringify({
          arrivalStatus: 'on_time',
          reason: 'Attempting to change arrival on locked worker',
        }),
      });
      assert.strictEqual(correctRes.status, 403);
      const data = await correctRes.json();
      assert.match(data.message, /permanently locked/i);

      // 2. Recording individual checkout exception on non-absent locked worker succeeds within checkout window
      const excRes = await fetch(
        `http://localhost:${port}/api/attendance/events/${eventId}/workers/${workerA1Id}/checkout-exception`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${managerToken}`,
          },
          body: JSON.stringify({
            actualDepartureDate: todayStr,
            actualDepartureTime: '18:00',
            reason: 'Permitted checkout exception on non-absent worker with closed concern',
          }),
        }
      );
      assert.strictEqual(excRes.status, 200);
      const excData = await excRes.json();
      assert.ok(excData.data.checkOut);
    });
  });

  // ---------------------------------------------------------------------------
  // 9. Past Event & 24h Operational Date Editing Deadline
  // ---------------------------------------------------------------------------
  describe('9. Past Event Editing Deadline Enforcement', () => {
    it('permanently blocks new check-in exceptions after event operational date has ended with 403 Forbidden', async () => {
      // 1. Initial confirmation of past event (without exceptions) succeeds
      await fetch(
        `http://localhost:${port}/api/attendance/events/${pastEventId}/categories/Catering%20Boy/finalize-checkin`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': 'past_key_init',
            Authorization: `Bearer ${managerToken}`,
          },
          body: JSON.stringify({}),
        }
      );

      // 2. Attempting to submit late exceptions after event day when re-finalizing is rejected with 403 Forbidden
      const res = await fetch(
        `http://localhost:${port}/api/attendance/events/${pastEventId}/categories/Catering%20Boy/finalize-checkin`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': 'past_key_1',
            Authorization: `Bearer ${managerToken}`,
          },
          body: JSON.stringify({
            lateExceptions: [
              {
                workerId: workerB1Id,
                actualArrivalTime: '09:00',
              },
            ],
          }),
        }
      );
      assert.strictEqual(res.status, 403);
      const data = await res.json();
      assert.match(data.message, /Check-in editing is closed because the scheduled event day has ended/i);
    });
  });

  // ---------------------------------------------------------------------------
  // 10. Complete Overall Checkout Finalization
  // ---------------------------------------------------------------------------
  describe('10. Overall Checkout Finalization Integration', () => {
    it('successfully finalizes overall checkout once all categories have confirmed check-in and departures', async () => {
      const res = await fetch(`http://localhost:${port}/api/attendance/events/${eventId}/finalize-checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': 'final_chkout_key_1',
          Authorization: `Bearer ${managerToken}`,
        },
        body: JSON.stringify({
          categoryFinishTimes: [
            { workerType: 'Cameraman / Photographer', normalFinishTime: '17:00' },
            { workerType: 'Catering Boy', normalFinishTime: '17:00' },
          ],
        }),
      });
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.strictEqual(data.data.checkOutFinalized, true);

      const session = await AttendanceSession.findOne({ eventId });
      assert.ok(session);
      assert.strictEqual(session.checkOutFinalized, true);
    });
  });
});
