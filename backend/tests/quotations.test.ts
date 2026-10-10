import { cleanupTestDatabase } from './setup.js';
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
      date: new Date(Date.now() + 30 * 86400000),
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
      date: new Date(Date.now() + 30 * 86400000),
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
    await cleanupTestDatabase();
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
    validUntil: new Date(Date.now() + 7 * 86400000).toISOString(),
    paymentPlan: [
      {
        title: 'Advance Deposit',
        amount: 10000,
        dueDateDescription: 'Immediate upon acceptance',
      },
      {
        title: 'Final Settlement',
        amount: 35000,
        dueDateDescription: 'Before event',
      }
    ],
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

    const p3 = validPayload(eventId1, activeServiceId1);
    p3.items[0].unitPrice = 0;
    const res3 = await fetch(`http://127.0.0.1:${port}/api/quotations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify(p3),
    });
    assert.equal(res3.status, 400);
  });

  it('11 - 15. Backend calculates line-item amount, subtotal, discount, taxableAmount, finalAmount, remainingAmount without tax', async () => {
    const payload = validPayload(eventId1, activeServiceId1);
    // Quantity 100 * 500 = 50,000 amount/subtotal
    // Discount = 5,000 -> taxableAmount = 45,000
    // Tax = 0 -> finalAmount = 45,000
    // Advance = 10,000 -> remaining = 35,000
    
    // Attempting to override values
    (payload as any).subtotal = 999999;
    (payload as any).taxableAmount = 1;
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
    assert.equal(data.data.discount, 5000);
    assert.equal(data.data.taxableAmount, 45000);
    assert.equal(data.data.tax.taxType, 'none');
    assert.equal(data.data.tax.taxRate, 0);
    assert.equal(data.data.tax.taxAmount, 0);
    assert.equal(data.data.tax.cgst, 0);
    assert.equal(data.data.tax.sgst, 0);
    assert.equal(data.data.tax.igst, 0);
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

  it('34. Send Quotation', async () => {
    // 1. Create a draft quotation
    const createRes = await fetch(`http://127.0.0.1:${port}/api/quotations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${managerToken1}` },
      body: JSON.stringify(validPayload(eventId1, activeServiceId1))
    });
    const { data: q } = await createRes.json() as any;

    // Unauthenticated send
    const res1 = await fetch(`http://127.0.0.1:${port}/api/quotations/${q._id}/send`, { method: 'PATCH' });
    assert.equal(res1.status, 401);

    // Client cannot send
    const res2 = await fetch(`http://127.0.0.1:${port}/api/quotations/${q._id}/send`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${clientToken1}` }
    });
    assert.equal(res2.status, 403);

    // Unauthorized Event Manager cannot send (manager 2 trying to send manager 1's event's quotation)
    const res3 = await fetch(`http://127.0.0.1:${port}/api/quotations/${q._id}/send`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${managerToken2}` }
    });
    assert.equal(res3.status, 403);

    // Authorized Manager can send
    const res4 = await fetch(`http://127.0.0.1:${port}/api/quotations/${q._id}/send`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${managerToken1}` }
    });
    assert.equal(res4.status, 200);
    const data4 = await res4.json() as any;
    assert.equal(data4.data.status, 'sent');
  });

  it('35. Client Accept Quotation', async () => {
    // Create & send
    const createRes = await fetch(`http://127.0.0.1:${port}/api/quotations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify(validPayload(eventId1, activeServiceId1))
    });
    const { data: q } = await createRes.json() as any;
    await fetch(`http://127.0.0.1:${port}/api/quotations/${q._id}/send`, {
      method: 'PATCH', headers: { 'Authorization': `Bearer ${adminToken}` }
    });

    // Unauthenticated accept
    const res1 = await fetch(`http://127.0.0.1:${port}/api/quotations/${q._id}/accept`, { method: 'PATCH' });
    assert.equal(res1.status, 401);

    // Admin cannot accept
    const res2 = await fetch(`http://127.0.0.1:${port}/api/quotations/${q._id}/accept`, {
      method: 'PATCH', headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    assert.equal(res2.status, 403);

    // Client 2 cannot accept Client 1's quotation
    const res3 = await fetch(`http://127.0.0.1:${port}/api/quotations/${q._id}/accept`, {
      method: 'PATCH', headers: { 'Authorization': `Bearer ${clientToken2}` }
    });
    assert.equal(res3.status, 403);

    // Client 1 can accept
    const res4 = await fetch(`http://127.0.0.1:${port}/api/quotations/${q._id}/accept`, {
      method: 'PATCH', headers: { 'Authorization': `Bearer ${clientToken1}` }
    });
    assert.equal(res4.status, 200);
    const data4 = await res4.json() as any;
    assert.equal(data4.data.status, 'accepted');

    // Verify Event status changed to awaiting_payment
    const evRes = await Event.findById(eventId1);
    assert.equal(evRes?.status, 'awaiting_payment');
  });

  it('36. Client Reject Quotation', async () => {
    // Create & send
    const createRes = await fetch(`http://127.0.0.1:${port}/api/quotations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify(validPayload(eventId2, activeServiceId1))
    });
    const { data: q } = await createRes.json() as any;
    await fetch(`http://127.0.0.1:${port}/api/quotations/${q._id}/send`, {
      method: 'PATCH', headers: { 'Authorization': `Bearer ${adminToken}` }
    });

    // Client 2 can reject
    const res = await fetch(`http://127.0.0.1:${port}/api/quotations/${q._id}/reject`, {
      method: 'PATCH', headers: { 'Authorization': `Bearer ${clientToken2}` }
    });
    assert.equal(res.status, 200);
    const data = await res.json() as any;
    assert.equal(data.data.status, 'rejected');

    // Event status should NOT change to confirmed/awaiting_payment
    const evRes = await Event.findById(eventId2);
    assert.notEqual(evRes?.status, 'awaiting_payment');
  });

  it('37. Client Request Changes', async () => {
    // Create & send
    const createRes = await fetch(`http://127.0.0.1:${port}/api/quotations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify(validPayload(eventId1, activeServiceId1))
    });
    const { data: q } = await createRes.json() as any;
    await fetch(`http://127.0.0.1:${port}/api/quotations/${q._id}/send`, {
      method: 'PATCH', headers: { 'Authorization': `Bearer ${adminToken}` }
    });

    // Client 1 can request changes
    const res = await fetch(`http://127.0.0.1:${port}/api/quotations/${q._id}/request-changes`, {
      method: 'PATCH', headers: { 'Authorization': `Bearer ${clientToken1}` }
    });
    assert.equal(res.status, 200);
    const data = await res.json() as any;
    assert.equal(data.data.status, 'changes_requested');

    // Now create Revision 2
    const rev2Res = await fetch(`http://127.0.0.1:${port}/api/quotations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify(validPayload(eventId1, activeServiceId2))
    });
    assert.equal(rev2Res.status, 201);
    const rev2 = await rev2Res.json() as any;
    assert.equal(rev2.data.revision, q.revision + 1);

    // Old revision remains changes_requested
    const oldQ = await Quotation.findById(q._id);
    assert.equal(oldQ?.status, 'changes_requested');
  });

  /* =======================================================================
   * Quotations Part 3: GST & Tax-Aware Commercial Structure Tests
   * ======================================================================= */

  it('38. Intra-state GST (18%) calculates CGST (9%) and SGST (9%) correctly on taxableAmount', async () => {
    const payload: any = validPayload(eventId1, activeServiceId1);
    // Subtotal = 100 * 500 = 50,000
    // Discount = 5,000 -> Taxable = 45,000
    // GST 18% intra-state:
    // Tax = 45,000 * 0.18 = 8,100
    // CGST = 4,050, SGST = 4,050, IGST = 0
    // FinalAmount = 45,000 + 8,100 = 53,100
    // Advance = 10,000 -> Remaining = 43,100
    payload.tax = {
      taxType: 'gst',
      taxRate: 18,
      gstTreatment: 'intra_state',
      placeOfSupply: 'Kerala',
      customerGstin: '32ABCDE1234F1Z5',
    };

    const res = await fetch(`http://127.0.0.1:${port}/api/quotations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify(payload),
    });
    assert.equal(res.status, 201);
    const data = (await res.json()) as any;

    assert.equal(data.data.subtotal, 50000);
    assert.equal(data.data.discount, 5000);
    assert.equal(data.data.taxableAmount, 45000);
    assert.equal(data.data.tax.taxType, 'gst');
    assert.equal(data.data.tax.taxRate, 18);
    assert.equal(data.data.tax.gstTreatment, 'intra_state');
    assert.equal(data.data.tax.taxAmount, 8100);
    assert.equal(data.data.tax.cgst, 4050);
    assert.equal(data.data.tax.sgst, 4050);
    assert.equal(data.data.tax.igst, 0);
    assert.equal(data.data.tax.placeOfSupply, 'Kerala');
    assert.equal(data.data.tax.customerGstin, '32ABCDE1234F1Z5');
    assert.equal(data.data.finalAmount, 53100);
    assert.equal(data.data.advanceAmount, 10000);
    assert.equal(data.data.remainingAmount, 43100);
  });

  it('39. Inter-state GST (18%) calculates IGST (18%) with zero CGST/SGST', async () => {
    const payload: any = validPayload(eventId1, activeServiceId1);
    // Subtotal = 50,000, Discount = 5,000 -> Taxable = 45,000
    // IGST 18% = 8,100
    // CGST = 0, SGST = 0, IGST = 8,100
    payload.tax = {
      taxType: 'gst',
      taxRate: 18,
      gstTreatment: 'inter_state',
      placeOfSupply: 'Karnataka',
    };

    const res = await fetch(`http://127.0.0.1:${port}/api/quotations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify(payload),
    });
    assert.equal(res.status, 201);
    const data = (await res.json()) as any;

    assert.equal(data.data.taxableAmount, 45000);
    assert.equal(data.data.tax.taxType, 'gst');
    assert.equal(data.data.tax.taxRate, 18);
    assert.equal(data.data.tax.gstTreatment, 'inter_state');
    assert.equal(data.data.tax.taxAmount, 8100);
    assert.equal(data.data.tax.cgst, 0);
    assert.equal(data.data.tax.sgst, 0);
    assert.equal(data.data.tax.igst, 8100);
    assert.equal(data.data.tax.placeOfSupply, 'Karnataka');
    assert.equal(data.data.finalAmount, 53100);
    assert.equal(data.data.remainingAmount, 43100);
  });

  it('40. Configurable tax rates (5%, 12%, 28%) and non-18% rates are supported', async () => {
    const payload: any = validPayload(eventId1, activeServiceId1);
    // Subtotal = 50,000, Discount = 10,000 -> Taxable = 40,000
    // 5% GST intra-state: Tax = 2,000 -> CGST = 1,000, SGST = 1,000
    payload.discount = 10000;
    payload.tax = {
      taxType: 'gst',
      taxRate: 5,
      gstTreatment: 'intra_state',
    };

    const res = await fetch(`http://127.0.0.1:${port}/api/quotations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify(payload),
    });
    assert.equal(res.status, 201);
    const data = (await res.json()) as any;

    assert.equal(data.data.taxableAmount, 40000);
    assert.equal(data.data.tax.taxRate, 5);
    assert.equal(data.data.tax.taxAmount, 2000);
    assert.equal(data.data.tax.cgst, 1000);
    assert.equal(data.data.tax.sgst, 1000);
    assert.equal(data.data.tax.igst, 0);
    assert.equal(data.data.finalAmount, 42000);
  });

  it('41. Custom / VAT tax types calculate total tax without GST splits', async () => {
    const payload: any = validPayload(eventId1, activeServiceId1);
    // Subtotal = 50,000, Discount = 5,000 -> Taxable = 45,000
    // VAT 10% = 4,500
    payload.tax = {
      taxType: 'vat',
      taxRate: 10,
    };

    const res = await fetch(`http://127.0.0.1:${port}/api/quotations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify(payload),
    });
    assert.equal(res.status, 201);
    const data = (await res.json()) as any;

    assert.equal(data.data.taxableAmount, 45000);
    assert.equal(data.data.tax.taxType, 'vat');
    assert.equal(data.data.tax.taxRate, 10);
    assert.equal(data.data.tax.taxAmount, 4500);
    assert.equal(data.data.tax.cgst, 0);
    assert.equal(data.data.tax.sgst, 0);
    assert.equal(data.data.tax.igst, 0);
    assert.equal(data.data.finalAmount, 49500);
  });

  it('42. Exempt GST treatment produces zero tax amounts', async () => {
    const payload: any = validPayload(eventId1, activeServiceId1);
    payload.tax = {
      taxType: 'gst',
      taxRate: 18,
      gstTreatment: 'exempt',
    };

    const res = await fetch(`http://127.0.0.1:${port}/api/quotations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify(payload),
    });
    assert.equal(res.status, 201);
    const data = (await res.json()) as any;

    assert.equal(data.data.tax.taxAmount, 0);
    assert.equal(data.data.tax.cgst, 0);
    assert.equal(data.data.tax.sgst, 0);
    assert.equal(data.data.tax.igst, 0);
    assert.equal(data.data.finalAmount, data.data.taxableAmount);
  });

  it('43. Discount is applied before tax calculation', async () => {
    const payload: any = validPayload(eventId1, activeServiceId1);
    // Subtotal = 50,000, Discount = 20,000 -> Taxable = 30,000
    // 18% Tax = 30,000 * 0.18 = 5,400 (NOT 50,000 * 0.18 = 9,000)
    payload.discount = 20000;
    payload.tax = {
      taxType: 'gst',
      taxRate: 18,
      gstTreatment: 'intra_state',
    };

    const res = await fetch(`http://127.0.0.1:${port}/api/quotations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify(payload),
    });
    assert.equal(res.status, 201);
    const data = (await res.json()) as any;

    assert.equal(data.data.taxableAmount, 30000);
    assert.equal(data.data.tax.taxAmount, 5400);
    assert.equal(data.data.finalAmount, 35400);
  });

  it('44. 2-decimal precision prevents floating point inconsistency on odd splits', async () => {
    // 3 items with fractional subtotal
    const payload: any = {
      eventId: eventId1,
      items: [
        {
          serviceId: activeServiceId1,
          quantity: 3,
          unitPrice: 33.33, // 99.99
        }
      ],
      discount: 0,
      advanceAmount: 10,
      tax: {
        taxType: 'gst',
        taxRate: 5, // 99.99 * 0.05 = 4.9995 -> 5.00
        gstTreatment: 'intra_state',
      },
      validUntil: new Date(Date.now() + 86400000).toISOString(),
      paymentPlan: [{ title: 'Deposit', amount: 50, dueDateDescription: 'Immediate' }],
    };

    const res = await fetch(`http://127.0.0.1:${port}/api/quotations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify(payload),
    });
    assert.equal(res.status, 201);
    const data = (await res.json()) as any;

    assert.equal(data.data.subtotal, 99.99);
    assert.equal(data.data.taxableAmount, 99.99);
    assert.equal(data.data.tax.taxAmount, 5);
    assert.equal(data.data.tax.cgst, 2.5);
    assert.equal(data.data.tax.sgst, 2.5);
    assert.equal(data.data.tax.cgst + data.data.tax.sgst, data.data.tax.taxAmount);
    assert.equal(data.data.finalAmount, 104.99);
    assert.equal(data.data.remainingAmount, 94.99);
  });

  it('45. Negative tax rate is rejected with 400', async () => {
    const payload: any = validPayload(eventId1, activeServiceId1);
    payload.tax = {
      taxType: 'gst',
      taxRate: -18,
    };

    const res = await fetch(`http://127.0.0.1:${port}/api/quotations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify(payload),
    });
    assert.equal(res.status, 400);
    const data = (await res.json()) as any;
    assert.match(data.message, /Validation failed/);
  });

  it('46. Invalid tax type is rejected with 400', async () => {
    const payload: any = validPayload(eventId1, activeServiceId1);
    payload.tax = {
      taxType: 'alien_tax',
      taxRate: 18,
    };

    const res = await fetch(`http://127.0.0.1:${port}/api/quotations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify(payload),
    });
    assert.equal(res.status, 400);
  });

  it('47. Invalid GST treatment is rejected with 400', async () => {
    const payload: any = validPayload(eventId1, activeServiceId1);
    payload.tax = {
      taxType: 'gst',
      taxRate: 18,
      gstTreatment: 'international_space_station',
    };

    const res = await fetch(`http://127.0.0.1:${port}/api/quotations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify(payload),
    });
    assert.equal(res.status, 400);
  });

  it('48. Advance amount exceeding final amount (tax-inclusive) is rejected', async () => {
    const payload: any = validPayload(eventId1, activeServiceId1);
    // Subtotal 50,000, Taxable 45,000, Tax 8,100 -> Final 53,100
    // Advance = 60,000 > 53,100 -> Reject
    payload.tax = {
      taxType: 'gst',
      taxRate: 18,
      gstTreatment: 'intra_state',
    };
    payload.advanceAmount = 60000;

    const res = await fetch(`http://127.0.0.1:${port}/api/quotations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify(payload),
    });
    assert.equal(res.status, 400);
    const data = (await res.json()) as any;
    assert.match(data.message, /Advance amount cannot exceed the final amount/);
  });

  it('49. Client cannot override taxAmount, cgst, sgst, igst, taxableAmount, finalAmount', async () => {
    const payload: any = validPayload(eventId1, activeServiceId1);
    payload.tax = {
      taxType: 'gst',
      taxRate: 18,
      gstTreatment: 'intra_state',
      taxAmount: 0, // Attacker attempts to bypass tax
      cgst: 0,
      sgst: 0,
      igst: 0,
      taxableAmount: 1,
    };
    payload.taxableAmount = 1;
    payload.finalAmount = 1;
    payload.remainingAmount = 0;

    const res = await fetch(`http://127.0.0.1:${port}/api/quotations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify(payload),
    });
    assert.equal(res.status, 201);
    const data = (await res.json()) as any;

    // Backend calculation overrides all client-sent numbers
    assert.equal(data.data.taxableAmount, 45000);
    assert.equal(data.data.tax.taxAmount, 8100);
    assert.equal(data.data.tax.cgst, 4050);
    assert.equal(data.data.tax.sgst, 4050);
    assert.equal(data.data.finalAmount, 53100);
  });

  it('50. Historical quotation preserves its tax snapshot when subsequent revision changes tax configuration', async () => {
    // Rev 1 with 18% intra-state GST
    const p1: any = validPayload(eventId1, activeServiceId1);
    p1.tax = {
      taxType: 'gst',
      taxRate: 18,
      gstTreatment: 'intra_state',
      placeOfSupply: 'Kerala',
    };
    const res1 = await fetch(`http://127.0.0.1:${port}/api/quotations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify(p1),
    });
    assert.equal(res1.status, 201);
    const q1 = (await res1.json()) as any;
    assert.equal(q1.data.revision, 1);
    assert.equal(q1.data.tax.taxRate, 18);
    assert.equal(q1.data.tax.taxAmount, 8100);
    assert.equal(q1.data.finalAmount, 53100);

    // Rev 2 with 5% inter-state GST
    const p2: any = validPayload(eventId1, activeServiceId1);
    p2.tax = {
      taxType: 'gst',
      taxRate: 5,
      gstTreatment: 'inter_state',
      placeOfSupply: 'Tamil Nadu',
    };
    const res2 = await fetch(`http://127.0.0.1:${port}/api/quotations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify(p2),
    });
    assert.equal(res2.status, 201);
    const q2 = (await res2.json()) as any;
    assert.equal(q2.data.revision, 2);
    assert.equal(q2.data.tax.taxRate, 5);
    assert.equal(q2.data.tax.taxAmount, 2250);
    assert.equal(q2.data.tax.igst, 2250);
    assert.equal(q2.data.tax.placeOfSupply, 'Tamil Nadu');
    assert.equal(q2.data.finalAmount, 47250);

    // Fetch Rev 1 by ID and verify its snapshot is untouched
    const getRev1 = await fetch(`http://127.0.0.1:${port}/api/quotations/${q1.data._id}`, {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    const fetchedQ1 = (await getRev1.json()) as any;
    assert.equal(fetchedQ1.data.revision, 1);
    assert.equal(fetchedQ1.data.tax.taxRate, 18);
    assert.equal(fetchedQ1.data.tax.gstTreatment, 'intra_state');
    assert.equal(fetchedQ1.data.tax.taxAmount, 8100);
    assert.equal(fetchedQ1.data.tax.cgst, 4050);
    assert.equal(fetchedQ1.data.tax.sgst, 4050);
    assert.equal(fetchedQ1.data.tax.placeOfSupply, 'Kerala');
    assert.equal(fetchedQ1.data.finalAmount, 53100);
  });

  it('51. Accepted tax-inclusive quotation preserves advanceAmount and transitions Event to awaiting_payment', async () => {
    // Create & Send Rev 1 with tax
    const payload: any = validPayload(eventId1, activeServiceId1);
    payload.advanceAmount = 15000;
    payload.tax = {
      taxType: 'gst',
      taxRate: 18,
      gstTreatment: 'intra_state',
    };
    const createRes = await fetch(`http://127.0.0.1:${port}/api/quotations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify(payload),
    });
    const { data: q } = (await createRes.json()) as any;

    await fetch(`http://127.0.0.1:${port}/api/quotations/${q._id}/send`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${adminToken}` },
    });

    // Client accepts
    const acceptRes = await fetch(`http://127.0.0.1:${port}/api/quotations/${q._id}/accept`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${clientToken1}` },
    });
    assert.equal(acceptRes.status, 200);
    const acceptedData = (await acceptRes.json()) as any;

    assert.equal(acceptedData.data.status, 'accepted');
    assert.equal(acceptedData.data.advanceAmount, 15000);
    assert.equal(acceptedData.data.finalAmount, 53100);
    assert.equal(acceptedData.data.remainingAmount, 38100);

    const event = await Event.findById(eventId1);
    assert.equal(event?.status, 'awaiting_payment');
  });

  it('52. Client can list own quotations via GET /api/quotations without eventId', async () => {
    // Create a quotation for client 1
    const payload = validPayload(eventId1, activeServiceId1);
    await fetch(`http://127.0.0.1:${port}/api/quotations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify(payload),
    });

    // Client 1 fetches all own quotations
    const res = await fetch(`http://127.0.0.1:${port}/api/quotations`, {
      headers: { 'Authorization': `Bearer ${clientToken1}` }
    });
    assert.equal(res.status, 200);
    const data = (await res.json()) as any;
    assert.ok(Array.isArray(data.data));
    assert.equal(data.data.length, 1);
    assert.equal(data.data[0].clientId, clientId1);
  });

  it('53. Client can request changes with reason notes persisted', async () => {
    // Create & send a quotation for client 1
    const payload = validPayload(eventId1, activeServiceId1);
    const createRes = await fetch(`http://127.0.0.1:${port}/api/quotations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify(payload),
    });
    const { data: q } = (await createRes.json()) as any;

    await fetch(`http://127.0.0.1:${port}/api/quotations/${q._id}/send`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${adminToken}` },
    });

    const res = await fetch(`http://127.0.0.1:${port}/api/quotations/${q._id}/request-changes`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${clientToken1}` },
      body: JSON.stringify({ reason: 'Please reduce decoration package rate by 10%.' }),
    });
    assert.equal(res.status, 200);
    const data = (await res.json()) as any;
    assert.equal(data.data.status, 'changes_requested');
    assert.equal(data.data.clientNotes, 'Please reduce decoration package rate by 10%.');
  });

  it('54. Client can reject quotation with reason persisted', async () => {
    // Create & send a quotation for client 2
    const payload = validPayload(eventId2, activeServiceId1);
    const createRes = await fetch(`http://127.0.0.1:${port}/api/quotations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify(payload),
    });
    const { data: q } = (await createRes.json()) as any;

    await fetch(`http://127.0.0.1:${port}/api/quotations/${q._id}/send`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${adminToken}` },
    });

    const res = await fetch(`http://127.0.0.1:${port}/api/quotations/${q._id}/reject`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${clientToken2}` },
      body: JSON.stringify({ reason: 'Found alternative budget option.' }),
    });
    assert.equal(res.status, 200);
    const data = (await res.json()) as any;
    assert.equal(data.data.status, 'rejected');
    assert.equal(data.data.rejectionReason, 'Found alternative budget option.');
  });

  it('55. Admin creates Revision 2 for changes_requested quotation, preserving Revision 1 intact', async () => {
    // 1. Admin creates Revision 1
    const p1 = validPayload(eventId1, activeServiceId1);
    const createRes1 = await fetch(`http://127.0.0.1:${port}/api/quotations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify(p1),
    });
    const { data: rev1 } = (await createRes1.json()) as any;
    assert.equal(rev1.revision, 1);

    // 2. Issue Revision 1
    await fetch(`http://127.0.0.1:${port}/api/quotations/${rev1._id}/send`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${adminToken}` },
    });

    // 3. Client requests changes on Revision 1
    await fetch(`http://127.0.0.1:${port}/api/quotations/${rev1._id}/request-changes`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${clientToken1}` },
      body: JSON.stringify({ reason: 'Increase quantity from 100 to 150 guests.' }),
    });

    // Verify Revision 1 is changes_requested with clientNotes
    const rev1Doc = await Quotation.findById(rev1._id);
    assert.equal(rev1Doc?.status, 'changes_requested');
    assert.equal(rev1Doc?.clientNotes, 'Increase quantity from 100 to 150 guests.');

    // 4. Admin creates Revision 2 with updated quantity
    const p2 = {
      ...validPayload(eventId1, activeServiceId1),
      items: [{ serviceId: activeServiceId1, quantity: 150, unitPrice: 500 }],
    };
    const createRes2 = await fetch(`http://127.0.0.1:${port}/api/quotations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify(p2),
    });
    assert.equal(createRes2.status, 201);
    const { data: rev2 } = (await createRes2.json()) as any;

    assert.equal(rev2.revision, 2);
    assert.equal(rev2.quotationNumber, rev1.quotationNumber);
    assert.equal(rev2.status, 'draft');
    assert.equal(rev2.items[0].quantity, 150);

    // 5. Verify Revision 1 is STILL intact and unchanged
    const rev1After = await Quotation.findById(rev1._id);
    assert.equal(rev1After?.revision, 1);
    assert.equal(rev1After?.status, 'changes_requested');
    assert.equal(rev1After?.clientNotes, 'Increase quantity from 100 to 150 guests.');
    assert.equal(rev1After?.items[0].quantity, 100);
  });

  it('56. Admin can update a draft quotation via PUT /api/quotations/:id, but cannot edit non-drafts', async () => {
    // 1. Create draft quotation
    const p = validPayload(eventId1, activeServiceId1);
    const createRes = await fetch(`http://127.0.0.1:${port}/api/quotations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify(p),
    });
    const { data: draftQ } = (await createRes.json()) as any;

    // 2. Update draft quotation
    const updatedPayload = {
      ...p,
      discount: 2000,
      items: [{ serviceId: activeServiceId1, quantity: 120, unitPrice: 450 }],
    };
    const updateRes = await fetch(`http://127.0.0.1:${port}/api/quotations/${draftQ._id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify(updatedPayload),
    });
    assert.equal(updateRes.status, 200);
    const { data: updatedQ } = (await updateRes.json()) as any;
    assert.equal(updatedQ.discount, 2000);
    assert.equal(updatedQ.items[0].quantity, 120);

    // 3. Issue the quotation so status is 'sent'
    await fetch(`http://127.0.0.1:${port}/api/quotations/${draftQ._id}/send`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${adminToken}` },
    });

    // 4. Try updating the sent quotation -> must fail with 400
    const failRes = await fetch(`http://127.0.0.1:${port}/api/quotations/${draftQ._id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify(updatedPayload),
    });
    assert.equal(failRes.status, 400);
    const failData = (await failRes.json()) as any;
    assert.match(failData.message, /Only draft quotations can be edited/);
  });

  it('57. Multiple change cycles work seamlessly: Rev 1 -> Rev 2 -> Rev 3', async () => {
    // Rev 1
    const p1 = validPayload(eventId1, activeServiceId1);
    const c1 = await fetch(`http://127.0.0.1:${port}/api/quotations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify(p1),
    });
    const { data: rev1 } = (await c1.json()) as any;
    await fetch(`http://127.0.0.1:${port}/api/quotations/${rev1._id}/send`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${adminToken}` },
    });

    // Client requests changes to Rev 1
    await fetch(`http://127.0.0.1:${port}/api/quotations/${rev1._id}/request-changes`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${clientToken1}` },
      body: JSON.stringify({ reason: 'Cycle 1 request' }),
    });

    // Admin creates and issues Rev 2
    const c2 = await fetch(`http://127.0.0.1:${port}/api/quotations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify(validPayload(eventId1, activeServiceId1)),
    });
    const { data: rev2 } = (await c2.json()) as any;
    assert.equal(rev2.revision, 2);

    await fetch(`http://127.0.0.1:${port}/api/quotations/${rev2._id}/send`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${adminToken}` },
    });

    // Client requests changes to Rev 2
    await fetch(`http://127.0.0.1:${port}/api/quotations/${rev2._id}/request-changes`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${clientToken1}` },
      body: JSON.stringify({ reason: 'Cycle 2 request' }),
    });

    // Admin creates and issues Rev 3
    const c3 = await fetch(`http://127.0.0.1:${port}/api/quotations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify(validPayload(eventId1, activeServiceId1)),
    });
    const { data: rev3 } = (await c3.json()) as any;
    assert.equal(rev3.revision, 3);
    assert.equal(rev3.quotationNumber, rev1.quotationNumber);

    // Verify all 3 revisions exist in database
    const all = await Quotation.find({ eventId: eventId1 }).sort({ revision: 1 });
    assert.equal(all.length, 3);
    assert.equal(all[0].revision, 1);
    assert.equal(all[0].clientNotes, 'Cycle 1 request');
    assert.equal(all[1].revision, 2);
    assert.equal(all[1].clientNotes, 'Cycle 2 request');
    assert.equal(all[2].revision, 3);
  });

  it('saves and retrieves payment plan with dueDate correctly in db', async () => {
    const payload = validPayload(eventId1, activeServiceId1);
    const dueDateStr = '2026-11-15T00:00:00.000Z';
    (payload as any).paymentPlan = [
      {
        title: 'Advance Deposit',
        amount: 15000,
        dueDate: dueDateStr,
        dueDateDescription: 'Upon quotation acceptance',
        percentage: 30,
        purpose: ['Booking lock'],
      },
      {
        title: 'Final Settlement',
        amount: 35000,
        dueDate: '2026-12-01T00:00:00.000Z',
        dueDateDescription: '1 day prior to event',
        percentage: 70,
        purpose: ['Completion'],
      }
    ];

    const res = await fetch(`http://127.0.0.1:${port}/api/quotations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify(payload),
    });
    assert.equal(res.status, 201);
    const data = (await res.json()) as any;
    assert.equal(data.data.paymentPlan.length, 2);
    assert.equal(data.data.paymentPlan[0].title, 'Advance Deposit');
    assert.ok(data.data.paymentPlan[0].dueDate);
    assert.equal(new Date(data.data.paymentPlan[0].dueDate).toISOString(), dueDateStr);
    assert.equal(data.data.paymentPlan[0].dueDateDescription, 'Upon quotation acceptance');

    // Verify directly in MongoDB
    const qtnInDb = await Quotation.findById(data.data._id);
    assert.ok(qtnInDb);
    assert.equal(qtnInDb.paymentPlan?.length, 2);
    assert.ok(qtnInDb.paymentPlan![0].dueDate instanceof Date);
    assert.equal(qtnInDb.paymentPlan![0].dueDate!.toISOString(), dueDateStr);
  });

  it('rejects creation when validUntil is missing or paymentPlan is empty / zero amount', async () => {
    // Missing validUntil
    const pNoValidity: any = validPayload(eventId1, activeServiceId1);
    delete pNoValidity.validUntil;
    const r1 = await fetch(`http://127.0.0.1:${port}/api/quotations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify(pNoValidity),
    });
    assert.equal(r1.status, 400);

    // Empty paymentPlan
    const pNoPlan: any = validPayload(eventId1, activeServiceId1);
    pNoPlan.paymentPlan = [];
    const r2 = await fetch(`http://127.0.0.1:${port}/api/quotations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify(pNoPlan),
    });
    assert.equal(r2.status, 400);

    // Installment amount 0
    const pZeroAmount: any = validPayload(eventId1, activeServiceId1);
    pZeroAmount.paymentPlan = [{ title: 'Deposit', amount: 0, dueDateDescription: 'Immediate' }];
    const r3 = await fetch(`http://127.0.0.1:${port}/api/quotations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify(pZeroAmount),
    });
    assert.equal(r3.status, 400);
  });

  it('rejects issuing a quotation if service amount is 0 or installment amount is 0', async () => {
    const qtn = await Quotation.create({
      quotationNumber: 'QTN-VAL-1',
      revision: 1,
      eventId: eventId1,
      clientId: clientId1,
      status: 'draft',
      createdBy: adminId,
      items: [{ serviceId: activeServiceId1, quantity: 1, unitPrice: 0, amount: 0, name: 'Decoration', description: 'Setup', pricingType: 'package' }],
      subtotal: 0,
      discount: 0,
      taxableAmount: 0,
      finalAmount: 0,
      advanceAmount: 0,
      remainingAmount: 0,
      validUntil: new Date(Date.now() + 86400000),
      paymentPlan: [{ title: 'Advance', amount: 1000, dueDateDescription: 'Now' }],
    });

    // Try issuing with service price 0
    const res1 = await fetch(`http://127.0.0.1:${port}/api/quotations/${qtn._id}/send`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${adminToken}` },
    });
    assert.equal(res1.status, 400);
    const data1 = (await res1.json()) as any;
    assert.match(data1.message, /Price for "Decoration" must be greater than 0/);

    // Update item price > 0, but set installment amount 0
    qtn.items[0].unitPrice = 5000;
    qtn.items[0].amount = 5000;
    qtn.paymentPlan![0].amount = 0;
    await qtn.save();

    const res2 = await fetch(`http://127.0.0.1:${port}/api/quotations/${qtn._id}/send`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${adminToken}` },
    });
    assert.equal(res2.status, 400);
    const data2 = (await res2.json()) as any;
    assert.match(data2.message, /must be greater than 0/);
  });

  it('validates quotation validity date: cannot be blank, cannot be in past, cannot be after event date', async () => {
    // 1. Blank validUntil
    const pBlank: any = validPayload(eventId1, activeServiceId1);
    pBlank.validUntil = '   ';
    const resBlank = await fetch(`http://127.0.0.1:${port}/api/quotations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify(pBlank),
    });
    assert.equal(resBlank.status, 400);

    // 2. Past date (yesterday)
    const pPast: any = validPayload(eventId1, activeServiceId1);
    pPast.validUntil = new Date(Date.now() - 86400000).toISOString();
    const resPast = await fetch(`http://127.0.0.1:${port}/api/quotations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify(pPast),
    });
    assert.equal(resPast.status, 400);
    const dataPast = (await resPast.json()) as any;
    assert.match(JSON.stringify(dataPast), /cannot be less than today's date/);

    // 3. Date after event date (event is +30 days, validUntil is +35 days)
    const pAfterEvent: any = validPayload(eventId1, activeServiceId1);
    pAfterEvent.validUntil = new Date(Date.now() + 35 * 86400000).toISOString();
    const resAfter = await fetch(`http://127.0.0.1:${port}/api/quotations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify(pAfterEvent),
    });
    assert.equal(resAfter.status, 400);
    const dataAfter = (await resAfter.json()) as any;
    assert.match(dataAfter.message, /cannot be after the event date/);

    // 4. Valid date (7 days ahead, within event date)
    const pValid: any = validPayload(eventId1, activeServiceId1);
    pValid.validUntil = new Date(Date.now() + 7 * 86400000).toISOString();
    const resValid = await fetch(`http://127.0.0.1:${port}/api/quotations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify(pValid),
    });
    assert.equal(resValid.status, 201);
  });
});
