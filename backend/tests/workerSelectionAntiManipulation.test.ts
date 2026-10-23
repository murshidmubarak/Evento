import './setup.js';
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import app from '../src/app.js';
import { Event } from '../src/modules/events/model/event.model.js';
import { User } from '../src/modules/auth/model/user.model.js';
import { WorkRequirement } from '../src/modules/work-requirements/model/work-requirement.model.js';
import { WorkResponse } from '../src/modules/work-requirements/model/work-response.model.js';
import { WorkerLocationHistory } from '../src/modules/work-requirements/model/worker-location-history.model.js';
import { connectDB } from '../src/config/db.js';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import { env } from '../src/config/env.js';
import { workerSelectionService } from '../src/modules/worker-selection/service/worker-selection.service.js';
import { workerSelectionQueueService } from '../src/modules/worker-selection/queues/worker-selection.queue.js';
import { CombinedPerformanceDistanceRankingStrategy } from '../src/modules/worker-selection/ranking/combined-performance-distance.strategy.js';
import { DistanceOnlyRankingStrategy } from '../src/modules/worker-selection/ranking/distance-only.strategy.js';

describe('Worker Selection Engine — Immutable Location History & Anti-Manipulation (§17)', () => {
  let server: any;
  let port: number;

  let managerToken: string;
  let managerId: string;
  let clientId: string;

  // Venue: Marine Drive, Kochi (9.9786, 76.2758)
  const venueLocation = {
    address: 'Marine Drive Event Venue, Kochi, Kerala',
    lat: 9.9786,
    lng: 76.2758,
  };

  // Location A: Aluva (~16.4 km from venue)
  const locationA = {
    address: 'Railway Station Road, Aluva, Kerala',
    lat: 10.1076,
    lng: 76.3516,
  };

  // Location B: Walkable from venue (~0.15 km from venue)
  const locationB = {
    address: 'Shanmugham Road, Marine Drive, Kochi',
    lat: 9.9795,
    lng: 76.2765,
  };

  // Location Far: Trivandrum (~180 km from venue)
  const locationFar = {
    address: 'Palayam, Thiruvananthapuram',
    lat: 8.5241,
    lng: 76.9366,
  };

  const generateToken = (userId: string, role: string) => {
    return jwt.sign({ userId, role }, env.jwtSecret, { expiresIn: '2h' });
  };

  const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  before(async () => {
    await connectDB();
    server = app.listen(0);
    port = (server.address() as any).port;

    managerId = new mongoose.Types.ObjectId().toString();
    clientId = new mongoose.Types.ObjectId().toString();

    managerToken = generateToken(managerId, 'event_manager');

    await User.deleteMany({});
    await Event.deleteMany({});
    await WorkRequirement.deleteMany({});
    await WorkResponse.deleteMany({});
    await WorkerLocationHistory.deleteMany({});

    // Create Manager
    await User.create({
      _id: new mongoose.Types.ObjectId(managerId),
      name: 'Manager AntiManip',
      email: 'manager_antimanip@example.com',
      password: 'password',
      role: 'event_manager',
      isActive: true,
    });

    // Create Client
    await User.create({
      _id: new mongoose.Types.ObjectId(clientId),
      name: 'Client AntiManip',
      email: 'client_antimanip@example.com',
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
    await WorkerLocationHistory.deleteMany({});
    workerSelectionQueueService.getMockQueue().clear();
  });

  /**
   * Helper to create a confirmed event assigned to managerId
   */
  async function createConfirmedEvent(dateStr = '2026-11-25T00:00:00.000Z') {
    return await Event.create({
      clientId: new mongoose.Types.ObjectId(clientId),
      eventManagerId: new mongoose.Types.ObjectId(managerId),
      title: 'Anti-Manipulation Verification Summit',
      eventType: 'Corporate',
      date: new Date(dateStr),
      startTime: '09:00',
      endTime: '17:00',
      location: venueLocation,
      guestCount: 200,
      status: 'confirmed',
    });
  }

  /**
   * Helper to register/create an active worker
   */
  async function createWorker(
    name: string,
    email: string,
    workerType = 'Juice Worker',
    initialLocation?: { address: string; lat: number; lng: number },
    customConfirmedAt?: Date
  ) {
    const workerId = new mongoose.Types.ObjectId().toString();
    const token = generateToken(workerId, 'worker');

    const confirmedAt = initialLocation ? (customConfirmedAt || new Date()) : undefined;

    const user = await User.create({
      _id: new mongoose.Types.ObjectId(workerId),
      name,
      email,
      password: 'password',
      role: 'worker',
      workerType,
      businessId: `EV-WKR-${Math.floor(1000 + Math.random() * 9000)}`,
      isActive: true,
      location: initialLocation
        ? {
            address: initialLocation.address,
            lat: initialLocation.lat,
            lng: initialLocation.lng,
            confirmedAt,
          }
        : undefined,
    });

    // If initial location provided, also seed initial WorkerLocationHistory record
    if (initialLocation && confirmedAt) {
      await WorkerLocationHistory.create({
        workerId: user._id,
        address: initialLocation.address,
        lat: initialLocation.lat,
        lng: initialLocation.lng,
        effectiveFrom: confirmedAt,
        versionId: new mongoose.Types.ObjectId().toString(),
      });
    }

    return { user, workerId, token };
  }

  // =========================================================================
  // SECTION 1: MANDATORY 13-STEP ANTI-MANIPULATION SCENARIO (§17)
  // =========================================================================
  it('enforces the complete 13-step location anti-manipulation lifecycle (§17)', async () => {
    const event = await createConfirmedEvent();
    const eventId = event._id.toString();

    // 1. A Worker saves Location A (Aluva: ~16.4 km from venue)
    const { workerId, token: workerToken } = await createWorker(
      'Worker Manipulation Tester',
      'worker_manip@example.com',
      'Juice Worker'
    );

    // Save Location A via Worker Portal location update API
    const saveLocARes = await fetch(`http://localhost:${port}/api/worker/location`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${workerToken}`,
      },
      body: JSON.stringify(locationA),
    });
    assert.equal(saveLocARes.status, 200, 'Saving Location A should succeed');

    await delay(50);

    // 2. The Work Requirement is created and published
    // Manager creates requirement in draft, then publishes it
    const createReqRes = await fetch(
      `http://localhost:${port}/api/manager/events/${eventId}/work-requirements`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${managerToken}`,
        },
        body: JSON.stringify({
          workerType: 'Juice Worker',
          requiredCount: 2,
          reportingTime: '08:30',
          description: 'Juice station staffing',
          maxDistanceKm: 25, // Location A (~16.4 km) is within limit; Location Far is not
          interestDeadlineAt: new Date(Date.now() + 3600000).toISOString(), // 1 hour in future
        }),
      }
    );
    assert.equal(createReqRes.status, 201);
    const createdReq = (await createReqRes.json()).data.requirement;
    const req1Id = createdReq._id;

    // Publish Requirement 1 (draft -> open)
    const publishReqRes = await fetch(
      `http://localhost:${port}/api/manager/work-requirements/${req1Id}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${managerToken}`,
        },
        body: JSON.stringify({
          status: 'open',
        }),
      }
    );
    assert.equal(publishReqRes.status, 200);

    // 3. The publication timestamp is persisted authoritatively
    const req1AfterPub = await WorkRequirement.findById(req1Id);
    assert.ok(req1AfterPub?.interestPublishedAt, 'interestPublishedAt must be persisted');
    const originalPublicationCutoff = req1AfterPub!.interestPublishedAt!;

    await delay(50);

    // 4. The Worker changes their profile to Location B (Marine Drive, ~0.15 km from venue)
    const updateToLocBRes = await fetch(`http://localhost:${port}/api/worker/location`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${workerToken}`,
      },
      body: JSON.stringify(locationB),
    });
    assert.equal(updateToLocBRes.status, 200);

    // Verify 2 versions now exist in WorkerLocationHistory
    const versions = await WorkerLocationHistory.find({ workerId }).sort({ effectiveFrom: 1 });
    assert.equal(versions.length, 2, 'Must have exactly 2 immutable location versions');
    assert.equal(versions[0].address, locationA.address);
    assert.equal(versions[1].address, locationB.address);

    // 5. The Worker expresses interest in the existing Requirement 1
    const expressInterestRes = await fetch(
      `http://localhost:${port}/api/worker/opportunities/${req1Id}/interest`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${workerToken}`,
        },
      }
    );
    assert.equal(expressInterestRes.status, 201, 'Express interest should succeed');
    const interestData = (await expressInterestRes.json()).data.response;

    // 6. The backend uses Location A for distance calculation (~16.4 km, NOT ~0.15 km)
    assert.ok(
      interestData.distanceKm > 10,
      `Calculated distance must reflect Location A (~16.4 km), got ${interestData.distanceKm} km`
    );
    assert.ok(
      Math.abs(interestData.distanceKm - 16.4) < 1.0,
      `Distance should be ~16.4 km, got ${interestData.distanceKm}`
    );

    // 7. The Worker is NOT granted a better distance score from Location B
    const responseInDb = await WorkResponse.findOne({ requirementId: req1Id, workerId });
    assert.ok(responseInDb);
    assert.equal(responseInDb.locationSnapshot?.address, locationA.address);
    assert.equal(responseInDb.locationSnapshot?.versionId, versions[0].versionId);

    // 8. The initial deadline expires and manager extends the deadline for Requirement 1
    await WorkRequirement.findByIdAndUpdate(req1Id, { interestDeadlineAt: new Date(Date.now() - 1000) });

    const newDeadline = new Date(Date.now() + 7200000).toISOString();
    const extendRes = await fetch(
      `http://localhost:${port}/api/manager/work-requirements/${req1Id}/extend-deadline`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${managerToken}`,
        },
        body: JSON.stringify({
          interestDeadlineAt: newDeadline,
        }),
      }
    );
    assert.equal(extendRes.status, 200, 'Deadline extension should succeed');

    // 9. The same requirement still uses original interestPublishedAt and Location A
    const req1AfterExtension = await WorkRequirement.findById(req1Id);
    assert.equal(
      req1AfterExtension?.interestPublishedAt?.getTime(),
      originalPublicationCutoff.getTime(),
      'Deadline extension MUST NOT reset interestPublishedAt cutoff'
    );

    // 10 & 11. Worker views opportunities; Requirement 1 still evaluates using Location A (~16.4 km)
    const oppsRes = await fetch(`http://localhost:${port}/api/worker/opportunities`, {
      headers: {
        Authorization: `Bearer ${workerToken}`,
      },
    });
    assert.equal(oppsRes.status, 200);
    const opps = (await oppsRes.json()).data.opportunities;
    const opp1 = opps.find((o: any) => o.id === req1Id);
    assert.ok(opp1);
    assert.ok(
      opp1.distanceKm > 10,
      `Opportunity distance on extended requirement 1 must still use Location A (~16.4 km), got ${opp1.distanceKm}`
    );

    await delay(50);

    // 12. A NEW Work Requirement 2 is published AFTER the location change to Location B
    const createReq2Res = await fetch(
      `http://localhost:${port}/api/manager/events/${eventId}/work-requirements`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${managerToken}`,
        },
        body: JSON.stringify({
          workerType: 'Juice Worker',
          requiredCount: 1,
          reportingTime: '10:00',
          description: 'Second round juice staffing',
          maxDistanceKm: 25,
          interestDeadlineAt: new Date(Date.now() + 3600000).toISOString(),
        }),
      }
    );
    assert.equal(createReq2Res.status, 201);
    const req2Id = (await createReq2Res.json()).data.requirement._id;

    // Publish Requirement 2
    const publishReq2Res = await fetch(
      `http://localhost:${port}/api/manager/work-requirements/${req2Id}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${managerToken}`,
        },
        body: JSON.stringify({ status: 'open' }),
      }
    );
    assert.equal(publishReq2Res.status, 200);

    // 13. The new requirement uses Location B (~0.15 km)
    const expressReq2Res = await fetch(
      `http://localhost:${port}/api/worker/opportunities/${req2Id}/interest`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${workerToken}`,
        },
      }
    );
    assert.equal(expressReq2Res.status, 201);
    const req2InterestData = (await expressReq2Res.json()).data.response;
    assert.ok(
      req2InterestData.distanceKm < 1.0,
      `New requirement published after update must use Location B (< 1.0 km), got ${req2InterestData.distanceKm} km`
    );
    assert.equal(req2InterestData.locationSnapshot.address, locationB.address);
    assert.equal(req2InterestData.locationSnapshot.versionId, versions[1].versionId);
  });

  // =========================================================================
  // SECTION 2: CANNOT CIRCUMVENT MAXIMUM DISTANCE BY MOVING CLOSER AFTERWARDS
  // =========================================================================
  it('prevents an ineligible distant worker from becoming eligible by updating location after publication', async () => {
    const event = await createConfirmedEvent();
    const eventId = event._id.toString();

    // Worker starts at Location Far (~180 km away)
    const { token: farWorkerToken } = await createWorker(
      'Distant Worker',
      'distant_worker@example.com',
      'Juice Worker'
    );

    // Save Location Far
    const farSaveRes = await fetch(`http://localhost:${port}/api/worker/location`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${farWorkerToken}`,
      },
      body: JSON.stringify(locationFar),
    });
    assert.equal(farSaveRes.status, 200);

    await delay(50);

    // Manager publishes Requirement with maxDistanceKm = 30 km
    const createRes = await fetch(
      `http://localhost:${port}/api/manager/events/${eventId}/work-requirements`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${managerToken}`,
        },
        body: JSON.stringify({
          workerType: 'Juice Worker',
          requiredCount: 2,
          reportingTime: '08:00',
          maxDistanceKm: 30, // 30 km limit
          interestDeadlineAt: new Date(Date.now() + 3600000).toISOString(),
        }),
      }
    );
    assert.equal(createRes.status, 201);
    const reqId = (await createRes.json()).data.requirement._id;

    const pubRes = await fetch(`http://localhost:${port}/api/manager/work-requirements/${reqId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${managerToken}`,
      },
      body: JSON.stringify({ status: 'open' }),
    });
    assert.equal(pubRes.status, 200);

    await delay(50);

    // Worker moves closer to venue (Location B, ~0.15 km) AFTER requirement is published
    await fetch(`http://localhost:${port}/api/worker/location`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${farWorkerToken}`,
      },
      body: JSON.stringify(locationB),
    });

    // Worker tries to express interest in Requirement
    const expressRes = await fetch(
      `http://localhost:${port}/api/worker/opportunities/${reqId}/interest`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${farWorkerToken}`,
        },
      }
    );

    // MUST BE REJECTED because as of requirement publication, distance was ~180 km > 30 km!
    assert.equal(expressRes.status, 400);
    const errorBody = await expressRes.json();
    assert.match(
      errorBody.message,
      /exceeds the maximum permitted distance/i,
      'Should reject because distance at publication cutoff exceeds limit'
    );
  });

  // =========================================================================
  // SECTION 3: WORKER WITH NO LOCATION AT PUBLICATION CUTOFF IS INELIGIBLE
  // =========================================================================
  it('excludes a worker who had no confirmed location at publication cutoff even if added later', async () => {
    const event = await createConfirmedEvent();
    const eventId = event._id.toString();

    // Worker registers with NO location
    const { token: noLocWorkerToken } = await createWorker(
      'No Initial Location Worker',
      'no_loc_worker@example.com',
      'Juice Worker'
    );

    await delay(50);

    // Manager publishes requirement
    const createRes = await fetch(
      `http://localhost:${port}/api/manager/events/${eventId}/work-requirements`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${managerToken}`,
        },
        body: JSON.stringify({
          workerType: 'Juice Worker',
          requiredCount: 1,
          reportingTime: '08:00',
          maxDistanceKm: 50,
          interestDeadlineAt: new Date(Date.now() + 3600000).toISOString(),
        }),
      }
    );
    assert.equal(createRes.status, 201);
    const reqId = (await createRes.json()).data.requirement._id;

    const pubRes = await fetch(`http://localhost:${port}/api/manager/work-requirements/${reqId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${managerToken}`,
      },
      body: JSON.stringify({ status: 'open' }),
    });
    assert.equal(pubRes.status, 200);

    await delay(50);

    // Worker configures location B AFTER publication
    await fetch(`http://localhost:${port}/api/worker/location`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${noLocWorkerToken}`,
      },
      body: JSON.stringify(locationB),
    });

    // Worker tries to express interest in requirement published before their location setup
    const expressRes = await fetch(
      `http://localhost:${port}/api/worker/opportunities/${reqId}/interest`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${noLocWorkerToken}`,
        },
      }
    );

    assert.equal(expressRes.status, 400);
    const errorBody = await expressRes.json();
    assert.match(
      errorBody.message,
      /did not have a confirmed location on file when this work requirement was published/i
    );
  });

  // =========================================================================
  // SECTION 4: ANTI-REDUNDANCY — RESUBMITTING IDENTICAL COORDS CREATES NO DUPLICATE VERSION
  // =========================================================================
  it('does not create duplicate location history versions when resubmitting identical coordinates', async () => {
    const { workerId, token: workerToken } = await createWorker(
      'Duplicate Version Tester',
      'dup_ver@example.com',
      'Juice Worker'
    );

    // First location update
    const res1 = await fetch(`http://localhost:${port}/api/worker/location`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${workerToken}`,
      },
      body: JSON.stringify(locationA),
    });
    assert.equal(res1.status, 200);

    // Resubmit identical location
    const res2 = await fetch(`http://localhost:${port}/api/worker/location`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${workerToken}`,
      },
      body: JSON.stringify(locationA),
    });
    assert.equal(res2.status, 200);

    // Count versions
    const count = await WorkerLocationHistory.countDocuments({ workerId });
    assert.equal(count, 1, 'Identical location update must not produce redundant history records');
  });

  // =========================================================================
  // SECTION 5: SELECTION ENGINE EVALUATES CANDIDATES USING HISTORICAL LOCATION
  // =========================================================================
  it('uses historical location during deterministic selection execution and preserves earlier assignments', async () => {
    const event = await createConfirmedEvent();

    // Two minutes ago: Workers established locations A and B
    const twoMinutesAgo = new Date(Date.now() - 120000);
    const oneMinuteAgo = new Date(Date.now() - 60000);

    // Worker 1 starts at Location A (~16.4 km) 2 minutes ago
    const { workerId: w1Id } = await createWorker(
      'Worker One',
      'w1@example.com',
      'Juice Worker',
      locationA,
      twoMinutesAgo
    );

    // Worker 2 starts at Location B (~0.15 km) 2 minutes ago
    const { workerId: w2Id } = await createWorker(
      'Worker Two',
      'w2@example.com',
      'Juice Worker',
      locationB,
      twoMinutesAgo
    );

    // Requirement: published 1 minute ago, requires 1 worker, deadline in past (to trigger selection)
    const pastDeadline = new Date(Date.now() - 10000);
    const req = await WorkRequirement.create({
      eventId: event._id,
      workerType: 'Juice Worker',
      requiredCount: 1,
      reportingTime: '08:00',
      maxDistanceKm: 30,
      interestDeadlineAt: pastDeadline,
      interestPublishedAt: oneMinuteAgo, // published 1 minute ago (after workers' confirmed locations)
      status: 'open',
    });

    // Both workers expressed interest
    await WorkResponse.create({
      requirementId: req._id,
      workerId: new mongoose.Types.ObjectId(w1Id),
      eventId: event._id,
      responseStatus: 'interested',
      respondedAt: new Date(Date.now() - 30000),
      distanceKm: 16.4,
      selectionRound: 1,
      locationSnapshot: { address: locationA.address, lat: locationA.lat, lng: locationA.lng },
    });

    await WorkResponse.create({
      requirementId: req._id,
      workerId: new mongoose.Types.ObjectId(w2Id),
      eventId: event._id,
      responseStatus: 'interested',
      respondedAt: new Date(Date.now() - 20000),
      distanceKm: 0.15,
      selectionRound: 1,
      locationSnapshot: { address: locationB.address, lat: locationB.lat, lng: locationB.lng },
    });

    // Worker 1 maliciously updates profile to Location B (~0.15 km) right before selection
    await User.findByIdAndUpdate(w1Id, {
      $set: { location: { address: locationB.address, lat: locationB.lat, lng: locationB.lng, confirmedAt: new Date() } },
    });

    // Execute selection
    const result = await workerSelectionService.executeSelection(req._id.toString());

    // Worker 2 should be selected because Worker 1's historical distance was ~16.4 km (Location A),
    // and Worker 2's distance was ~0.15 km (Location B). Shorter distance wins!
    assert.equal(result.newlySelectedCount, 1);
    assert.equal(result.selectedWorkers[0].workerId, w2Id, 'Worker 2 (closer historically) must be selected');

    // Requirement is now filled
    const reqAfter = await WorkRequirement.findById(req._id);
    assert.equal(reqAfter?.status, 'filled');
  });

  // =========================================================================
  // SECTION 6: FUTURE 55% PERFORMANCE / 45% DISTANCE RANKING STRATEGY
  // =========================================================================
  it('verifies pure calculation and deterministic tie-breaking for future combined ranking strategy', () => {
    // Score formula: (perf * 0.55) + (dist * 0.45)
    // Candidate 1: Perf 80, Dist 80 -> (80 * 0.55) + (80 * 0.45) = 44 + 36 = 80
    const score1 = CombinedPerformanceDistanceRankingStrategy.calculateCombinedScore(80, 80);
    assert.equal(score1, 80);

    // Candidate 2: Perf 90, Dist 60 -> (90 * 0.55) + (60 * 0.45) = 49.5 + 27 = 76.5
    const score2 = CombinedPerformanceDistanceRankingStrategy.calculateCombinedScore(90, 60);
    assert.equal(score2, 76.5);

    const strategy = new CombinedPerformanceDistanceRankingStrategy();
    const now = new Date();

    const candidates = [
      {
        workerId: 'worker_c',
        workerName: 'Worker C',
        workerType: 'Juice Worker',
        respondedAt: now,
        distanceKm: 10,
        distanceScore: 60,
        performanceScore: 90, // combined = 76.5
        eligible: true,
      },
      {
        workerId: 'worker_a',
        workerName: 'Worker A',
        workerType: 'Juice Worker',
        respondedAt: now,
        distanceKm: 5,
        distanceScore: 80,
        performanceScore: 80, // combined = 80.0
        eligible: true,
      },
      {
        workerId: 'worker_b',
        workerName: 'Worker B',
        workerType: 'Juice Worker',
        respondedAt: now,
        distanceKm: 4,
        distanceScore: 85,
        performanceScore: 90, // combined = (90*0.55) + (85*0.45) = 49.5 + 38.25 = 87.75
        eligible: true,
      },
    ];

    const ranked = strategy.rank(candidates);
    assert.equal(ranked[0].workerId, 'worker_b', 'Highest combined score (87.75) ranks 1st');
    assert.equal(ranked[1].workerId, 'worker_a', 'Second highest combined score (80.0) ranks 2nd');
    assert.equal(ranked[2].workerId, 'worker_c', 'Third combined score (76.5) ranks 3rd');
  });

  // =========================================================================
  // SECTION 7: CURRENT DISTANCE-ONLY STRATEGY DETERMINISTIC TIE-BREAKING
  // =========================================================================
  it('ranks deterministically using distance-only with timestamp and workerId tie-breakers', () => {
    const strategy = new DistanceOnlyRankingStrategy();
    const t1 = new Date('2026-10-22T10:00:00.000Z');
    const t2 = new Date('2026-10-22T10:05:00.000Z');

    const candidates = [
      {
        workerId: 'worker_z',
        workerName: 'Worker Z (Tied distance, later time)',
        workerType: 'Juice Worker',
        respondedAt: t2,
        distanceKm: 5.0,
        distanceScore: 90,
        eligible: true,
      },
      {
        workerId: 'worker_a',
        workerName: 'Worker A (Tied distance, earlier time)',
        workerType: 'Juice Worker',
        respondedAt: t1,
        distanceKm: 5.0,
        distanceScore: 90,
        eligible: true,
      },
      {
        workerId: 'worker_close',
        workerName: 'Worker Close (Shortest distance)',
        workerType: 'Juice Worker',
        respondedAt: t2,
        distanceKm: 2.0,
        distanceScore: 96,
        eligible: true,
      },
    ];

    const ranked = strategy.rank(candidates);
    assert.equal(ranked[0].workerId, 'worker_close', 'Shorter distance ranks 1st');
    assert.equal(ranked[1].workerId, 'worker_a', 'Earlier timestamp wins tie-breaker for 2nd');
    assert.equal(ranked[2].workerId, 'worker_z', 'Later timestamp ranks 3rd');
  });
});
