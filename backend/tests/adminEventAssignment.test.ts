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

describe('Admin Event Assignment API', () => {
  let adminToken: string;
  let clientToken: string;
  let workerToken: string;
  let manager1Id: string;
  let manager2Id: string;
  let manager3Id: string;

  let event1Id: string;
  let event2Id: string;
  let event3Id: string; // for completed/cancelled

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
      email: 'm1@example.com',
      password: 'password',
      role: 'event_manager',
      isActive: true,
    });
    manager1Id = m1._id.toString();

    const m2 = await User.create({
      name: 'Manager 2',
      email: 'm2@example.com',
      password: 'password',
      role: 'event_manager',
      isActive: false, // Inactive manager
    });
    manager2Id = m2._id.toString();

    const m3 = await User.create({
      name: 'Manager 3',
      email: 'm3@example.com',
      password: 'password',
      role: 'event_manager',
      isActive: true,
    });
    manager3Id = m3._id.toString();
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
      location: { address: '123 Main St' },
      guestCount: 100,
    };

    // Confirmed event, 10:00 - 14:00
    const e1 = await Event.create({
      ...baseEvent,
      startTime: '10:00',
      endTime: '14:00',
      status: 'confirmed',
    });
    event1Id = e1._id.toString();

    // Confirmed event on the same day, 13:00 - 16:00 (overlaps E1)
    const e2 = await Event.create({
      ...baseEvent,
      startTime: '13:00',
      endTime: '16:00',
      status: 'confirmed',
    });
    event2Id = e2._id.toString();

    // Confirmed event on the same day, 15:00 - 18:00 (no overlap with E1, overlaps E2)
    const e3 = await Event.create({
      ...baseEvent,
      startTime: '15:00',
      endTime: '18:00',
      status: 'confirmed',
    });
    event3Id = e3._id.toString();
  });

  it('1. GET /api/admin/events/:id/available-managers → Returns active managers', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/admin/events/${event1Id}/available-managers`, {
      headers: { 'Authorization': `Bearer ${adminToken}` },
    });
    assert.equal(res.status, 200);
    const data = await res.json() as any;
    const managers = data.data.managers;
    
    assert.equal(managers.length, 2); // M1 and M3
    assert.ok(managers.find((m: any) => m._id === manager1Id));
    assert.ok(managers.find((m: any) => m._id === manager3Id));
    assert.equal(managers.find((m: any) => m._id === manager2Id), undefined, 'Inactive manager should not be returned');
  });

  it('2. PATCH /api/admin/events/:id/manager → Assigns manager', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/admin/events/${event1Id}/manager`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify({ eventManagerId: manager1Id }),
    });
    assert.equal(res.status, 200);
    const data = await res.json() as any;
    assert.equal(data.data.event.eventManagerId, manager1Id);
  });

  it('3. GET /available-managers excludes managers with overlapping events', async () => {
    // Assign M1 to Event 1 (10:00 - 14:00)
    await Event.findByIdAndUpdate(event1Id, { eventManagerId: manager1Id });

    // Check available managers for Event 2 (13:00 - 16:00)
    const res = await fetch(`http://127.0.0.1:${port}/api/admin/events/${event2Id}/available-managers`, {
      headers: { 'Authorization': `Bearer ${adminToken}` },
    });
    const data = await res.json() as any;
    const managers = data.data.managers;

    assert.equal(managers.length, 1); // Only M3
    assert.equal(managers[0]._id, manager3Id);
  });

  it('4. GET /available-managers does not exclude if events do not overlap time', async () => {
    // Assign M1 to Event 1 (10:00 - 14:00)
    await Event.findByIdAndUpdate(event1Id, { eventManagerId: manager1Id });

    // Check available managers for Event 3 (15:00 - 18:00) - No overlap
    const res = await fetch(`http://127.0.0.1:${port}/api/admin/events/${event3Id}/available-managers`, {
      headers: { 'Authorization': `Bearer ${adminToken}` },
    });
    const data = await res.json() as any;
    const managers = data.data.managers;

    assert.equal(managers.length, 2); // M1 and M3
  });

  it('5. PATCH /manager prevents assignment if manager is busy', async () => {
    // Assign M1 to Event 1 (10:00 - 14:00)
    await Event.findByIdAndUpdate(event1Id, { eventManagerId: manager1Id });

    // Try assigning M1 to Event 2 (13:00 - 16:00)
    const res = await fetch(`http://127.0.0.1:${port}/api/admin/events/${event2Id}/manager`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify({ eventManagerId: manager1Id }),
    });
    assert.equal(res.status, 400);
    const data = await res.json() as any;
    assert.match(data.message, /busy during this event time/i);
  });

  it('6. PATCH /manager allows assignment if events are cancelled/completed', async () => {
    // Assign M1 to Event 1 but cancel it
    await Event.findByIdAndUpdate(event1Id, { eventManagerId: manager1Id, status: 'cancelled' });

    // Try assigning M1 to Event 2 (13:00 - 16:00) - Should succeed because E1 is cancelled
    const res = await fetch(`http://127.0.0.1:${port}/api/admin/events/${event2Id}/manager`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify({ eventManagerId: manager1Id }),
    });
    assert.equal(res.status, 200);
  });

  it('7. Cannot assign an inactive manager', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/admin/events/${event1Id}/manager`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify({ eventManagerId: manager2Id }),
    });
    assert.equal(res.status, 400);
  });

  it('8. Cannot assign to unconfirmed event', async () => {
    await Event.findByIdAndUpdate(event1Id, { status: 'quoted' });

    const res = await fetch(`http://127.0.0.1:${port}/api/admin/events/${event1Id}/manager`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify({ eventManagerId: manager1Id }),
    });
    assert.equal(res.status, 400);
  });

  it('9. Authorization: Client/Worker/Unauthenticated cannot access endpoints', async () => {
    // Unauth
    let res = await fetch(`http://127.0.0.1:${port}/api/admin/events/${event1Id}/available-managers`);
    assert.equal(res.status, 401);

    // Client
    res = await fetch(`http://127.0.0.1:${port}/api/admin/events/${event1Id}/available-managers`, {
      headers: { 'Authorization': `Bearer ${clientToken}` },
    });
    assert.equal(res.status, 403);

    // Worker
    res = await fetch(`http://127.0.0.1:${port}/api/admin/events/${event1Id}/manager`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${workerToken}` },
      body: JSON.stringify({ eventManagerId: manager1Id }),
    });
    assert.equal(res.status, 403);
  });
});
