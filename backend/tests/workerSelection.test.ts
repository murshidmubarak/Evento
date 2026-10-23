import './setup.js';
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import app from '../src/app.js';
import { Event } from '../src/modules/events/model/event.model.js';
import { User } from '../src/modules/auth/model/user.model.js';
import { WorkRequirement } from '../src/modules/work-requirements/model/work-requirement.model.js';
import { WorkResponse } from '../src/modules/work-requirements/model/work-response.model.js';
import { connectDB } from '../src/config/db.js';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import { env } from '../src/config/env.js';
import { calculateHaversineDistanceKm, calculateDistanceScore } from '../src/modules/worker-selection/utils/distance.util.js';
import { DistanceOnlyRankingStrategy } from '../src/modules/worker-selection/ranking/distance-only.strategy.js';
import { CombinedPerformanceDistanceRankingStrategy } from '../src/modules/worker-selection/ranking/combined-performance-distance.strategy.js';
import { workerSelectionService } from '../src/modules/worker-selection/service/worker-selection.service.js';
import { workerSelectionQueueService } from '../src/modules/worker-selection/queues/worker-selection.queue.js';

describe('Worker Selection Engine & Interest Milestone', () => {
  let server: any;
  let port: number;

  let adminToken: string;
  let clientToken: string;
  let managerAToken: string;
  let managerBToken: string;

  let managerAId: string;
  let managerBId: string;
  let clientId: string;

  let confirmedEventAId: string;
  let confirmedEventBId: string;

  // Kochi Coordinates (Venue / Event location)
  // Marine Drive, Kochi: 9.9786, 76.2758
  const eventCoordinates = {
    address: 'Marine Drive, Kochi, Kerala',
    lat: 9.9786,
    lng: 76.2758,
  };

  const generateToken = (userId: string, role: string) => {
    return jwt.sign({ userId, role }, env.jwtSecret, { expiresIn: '1h' });
  };

  before(async () => {
    await connectDB();
    server = app.listen(0);
    port = (server.address() as any).port;

    const adminId = new mongoose.Types.ObjectId().toString();
    clientId = new mongoose.Types.ObjectId().toString();

    adminToken = generateToken(adminId, 'admin');
    clientToken = generateToken(clientId, 'client');

    await User.deleteMany({});

    // Create Manager A
    const mA = await User.create({
      name: 'Manager A',
      email: 'manager_a_ws@example.com',
      password: 'password',
      role: 'event_manager',
      isActive: true,
    });
    managerAId = mA._id.toString();
    managerAToken = generateToken(managerAId, 'event_manager');

    // Create Manager B
    const mB = await User.create({
      name: 'Manager B',
      email: 'manager_b_ws@example.com',
      password: 'password',
      role: 'event_manager',
      isActive: true,
    });
    managerBId = mB._id.toString();
    managerBToken = generateToken(managerBId, 'event_manager');

    // Create Client
    await User.create({
      _id: new mongoose.Types.ObjectId(clientId),
      name: 'Client A',
      email: 'client_ws@example.com',
      password: 'password',
      role: 'client',
      isActive: true,
    });
  });

  after(async () => {
    server.close();
    await workerSelectionQueueService.close();
    await mongoose.disconnect();
  });

  beforeEach(async () => {
    await Event.deleteMany({});
    await WorkRequirement.deleteMany({});
    await WorkResponse.deleteMany({});
    workerSelectionQueueService.getMockQueue().clear();

    // Event A (Confirmed, assigned to Manager A, Date: 2026-11-20)
    const eA = await Event.create({
      clientId: new mongoose.Types.ObjectId(clientId),
      eventManagerId: new mongoose.Types.ObjectId(managerAId),
      title: 'Grand Royal Wedding',
      eventType: 'Wedding',
      date: new Date('2026-11-20T00:00:00.000Z'),
      startTime: '09:00',
      endTime: '18:00',
      location: eventCoordinates,
      guestCount: 300,
      status: 'confirmed',
    });
    confirmedEventAId = eA._id.toString();

    // Event B (Confirmed, assigned to Manager B, Date: 2026-11-20 — Same Day!)
    const eB = await Event.create({
      clientId: new mongoose.Types.ObjectId(clientId),
      eventManagerId: new mongoose.Types.ObjectId(managerBId),
      title: 'Kochi Tech Summit',
      eventType: 'Corporate',
      date: new Date('2026-11-20T00:00:00.000Z'),
      startTime: '10:00',
      endTime: '17:00',
      location: eventCoordinates,
      guestCount: 200,
      status: 'confirmed',
    });
    confirmedEventBId = eB._id.toString();
  });

  // Helper to create an active worker with specific location & type
  const createWorkerHelper = async (
    name: string,
    email: string,
    workerType: string,
    lat?: number,
    lng?: number,
    address: string = 'Test Address',
    isActive: boolean = true
  ) => {
    const worker = await User.create({
      name,
      email,
      password: 'password',
      role: 'worker',
      workerType,
      isActive,
      emailVerified: true,
      invitationAcceptedAt: new Date(),
      location: lat !== undefined && lng !== undefined ? { address, lat, lng } : { address },
    });
    const token = generateToken(worker._id.toString(), 'worker');
    return { worker, token };
  };

  // ───────────────────────────────────────────────────────────────────────────
  // PART A: Worker Interest System
  // ───────────────────────────────────────────────────────────────────────────
  describe('PART A: Worker Interest Submission & Duplicate Prevention', () => {
    it('1. Eligible worker can view open opportunities and express interest', async () => {
      // 1. Create requirement in open status with maxDistanceKm = 20, future deadline
      const req = await WorkRequirement.create({
        eventId: new mongoose.Types.ObjectId(confirmedEventAId),
        workerType: 'Catering Boy',
        requiredCount: 5,
        reportingTime: '08:00 AM',
        maxDistanceKm: 20,
        interestDeadlineAt: new Date(Date.now() + 86400000 * 2),
        status: 'open',
      });

      // 2. Create matching worker in Ernakulam (approx 3 km from Marine Drive)
      const { worker, token } = await createWorkerHelper(
        'Rahul Kumar',
        'rahul_interest@example.com',
        'Catering Boy',
        9.9816,
        76.2828
      );

      // 3. Worker views available opportunities
      const oppRes = await fetch(`http://127.0.0.1:${port}/api/worker/opportunities`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      assert.equal(oppRes.status, 200);
      const oppData = (await oppRes.json()) as any;
      assert.equal(oppData.success, true);
      assert.equal(oppData.data.opportunities.length, 1);
      assert.equal(oppData.data.opportunities[0].id, req._id.toString());
      assert.equal(oppData.data.opportunities[0].hasExpressedInterest, false);

      // 4. Worker expresses interest
      const interestRes = await fetch(
        `http://127.0.0.1:${port}/api/worker/opportunities/${req._id}/interest`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      assert.equal(interestRes.status, 201);
      const interestData = (await interestRes.json()) as any;
      assert.equal(interestData.success, true);
      assert.equal(interestData.data.response.responseStatus, 'interested');
      assert.ok(interestData.data.response.respondedAt);

      // 5. Subsequent opportunities check shows hasExpressedInterest = true
      const oppRes2 = await fetch(`http://127.0.0.1:${port}/api/worker/opportunities`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const oppData2 = (await oppRes2.json()) as any;
      assert.equal(oppData2.data.opportunities[0].hasExpressedInterest, true);
      assert.equal(oppData2.data.opportunities[0].myResponseStatus, 'interested');
    });

    it('2. Repeated interest submissions are prevented (atomic duplicate protection)', async () => {
      const req = await WorkRequirement.create({
        eventId: new mongoose.Types.ObjectId(confirmedEventAId),
        workerType: 'Chef',
        requiredCount: 2,
        reportingTime: '06:00 AM',
        maxDistanceKm: 30,
        interestDeadlineAt: new Date(Date.now() + 86400000 * 2),
        status: 'open',
      });

      const { token } = await createWorkerHelper(
        'Chef Antonio',
        'antonio@example.com',
        'Chef',
        9.9816,
        76.2828
      );

      // First submission succeeds
      const res1 = await fetch(`http://127.0.0.1:${port}/api/worker/opportunities/${req._id}/interest`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      assert.equal(res1.status, 201);

      // Second submission is rejected with 400 Bad Request
      const res2 = await fetch(`http://127.0.0.1:${port}/api/worker/opportunities/${req._id}/interest`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      assert.equal(res2.status, 400);
      const err = (await res2.json()) as any;
      assert.match(err.message, /already expressed interest/i);

      // Verify DB contains strictly one response record
      const count = await WorkResponse.countDocuments({ requirementId: req._id });
      assert.equal(count, 1);
    });

    it('3. Mismatched worker type is rejected', async () => {
      const req = await WorkRequirement.create({
        eventId: new mongoose.Types.ObjectId(confirmedEventAId),
        workerType: 'Videographer',
        requiredCount: 1,
        reportingTime: '10:00 AM',
        maxDistanceKm: 25,
        interestDeadlineAt: new Date(Date.now() + 86400000 * 2),
        status: 'open',
      });

      // Catering Boy tries to apply for Videographer
      const { token } = await createWorkerHelper(
        'Catering Guy',
        'cguy@example.com',
        'Catering Boy',
        9.9816,
        76.2828
      );

      const res = await fetch(`http://127.0.0.1:${port}/api/worker/opportunities/${req._id}/interest`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      assert.equal(res.status, 400);
      const err = (await res.json()) as any;
      assert.match(err.message, /worker type .* does not match/i);
    });

    it('4. Inactive worker account is rejected from expressing interest', async () => {
      const req = await WorkRequirement.create({
        eventId: new mongoose.Types.ObjectId(confirmedEventAId),
        workerType: 'Host',
        requiredCount: 1,
        reportingTime: '09:00 AM',
        maxDistanceKm: 20,
        interestDeadlineAt: new Date(Date.now() + 86400000 * 2),
        status: 'open',
      });

      const { token } = await createWorkerHelper(
        'Inactive Host',
        'inactive_host@example.com',
        'Host',
        9.9816,
        76.2828,
        'Test Address',
        false // isActive = false
      );

      const res = await fetch(`http://127.0.0.1:${port}/api/worker/opportunities/${req._id}/interest`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      assert.equal(res.status, 403);
    });

    it('5. Expired interest window rejects new interest submissions', async () => {
      const pastDeadline = new Date(Date.now() - 3600000); // 1 hour ago
      const req = await WorkRequirement.create({
        eventId: new mongoose.Types.ObjectId(confirmedEventAId),
        workerType: 'Host',
        requiredCount: 1,
        reportingTime: '09:00 AM',
        maxDistanceKm: 20,
        interestDeadlineAt: pastDeadline,
        status: 'open',
      });

      const { token } = await createWorkerHelper(
        'Late Host',
        'late_host@example.com',
        'Host',
        9.9816,
        76.2828
      );

      const res = await fetch(`http://127.0.0.1:${port}/api/worker/opportunities/${req._id}/interest`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      assert.equal(res.status, 400);
      const err = (await res.json()) as any;
      assert.match(err.message, /deadline .* expired/i);
    });

    it('6. Non-worker roles (Client, Manager) cannot access worker opportunity APIs', async () => {
      const req = await WorkRequirement.create({
        eventId: new mongoose.Types.ObjectId(confirmedEventAId),
        workerType: 'Chef',
        requiredCount: 1,
        reportingTime: '06:00 AM',
        maxDistanceKm: 20,
        interestDeadlineAt: new Date(Date.now() + 86400000),
        status: 'open',
      });

      for (const t of [clientToken, managerAToken, adminToken]) {
        const res = await fetch(
          `http://127.0.0.1:${port}/api/worker/opportunities/${req._id}/interest`,
          {
            method: 'POST',
            headers: { Authorization: `Bearer ${t}` },
          }
        );
        assert.equal(res.status, 403);
      }
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // PART B: Manager Configures Distance and Deadline
  // ───────────────────────────────────────────────────────────────────────────
  describe('PART B: Maximum Distance and Deadline Validation', () => {
    it('1. Opening recruitment requires positive finite maxDistanceKm and future interestDeadlineAt', async () => {
      const req = await WorkRequirement.create({
        eventId: new mongoose.Types.ObjectId(confirmedEventAId),
        workerType: 'Catering Boy',
        requiredCount: 5,
        reportingTime: '08:00 AM',
        status: 'draft',
      });

      // Trying to transition to 'open' without distance and deadline -> 400
      const resNoFields = await fetch(`http://127.0.0.1:${port}/api/manager/work-requirements/${req._id}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${managerAToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: 'open' }),
      });
      assert.equal(resNoFields.status, 400);
      const err1 = (await resNoFields.json()) as any;
      assert.match(err1.message, /maximum worker distance/i);

      // Invalid distance (0 or negative) is rejected
      const resBadDist = await fetch(`http://127.0.0.1:${port}/api/manager/work-requirements/${req._id}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${managerAToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          maxDistanceKm: -5,
          interestDeadlineAt: new Date(Date.now() + 86400000).toISOString(),
          status: 'open',
        }),
      });
      assert.equal(resBadDist.status, 400);

      // Deadline in the past is rejected
      const resPastDeadline = await fetch(`http://127.0.0.1:${port}/api/manager/work-requirements/${req._id}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${managerAToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          maxDistanceKm: 15,
          interestDeadlineAt: new Date(Date.now() - 3600000).toISOString(),
          status: 'open',
        }),
      });
      assert.equal(resPastDeadline.status, 400);

      // Valid distance and valid future deadline successfully opens recruitment
      const validDeadline = new Date('2026-11-18T10:00:00.000Z'); // Before Event date 2026-11-20
      const resSuccess = await fetch(`http://127.0.0.1:${port}/api/manager/work-requirements/${req._id}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${managerAToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          maxDistanceKm: 15,
          interestDeadlineAt: validDeadline.toISOString(),
          status: 'open',
        }),
      });
      assert.equal(resSuccess.status, 200);
      const successData = (await resSuccess.json()) as any;
      assert.equal(successData.data.requirement.status, 'open');
      assert.equal(successData.data.requirement.maxDistanceKm, 15);
    });

    it('2. Deadline occurring after event reporting time is rejected', async () => {
      const req = await WorkRequirement.create({
        eventId: new mongoose.Types.ObjectId(confirmedEventAId), // Date: 2026-11-20
        workerType: 'Chef',
        requiredCount: 2,
        reportingTime: '08:00 AM',
        status: 'draft',
      });

      // Set deadline after event date (2026-11-21)
      const afterEventDeadline = new Date('2026-11-21T00:00:00.000Z');
      const res = await fetch(`http://127.0.0.1:${port}/api/manager/work-requirements/${req._id}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${managerAToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          maxDistanceKm: 25,
          interestDeadlineAt: afterEventDeadline.toISOString(),
          status: 'open',
        }),
      });
      assert.equal(res.status, 400);
      const err = (await res.json()) as any;
      assert.match(err.message, /before the event start/i);
    });

    it('3. Haversine distance formula and normalization calculations verify accurately', () => {
      // Test known distance between Marine Drive Kochi (9.9786, 76.2758) and Aluva (10.1076, 76.3516)
      // Straight-line distance is approx 16.5 km
      const d = calculateHaversineDistanceKm(9.9786, 76.2758, 10.1076, 76.3516);
      assert.ok(d > 16.0 && d < 17.0, `Calculated distance ${d} should be approx 16.5 km`);

      // Normalization test
      const maxDistance = 20;
      // 0 km away -> 100
      assert.equal(calculateDistanceScore(0, maxDistance), 100);
      // exactly max distance away -> 0
      assert.equal(calculateDistanceScore(20, maxDistance), 0);
      // halfway away (10 km out of 20) -> 50
      assert.equal(calculateDistanceScore(10, maxDistance), 50);
      // beyond max distance -> 0
      assert.equal(calculateDistanceScore(25, maxDistance), 0);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // PART C & D: Deterministic Selection, Strict Same-Day Exclusion & Distance Limits
  // ───────────────────────────────────────────────────────────────────────────
  describe('PART C & D: Distance Ranking, Same-Day Conflict, and Selection Enforcement', () => {
    it('1. Ranks strictly by shorter distance and resolves ties by earlier submission timestamp', async () => {
      const pastDeadline = new Date(Date.now() - 1000);
      const req = await WorkRequirement.create({
        eventId: new mongoose.Types.ObjectId(confirmedEventAId),
        workerType: 'Catering Boy',
        requiredCount: 2,
        reportingTime: '08:00 AM',
        maxDistanceKm: 25,
        interestDeadlineAt: pastDeadline,
        status: 'open',
      });

      // Worker 1: 5 km away, responded at T+10
      const { worker: w1 } = await createWorkerHelper('Worker Near', 'wnear@example.com', 'Catering Boy', 9.9800, 76.2900);
      // Worker 2: 15 km away, responded at T+5 (earlier, but further away)
      const { worker: w2 } = await createWorkerHelper('Worker Far', 'wfar@example.com', 'Catering Boy', 10.0800, 76.3400);
      // Worker 3: 5 km away (identical distance to w1 within 1m tolerance), but responded at T+20
      const { worker: w3 } = await createWorkerHelper('Worker Near Tied', 'wtied@example.com', 'Catering Boy', 9.9800, 76.2900);

      // Create responses with specific timestamps
      await WorkResponse.create({
        requirementId: req._id,
        workerId: w2._id,
        eventId: req.eventId,
        responseStatus: 'interested',
        respondedAt: new Date(1000000000), // earlier timestamp, but further
      });
      await WorkResponse.create({
        requirementId: req._id,
        workerId: w1._id,
        eventId: req.eventId,
        responseStatus: 'interested',
        respondedAt: new Date(1000002000), // 5km, earlier than w3
      });
      await WorkResponse.create({
        requirementId: req._id,
        workerId: w3._id,
        eventId: req.eventId,
        responseStatus: 'interested',
        respondedAt: new Date(1000005000), // 5km, later than w1
      });

      // Execute selection
      const result = await workerSelectionService.executeSelection(req._id.toString());
      assert.equal(result.newlySelectedCount, 2);
      assert.equal(result.totalAssignedCount, 2);
      assert.equal(result.status, 'filled');

      // Top 2 selected must be w1 (closest) and w3 (closest, next earlier)
      const selectedIds = result.selectedWorkers.map((s) => s.workerId);
      assert.equal(selectedIds[0], w1._id.toString());
      assert.equal(selectedIds[1], w3._id.toString());
      assert.ok(!selectedIds.includes(w2._id.toString()), 'Further candidate w2 should not be selected');
    });

    it('2. Strict same-calendar-day exclusion: Worker with active assignment on same day is excluded', async () => {
      const pastDeadline = new Date(Date.now() - 1000);

      // Req 1 on Event A (Date: 2026-11-20)
      const req1 = await WorkRequirement.create({
        eventId: new mongoose.Types.ObjectId(confirmedEventAId),
        workerType: 'Catering Boy',
        requiredCount: 1,
        reportingTime: '08:00 AM',
        maxDistanceKm: 25,
        interestDeadlineAt: pastDeadline,
        status: 'open',
      });

      // Req 2 on Event B (Same date: 2026-11-20!)
      const req2 = await WorkRequirement.create({
        eventId: new mongoose.Types.ObjectId(confirmedEventBId),
        workerType: 'Catering Boy',
        requiredCount: 1,
        reportingTime: '10:00 AM',
        maxDistanceKm: 25,
        interestDeadlineAt: pastDeadline,
        status: 'open',
      });

      // Worker is 2 km from both venues
      const { worker } = await createWorkerHelper(
        'Dual Worker',
        'dual_worker@example.com',
        'Catering Boy',
        9.9800,
        76.2800
      );

      // Worker expressed interest in BOTH requirements
      await WorkResponse.create({
        requirementId: req1._id,
        workerId: worker._id,
        eventId: req1.eventId,
        responseStatus: 'interested',
        respondedAt: new Date(),
      });
      await WorkResponse.create({
        requirementId: req2._id,
        workerId: worker._id,
        eventId: req2.eventId,
        responseStatus: 'interested',
        respondedAt: new Date(),
      });

      // 1. Selection runs for Req 1 -> Worker is selected for Event A
      const res1 = await workerSelectionService.executeSelection(req1._id.toString());
      assert.equal(res1.newlySelectedCount, 1);
      assert.equal(res1.selectedWorkers[0].workerId, worker._id.toString());

      // 2. Selection runs for Req 2 (Same day) -> Worker MUST BE EXCLUDED!
      const res2 = await workerSelectionService.executeSelection(req2._id.toString());
      assert.equal(res2.newlySelectedCount, 0);
      assert.equal(res2.excludedCandidates.length, 1);
      assert.equal(res2.excludedCandidates[0].workerId, worker._id.toString());
      assert.match(res2.excludedCandidates[0].reason, /same-calendar-day assignment conflict/i);
    });

    it('3. Candidates exceeding maxDistanceKm are excluded from selection', async () => {
      const pastDeadline = new Date(Date.now() - 1000);
      const req = await WorkRequirement.create({
        eventId: new mongoose.Types.ObjectId(confirmedEventAId),
        workerType: 'Chef',
        requiredCount: 1,
        reportingTime: '06:00 AM',
        maxDistanceKm: 10, // Max 10 km
        interestDeadlineAt: pastDeadline,
        status: 'open',
      });

      // Worker located in Thrissur (approx 65 km away from Kochi)
      const { worker } = await createWorkerHelper(
        'Faraway Chef',
        'far_chef@example.com',
        'Chef',
        10.5276,
        76.2144
      );

      await WorkResponse.create({
        requirementId: req._id,
        workerId: worker._id,
        eventId: req.eventId,
        responseStatus: 'interested',
        respondedAt: new Date(),
      });

      const result = await workerSelectionService.executeSelection(req._id.toString());
      assert.equal(result.newlySelectedCount, 0);
      assert.equal(result.excludedCandidates.length, 1);
      assert.match(result.excludedCandidates[0].reason, /exceeds maximum permitted limit/i);
    });

    it('4. Missing coordinates exclude candidate without fabricating fallback distance', async () => {
      const pastDeadline = new Date(Date.now() - 1000);
      const req = await WorkRequirement.create({
        eventId: new mongoose.Types.ObjectId(confirmedEventAId),
        workerType: 'Host',
        requiredCount: 1,
        reportingTime: '08:00 AM',
        maxDistanceKm: 20,
        interestDeadlineAt: pastDeadline,
        status: 'open',
      });

      // Worker without coordinates
      const { worker } = await createWorkerHelper(
        'No Location Worker',
        'noloc@example.com',
        'Host'
        // lat, lng omitted
      );

      await WorkResponse.create({
        requirementId: req._id,
        workerId: worker._id,
        eventId: req.eventId,
        responseStatus: 'interested',
        respondedAt: new Date(),
      });

      const result = await workerSelectionService.executeSelection(req._id.toString());
      assert.equal(result.newlySelectedCount, 0);
      assert.equal(result.excludedCandidates.length, 1);
      assert.match(result.excludedCandidates[0].reason, /missing valid starting coordinates/i);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // PART F: Full Partial Selection, Deadline Extension & Preservation Flow
  // ───────────────────────────────────────────────────────────────────────────
  describe('PART F: Partial Selection, Deadline Extension, and Assignment Preservation', () => {
    it('Comprehensive 8-Worker Flow: Select 5 -> Extend -> Retain 5 -> Select 3 more -> Filled', async () => {
      // 1. Event Manager creates requirement for 8 Catering Boys
      const deadline1 = new Date(Date.now() - 5000); // Window 1 expired
      const req = await WorkRequirement.create({
        eventId: new mongoose.Types.ObjectId(confirmedEventAId),
        workerType: 'Catering Boy',
        requiredCount: 8,
        reportingTime: '08:00 AM',
        maxDistanceKm: 25,
        interestDeadlineAt: deadline1,
        selectionRound: 1,
        status: 'open',
      });

      // 2. Create 5 eligible candidates for Window 1
      const round1Workers = [];
      for (let i = 1; i <= 5; i++) {
        const { worker } = await createWorkerHelper(
          `Catering Worker ${i}`,
          `cworker_${i}@example.com`,
          'Catering Boy',
          9.9786 + i * 0.005,
          76.2758 + i * 0.005
        );
        round1Workers.push(worker);

        await WorkResponse.create({
          requirementId: req._id,
          workerId: worker._id,
          eventId: req.eventId,
          responseStatus: 'interested',
          respondedAt: new Date(Date.now() - 10000 + i * 1000),
          selectionRound: 1,
        });
      }

      // 3. Selection runs for Window 1
      const selResult1 = await workerSelectionService.executeSelection(req._id.toString(), 1);
      assert.equal(selResult1.newlySelectedCount, 5);
      assert.equal(selResult1.totalAssignedCount, 5);
      assert.equal(selResult1.remainingCount, 3);
      assert.equal(selResult1.status, 'open', 'Requirement must remain open (not filled) since 3 positions remain');

      // 4. Verify MongoDB state after Window 1
      const reqAfterRound1 = await WorkRequirement.findById(req._id);
      assert.equal(reqAfterRound1?.assignedWorkers.length, 5);
      assert.equal(reqAfterRound1?.status, 'open');

      // 5. Manager extends the deadline for the 3 remaining positions via API
      const newDeadline = new Date(Date.now() + 86400000); // 1 day in future
      const extendRes = await fetch(
        `http://127.0.0.1:${port}/api/manager/work-requirements/${req._id}/extend-deadline`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${managerAToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            interestDeadlineAt: newDeadline.toISOString(),
          }),
        }
      );
      assert.equal(extendRes.status, 200);
      const extendData = (await extendRes.json()) as any;
      assert.equal(extendData.success, true);
      assert.equal(extendData.data.requirement.filled, 5);
      assert.equal(extendData.data.requirement.pending, 3);

      // 6. VERIFY CRITICAL RULE: Extending deadline did not remove or reset previously assigned workers!
      const reqAfterExtend = await WorkRequirement.findById(req._id);
      assert.equal(reqAfterExtend?.assignedWorkers.length, 5, 'All 5 previously selected workers MUST remain assigned!');
      assert.equal(reqAfterExtend?.selectionRound, 2, 'Selection round must be incremented to 2');
      assert.equal(reqAfterExtend?.extensionHistory.length, 1);
      assert.equal(reqAfterExtend?.extensionHistory[0].remainingCount, 3);

      // 7. During extended window, 3 additional eligible workers express interest
      const round2Workers = [];
      for (let i = 6; i <= 8; i++) {
        const { worker } = await createWorkerHelper(
          `Catering Worker ${i}`,
          `cworker_${i}@example.com`,
          'Catering Boy',
          9.9786 + (i - 5) * 0.003,
          76.2758 + (i - 5) * 0.003
        );
        round2Workers.push(worker);

        await WorkResponse.create({
          requirementId: req._id,
          workerId: worker._id,
          eventId: req.eventId,
          responseStatus: 'interested',
          respondedAt: new Date(),
          selectionRound: 2,
        });
      }

      // 8. Extended deadline expires and selection runs for Window 2
      // Fast-forward deadline for test execution
      await WorkRequirement.findByIdAndUpdate(req._id, {
        interestDeadlineAt: new Date(Date.now() - 1000),
      });

      const selResult2 = await workerSelectionService.executeSelection(req._id.toString(), 2);
      assert.equal(selResult2.newlySelectedCount, 3, 'Must select exactly 3 newly interested workers');
      assert.equal(selResult2.previouslyRetainedCount, 5, 'Must report 5 previously retained workers');
      assert.equal(selResult2.totalAssignedCount, 8, 'Total assigned reaches 8');
      assert.equal(selResult2.remainingCount, 0, '0 positions remain unfilled');
      assert.equal(selResult2.status, 'filled', 'Requirement becomes filled once full quota is satisfied');

      // 9. Inspect authoritative database state:
      const finalReq = await WorkRequirement.findById(req._id);
      assert.equal(finalReq?.assignedWorkers.length, 8);
      assert.equal(finalReq?.status, 'filled');

      // Verify all 5 original worker IDs are present in the final assignment list:
      const finalAssignedIds = finalReq?.assignedWorkers.map((a) => a.workerId.toString());
      for (const w of round1Workers) {
        assert.ok(finalAssignedIds?.includes(w._id.toString()), `Original worker ${w._id} must still be assigned!`);
      }
      for (const w of round2Workers) {
        assert.ok(finalAssignedIds?.includes(w._id.toString()), `New worker ${w._id} must be appended!`);
      }

      // 10. Attempting to extend an already filled requirement is rejected
      const extendFilledRes = await fetch(
        `http://127.0.0.1:${port}/api/manager/work-requirements/${req._id}/extend-deadline`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${managerAToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            interestDeadlineAt: new Date(Date.now() + 86400000).toISOString(),
          }),
        }
      );
      assert.equal(extendFilledRes.status, 400);
      const filledErr = (await extendFilledRes.json()) as any;
      assert.match(filledErr.message, /already fully staffed/i);
    });

    it('5. Stale BullMQ job from an earlier selection window does not execute or corrupt new round', async () => {
      const pastDeadline = new Date(Date.now() - 1000);
      const req = await WorkRequirement.create({
        eventId: new mongoose.Types.ObjectId(confirmedEventAId),
        workerType: 'Host',
        requiredCount: 5,
        reportingTime: '08:00 AM',
        maxDistanceKm: 25,
        interestDeadlineAt: pastDeadline,
        selectionRound: 2, // Requirement is currently at Round 2
        status: 'open',
      });

      // Execute selection simulating stale Round 1 job
      const result = await workerSelectionService.executeSelection(req._id.toString(), 1);
      assert.equal(result.newlySelectedCount, 0);

      // Verify status remained untouched
      const freshReq = await WorkRequirement.findById(req._id);
      assert.equal(freshReq?.status, 'open');
      assert.equal(freshReq?.selectionRound, 2);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // PART G: Future Performance Capability (Pure Unit Tests on Synthetic Data)
  // ───────────────────────────────────────────────────────────────────────────
  describe('PART G: Future Combined Performance Scoring (55% Performance / 45% Distance)', () => {
    it('1. Verifies approved formula: Combined Score = (Performance * 0.55) + (Distance * 0.45)', () => {
      // Worker A: Performance 90, Distance Score 80
      // Expected = 90 * 0.55 + 80 * 0.45 = 49.5 + 36 = 85.5
      const scoreA = CombinedPerformanceDistanceRankingStrategy.calculateCombinedScore(90, 80);
      assert.equal(scoreA, 85.5);

      // Worker B: Performance 70, Distance Score 100 (Right next door)
      // Expected = 70 * 0.55 + 100 * 0.45 = 38.5 + 45 = 83.5
      const scoreB = CombinedPerformanceDistanceRankingStrategy.calculateCombinedScore(70, 100);
      assert.equal(scoreB, 83.5);

      // Worker C: Performance 100 (5-star), Distance Score 60
      // Expected = 100 * 0.55 + 60 * 0.45 = 55 + 27 = 82
      const scoreC = CombinedPerformanceDistanceRankingStrategy.calculateCombinedScore(100, 60);
      assert.equal(scoreC, 82);
    });

    it('2. Evaluates full tie-breaking rules deterministically', () => {
      const strategy = new CombinedPerformanceDistanceRankingStrategy();

      // Candidate 1: High combined score
      const c1 = {
        workerId: 'w1',
        workerName: 'Alice',
        workerType: 'Chef',
        respondedAt: new Date(1000),
        distanceKm: 5,
        distanceScore: 75,
        performanceScore: 90,
        eligible: true,
      };

      // Candidate 2: Combined score = 82 * 0.55 + 70 * 0.45 = 45.1 + 31.5 = 76.6
      const c2 = {
        workerId: 'w2',
        workerName: 'Bob',
        workerType: 'Chef',
        respondedAt: new Date(1500),
        distanceKm: 10,
        distanceScore: 70,
        performanceScore: 82,
        eligible: true,
      };

      // Candidate 3: Tied combined score with c2 (~76.6: 70 * 0.55 + 84.667 * 0.45 = 38.5 + 38.1 = 76.6)
      // but lower performance score (70 vs 82) -> c2 wins over c3!
      const c3 = {
        workerId: 'w3',
        workerName: 'Charlie',
        workerType: 'Chef',
        respondedAt: new Date(1200),
        distanceKm: 4,
        distanceScore: 84.667,
        performanceScore: 70,
        eligible: true,
      };

      // Candidate 4: Combined score = 80 * 0.55 + 70 * 0.45 = 44 + 31.5 = 75.5 (lower than c2/c3)
      const c4 = {
        workerId: 'w4',
        workerName: 'Dave',
        workerType: 'Chef',
        respondedAt: new Date(2000),
        distanceKm: 6,
        distanceScore: 70,
        performanceScore: 80,
        eligible: true,
      };

      // Candidate 5: Tied with c4, but further distance
      const c5 = {
        workerId: 'w5',
        workerName: 'Eve',
        workerType: 'Chef',
        respondedAt: new Date(2000),
        distanceKm: 8,
        distanceScore: 70,
        performanceScore: 80,
        eligible: true,
      };

      const ranked = strategy.rank([c5, c4, c3, c2, c1]);

      // c1 should be rank 1 (highest combined)
      assert.equal(ranked[0].workerId, 'w1');
      // Between c2 and c3: c2 has higher performance (90 vs 65.45) -> c2 wins
      assert.equal(ranked[1].workerId, 'w2');
      // Between c4 and c5: c4 has shorter distance (6km vs 8km) -> c4 wins over c5
      const c4Index = ranked.findIndex((r) => r.workerId === 'w4');
      const c5Index = ranked.findIndex((r) => r.workerId === 'w5');
      assert.ok(c4Index < c5Index, 'c4 (shorter distance) must rank higher than c5');
    });
  });
});
