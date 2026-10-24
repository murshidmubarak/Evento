import './setup.js';
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import app from '../src/app.js';
import '../src/modules/services/model/service.model.js';
import { Event } from '../src/modules/events/model/event.model.js';
import { User } from '../src/modules/auth/model/user.model.js';
import { WorkRequirement } from '../src/modules/work-requirements/model/work-requirement.model.js';
import { connectDB } from '../src/config/db.js';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import type { Server } from 'http';

describe('Event Date Passed -> Status: completed and Work Requirement Behavior', () => {
  let server: Server;
  let port: number;
  let managerId: string;
  let managerToken: string;
  let clientId: string;
  let pastEventId: string;
  let futureEventId: string;
  let pastReqId: string;

  before(async () => {
    await connectDB();
    server = app.listen(0);
    port = (server.address() as any).port;
  });

  after(async () => {
    server.close();
    await mongoose.disconnect();
  });

  beforeEach(async () => {
    await Event.deleteMany({});
    await WorkRequirement.deleteMany({});
    await User.deleteMany({});

    const manager = await User.create({
      name: 'Manager Test',
      email: 'manager_test@example.com',
      password: 'password',
      role: 'event_manager',
      isActive: true,
    });
    managerId = manager._id.toString();
    managerToken = jwt.sign(
      { userId: managerId, role: 'event_manager', email: manager.email },
      process.env.JWT_SECRET || 'test_jwt_secret',
      { expiresIn: '1h' }
    );

    const client = await User.create({
      name: 'Client Test',
      email: 'client_test@example.com',
      password: 'password',
      role: 'client',
      isActive: true,
    });
    clientId = client._id.toString();

    // 1. Past event (date is 3 days ago)
    const pastDate = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    const pastEvt = await Event.create({
      clientId,
      eventManagerId: managerId,
      title: 'Past Gala Event',
      eventType: 'Corporate',
      date: pastDate,
      startTime: '10:00',
      endTime: '16:00',
      location: { address: 'Convention Center', lat: 12.9716, lng: 77.5946 },
      guestCount: 200,
      status: 'confirmed', // Was confirmed, but time has passed
    });
    pastEventId = pastEvt._id.toString();

    // Work requirement on the past event
    const pastReq = await WorkRequirement.create({
      eventId: pastEventId,
      workerType: 'Catering Boy',
      requiredCount: 5,
      reportingTime: '09:00',
      maxDistanceKm: 25,
      interestDeadlineAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      status: 'open',
    });
    pastReqId = pastReq._id.toString();

    // 2. Future event (date is 5 days ahead)
    const futureDate = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
    const futureEvt = await Event.create({
      clientId,
      eventManagerId: managerId,
      title: 'Future Wedding Event',
      eventType: 'Wedding',
      date: futureDate,
      startTime: '10:00',
      endTime: '18:00',
      location: { address: 'Grand Palace', lat: 12.9716, lng: 77.5946 },
      guestCount: 150,
      status: 'confirmed',
    });
    futureEventId = futureEvt._id.toString();
  });

  it('1. GET /api/manager/events updates past event status to completed (not closed)', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/manager/events`, {
      headers: { Authorization: `Bearer ${managerToken}` },
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as any;
    const past = body.data.events.find((e: any) => e._id === pastEventId);
    assert.ok(past, 'Past event should be returned');
    assert.equal(past.status, 'completed', 'Past event status must transition to completed');

    const dbEvt = await Event.findById(pastEventId);
    assert.equal(dbEvt?.status, 'completed');
  });

  it('2. GET /api/manager/events/:eventId updates past event status to completed (not closed)', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/manager/events/${pastEventId}`, {
      headers: { Authorization: `Bearer ${managerToken}` },
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as any;
    assert.equal(body.data.event.status, 'completed');
  });

  it('3. Manager CANNOT create new work requirements on a past/completed event', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/manager/events/${pastEventId}/work-requirements`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${managerToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        workerType: 'Chef',
        requiredCount: 2,
        reportingTime: '08:30',
        maxDistanceKm: 20,
      }),
    });
    assert.equal(res.status, 400);
    const body = (await res.json()) as any;
    assert.match(body.message, /completed|passed/i);
  });

  it('4. Manager CAN view work requirements on a past/completed event (read-only)', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/manager/events/${pastEventId}/work-requirements`, {
      headers: { Authorization: `Bearer ${managerToken}` },
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as any;
    assert.ok(Array.isArray(body.data.requirements));
    assert.equal(body.data.requirements.length, 1);
    assert.equal(body.data.requirements[0]._id, pastReqId);
    assert.equal(body.data.requirements[0].workerType, 'Catering Boy');
  });

  it('5. Manager CAN view a single requirement on a past/completed event', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/manager/work-requirements/${pastReqId}`, {
      headers: { Authorization: `Bearer ${managerToken}` },
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as any;
    assert.equal(body.data.requirement._id, pastReqId);
  });

  it('6. Manager CANNOT update a work requirement on a past/completed event', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/manager/work-requirements/${pastReqId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${managerToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ requiredCount: 10 }),
    });
    assert.equal(res.status, 400);
    const body = (await res.json()) as any;
    assert.match(body.message, /completed|passed/i);
  });

  it('7. Manager CANNOT cancel a work requirement on a past/completed event', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/manager/work-requirements/${pastReqId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${managerToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ status: 'cancelled' }),
    });
    assert.equal(res.status, 400);
    const body = (await res.json()) as any;
    assert.match(body.message, /completed|passed/i);
  });

  it('8. Manager CANNOT extend deadline on a past/completed event', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/manager/work-requirements/${pastReqId}/extend-deadline`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${managerToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        interestDeadlineAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      }),
    });
    assert.equal(res.status, 400);
    const body = (await res.json()) as any;
    assert.match(body.message, /passed|closed/i);
  });

  it('9. Manager CAN create work requirements on a confirmed future event', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/manager/events/${futureEventId}/work-requirements`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${managerToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        workerType: 'Chef',
        requiredCount: 3,
        reportingTime: '08:30',
        maxDistanceKm: 20,
      }),
    });
    assert.equal(res.status, 201);
    const body = (await res.json()) as any;
    assert.equal(body.data.requirement.workerType, 'Chef');
    assert.equal(body.data.requirement.requiredCount, 3);
  });
});
