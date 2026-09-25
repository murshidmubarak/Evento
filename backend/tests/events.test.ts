import './setup.js';
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import app from '../src/app.js';
import { Event } from '../src/modules/events/model/event.model.js';
import { Service } from '../src/modules/services/model/service.model.js';
import { connectDB } from '../src/config/db.js';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import { env } from '../src/config/env.js';

describe('Event Requests API', () => {
  let adminToken: string;
  let clientToken1: string;
  let clientToken2: string;
  let managerToken: string;
  let workerToken: string;
  
  let clientId1: string;
  let clientId2: string;

  let activeServiceId: string;
  let inactiveServiceId: string;

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
    clientId1 = new mongoose.Types.ObjectId().toString();
    clientId2 = new mongoose.Types.ObjectId().toString();
    const managerId = new mongoose.Types.ObjectId().toString();
    const workerId = new mongoose.Types.ObjectId().toString();

    adminToken = generateToken(adminId, 'admin');
    clientToken1 = generateToken(clientId1, 'client');
    clientToken2 = generateToken(clientId2, 'client');
    managerToken = generateToken(managerId, 'event_manager');
    workerToken = generateToken(workerId, 'worker');

    // Setup Services
    await Service.deleteMany({});
    const activeService = await Service.create({
      name: 'Test Catering',
      description: 'Food',
      pricingType: 'per_guest',
      isActive: true,
    });
    activeServiceId = activeService._id.toString();

    const inactiveService = await Service.create({
      name: 'Test Decoration',
      description: 'Deco',
      pricingType: 'per_event',
      isActive: false,
    });
    inactiveServiceId = inactiveService._id.toString();
  });

  after(async () => {
    server.close();
  });

  beforeEach(async () => {
    await Event.deleteMany({});
  });

  const validPayload = {
    title: 'My Wedding',
    eventType: 'Wedding',
    date: new Date().toISOString(),
    startTime: '10:00',
    endTime: '18:00',
    location: { address: '123 Main St' },
    guestCount: 200,
  };

  it('1. Unauthenticated POST /api/events → 401', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validPayload),
    });
    assert.equal(res.status, 401);
  });

  it('2. Admin cannot create Event → 403', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify(validPayload),
    });
    assert.equal(res.status, 403);
  });

  it('3. Event Manager cannot create Event → 403', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${managerToken}` },
      body: JSON.stringify(validPayload),
    });
    assert.equal(res.status, 403);
  });

  it('4. Worker cannot create Event → 403', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${workerToken}` },
      body: JSON.stringify(validPayload),
    });
    assert.equal(res.status, 403);
  });

  it('5. Client can create Event', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${clientToken1}` },
      body: JSON.stringify({ ...validPayload, selectedServices: [activeServiceId] }),
    });
    assert.equal(res.status, 201);
    const data = await res.json() as any;
    assert.equal(data.data.event.title, 'My Wedding');
    assert.equal(data.data.event.status, 'requested');
    assert.equal(data.data.event.clientId, clientId1);
  });

  it('6 & 7. Created Event owner is the authenticated Client, cannot submit another clientId', async () => {
    const maliciousPayload = { ...validPayload, clientId: clientId2 };
    const res = await fetch(`http://127.0.0.1:${port}/api/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${clientToken1}` },
      body: JSON.stringify(maliciousPayload),
    });
    assert.equal(res.status, 201);
    const data = await res.json() as any;
    // Should still belong to client 1
    assert.equal(data.data.event.clientId, clientId1);
  });

  it('8 & 9. Initial status is always requested, Client cannot force confirmed/paid/completed status', async () => {
    const maliciousPayload = { ...validPayload, status: 'confirmed' };
    const res = await fetch(`http://127.0.0.1:${port}/api/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${clientToken1}` },
      body: JSON.stringify(maliciousPayload),
    });
    assert.equal(res.status, 201);
    const data = await res.json() as any;
    assert.equal(data.data.event.status, 'requested');
  });

  it('10. Invalid event type rejected', async () => {
    const invalidPayload = { ...validPayload, eventType: 'InvalidType' };
    const res = await fetch(`http://127.0.0.1:${port}/api/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${clientToken1}` },
      body: JSON.stringify(invalidPayload),
    });
    assert.equal(res.status, 400);
  });

  it('11. Missing required fields rejected', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${clientToken1}` },
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 400);
  });

  it('12. Invalid guest count rejected', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${clientToken1}` },
      body: JSON.stringify({ ...validPayload, guestCount: -10 }),
    });
    assert.equal(res.status, 400);

    const res2 = await fetch(`http://127.0.0.1:${port}/api/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${clientToken1}` },
      body: JSON.stringify({ ...validPayload, guestCount: "many" }),
    });
    assert.equal(res2.status, 400);
  });

  it('13. Invalid budget rejected', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${clientToken1}` },
      body: JSON.stringify({ ...validPayload, budget: -500 }),
    });
    assert.equal(res.status, 400);
  });

  it('14. Invalid date/time rejected', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${clientToken1}` },
      body: JSON.stringify({ ...validPayload, date: 'not-a-date' }),
    });
    assert.equal(res.status, 400);
  });

  it('15. End time before start time rejected', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${clientToken1}` },
      body: JSON.stringify({ ...validPayload, startTime: '18:00', endTime: '10:00' }),
    });
    assert.equal(res.status, 400);
  });

  it('16. Invalid service ID rejected', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${clientToken1}` },
      body: JSON.stringify({ ...validPayload, selectedServices: ['invalid_id'] }),
    });
    assert.equal(res.status, 400);
    
    const fakeId = new mongoose.Types.ObjectId().toString();
    const res2 = await fetch(`http://127.0.0.1:${port}/api/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${clientToken1}` },
      body: JSON.stringify({ ...validPayload, selectedServices: [fakeId] }),
    });
    assert.equal(res2.status, 400);
  });

  it('17. Inactive service cannot be normally selected', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${clientToken1}` },
      body: JSON.stringify({ ...validPayload, selectedServices: [inactiveServiceId] }),
    });
    assert.equal(res.status, 400);
  });

  it('20 & 21. Client can retrieve only own events, Client cannot retrieve another client\'s event', async () => {
    // Create event for client 1
    const res1 = await fetch(`http://127.0.0.1:${port}/api/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${clientToken1}` },
      body: JSON.stringify({ ...validPayload, title: 'Client1 Event' }),
    });
    const c1EventId = ((await res1.json()) as any).data.event._id;

    // Create event for client 2
    await fetch(`http://127.0.0.1:${port}/api/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${clientToken2}` },
      body: JSON.stringify({ ...validPayload, title: 'Client2 Event' }),
    });

    // Client 1 gets their list
    const listRes = await fetch(`http://127.0.0.1:${port}/api/events`, {
      headers: { 'Authorization': `Bearer ${clientToken1}` },
    });
    const listData = await listRes.json() as any;
    assert.equal(listData.data.events.length, 1);
    assert.equal(listData.data.events[0].title, 'Client1 Event');

    // Client 2 attempts to get Client 1's event by ID
    const singleRes = await fetch(`http://127.0.0.1:${port}/api/events/${c1EventId}`, {
      headers: { 'Authorization': `Bearer ${clientToken2}` },
    });
    assert.equal(singleRes.status, 403);
  });
});
