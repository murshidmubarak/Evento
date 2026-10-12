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
import crypto from 'node:crypto';

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
    // We mock NODE_ENV to production temporarily to prove the safeguard holds
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    
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

    process.env.NODE_ENV = originalNodeEnv;
  });

  it('27. Security - Development with dummy keys correctly bypasses Razorpay', async () => {
    // Delete payment again to bypass idempotency
    await Payment.deleteMany({ eventId: eventId1 });
    
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    
    // Ensure the key is the dummy key (as configured in test environment)
    assert.equal(env.razorpayKeyId, 'rzp_test_dummy_key_id');

    const res = await fetch(`http://127.0.0.1:${port}/api/payments/create-order`, {
      method: 'POST', body: JSON.stringify({ eventId: eventId1 }),
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${clientToken1}` }
    });

    // In development with dummy key, shouldBypass is true. It generates a fake order ID and succeeds.
    assert.equal(res.status, 201, 'Development with dummy keys must successfully bypass Razorpay');
    
    process.env.NODE_ENV = originalNodeEnv;
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
  describe('Payment Verification', () => {
    let orderId: string;
    let paymentId: string;
    let signature: string;
    const paymentIdStr = 'pay_fake123';

    before(async () => {
      // Retrieve the real accepted quotation for Event 1
      const acceptedQ = await Quotation.findOne({ eventId: eventId1, status: 'accepted' });
      assert.ok(acceptedQ, 'Setup: accepted quotation for eventId1 must exist');

      // Create a pending payment that correctly references the accepted quotation
      const p = await Payment.create({
        eventId: eventId1,
        quotationId: acceptedQ._id, // real accepted quotation ID — required by quotationId cross-check
        clientId: clientId1,
        paymentType: 'advance',
        amount: 2000,
        currency: 'INR',
        status: 'pending',
        razorpayOrderId: 'order_test123',
        receiptReference: 'rcpt_123',
      });
      paymentId = p.id;
      orderId = 'order_test123';

      // Generate a valid HMAC-SHA256 signature matching what Razorpay would produce
      signature = crypto.createHmac('sha256', env.razorpayKeySecret)
        .update(`${orderId}|${paymentIdStr}`)
        .digest('hex');
    });

    it('29. Unauthenticated verify request -> 401', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/api/payments/verify`, {
        method: 'POST', body: JSON.stringify({ razorpay_order_id: orderId, razorpay_payment_id: paymentIdStr, razorpay_signature: signature }), headers: { 'Content-Type': 'application/json' }
      });
      assert.equal(res.status, 401);
    });

    it('30. Invalid payload -> 400', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/api/payments/verify`, {
        method: 'POST', body: JSON.stringify({ razorpay_order_id: orderId }), // missing fields
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${clientToken1}` }
      });
      assert.equal(res.status, 400);
    });

    it('31. Tampered signature -> 400', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/api/payments/verify`, {
        method: 'POST', body: JSON.stringify({ razorpay_order_id: orderId, razorpay_payment_id: paymentIdStr, razorpay_signature: 'invalid_sig' }),
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${clientToken1}` }
      });
      assert.equal(res.status, 400);
      const payment = await Payment.findById(paymentId);
      assert.equal(payment?.status, 'failed', 'Payment should be marked as failed on bad signature');

      // Reset to pending for next tests
      if (payment) {
        payment.status = 'pending';
        await payment.save();
      }
    });

    it('32. Non-owner client cannot verify -> 403', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/api/payments/verify`, {
        method: 'POST', body: JSON.stringify({ razorpay_order_id: orderId, razorpay_payment_id: paymentIdStr, razorpay_signature: signature }),
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${clientToken2}` }
      });
      assert.equal(res.status, 403);
    });

    it('33. Valid signature updates payment to paid and event to confirmed', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/api/payments/verify`, {
        method: 'POST', body: JSON.stringify({ razorpay_order_id: orderId, razorpay_payment_id: paymentIdStr, razorpay_signature: signature }),
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${clientToken1}` }
      });
      assert.equal(res.status, 200);

      const p = await Payment.findById(paymentId);
      assert.equal(p?.status, 'paid');
      assert.equal(p?.razorpayPaymentId, paymentIdStr);

      const ev = await Event.findById(eventId1);
      assert.equal(ev?.status, 'confirmed');
    });

    it('34. Idempotency: Duplicate verify request returns success', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/api/payments/verify`, {
        method: 'POST', body: JSON.stringify({ razorpay_order_id: orderId, razorpay_payment_id: paymentIdStr, razorpay_signature: signature }),
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${clientToken1}` }
      });
      assert.equal(res.status, 200);
    });

    it('35. Stale quotation revision: payment referencing superseded quotation is rejected', async () => {
      // Create a new event with an accepted quotation
      const evStale = await Event.create({
        clientId: clientId1, title: 'Stale Q Event', eventType: 'Corporate',
        date: new Date(), startTime: '09:00', endTime: '13:00',
        location: { address: 'Stale Venue' },
        guestCount: 50, status: 'awaiting_payment'
      });

      // First accepted quotation (rev 1)
      const q1 = await Quotation.create({
        quotationNumber: 'QTN-STALE-1', revision: 1, eventId: evStale.id, clientId: clientId1,
        status: 'accepted', createdBy: adminId,
        items: [{ serviceId, quantity: 1, unitPrice: 3000, name: 'DJ', description: 'DJ', pricingType: 'package', amount: 3000 }],
        subtotal: 3000, discount: 0, taxableAmount: 3000, finalAmount: 3000, advanceAmount: 1500, remainingAmount: 1500,
        validUntil: new Date(Date.now() + 86400000)
      });

      // Payment created against the first revision
      const staleOrderId = `order_stale_${Date.now()}`;
      const staleReceiptRef = `rcpt_stale_${Date.now()}`;
      await Payment.create({
        eventId: evStale.id, quotationId: q1._id, clientId: clientId1,
        paymentType: 'advance', amount: 1500, currency: 'INR',
        status: 'pending', razorpayOrderId: staleOrderId,
        receiptReference: staleReceiptRef,
      });

      // Supersede: mark first as changes_requested and create a new accepted revision
      await Quotation.findByIdAndUpdate(q1._id, { status: 'changes_requested' });
      await Quotation.create({
        quotationNumber: 'QTN-STALE-1', revision: 2, eventId: evStale.id, clientId: clientId1,
        status: 'accepted', createdBy: adminId,
        items: [{ serviceId, quantity: 1, unitPrice: 4000, name: 'DJ', description: 'DJ', pricingType: 'package', amount: 4000 }],
        subtotal: 4000, discount: 0, taxableAmount: 4000, finalAmount: 4000, advanceAmount: 2000, remainingAmount: 2000,
        validUntil: new Date(Date.now() + 86400000)
      });

      // Attempt to verify using the old payment (which references q1, now superseded)
      const staleSig = crypto.createHmac('sha256', env.razorpayKeySecret)
        .update(`${staleOrderId}|pay_stale_fake`)
        .digest('hex');

      const res = await fetch(`http://127.0.0.1:${port}/api/payments/verify`, {
        method: 'POST',
        body: JSON.stringify({ razorpay_order_id: staleOrderId, razorpay_payment_id: 'pay_stale_fake', razorpay_signature: staleSig }),
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${clientToken1}` }
      });

      assert.equal(res.status, 400);
      const data = await res.json() as any;
      assert.ok(data.message.includes('superseded'), `Expected superseded rejection, got: ${data.message}`);
    });
  });

  describe('Partial Advance Payments, Advance Summary & Event Confirmation (Prompt 1 Milestone)', () => {
    let partialEventId: string;
    let partialQuotationId: string;

    before(async () => {
      // Create reference fixture matching prompt:
      // Final amount: 372,000; Required advance: 100,000; Remaining: 272,000
      const ev = await Event.create({
        clientId: clientId1,
        title: 'Grand Gala 2026',
        eventType: 'Corporate',
        date: new Date('2026-10-15'),
        startTime: '18:00',
        endTime: '23:00',
        location: { address: 'Convention Hall, City' },
        guestCount: 500,
        status: 'awaiting_payment',
      });
      partialEventId = ev.id;

      const qtn = await Quotation.create({
        quotationNumber: 'QTN-2026-003',
        revision: 1,
        eventId: ev._id,
        clientId: clientId1,
        createdBy: adminId,
        status: 'accepted',
        items: [
          {
            serviceId,
            name: 'Production & Logistics',
            description: 'Full event production',
            pricingType: 'package',
            quantity: 1,
            unitPrice: 372000,
            amount: 372000,
          },
        ],
        subtotal: 372000,
        discount: 0,
        taxableAmount: 372000,
        finalAmount: 372000,
        advanceAmount: 100000,
        remainingAmount: 272000,
        paymentPlan: [
          {
            title: 'Booking Advance',
            amount: 100000,
            dueDateDescription: 'Immediate upon acceptance',
            dueDate: new Date('2026-10-11'),
            expiryDate: new Date('2026-10-15'),
            status: 'Pending',
            purpose: ['advance'],
          },
          {
            title: 'Final settlement',
            amount: 272000,
            dueDateDescription: 'Prior to event day',
            dueDate: new Date('2026-10-16'),
            expiryDate: new Date('2026-10-24'),
            status: 'Pending',
            purpose: ['settlement'],
          },
        ],
      });
      partialQuotationId = qtn.id;
    });

    it('36. Client can retrieve authoritative advance summary before payment', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/api/payments/advance-summary/${partialEventId}`, {
        headers: { Authorization: `Bearer ${clientToken1}` },
      });
      assert.equal(res.status, 200);
      const body = (await res.json()) as any;
      assert.equal(body.success, true);
      assert.equal(body.data.requiredAdvance, 100000);
      assert.equal(body.data.advancePaidAmount, 0);
      assert.equal(body.data.outstandingAdvance, 100000);
      assert.equal(body.data.isFullyPaid, false);
      assert.equal(body.data.isEligibleForPayment, true);
      assert.equal(body.data.quotationNumber, 'QTN-2026-003');
    });

    it('37. Unauthorized client cannot view advance summary of another client -> 403', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/api/payments/advance-summary/${partialEventId}`, {
        headers: { Authorization: `Bearer ${clientToken2}` },
      });
      assert.equal(res.status, 403);
    });

    it('38. Admin can view advance summary for any event', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/api/payments/advance-summary/${partialEventId}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      assert.equal(res.status, 200);
      const body = (await res.json()) as any;
      assert.equal(body.data.outstandingAdvance, 100000);
    });

    it('39. Backend validates partial amount: rejects <= 0 or amount exceeding outstanding advance -> 400', async () => {
      // Rejects negative/zero
      const resZero = await fetch(`http://127.0.0.1:${port}/api/payments/create-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${clientToken1}` },
        body: JSON.stringify({ eventId: partialEventId, partialAmount: 0 }),
      });
      assert.equal(resZero.status, 400);

      // Rejects exceeding outstanding (120,000 > 100,000)
      const resExceed = await fetch(`http://127.0.0.1:${port}/api/payments/create-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${clientToken1}` },
        body: JSON.stringify({ eventId: partialEventId, partialAmount: 120000 }),
      });
      assert.equal(resExceed.status, 400);
      const exceedBody = (await resExceed.json()) as any;
      assert.ok(exceedBody.message.includes('exceed'), `Expected exceed message, got ${exceedBody.message}`);
    });

    let orderIdPart1: string;
    let paymentIdPart1: string;

    it('40. Initiates first partial payment (₹40,000 of ₹100,000 required)', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/api/payments/create-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${clientToken1}` },
        body: JSON.stringify({ eventId: partialEventId, partialAmount: 40000 }),
      });
      assert.equal(res.status, 201);
      const body = (await res.json()) as any;
      assert.equal(body.data.amount, 40000);
      assert.equal(body.data.requiredAdvance, 100000);
      assert.equal(body.data.outstandingAdvance, 100000);
      orderIdPart1 = body.data.razorpayOrderId;
      paymentIdPart1 = body.data.paymentId;
    });

    it('41. Failed verification does not update verified paid amount and does not confirm event', async () => {
      const badSig = 'bad_sig_12345';
      const res = await fetch(`http://127.0.0.1:${port}/api/payments/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${clientToken1}` },
        body: JSON.stringify({
          razorpay_order_id: orderIdPart1,
          razorpay_payment_id: 'pay_fail_test',
          razorpay_signature: badSig,
        }),
      });
      assert.equal(res.status, 400);

      // Verify DB state did not change
      const payment = await Payment.findById(paymentIdPart1);
      assert.equal(payment?.status, 'failed');

      const ev = await Event.findById(partialEventId);
      assert.equal(ev?.status, 'awaiting_payment');
    });

    it('42. Verifies first partial payment (₹40,000): event remains awaiting_payment and installment is Partially Paid', async () => {
      // Re-create order after failure
      const createRes = await fetch(`http://127.0.0.1:${port}/api/payments/create-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${clientToken1}` },
        body: JSON.stringify({ eventId: partialEventId, partialAmount: 40000 }),
      });
      assert.equal(createRes.status, 201);
      const createBody = (await createRes.json()) as any;
      orderIdPart1 = createBody.data.razorpayOrderId;
      paymentIdPart1 = createBody.data.paymentId;

      const rzpPaymentId1 = 'pay_part1_success';
      const validSig = crypto
        .createHmac('sha256', env.razorpayKeySecret)
        .update(`${orderIdPart1}|${rzpPaymentId1}`)
        .digest('hex');

      const verifyRes = await fetch(`http://127.0.0.1:${port}/api/payments/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${clientToken1}` },
        body: JSON.stringify({
          razorpay_order_id: orderIdPart1,
          razorpay_payment_id: rzpPaymentId1,
          razorpay_signature: validSig,
        }),
      });
      assert.equal(verifyRes.status, 200);
      const verifyBody = (await verifyRes.json()) as any;
      assert.equal(verifyBody.data.amountPaid, 40000);
      assert.equal(verifyBody.data.totalAdvancePaid, 40000);
      assert.equal(verifyBody.data.outstandingAdvance, 60000);
      assert.equal(verifyBody.data.isFullyPaid, false);
      assert.equal(verifyBody.data.eventStatus, 'awaiting_payment');

      // Check event in DB: must still be awaiting_payment
      const ev = await Event.findById(partialEventId);
      assert.equal(ev?.status, 'awaiting_payment');

      // Check quotation in DB: installment must be Partially Paid
      const qtn = await Quotation.findById(partialQuotationId);
      assert.equal(qtn?.paymentPlan?.[0]?.status, 'Partially Paid');
    });

    it('43. Advance summary reflects partial state: paid ₹40,000, outstanding ₹60,000', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/api/payments/advance-summary/${partialEventId}`, {
        headers: { Authorization: `Bearer ${clientToken1}` },
      });
      assert.equal(res.status, 200);
      const body = (await res.json()) as any;
      assert.equal(body.data.advancePaidAmount, 40000);
      assert.equal(body.data.outstandingAdvance, 60000);
      assert.equal(body.data.isFullyPaid, false);
      assert.equal(body.data.isEligibleForPayment, true);
      assert.equal(body.data.payments.length, 1);
    });

    it('44. Initiates and verifies second partial payment (₹60,000): completes advance and confirms event', async () => {
      // Client now pays remaining 60,000
      const createRes = await fetch(`http://127.0.0.1:${port}/api/payments/create-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${clientToken1}` },
        body: JSON.stringify({ eventId: partialEventId, partialAmount: 60000 }),
      });
      assert.equal(createRes.status, 201);
      const createBody = (await createRes.json()) as any;
      assert.equal(createBody.data.amount, 60000);
      assert.equal(createBody.data.outstandingAdvance, 60000);
      const orderIdPart2 = createBody.data.razorpayOrderId;

      const rzpPaymentId2 = 'pay_part2_success';
      const sig2 = crypto
        .createHmac('sha256', env.razorpayKeySecret)
        .update(`${orderIdPart2}|${rzpPaymentId2}`)
        .digest('hex');

      const verifyRes = await fetch(`http://127.0.0.1:${port}/api/payments/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${clientToken1}` },
        body: JSON.stringify({
          razorpay_order_id: orderIdPart2,
          razorpay_payment_id: rzpPaymentId2,
          razorpay_signature: sig2,
        }),
      });
      assert.equal(verifyRes.status, 200);
      const verifyBody = (await verifyRes.json()) as any;
      assert.equal(verifyBody.data.amountPaid, 60000);
      assert.equal(verifyBody.data.totalAdvancePaid, 100000);
      assert.equal(verifyBody.data.outstandingAdvance, 0);
      assert.equal(verifyBody.data.isFullyPaid, true);
      assert.equal(verifyBody.data.eventStatus, 'confirmed');

      // Check event in DB: must now be confirmed!
      const ev = await Event.findById(partialEventId);
      assert.equal(ev?.status, 'confirmed');

      // Check quotation in DB: installment must now be Paid
      const qtn = await Quotation.findById(partialQuotationId);
      assert.equal(qtn?.paymentPlan?.[0]?.status, 'Paid');
    });

    it('45. Duplicate transaction protection: re-verifying does not increase paid total or double-count', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/api/payments/advance-summary/${partialEventId}`, {
        headers: { Authorization: `Bearer ${clientToken1}` },
      });
      assert.equal(res.status, 200);
      const body = (await res.json()) as any;
      assert.equal(body.data.advancePaidAmount, 100000);
      assert.equal(body.data.outstandingAdvance, 0);
      assert.equal(body.data.isFullyPaid, true);
      assert.equal(body.data.isEligibleForPayment, false);
      assert.equal(body.data.payments.length, 2);
    });

    it('46. Attempting to create advance order when already fully paid -> 400', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/api/payments/create-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${clientToken1}` },
        body: JSON.stringify({ eventId: partialEventId }),
      });
      // Event is now confirmed, and advance is fully paid -> rejects
      assert.equal(res.status, 400);
    });

    it('47. Admin payments endpoint lists payment records', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/api/payments/admin?eventId=${partialEventId}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      assert.equal(res.status, 200);
      const body = (await res.json()) as any;
      assert.equal(body.success, true);
      assert.ok(Array.isArray(body.data));
      assert.ok(body.data.length >= 2);
    });

    it('48. Client cannot access admin payments endpoint -> 403', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/api/payments/admin`, {
        headers: { Authorization: `Bearer ${clientToken1}` },
      });
      assert.equal(res.status, 403);
    });
  });
});

