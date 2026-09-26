import './setup.js';
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import app from '../src/app.js';
import { Event } from '../src/modules/events/model/event.model.js';
import { User } from '../src/modules/auth/model/user.model.js';
import { connectDB } from '../src/config/db.js';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import { env } from '../src/config/env.js';

describe('Event Manager Dashboard API', () => {
  let adminToken: string;
  let clientToken: string;
  let workerToken: string;
  let manager1Token: string;
  let manager2Token: string;
  
  let manager1Id: string;
  let manager2Id: string;

  let event1Id: string; // M1
  let event2Id: string; // M1
  let event3Id: string; // M2
  let event4Id: string; // Unassigned

  let server: any;
  let port: number;

  const generateToken = (userId: string, role: string) => {
    return jwt.sign({ userId, role }, env.jwtSecret, { expiresIn: '1h' });
  };

  before(async () => {
    await connectDB();
    server = app.listen(0);
    port = (server.address() as any).port;

    const adminId = new mongoose.Types.ObjectId().toString();
    const clientId = new mongoose.Types.ObjectId().toString();
    const workerId = new mongoose.Types.ObjectId().toString();

    adminToken = generateToken(adminId, 'admin');
    clientToken = generateToken(clientId, 'client');
    workerToken = generateToken(workerId, 'worker');

    await User.deleteMany({});
    
    // Create Managers
    const m1 = await User.create({
      name: 'Manager 1',
      email: 'm1_dash@example.com',
      password: 'password',
      role: 'event_manager',
      isActive: true,
    });
    manager1Id = m1._id.toString();
    manager1Token = generateToken(manager1Id, 'event_manager');

    const m2 = await User.create({
      name: 'Manager 2',
      email: 'm2_dash@example.com',
      password: 'password',
      role: 'event_manager',
      isActive: true,
    });
    manager2Id = m2._id.toString();
    manager2Token = generateToken(manager2Id, 'event_manager');
  });

  after(async () => {
    server.close();
    await mongoose.disconnect();
  });

  beforeEach(async () => {
    await Event.deleteMany({});
    
    const baseEvent = {
      clientId: new mongoose.Types.ObjectId(),
      title: 'Test Event',
      eventType: 'Wedding',
      date: new Date('2026-10-15T00:00:00.000Z'),
      startTime: '10:00',
      endTime: '14:00',
      location: { address: '123 Main St' },
      guestCount: 100,
    };

    const e1 = await Event.create({
      ...baseEvent,
      eventManagerId: manager1Id,
      status: 'confirmed',
    });
    event1Id = e1._id.toString();

    const e2 = await Event.create({
      ...baseEvent,
      eventManagerId: manager1Id,
      status: 'completed',
    });
    event2Id = e2._id.toString();

    const e3 = await Event.create({
      ...baseEvent,
      eventManagerId: manager2Id,
      status: 'in_progress',
    });
    event3Id = e3._id.toString();
    
    const e4 = await Event.create({
      ...baseEvent,
      status: 'requested', // No manager
    });
    event4Id = e4._id.toString();
  });

  it('1. GET /api/manager/dashboard -> Unauthenticated returns 401', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/manager/dashboard`);
    assert.equal(res.status, 401);
  });

  it('2. GET /api/manager/dashboard -> Wrong roles return 403', async () => {
    const resA = await fetch(`http://127.0.0.1:${port}/api/manager/dashboard`, { headers: { 'Authorization': `Bearer ${adminToken}` } });
    assert.equal(resA.status, 403);
    
    const resC = await fetch(`http://127.0.0.1:${port}/api/manager/dashboard`, { headers: { 'Authorization': `Bearer ${clientToken}` } });
    assert.equal(resC.status, 403);

    const resW = await fetch(`http://127.0.0.1:${port}/api/manager/dashboard`, { headers: { 'Authorization': `Bearer ${workerToken}` } });
    assert.equal(resW.status, 403);
  });

  it('3. GET /api/manager/dashboard -> Returns correct stats for Manager 1', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/manager/dashboard`, {
      headers: { 'Authorization': `Bearer ${manager1Token}` },
    });
    assert.equal(res.status, 200);
    const data = await res.json() as any;
    
    assert.equal(data.data.stats.totalAssigned, 2);
    assert.equal(data.data.stats.upcoming, 1);
    assert.equal(data.data.stats.completed, 1);
    assert.equal(data.data.stats.ongoing, 0);
  });

  it('4. GET /api/manager/events -> Returns only events assigned to Manager 1', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/manager/events`, {
      headers: { 'Authorization': `Bearer ${manager1Token}` },
    });
    assert.equal(res.status, 200);
    const data = await res.json() as any;
    
    assert.equal(data.data.events.length, 2);
    const eventIds = data.data.events.map((e: any) => e._id);
    assert.ok(eventIds.includes(event1Id));
    assert.ok(eventIds.includes(event2Id));
    assert.ok(!eventIds.includes(event3Id), 'Should not include Manager 2 event');
    assert.ok(!eventIds.includes(event4Id), 'Should not include unassigned event');
  });

  it('5. GET /api/manager/events -> Filters correctly', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/manager/events?status=completed`, {
      headers: { 'Authorization': `Bearer ${manager1Token}` },
    });
    assert.equal(res.status, 200);
    const data = await res.json() as any;
    
    assert.equal(data.data.events.length, 1);
    assert.equal(data.data.events[0]._id, event2Id);
  });

  it('6. GET /api/events/:id -> Manager can access own event', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/events/${event1Id}`, {
      headers: { 'Authorization': `Bearer ${manager1Token}` },
    });
    assert.equal(res.status, 200);
    const data = await res.json() as any;
    assert.equal(data.data.event._id, event1Id);
  });

  it('7. GET /api/events/:id -> Manager cannot access other manager event', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/events/${event3Id}`, {
      headers: { 'Authorization': `Bearer ${manager1Token}` },
    });
    assert.equal(res.status, 403);
  });
});
