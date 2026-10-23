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

describe('Mandatory Worker Location & Distance Gate Tests', () => {
  let server: any;
  let port: number;

  let managerToken: string;
  let managerId: string;
  let clientToken: string;
  let clientId: string;

  let workerNoLocToken: string;
  let workerNoLocId: string;

  let workerNearToken: string;
  let workerNearId: string;

  let workerFarToken: string;
  let workerFarId: string;

  let eventId: string;
  let requirementId: string;

  // Venue coordinates: Kochi MG Road (9.9312, 76.2673)
  const venueLocation = {
    address: 'Kochi Convention Centre, MG Road, Kochi',
    lat: 9.9312,
    lng: 76.2673,
  };

  // Near Worker: ~1.5 km from venue (9.9400, 76.2750)
  const nearLocation = {
    address: 'Marine Drive, Kochi',
    lat: 9.9400,
    lng: 76.2750,
  };

  // Far Worker: Trivandrum (~180 km from venue) (8.5241, 76.9366)
  const farLocation = {
    address: 'Palayam, Thiruvananthapuram',
    lat: 8.5241,
    lng: 76.9366,
  };

  const generateToken = (userId: string, role: string) => {
    return jwt.sign({ userId, role }, env.jwtSecret, { expiresIn: '2h' });
  };

  before(async () => {
    await connectDB();
    server = app.listen(0);
    port = (server.address() as any).port;

    managerId = new mongoose.Types.ObjectId().toString();
    clientId = new mongoose.Types.ObjectId().toString();
    workerNoLocId = new mongoose.Types.ObjectId().toString();
    workerNearId = new mongoose.Types.ObjectId().toString();
    workerFarId = new mongoose.Types.ObjectId().toString();

    managerToken = generateToken(managerId, 'event_manager');
    clientToken = generateToken(clientId, 'client');
    workerNoLocToken = generateToken(workerNoLocId, 'worker');
    workerNearToken = generateToken(workerNearId, 'worker');
    workerFarToken = generateToken(workerFarId, 'worker');

    await User.deleteMany({});

    // Create Manager
    await User.create({
      _id: managerId,
      name: 'Manager Bob',
      email: 'manager_loc@example.com',
      password: 'password',
      role: 'event_manager',
      isActive: true,
    });

    // Create Client
    await User.create({
      _id: clientId,
      name: 'Client Alice',
      email: 'client_loc@example.com',
      password: 'password',
      role: 'client',
      isActive: true,
    });

    // Create Worker without location
    await User.create({
      _id: workerNoLocId,
      name: 'Worker No Location',
      email: 'worker_noloc@example.com',
      password: 'password',
      role: 'worker',
      workerType: 'Juice Worker',
      isActive: true,
    });

    // Create Worker Near (configured with valid coordinates)
    await User.create({
      _id: workerNearId,
      name: 'Worker Near',
      email: 'worker_near@example.com',
      password: 'password',
      role: 'worker',
      workerType: 'Juice Worker',
      location: {
        address: nearLocation.address,
        lat: nearLocation.lat,
        lng: nearLocation.lng,
        confirmedAt: new Date(),
      },
      isActive: true,
    });

    // Create Worker Far (configured with coordinates > 10 km)
    await User.create({
      _id: workerFarId,
      name: 'Worker Far',
      email: 'worker_far@example.com',
      password: 'password',
      role: 'worker',
      workerType: 'Juice Worker',
      location: {
        address: farLocation.address,
        lat: farLocation.lat,
        lng: farLocation.lng,
        confirmedAt: new Date(),
      },
      isActive: true,
    });
  });

  after(async () => {
    server.close();
    await mongoose.disconnect();
  });

  beforeEach(async () => {
    await Event.deleteMany({});
    await WorkRequirement.deleteMany({});
    await WorkResponse.deleteMany({});

    // Reset Worker No Location to having no location
    await User.findByIdAndUpdate(workerNoLocId, { $unset: { location: 1 } });

    // Reset Worker Near location
    await User.findByIdAndUpdate(workerNearId, {
      location: {
        address: nearLocation.address,
        lat: nearLocation.lat,
        lng: nearLocation.lng,
        confirmedAt: new Date(),
      },
    });

    // Create a confirmed event with venue coordinates
    const event = await Event.create({
      title: 'Grand Gala Kochi',
      notes: 'Annual corporate event',
      eventType: 'Corporate',
      clientId,
      eventManagerId: managerId,
      status: 'confirmed',
      date: new Date(Date.now() + 86400000 * 5),
      startTime: '10:00',
      endTime: '18:00',
      location: venueLocation,
      guestCount: 200,
    });
    eventId = event._id.toString();

    // Create an open work requirement with 10 km maxDistance
    const deadline = new Date(Date.now() + 86400000 * 2);
    const req = await WorkRequirement.create({
      eventId,
      workerType: 'Juice Worker',
      requiredCount: 2,
      reportingTime: '09:00',
      description: 'Need skilled juice baristas',
      maxDistanceKm: 10,
      interestDeadlineAt: deadline,
      status: 'open',
      selectionRound: 1,
    });
    requirementId = req._id.toString();
  });

  describe('1. Location Setup & Validation (PATCH /api/worker/location)', () => {
    it('rejects unauthenticated requests with 401', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/api/worker/location`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(nearLocation),
      });
      assert.equal(res.status, 401);
    });

    it('rejects non-worker roles (e.g. client or manager) with 403', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/api/worker/location`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${clientToken}`,
        },
        body: JSON.stringify(nearLocation),
      });
      assert.equal(res.status, 403);
    });

    it('rejects missing coordinates with 400', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/api/worker/location`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${workerNoLocToken}`,
        },
        body: JSON.stringify({ address: 'Some address without coordinates' }),
      });
      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.success, false);
      const jsonStr = JSON.stringify(data);
      assert.ok(
        jsonStr.includes('Latitude and longitude are required') || data.message === 'Validation failed'
      );
    });

    it('rejects latitude greater than 90 with 400', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/api/worker/location`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${workerNoLocToken}`,
        },
        body: JSON.stringify({ lat: 95.0, lng: 76.26 }),
      });
      assert.equal(res.status, 400);
    });

    it('rejects latitude less than -90 with 400', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/api/worker/location`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${workerNoLocToken}`,
        },
        body: JSON.stringify({ lat: -95.0, lng: 76.26 }),
      });
      assert.equal(res.status, 400);
    });

    it('rejects longitude greater than 180 with 400', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/api/worker/location`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${workerNoLocToken}`,
        },
        body: JSON.stringify({ lat: 9.93, lng: 185.0 }),
      });
      assert.equal(res.status, 400);
    });

    it('rejects longitude less than -180 with 400', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/api/worker/location`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${workerNoLocToken}`,
        },
        body: JSON.stringify({ lat: 9.93, lng: -185.0 }),
      });
      assert.equal(res.status, 400);
    });

    it('rejects non-finite/malformed coordinates (e.g. strings or null)', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/api/worker/location`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${workerNoLocToken}`,
        },
        body: JSON.stringify({ lat: 'invalid', lng: 76.26 }),
      });
      assert.equal(res.status, 400);
    });

    it('successfully saves valid location and sets confirmedAt timestamp', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/api/worker/location`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${workerNoLocToken}`,
        },
        body: JSON.stringify({
          lat: 9.935,
          lng: 76.268,
          address: 'Fort Kochi, Kerala',
        }),
      });
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.success, true);
      assert.equal(data.data.location.lat, 9.935);
      assert.equal(data.data.location.lng, 76.268);
      assert.equal(data.data.location.address, 'Fort Kochi, Kerala');
      assert.ok(data.data.location.confirmedAt, 'confirmedAt timestamp must be recorded');

      // Verify database record
      const dbUser = await User.findById(workerNoLocId);
      assert.equal(dbUser?.location?.lat, 9.935);
      assert.equal(dbUser?.location?.lng, 76.268);
      assert.ok(dbUser?.location?.confirmedAt);
    });
  });

  describe('2. Mandatory Location Gate (Access Control)', () => {
    it('Worker with no location cannot access available opportunities (400 LOCATION_REQUIRED)', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/api/worker/opportunities`, {
        headers: {
          Authorization: `Bearer ${workerNoLocToken}`,
        },
      });
      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.success, false);
      const hasLocError =
        (data.error?.errors && data.error.errors.includes('LOCATION_REQUIRED')) ||
        (data.message && data.message.includes('Location configuration required'));
      assert.ok(hasLocError, 'Must return LOCATION_REQUIRED error');
    });

    it('Worker with no location cannot express interest (400 LOCATION_REQUIRED)', async () => {
      const res = await fetch(
        `http://127.0.0.1:${port}/api/worker/opportunities/${requirementId}/interest`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${workerNoLocToken}`,
          },
        }
      );
      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.success, false);
      const hasLocError =
        (data.error?.errors && data.error.errors.includes('LOCATION_REQUIRED')) ||
        (data.message && data.message.includes('Location configuration required'));
      assert.ok(hasLocError, 'Must return LOCATION_REQUIRED error on interest attempt');
    });
  });

  describe('3. Distance-Based Opportunity Filtering & Maximum Distance Limit', () => {
    it('Worker Near (within maxDistanceKm = 10 km) can view the opportunity', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/api/worker/opportunities`, {
        headers: {
          Authorization: `Bearer ${workerNearToken}`,
        },
      });
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.success, true);
      assert.equal(data.data.opportunities.length, 1);
      const opp = data.data.opportunities[0];
      assert.equal(opp.id, requirementId);
      assert.equal(opp.withinDistance, true);
      assert.ok(typeof opp.distanceKm === 'number');
      assert.ok(opp.distanceKm <= 10, 'Distance must be <= 10 km');
    });

    it('Worker Far (beyond maxDistanceKm = 10 km) is excluded from available opportunities', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/api/worker/opportunities`, {
        headers: {
          Authorization: `Bearer ${workerFarToken}`,
        },
      });
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.success, true);
      // Hard filter: requirement exceeds 10 km, so Worker Far sees 0 opportunities
      assert.equal(data.data.opportunities.length, 0);
    });

    it('Worker Far attempting to express interest directly via API is rejected (400 distance limit exceeded)', async () => {
      const res = await fetch(
        `http://127.0.0.1:${port}/api/worker/opportunities/${requirementId}/interest`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${workerFarToken}`,
          },
        }
      );
      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.success, false);
      assert.match(data.message, /maximum permitted distance/i);
    });
  });

  describe('4. Worker Interest Location Snapshot & Consistency', () => {
    it('Worker Near expressing interest records locationSnapshot on WorkResponse', async () => {
      const res = await fetch(
        `http://127.0.0.1:${port}/api/worker/opportunities/${requirementId}/interest`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${workerNearToken}`,
          },
        }
      );
      assert.ok(res.status === 200 || res.status === 201);
      const data = await res.json();
      assert.equal(data.success, true);

      // Verify snapshot in database
      const workResponse = await WorkResponse.findOne({
        requirementId,
        workerId: workerNearId,
      });
      assert.ok(workResponse, 'WorkResponse record must be created');
      assert.equal(workResponse.responseStatus, 'interested');
      assert.ok(workResponse.distanceKm! <= 10);
      assert.ok(workResponse.locationSnapshot, 'locationSnapshot must exist');
      assert.equal(workResponse.locationSnapshot?.lat, nearLocation.lat);
      assert.equal(workResponse.locationSnapshot?.lng, nearLocation.lng);
      assert.equal(workResponse.locationSnapshot?.address, nearLocation.address);
      assert.ok(workResponse.locationSnapshot?.confirmedAt);
      assert.ok(workResponse.respondedAt, 'Server respondedAt timestamp must exist');
    });

    it('Updating location preserves historical distance and locationSnapshot on existing responses (§5, §8)', async () => {
      // Seed a pending interested response with an older timestamp
      const initialDate = new Date(Date.now() - 60000);
      await WorkResponse.create({
        eventId,
        requirementId,
        workerId: workerNearId,
        responseStatus: 'interested',
        respondedAt: initialDate,
        distanceKm: 1.5,
        locationSnapshot: {
          address: nearLocation.address,
          lat: nearLocation.lat,
          lng: nearLocation.lng,
          confirmedAt: initialDate,
        },
      });

      // Slightly shift Worker Near location
      const updatedLat = 9.938;
      const updatedLng = 76.271;
      const patchRes = await fetch(`http://127.0.0.1:${port}/api/worker/location`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${workerNearToken}`,
        },
        body: JSON.stringify({
          lat: updatedLat,
          lng: updatedLng,
          address: 'Kochi Port Area',
        }),
      });
      assert.equal(patchRes.status, 200);

      // Verify WorkResponse preserves original historical snapshot and distance per anti-manipulation rule (§5, §8)
      const existingResponse = await WorkResponse.findOne({
        requirementId,
        workerId: workerNearId,
      });
      assert.ok(existingResponse);
      assert.equal(existingResponse.locationSnapshot?.lat, nearLocation.lat, 'Must preserve historical latitude');
      assert.equal(existingResponse.locationSnapshot?.lng, nearLocation.lng, 'Must preserve historical longitude');
      assert.equal(existingResponse.locationSnapshot?.address, nearLocation.address, 'Must preserve historical address');
      assert.equal(existingResponse.distanceKm, 1.5, 'Must preserve historical distance');

      // Crucial tie-breaker preservation: respondedAt MUST NOT be reset
      assert.equal(
        existingResponse.respondedAt.getTime(),
        initialDate.getTime(),
        'Original interest submission timestamp must be strictly preserved'
      );
    });

    it('Already selected workers are NOT modified or removed if location changes later', async () => {
      // Create confirmed assignment and selected work response
      await WorkResponse.create({
        eventId,
        requirementId,
        workerId: workerNearId,
        responseStatus: 'selected',
        respondedAt: new Date(Date.now() - 120000),
        distanceKm: 1.5,
      });
      await WorkRequirement.findByIdAndUpdate(requirementId, {
        status: 'filled',
        assignedWorkers: [
          {
            workerId: workerNearId,
            assignedAt: new Date(),
            distanceKm: 1.5,
          },
        ],
      });

      // Now worker updates location far away (e.g. Bangalore)
      const patchRes = await fetch(`http://127.0.0.1:${port}/api/worker/location`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${workerNearToken}`,
        },
        body: JSON.stringify({
          lat: 12.9716,
          lng: 77.5946,
          address: 'Bangalore, Karnataka',
        }),
      });
      assert.equal(patchRes.status, 200);

      // Confirm requirement and assignment remain completely intact
      const req = await WorkRequirement.findById(requirementId);
      assert.equal(req?.assignedWorkers?.length, 1);
      assert.equal(req?.assignedWorkers?.[0]?.workerId?.toString(), workerNearId);

      // Confirm WorkResponse status remains 'selected'
      const response = await WorkResponse.findOne({
        requirementId,
        workerId: workerNearId,
      });
      assert.equal(response?.responseStatus, 'selected');
    });
  });

  describe('5. Event Missing Coordinates Handling', () => {
    it('Opportunity where event location has missing coordinates does not crash or fabricate distance', async () => {
      // Remove venue lat/lng
      await Event.findByIdAndUpdate(eventId, {
        location: { address: 'Unverified Venue Address Without Coordinates' },
      });

      const res = await fetch(`http://127.0.0.1:${port}/api/worker/opportunities`, {
        headers: {
          Authorization: `Bearer ${workerNearToken}`,
        },
      });
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.success, true);
      // Hard safety guard: requirements without venue coordinates cannot be safely verified within distance, so 0 opportunities offered
      assert.equal(data.data.opportunities.length, 0);
    });
  });
});
