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

describe('Event Control Center API', () => {
  let adminToken: string;
  let clientToken: string;
  let workerToken: string;
  let managerAToken: string;
  let managerBToken: string;
  
  let managerAId: string;
  let managerBId: string;

  let eventAId: string;
  let eventBId: string;
  let eventUnassignedId: string;

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
    const mA = await User.create({
      name: 'Manager A',
      email: 'ma_cc@example.com',
      password: 'password',
      role: 'event_manager',
      isActive: true,
    });
    managerAId = mA._id.toString();
    managerAToken = generateToken(managerAId, 'event_manager');

    const mB = await User.create({
      name: 'Manager B',
      email: 'mb_cc@example.com',
      password: 'password',
      role: 'event_manager',
      isActive: true,
    });
    managerBId = mB._id.toString();
    managerBToken = generateToken(managerBId, 'event_manager');

    // Create Client
    await User.create({
      _id: clientId,
      name: 'Test Client',
      email: 'client_cc@example.com',
      password: 'password',
      role: 'client',
      isActive: true,
    });
  });

  after(async () => {
    server.close();
    await mongoose.disconnect();
  });

  beforeEach(async () => {
    await Event.deleteMany({});
    
    const baseEvent = {
      clientId: await User.findOne({ email: 'client_cc@example.com' }).then(u => u?._id),
      title: 'Test Event',
      eventType: 'Wedding',
      date: new Date('2026-10-15T00:00:00.000Z'),
      startTime: '10:00',
      endTime: '14:00',
      location: { address: '123 Main St' },
      guestCount: 100,
    };

    const eA = await Event.create({
      ...baseEvent,
      eventManagerId: managerAId,
      status: 'confirmed',
    });
    eventAId = eA._id.toString();

    const eB = await Event.create({
      ...baseEvent,
      eventManagerId: managerBId,
      status: 'confirmed',
    });
    eventBId = eB._id.toString();

    const eUnassigned = await Event.create({
      ...baseEvent,
      status: 'requested',
    });
    eventUnassignedId = eUnassigned._id.toString();
  });

  it('1. GET /api/manager/events/:id -> unauthenticated returns 401', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/manager/events/${eventAId}`);
    assert.equal(res.status, 401);
  });

  it('2. GET /api/manager/events/:id -> wrong roles return 403', async () => {
    const resC = await fetch(`http://127.0.0.1:${port}/api/manager/events/${eventAId}`, { headers: { 'Authorization': `Bearer ${clientToken}` } });
    assert.equal(resC.status, 403);

    const resW = await fetch(`http://127.0.0.1:${port}/api/manager/events/${eventAId}`, { headers: { 'Authorization': `Bearer ${workerToken}` } });
    assert.equal(resW.status, 403);

    const resAdmin = await fetch(`http://127.0.0.1:${port}/api/manager/events/${eventAId}`, { headers: { 'Authorization': `Bearer ${adminToken}` } });
    assert.equal(resAdmin.status, 403);
  });

  it('3. GET /api/manager/events/:id -> Manager A can access Event A', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/manager/events/${eventAId}`, {
      headers: { 'Authorization': `Bearer ${managerAToken}` },
    });
    assert.equal(res.status, 200);
    const data = await res.json() as any;
    assert.equal(data.data.event._id, eventAId);
    assert.equal(data.data.event.clientId.name, 'Test Client');
    assert.equal(data.data.event.clientId.password, undefined); // Safe client info
  });

  it('4. GET /api/manager/events/:id -> Manager A cannot access Event B', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/manager/events/${eventBId}`, {
      headers: { 'Authorization': `Bearer ${managerAToken}` },
    });
    assert.equal(res.status, 403);
  });

  it('5. GET /api/manager/events/:id -> Manager B can access Event B', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/manager/events/${eventBId}`, {
      headers: { 'Authorization': `Bearer ${managerBToken}` },
    });
    assert.equal(res.status, 200);
  });

  it('6. GET /api/manager/events/:id -> Manager B cannot access Event A', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/manager/events/${eventAId}`, {
      headers: { 'Authorization': `Bearer ${managerBToken}` },
    });
    assert.equal(res.status, 403);
  });

  it('7. GET /api/manager/events/:id -> Nonexistent event returns 404', async () => {
    const randomId = new mongoose.Types.ObjectId().toString();
    const res = await fetch(`http://127.0.0.1:${port}/api/manager/events/${randomId}`, {
      headers: { 'Authorization': `Bearer ${managerAToken}` },
    });
    assert.equal(res.status, 404);
  });

  it('8. GET /api/manager/events/:id -> Invalid ID returns 400 (validation error)', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/manager/events/invalid-id`, {
      headers: { 'Authorization': `Bearer ${managerAToken}` },
    });
    assert.equal(res.status, 400); // Because it is not a valid ObjectId (cast error handled usually as 400 or 500)
    // For this specific project, if cast error middleware is mapped to 400, it passes.
  });

  it('9. GET /api/manager/events -> Returns only events assigned to the authenticated manager', async () => {
    // Manager A fetches assigned events -> should only see Event A
    const resA = await fetch(`http://127.0.0.1:${port}/api/manager/events`, {
      headers: { 'Authorization': `Bearer ${managerAToken}` },
    });
    assert.equal(resA.status, 200);
    const dataA = await resA.json() as any;
    assert.equal(dataA.success, true);
    assert.equal(dataA.data.events.length, 1);
    assert.equal(dataA.data.events[0]._id, eventAId);
    assert.equal(dataA.data.events[0].clientId.name, 'Test Client');

    // Manager B fetches assigned events -> should only see Event B
    const resB = await fetch(`http://127.0.0.1:${port}/api/manager/events`, {
      headers: { 'Authorization': `Bearer ${managerBToken}` },
    });
    assert.equal(resB.status, 200);
    const dataB = await resB.json() as any;
    assert.equal(dataB.data.events.length, 1);
    assert.equal(dataB.data.events[0]._id, eventBId);
  });

  it('10. GET /api/manager/dashboard -> Returns accurate stats for authenticated manager', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/manager/dashboard`, {
      headers: { 'Authorization': `Bearer ${managerAToken}` },
    });
    assert.equal(res.status, 200);
    const data = await res.json() as any;
    assert.equal(data.success, true);
    assert.equal(data.data.stats.totalAssigned, 1);
    assert.equal(data.data.stats.upcoming, 1); // confirmed
    assert.equal(data.data.stats.ongoing, 0);
    assert.equal(data.data.stats.completed, 0);
  });

  it('11. Security: Unauthorized roles cannot access manager dashboard or events list', async () => {
    // Unauth
    let res = await fetch(`http://127.0.0.1:${port}/api/manager/events`);
    assert.equal(res.status, 401);

    // Client
    res = await fetch(`http://127.0.0.1:${port}/api/manager/events`, {
      headers: { 'Authorization': `Bearer ${clientToken}` },
    });
    assert.equal(res.status, 403);

    // Worker
    res = await fetch(`http://127.0.0.1:${port}/api/manager/dashboard`, {
      headers: { 'Authorization': `Bearer ${workerToken}` },
    });
    assert.equal(res.status, 403);

    // Admin
    res = await fetch(`http://127.0.0.1:${port}/api/manager/dashboard`, {
      headers: { 'Authorization': `Bearer ${adminToken}` },
    });
    assert.equal(res.status, 403);
  });
});
