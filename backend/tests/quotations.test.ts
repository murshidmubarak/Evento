import './setup.js';
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import app from '../src/app.js';
import { Quotation } from '../src/modules/quotations/model/quotation.model.js';
import { Event } from '../src/modules/events/model/event.model.js';
import { Service } from '../src/modules/services/model/service.model.js';
import { connectDB } from '../src/config/db.js';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import { env } from '../src/config/env.js';
import { Sequence } from '../src/modules/users/model/sequence.model.js';

describe('Quotations API', () => {
  let adminToken: string;
  let clientToken1: string;
  let clientToken2: string;
  let managerToken1: string;
  let managerToken2: string;
  let workerToken: string;
  
  let adminId: string;
  let clientId1: string;
  let clientId2: string;
  let managerId1: string;
  let managerId2: string;
  let workerId: string;

  let activeServiceId1: string;
  let activeServiceId2: string;
  let inactiveServiceId: string;

  let eventId1: string; // client 1, manager 1
  let eventId2: string; // client 2, manager 2

  let server: any;
  let port: number;

  const generateToken = (userId: string, role: string) => {
    return jwt.sign({ userId, role }, env.jwtSecret, { expiresIn: '1h' });
  };

  before(async () => {
    await connectDB();
    server = app.listen(0);
    port = (server.address() as any).port;

    adminId = new mongoose.Types.ObjectId().toString();
    clientId1 = new mongoose.Types.ObjectId().toString();
    clientId2 = new mongoose.Types.ObjectId().toString();
    managerId1 = new mongoose.Types.ObjectId().toString();
    managerId2 = new mongoose.Types.ObjectId().toString();
    workerId = new mongoose.Types.ObjectId().toString();

    adminToken = generateToken(adminId, 'admin');
    clientToken1 = generateToken(clientId1, 'client');
    clientToken2 = generateToken(clientId2, 'client');
    managerToken1 = generateToken(managerId1, 'event_manager');
    managerToken2 = generateToken(managerId2, 'event_manager');
    workerToken = generateToken(workerId, 'worker');

    // Setup Services
    await Service.deleteMany({});
    const activeService1 = await Service.create({
      name: 'Test Catering',
      description: 'Food',
      pricingType: 'per_guest',
      isActive: true,
    });
    activeServiceId1 = activeService1._id.toString();

    const activeService2 = await Service.create({
      name: 'Test Decoration',
      description: 'Deco',
      pricingType: 'package',
      isActive: true,
    });
    activeServiceId2 = activeService2._id.toString();

    const inactiveService = await Service.create({
      name: 'Old Service',
      description: 'None',
      pricingType: 'per_event',
      isActive: false,
    });
    inactiveServiceId = inactiveService._id.toString();

    // Setup Events
    await Event.deleteMany({});
    const event1 = await Event.create({
      clientId: clientId1,
      eventManagerId: managerId1,
      title: 'Event 1',
      eventType: 'Wedding',
      date: new Date(),
      startTime: '10:00',
      endTime: '18:00',
      location: { address: '123 Main St' },
      guestCount: 200,
      status: 'requested',
    });
    eventId1 = event1._id.toString();

    const event2 = await Event.create({
      clientId: clientId2,
      eventManagerId: managerId2,
      title: 'Event 2',
      eventType: 'Corporate',
      date: new Date(),
      startTime: '10:00',
      endTime: '18:00',
      location: { address: '456 Tech St' },
      guestCount: 100,
      status: 'requested',
    });
    eventId2 = event2._id.toString();
  });

  after(async () => {
    server.close();
    await mongoose.disconnect();
  });

  beforeEach(async () => {
    await Quotation.deleteMany({});
    await Sequence.deleteMany({});
  });

  const validPayload = (eventId: string, serviceId: string) => ({
    eventId,
    items: [
      {
        serviceId,
        quantity: 100,
        unitPrice: 500,
      }
    ],
    discount: 5000,
    advanceAmount: 10000,
  });

  it('1. Unauthenticated request → 401', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/quotations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validPayload(eventId1, activeServiceId1)),
    });
    assert.equal(res.status, 401);
  });

  it('2. Client cannot create internal quotation', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/quotations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${clientToken1}` },
      body: JSON.stringify(validPayload(eventId1, activeServiceId1)),
    });
    assert.equal(res.status, 403);
  });

  it('3. Worker cannot create quotation', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/quotations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${workerToken}` },
      body: JSON.stringify(validPayload(eventId1, activeServiceId1)),
    });
    assert.equal(res.status, 403);
  });

  it('4. Unauthorized Event Manager access is rejected (cannot quote another managers event)', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/quotations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${managerToken2}` }, // mgr 2 for event 1
      body: JSON.stringify(validPayload(eventId1, activeServiceId1)),
    });
    assert.equal(res.status, 403);
  });

  it('5. Authorized internal user can create quotation', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/quotations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify(validPayload(eventId1, activeServiceId1)),
    });
    assert.equal(res.status, 201);
    const data = (await res.json()) as any;
    assert.equal(data.data.status, 'draft');
  });

  it('6. Nonexistent Event rejected', async () => {
    const fakeEventId = new mongoose.Types.ObjectId().toString();
    const res = await fetch(`http://127.0.0.1:${port}/api/quotations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify(validPayload(fakeEventId, activeServiceId1)),
    });
    assert.equal(res.status, 404);
  });

  it('8. Invalid service rejected (e.g. inactive)', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/quotations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify(validPayload(eventId1, inactiveServiceId)),
    });
    assert.equal(res.status, 400);
    const data = await res.json() as any;
    assert.match(data.message, /inactive/);
  });

  it('9 & 10. Unit price & quantity validation works', async () => {
    const p1 = validPayload(eventId1, activeServiceId1);
    p1.items[0].quantity = 0;
    const res1 = await fetch(`http://127.0.0.1:${port}/api/quotations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify(p1),
    });
    assert.equal(res1.status, 400);

    const p2 = validPayload(eventId1, activeServiceId1);
    p2.items[0].unitPrice = -100;
    const res2 = await fetch(`http://127.0.0.1:${port}/api/quotations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify(p2),
    });
    assert.equal(res2.status, 400);
  });

  it('11 - 15. Backend calculates line-item amount, subtotal, discount, finalAmount, remainingAmount', async () => {
    const payload = validPayload(eventId1, activeServiceId1);
    // Quantity 100 * 500 = 50,000 amount/subtotal
    // Discount = 5,000 -> final = 45,000
    // Advance = 10,000 -> remaining = 35,000
    
    // Attempting to override values
    (payload as any).subtotal = 999999;
    (payload as any).finalAmount = 1;
    (payload as any).remainingAmount = 0;

    const res = await fetch(`http://127.0.0.1:${port}/api/quotations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify(payload),
    });
    assert.equal(res.status, 201);
    const data = (await res.json()) as any;
    
    assert.equal(data.data.items[0].amount, 50000);
    assert.equal(data.data.subtotal, 50000);
    assert.equal(data.data.finalAmount, 45000);
    assert.equal(data.data.remainingAmount, 35000);
  });

  it('19 - 21. Caller cannot choose quotation status, number, or revision directly', async () => {
    const payload = validPayload(eventId1, activeServiceId1);
    (payload as any).status = 'accepted';
    (payload as any).quotationNumber = 'HACKED-123';
    (payload as any).revision = 99;

    const res = await fetch(`http://127.0.0.1:${port}/api/quotations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify(payload),
    });
    assert.equal(res.status, 201);
    const data = (await res.json()) as any;
    
    assert.equal(data.data.status, 'draft');
    assert.notEqual(data.data.quotationNumber, 'HACKED-123');
    assert.equal(data.data.revision, 1);
  });

  it('24 & 25 & 26. Revision 2 and 3 can be created, history remains unchanged', async () => {
    // Rev 1
    const p1 = validPayload(eventId1, activeServiceId1);
    p1.items[0].unitPrice = 500;
    const res1 = await fetch(`http://127.0.0.1:${port}/api/quotations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${managerToken1}` },
      body: JSON.stringify(p1),
    });
    assert.equal(res1.status, 201);
    const q1 = (await res1.json()) as any;
    assert.equal(q1.data.revision, 1);
    const quotationNumber = q1.data.quotationNumber;

    // Rev 2
    const p2 = validPayload(eventId1, activeServiceId1);
    p2.items[0].unitPrice = 600;
    const res2 = await fetch(`http://127.0.0.1:${port}/api/quotations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${managerToken1}` },
      body: JSON.stringify(p2),
    });
    assert.equal(res2.status, 201);
    const q2 = (await res2.json()) as any;
    assert.equal(q2.data.revision, 2);
    assert.equal(q2.data.quotationNumber, quotationNumber);
    assert.equal(q2.data.items[0].unitPrice, 600);

    // Verify Rev 1 is intact
    const getRes1 = await fetch(`http://127.0.0.1:${port}/api/quotations/${q1.data._id}`, {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    const fetchedQ1 = (await getRes1.json()) as any;
    assert.equal(fetchedQ1.data.items[0].unitPrice, 500);

    // Rev 3
    const p3 = validPayload(eventId1, activeServiceId1);
    p3.items[0].unitPrice = 700;
    const res3 = await fetch(`http://127.0.0.1:${port}/api/quotations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${managerToken1}` },
      body: JSON.stringify(p3),
    });
    assert.equal(res3.status, 201);
    const q3 = (await res3.json()) as any;
    assert.equal(q3.data.revision, 3);
  });

  it('27. Service name/price information is snapshotted', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/quotations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify(validPayload(eventId1, activeServiceId1)),
    });
    assert.equal(res.status, 201);
    const data = (await res.json()) as any;
    assert.equal(data.data.items[0].name, 'Test Catering');

    // Change service in DB
    await Service.updateOne({ _id: activeServiceId1 }, { $set: { name: 'New Name' } });

    // Fetch quotation again
    const getRes = await fetch(`http://127.0.0.1:${port}/api/quotations/${data.data._id}`, {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    const fetchedQ = (await getRes.json()) as any;
    assert.equal(fetchedQ.data.items[0].name, 'Test Catering'); // snapshot remained unchanged
  });

  it('28 - 33. Retrieval rules', async () => {
    // Create Quotation for Event 1 (Client 1, Mgr 1)
    await fetch(`http://127.0.0.1:${port}/api/quotations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify(validPayload(eventId1, activeServiceId1)),
    });

    // Create Quotation for Event 2 (Client 2, Mgr 2)
    await fetch(`http://127.0.0.1:${port}/api/quotations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify(validPayload(eventId2, activeServiceId2)),
    });

    // Client 1 retrieves own
    const listC1 = await fetch(`http://127.0.0.1:${port}/api/quotations?eventId=${eventId1}`, {
      headers: { 'Authorization': `Bearer ${clientToken1}` }
    });
    assert.equal(listC1.status, 200);
    const dataC1 = (await listC1.json()) as any;
    assert.equal(dataC1.data.length, 1);

    // Client 2 attempts Client 1's event
    const listC2 = await fetch(`http://127.0.0.1:${port}/api/quotations?eventId=${eventId1}`, {
      headers: { 'Authorization': `Bearer ${clientToken2}` }
    });
    assert.equal(listC2.status, 403);

    // Mgr 1 retrieves own assigned
    const listM1 = await fetch(`http://127.0.0.1:${port}/api/quotations?eventId=${eventId1}`, {
      headers: { 'Authorization': `Bearer ${managerToken1}` }
    });
    assert.equal(listM1.status, 200);

    // Mgr 2 attempts Mgr 1's assigned
    const listM2 = await fetch(`http://127.0.0.1:${port}/api/quotations?eventId=${eventId1}`, {
      headers: { 'Authorization': `Bearer ${managerToken2}` }
    });
    assert.equal(listM2.status, 403);

    // Admin sees all
    const listAdmin = await fetch(`http://127.0.0.1:${port}/api/quotations`, {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    assert.equal(listAdmin.status, 200);
    const dataAdmin = (await listAdmin.json()) as any;
    assert.equal(dataAdmin.data.length, 2);

    // Worker access rejected
    const workerRes = await fetch(`http://127.0.0.1:${port}/api/quotations`, {
      headers: { 'Authorization': `Bearer ${workerToken}` }
    });
    assert.equal(workerRes.status, 403);
  });
});
