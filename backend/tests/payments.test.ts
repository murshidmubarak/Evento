import './setup.js';
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import app from '../src/app.js';
import { Payment } from '../src/modules/payments/model/payment.model.js';
import { Event } from '../src/modules/events/model/event.model.js';
import { Quotation } from '../src/modules/quotations/model/quotation.model.js';
import { Service } from '../src/modules/services/model/service.model.js';
import { User } from '../src/modules/auth/model/user.model.js';
import { connectDB } from '../src/config/db.js';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import { env } from '../src/config/env.js';
import { Sequence } from '../src/modules/users/model/sequence.model.js';

describe('Payments API', () => {
  let adminToken: string;
  let clientToken1: string;
  let clientToken2: string;
  let managerToken: string;
  let workerToken: string;
  
  let adminId: string;
  let clientId1: string;
  let clientId2: string;
  let managerId: string;
  let workerId: string;

  let serviceId: string;
  
  let eventId1: string;
  let eventId2: string; // Not in awaiting_payment
  let eventId3: string; // Belonging to client 2

  let server: any;
  let port: number;

  const generateToken = (userId: string, role: string) => {
    return jwt.sign({ userId, role }, env.jwtSecret, { expiresIn: '1h' });
  };

  before(async () => {
    await connectDB();

    server = app.listen(0);
    port = server.address().port;

    // Clear db
    await Payment.deleteMany({});
    await Quotation.deleteMany({});
    await Event.deleteMany({});
    await Service.deleteMany({});
    await User.deleteMany({});
    await Sequence.deleteMany({});

    // Users
    const admin = await User.create({ name: 'Admin', email: 'adminp@test.com', password: 'hash', role: 'admin' });
    const client1 = await User.create({ name: 'Client 1', email: 'c1p@test.com', password: 'hash', role: 'client' });
    const client2 = await User.create({ name: 'Client 2', email: 'c2p@test.com', password: 'hash', role: 'client' });
    const manager = await User.create({ name: 'Manager', email: 'mgr@test.com', password: 'hash', role: 'event_manager' });
    const worker = await User.create({ name: 'Worker', email: 'wkr@test.com', password: 'hash', role: 'worker', workerType: 'Host' });

    adminId = admin.id; clientId1 = client1.id; clientId2 = client2.id; managerId = manager.id; workerId = worker.id;
    adminToken = generateToken(adminId, 'admin');
    clientToken1 = generateToken(clientId1, 'client');
    clientToken2 = generateToken(clientId2, 'client');
    managerToken = generateToken(managerId, 'event_manager');
    workerToken = generateToken(workerId, 'worker');

    // Service
    const svc = await Service.create({ name: 'DJ', description: 'DJ Package', pricingType: 'package' });
    serviceId = svc.id;

    // Events
    const ev1 = await Event.create({
      clientId: clientId1, title: 'Event 1', eventType: 'Corporate', 
      date: new Date(), startTime: '10:00', endTime: '14:00', 
      location: { address: 'L1' }, 
      guestCount: 100, status: 'awaiting_payment'
    });
    eventId1 = ev1.id;

    const ev2 = await Event.create({
      clientId: clientId1, title: 'Event 2', eventType: 'Wedding', 
      date: new Date(), startTime: '10:00', endTime: '14:00', 
      location: { address: 'L2' }, 
      guestCount: 100, status: 'quoted'
    });
    eventId2 = ev2.id;

    const ev3 = await Event.create({
      clientId: clientId2, title: 'Event 3', eventType: 'Other', 
      date: new Date(), startTime: '10:00', endTime: '14:00', 
      location: { address: 'L3' }, 
      guestCount: 100, status: 'awaiting_payment'
    });
    eventId3 = ev3.id;

    // Quotations
    // Q1 for Event 1 -> accepted (valid)
    await Quotation.create({
      quotationNumber: 'QTN-P1', revision: 1, eventId: eventId1, clientId: clientId1, status: 'accepted', createdBy: adminId,
      items: [{ serviceId, quantity: 1, unitPrice: 5000, name: 'DJ', description: 'DJ Package', pricingType: 'package', amount: 5000 }],
      subtotal: 5000, discount: 0, taxableAmount: 5000, finalAmount: 5000, advanceAmount: 2000, remainingAmount: 3000,
      validUntil: new Date(Date.now() + 86400000)
    });

    // Q2 for Event 2 -> draft
    await Quotation.create({
      quotationNumber: 'QTN-P2', revision: 1, eventId: eventId2, clientId: clientId1, status: 'draft', createdBy: adminId,
      items: [{ serviceId, quantity: 1, unitPrice: 5000, name: 'DJ', description: 'DJ Package', pricingType: 'package', amount: 5000 }],
      subtotal: 5000, discount: 0, taxableAmount: 5000, finalAmount: 5000, advanceAmount: 2000, remainingAmount: 3000,
      validUntil: new Date(Date.now() + 86400000)
    });

    // Q3 for Event 3 -> accepted
    await Quotation.create({
      quotationNumber: 'QTN-P3', revision: 1, eventId: eventId3, clientId: clientId2, status: 'accepted', createdBy: adminId,
      items: [{ serviceId, quantity: 1, unitPrice: 5000, name: 'DJ', description: 'DJ Package', pricingType: 'package', amount: 5000 }],
      subtotal: 5000, discount: 0, taxableAmount: 5000, finalAmount: 5000, advanceAmount: 2000, remainingAmount: 3000,
      validUntil: new Date(Date.now() + 86400000)
    });
  });

  after(async () => {
    await Payment.deleteMany({});
    await Quotation.deleteMany({});
    await Event.deleteMany({});
    await Service.deleteMany({});
    await User.deleteMany({});
    await Sequence.deleteMany({});
    server.close();
    await mongoose.disconnect();
  });

  it('1. Unauthenticated request -> 401', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/payments/create-order`, {
      method: 'POST', body: JSON.stringify({ eventId: eventId1 }), headers: { 'Content-Type': 'application/json' }
    });
    assert.equal(res.status, 401);
  });

  it('2. Admin cannot use client create-order endpoint -> 403', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/payments/create-order`, {
      method: 'POST', body: JSON.stringify({ eventId: eventId1 }),
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` }
    });
    assert.equal(res.status, 403);
  });

  it('3. Event Manager cannot -> 403', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/payments/create-order`, {
      method: 'POST', body: JSON.stringify({ eventId: eventId1 }),
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${managerToken}` }
    });
    assert.equal(res.status, 403);
  });

  it('4. Worker cannot -> 403', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/payments/create-order`, {
      method: 'POST', body: JSON.stringify({ eventId: eventId1 }),
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${workerToken}` }
    });
    assert.equal(res.status, 403);
  });

  it('6. Client cannot create payment for another clients Event -> 403', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/payments/create-order`, {
      method: 'POST', body: JSON.stringify({ eventId: eventId3 }),
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${clientToken1}` }
    });
    assert.equal(res.status, 403);
  });

  it('7. Event must be awaiting_payment (event 2 is quoted) -> 400', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/payments/create-order`, {
      method: 'POST', body: JSON.stringify({ eventId: eventId2 }),
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${clientToken1}` }
    });
    assert.equal(res.status, 400);
    const data = await res.json() as any;
    assert.equal(data.message, 'Event is not in awaiting_payment state.');
  });

  it('5. Client owning Event can create payment order', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/payments/create-order`, {
      method: 'POST', body: JSON.stringify({ eventId: eventId1 }),
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${clientToken1}` }
    });
    const data = await res.json() as any;
    if (res.status !== 201) console.error(data);
    assert.equal(res.status, 201);
    assert.ok(data.data.razorpayOrderId);
    assert.equal(data.data.amount, 2000); // 2000 is the advance amount of event1's quotation
    assert.equal(data.data.currency, 'INR');
    
    // Check payment record
    const payment = await Payment.findById(data.data.paymentId);
    assert.ok(payment);
    assert.equal(payment.status, 'pending'); // 16. Payment record is created in a non-paid state
    assert.equal(payment.paymentType, 'advance');
  });

  it('23. Duplicate payment-order attempt is handled safely (Idempotency)', async () => {
    const p1 = await Payment.countDocuments({ eventId: eventId1 });
    const res = await fetch(`http://127.0.0.1:${port}/api/payments/create-order`, {
      method: 'POST', body: JSON.stringify({ eventId: eventId1 }),
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${clientToken1}` }
    });
    assert.equal(res.status, 201);
    
    const p2 = await Payment.countDocuments({ eventId: eventId1 });
    assert.equal(p1, p2, 'Should not create a duplicate payment record');
  });

  it('25. Event remains awaiting_payment after Order Creation', async () => {
    const ev = await Event.findById(eventId1);
    assert.equal(ev?.status, 'awaiting_payment');
  });

  it('13. Client-supplied amount cannot override advanceAmount', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/payments/create-order`, {
      method: 'POST', body: JSON.stringify({ eventId: eventId3, amount: 10 }),
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${clientToken2}` }
    });
    assert.equal(res.status, 201);
    const data = await res.json() as any;
    assert.equal(data.data.amount, 2000, 'Amount must remain 2000 from the authoritative accepted quotation');
  });

  it('26. Security - Production cannot bypass Razorpay even with dummy keys', async () => {
    // We mock nodeEnv to production temporarily to prove the safeguard holds
    const originalNodeEnv = env.nodeEnv;
    // @ts-ignore - circumventing readonly for test
    env.nodeEnv = 'production';
    
    // Clean up eventId1's payment so we don't hit idempotency logic (which returns 201)
    await Payment.deleteMany({ eventId: eventId1 });

    const res = await fetch(`http://127.0.0.1:${port}/api/payments/create-order`, {
      method: 'POST', body: JSON.stringify({ eventId: eventId1 }),
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${clientToken1}` }
    });

    // In production, shouldBypass is false. It attempts to call Razorpay API with 'rzp_test_dummy_key_id'
    // Razorpay SDK will fail, triggering our catch block and throwing 500 'Failed to create Razorpay order.'
    assert.equal(res.status, 500, 'Production must not bypass Razorpay and should fail when using dummy keys');
    const data = await res.json() as any;
    assert.equal(data.message, 'Failed to create Razorpay order.');

    // @ts-ignore
    env.nodeEnv = originalNodeEnv;
  });

  it('27. Security - Development with dummy keys correctly bypasses Razorpay', async () => {
    // Delete payment again to bypass idempotency
    await Payment.deleteMany({ eventId: eventId1 });
    
    const originalNodeEnv = env.nodeEnv;
    // @ts-ignore
    env.nodeEnv = 'development';
    
    // Ensure the key is the dummy key (as configured in test environment)
    assert.equal(env.razorpayKeyId, 'rzp_test_dummy_key_id');

    const res = await fetch(`http://127.0.0.1:${port}/api/payments/create-order`, {
      method: 'POST', body: JSON.stringify({ eventId: eventId1 }),
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${clientToken1}` }
    });

    // In development with dummy key, shouldBypass is true. It generates a fake order ID and succeeds.
    assert.equal(res.status, 201, 'Development with dummy keys must successfully bypass Razorpay');
    
    // @ts-ignore
    env.nodeEnv = originalNodeEnv;
  });

  it('28. Payment Order creation correctly uses advanceAmount from a tax-inclusive accepted quotation', async () => {
    // Create new event & accepted quotation with GST (18%)
    const evTax = await Event.create({
      clientId: clientId1,
      title: 'Tax Event',
      eventType: 'Wedding',
      date: new Date(),
      startTime: '10:00',
      endTime: '18:00',
      location: { address: 'Tax Venue' },
      guestCount: 150,
      status: 'awaiting_payment',
    });

    // Subtotal = 10,000, Tax = 1,800, Final = 11,800, Advance = 4,000
    await Quotation.create({
      quotationNumber: 'QTN-TAX-1',
      revision: 1,
      eventId: evTax.id,
      clientId: clientId1,
      status: 'accepted',
      createdBy: adminId,
      items: [
        {
          serviceId,
          quantity: 2,
          unitPrice: 5000,
          name: 'DJ',
          description: 'DJ Package',
          pricingType: 'package',
          amount: 10000,
        },
      ],
      subtotal: 10000,
      discount: 0,
      taxableAmount: 10000,
      tax: {
        taxType: 'gst',
        taxRate: 18,
        gstTreatment: 'intra_state',
        taxableAmount: 10000,
        taxAmount: 1800,
        cgst: 900,
        sgst: 900,
        igst: 0,
      },
      finalAmount: 11800,
      advanceAmount: 4000,
      remainingAmount: 7800,
    });

    const res = await fetch(`http://127.0.0.1:${port}/api/payments/create-order`, {
      method: 'POST',
      body: JSON.stringify({ eventId: evTax.id }),
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${clientToken1}` },
    });
    assert.equal(res.status, 201);
    const data = (await res.json()) as any;
    assert.equal(data.data.amount, 4000, 'Must obtain advanceAmount 4000 from accepted tax-inclusive quotation');
    assert.equal(data.data.currency, 'INR');

    const payment = await Payment.findById(data.data.paymentId);
    assert.ok(payment);
    assert.equal(payment.amount, 4000);
    assert.equal(payment.status, 'pending');
  });
});
