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
import { WebhookReceipt } from '../src/modules/payments/model/webhook-receipt.model.js';
import { PaymentReminderLog } from '../src/modules/payments/model/payment-reminder-log.model.js';
import { paymentReminderService, PaymentReminderService } from '../src/modules/payments/service/payment-reminder.service.js';
import { reminderSchedulerService } from '../src/modules/payments/service/reminder-scheduler.service.js';
import { paymentReminderQueueService } from '../src/modules/payments/queues/payment-reminder.queue.js';
import { emailService } from '../src/modules/email/service/email.service.js';
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
  let partialEventId: string;
  let partialQuotationId: string;

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
    await WebhookReceipt.deleteMany({});
    await PaymentReminderLog.deleteMany({});

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
    await WebhookReceipt.deleteMany({});
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
            expiryDate: new Date(Date.now() + 86400000 * 7),
            status: 'Pending',
            purpose: ['advance'],
          },
          {
            title: 'Final settlement',
            amount: 272000,
            dueDateDescription: 'Prior to event day',
            dueDate: new Date('2026-10-16'),
            expiryDate: new Date(Date.now() + 86400000 * 20),
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

  describe('Payment Milestone 2: Installments, Expiry, Admin Renewal & History', () => {
    let unconfirmedEventId: string;
    let unconfirmedQuotationId: string;
    let expiredAdvanceEventId: string;
    let expiredAdvanceQuotationId: string;

    before(async () => {
      // Event with unconfirmed status / unpaid advance to test prerequisite
      const evUnconf = await Event.create({
        clientId: clientId1,
        title: 'Unconfirmed Event',
        eventType: 'Corporate',
        date: new Date(Date.now() + 86400000 * 30),
        startTime: '10:00',
        endTime: '14:00',
        location: { address: 'Unconf Hall' },
        guestCount: 50,
        status: 'awaiting_payment',
      });
      unconfirmedEventId = evUnconf.id;

      const qtnUnconf = await Quotation.create({
        quotationNumber: 'QTN-UNCONF-1',
        revision: 1,
        eventId: unconfirmedEventId,
        clientId: clientId1,
        status: 'accepted',
        createdBy: adminId,
        items: [{ serviceId, quantity: 1, unitPrice: 20000, name: 'DJ', description: 'DJ Package', pricingType: 'package', amount: 20000 }],
        subtotal: 20000,
        discount: 0,
        taxableAmount: 20000,
        finalAmount: 20000,
        advanceAmount: 5000,
        remainingAmount: 15000,
        validUntil: new Date(Date.now() + 86400000),
        paymentPlan: [
          {
            title: 'Advance',
            amount: 5000,
            dueDate: new Date(Date.now() + 86400000 * 5),
            expiryDate: new Date(Date.now() + 86400000 * 10),
            status: 'Pending',
          },
          {
            title: 'Balance',
            amount: 15000,
            dueDate: new Date(Date.now() + 86400000 * 15),
            expiryDate: new Date(Date.now() + 86400000 * 20),
            status: 'Pending',
          },
        ],
      });
      unconfirmedQuotationId = qtnUnconf.id;

      // Event with expired advance link
      const yesterday = new Date(Date.now() - 86400000);
      const evExpAdv = await Event.create({
        clientId: clientId1,
        title: 'Expired Advance Event',
        eventType: 'Corporate',
        date: new Date(Date.now() + 86400000 * 30),
        startTime: '10:00',
        endTime: '14:00',
        location: { address: 'Exp Hall' },
        guestCount: 50,
        status: 'awaiting_payment',
      });
      expiredAdvanceEventId = evExpAdv.id;

      const qtnExpAdv = await Quotation.create({
        quotationNumber: 'QTN-EXP-ADV-1',
        revision: 1,
        eventId: expiredAdvanceEventId,
        clientId: clientId1,
        status: 'accepted',
        createdBy: adminId,
        items: [{ serviceId, quantity: 1, unitPrice: 10000, name: 'DJ', description: 'DJ Package', pricingType: 'package', amount: 10000 }],
        subtotal: 10000,
        discount: 0,
        taxableAmount: 10000,
        finalAmount: 10000,
        advanceAmount: 3000,
        remainingAmount: 7000,
        validUntil: new Date(Date.now() + 86400000),
        paymentPlan: [
          {
            title: 'Booking Advance',
            amount: 3000,
            dueDate: new Date(Date.now() - 86400000 * 2),
            expiryDate: yesterday,
            status: 'Pending',
          },
          {
            title: 'Final',
            amount: 7000,
            dueDate: new Date(Date.now() + 86400000 * 15),
            expiryDate: new Date(Date.now() + 86400000 * 20),
            status: 'Pending',
          },
        ],
      });
      expiredAdvanceQuotationId = qtnExpAdv.id;
    });

    it('49. Payment schedule endpoint: Client can retrieve authoritative schedule for own event', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/api/payments/schedule/${partialEventId}`, {
        headers: { Authorization: `Bearer ${clientToken1}` },
      });
      assert.equal(res.status, 200);
      const body = (await res.json()) as any;
      assert.equal(body.success, true);
      assert.equal(body.data.quotationNumber, 'QTN-2026-003');
      assert.equal(body.data.finalAmount, 372000);
      assert.equal(body.data.requiredAdvance, 100000);
      assert.equal(body.data.advancePaidAmount, 100000);
      assert.equal(body.data.isAdvanceSettled, true);
      assert.equal(body.data.totalPaidAmount, 100000);
      assert.equal(body.data.totalOutstandingAmount, 272000);
      assert.equal(body.data.installments.length, 2);

      // Advance installment check
      const advInst = body.data.installments[0];
      assert.equal(advInst.isAdvance, true);
      assert.equal(advInst.status, 'Paid');
      assert.equal(advInst.paidAmount, 100000);
      assert.equal(advInst.outstandingAmount, 0);

      // Remaining installment check
      const remInst = body.data.installments[1];
      assert.equal(remInst.isAdvance, false);
      assert.equal(remInst.title, 'Final settlement');
      assert.equal(remInst.scheduledAmount, 272000);
      assert.equal(remInst.paidAmount, 0);
      assert.equal(remInst.outstandingAmount, 272000);
      assert.equal(remInst.isEligibleForPayment, true);
    });

    it('50. Payment schedule access control: Unauthorized client cannot view schedule -> 403', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/api/payments/schedule/${partialEventId}`, {
        headers: { Authorization: `Bearer ${clientToken2}` },
      });
      assert.equal(res.status, 403);
    });

    it('51. Payment schedule access control: Admin can view schedule for any event', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/api/payments/schedule/${partialEventId}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      assert.equal(res.status, 200);
      const body = (await res.json()) as any;
      assert.equal(body.success, true);
    });

    it('52. Advance prerequisite: Cannot create installment order when advance is not fully settled -> 400', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/api/payments/create-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${clientToken1}` },
        body: JSON.stringify({ eventId: unconfirmedEventId, installmentIndex: 1 }),
      });
      assert.equal(res.status, 400);
      const body = (await res.json()) as any;
      assert.ok(body.message.includes('Initial advance payment must be fully paid'));
    });

    it('53. Installment validation: Rejects partial amount <= 0 or exceeding outstanding balance -> 400', async () => {
      // Exceeds scheduled 272,000
      const resExceed = await fetch(`http://127.0.0.1:${port}/api/payments/create-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${clientToken1}` },
        body: JSON.stringify({ eventId: partialEventId, installmentIndex: 1, partialAmount: 300000 }),
      });
      assert.equal(resExceed.status, 400);
      const exceedBody = (await resExceed.json()) as any;
      assert.ok(exceedBody.message.includes('exceed'));

      // Negative or zero
      const resZero = await fetch(`http://127.0.0.1:${port}/api/payments/create-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${clientToken1}` },
        body: JSON.stringify({ eventId: partialEventId, installmentIndex: 1, partialAmount: 0 }),
      });
      assert.equal(resZero.status, 400);
    });

    let instOrderId1: string;
    let instPaymentId1: string;

    it('54. Creates order for partial installment payment (₹200,000 of ₹272,000 scheduled)', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/api/payments/create-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${clientToken1}` },
        body: JSON.stringify({ eventId: partialEventId, installmentIndex: 1, partialAmount: 200000 }),
      });
      assert.equal(res.status, 201);
      const body = (await res.json()) as any;
      assert.equal(body.data.amount, 200000);
      assert.equal(body.data.scheduledAmount, 272000);
      assert.equal(body.data.outstandingAmount, 272000);
      assert.equal(body.data.installmentIndex, 1);
      instOrderId1 = body.data.razorpayOrderId;
      instPaymentId1 = body.data.paymentId;

      // Check payment model record
      const payRecord = await Payment.findById(instPaymentId1);
      assert.ok(payRecord);
      assert.equal(payRecord.paymentType, 'installment');
      assert.equal(payRecord.installmentIndex, 1);
      assert.equal(payRecord.status, 'pending');
    });

    it('55. Verifies partial installment payment (₹200,000): installment status is Partially Paid, event remains confirmed', async () => {
      const rzpPayId = 'pay_inst1_partial_200k';
      const sig = crypto
        .createHmac('sha256', env.razorpayKeySecret)
        .update(`${instOrderId1}|${rzpPayId}`)
        .digest('hex');

      const res = await fetch(`http://127.0.0.1:${port}/api/payments/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${clientToken1}` },
        body: JSON.stringify({
          razorpay_order_id: instOrderId1,
          razorpay_payment_id: rzpPayId,
          razorpay_signature: sig,
        }),
      });
      assert.equal(res.status, 200);
      const body = (await res.json()) as any;
      assert.equal(body.data.amountPaid, 200000);
      assert.equal(body.data.installmentIndex, 1);
      assert.equal(body.data.installmentStatus, 'Partially Paid');
      assert.equal(body.data.outstandingAmount, 72000);
      assert.equal(body.data.isFullyPaid, false);
      assert.equal(body.data.eventStatus, 'confirmed');

      // Check database state
      const ev = await Event.findById(partialEventId);
      assert.equal(ev?.status, 'confirmed');

      const qtn = await Quotation.findById(partialQuotationId);
      assert.equal(qtn?.paymentPlan?.[1]?.status, 'Partially Paid');

      // Schedule summary check
      const schedRes = await fetch(`http://127.0.0.1:${port}/api/payments/schedule/${partialEventId}`, {
        headers: { Authorization: `Bearer ${clientToken1}` },
      });
      const schedBody = (await schedRes.json()) as any;
      const inst1 = schedBody.data.installments[1];
      assert.equal(inst1.paidAmount, 200000);
      assert.equal(inst1.outstandingAmount, 72000);
      assert.equal(inst1.status, 'Partially Paid');
      assert.equal(inst1.isEligibleForPayment, true);
    });

    it('56. Backend enforces payment-link expiry: rejects attempt with exact required message', async () => {
      // Set installment 1 expiry date to yesterday
      const yesterday = new Date(Date.now() - 86400000);
      await Quotation.updateOne(
        { _id: partialQuotationId },
        { $set: { 'paymentPlan.1.expiryDate': yesterday } }
      );

      const res = await fetch(`http://127.0.0.1:${port}/api/payments/create-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${clientToken1}` },
        body: JSON.stringify({ eventId: partialEventId, installmentIndex: 1 }),
      });
      assert.equal(res.status, 400);
      const body = (await res.json()) as any;
      assert.ok(
        body.message.startsWith('This payment link expired on ') &&
        body.message.endsWith('. Please contact the Admin for further assistance.'),
        `Expected exact expiry message pattern, got: ${body.message}`
      );

      // Financial balance and event state must remain intact
      const ev = await Event.findById(partialEventId);
      assert.equal(ev?.status, 'confirmed');
    });

    it('57. Expired advance link: rejects payment with exact message and does not alter event status', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/api/payments/create-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${clientToken1}` },
        body: JSON.stringify({ eventId: expiredAdvanceEventId }),
      });
      assert.equal(res.status, 400);
      const body = (await res.json()) as any;
      assert.ok(
        body.message.startsWith('This payment link expired on ') &&
        body.message.endsWith('. Please contact the Admin for further assistance.')
      );

      // Event must remain in awaiting_payment (no invented automatic cancellation)
      const ev = await Event.findById(expiredAdvanceEventId);
      assert.equal(ev?.status, 'awaiting_payment');
    });

    it('58. Admin renewal authorization: Non-admin users cannot renew payment link -> 403', async () => {
      // Client attempt
      const clientRes = await fetch(`http://127.0.0.1:${port}/api/payments/renew-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${clientToken1}` },
        body: JSON.stringify({ eventId: partialEventId, installmentIndex: 1, newExpiryDays: 7 }),
      });
      assert.equal(clientRes.status, 403);

      // Event Manager attempt
      const mgrRes = await fetch(`http://127.0.0.1:${port}/api/payments/renew-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${managerToken}` },
        body: JSON.stringify({ eventId: partialEventId, installmentIndex: 1, newExpiryDays: 7 }),
      });
      assert.equal(mgrRes.status, 403);
    });

    let renewedLinkUrl: string;

    it('59. Authorized Admin renews expired link: replacement amount is strictly the outstanding balance (₹72,000)', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/api/payments/renew-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({
          eventId: partialEventId,
          installmentIndex: 1,
          newExpiryDays: 7,
        }),
      });
      assert.equal(res.status, 200);
      const body = (await res.json()) as any;
      assert.equal(body.success, true);
      assert.equal(body.data.outstandingAmount, 72000, 'Renewal amount must strictly be outstanding balance ₹72,000, not ₹272,000');
      assert.equal(body.data.installmentIndex, 1);
      assert.ok(body.data.newExpiryDate);
      assert.ok(body.data.paymentLinkUrl);
      renewedLinkUrl = body.data.paymentLinkUrl;

      // Check quotation in database: expiryDate is updated, original dueDate is preserved
      const qtn = await Quotation.findById(partialQuotationId);
      const inst = qtn?.paymentPlan?.[1];
      assert.ok(inst);
      assert.ok(new Date(inst.expiryDate!).getTime() > Date.now());
      // Original due date: 16 October 2026 preserved
      assert.equal(new Date(inst.dueDate!).getUTCDate(), 16);
      assert.equal(new Date(inst.dueDate!).getUTCMonth(), 9); // Month index 9 is October
    });

    it('60. Duplicate renewal protection: cannot renew while a valid active link already exists -> 400', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/api/payments/renew-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({
          eventId: partialEventId,
          installmentIndex: 1,
          newExpiryDays: 7,
        }),
      });
      assert.equal(res.status, 400);
      const body = (await res.json()) as any;
      assert.ok(body.message.includes('already has an active, valid payment link'));
    });

    it('61. Preserves payment-link history and distinguishes active link from previous history', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/api/payments/schedule/${partialEventId}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      assert.equal(res.status, 200);
      const body = (await res.json()) as any;
      const inst1 = body.data.installments[1];
      assert.ok(inst1.activeLink);
      assert.equal(inst1.activeLink.linkStatus, 'active');
      assert.ok(Array.isArray(inst1.linkHistory));
      assert.ok(inst1.linkHistory.length >= 1);
    });

    it('62. Client completes remaining installment balance (₹72,000) using renewed link', async () => {
      const createRes = await fetch(`http://127.0.0.1:${port}/api/payments/create-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${clientToken1}` },
        body: JSON.stringify({ eventId: partialEventId, installmentIndex: 1, partialAmount: 72000 }),
      });
      assert.equal(createRes.status, 201);
      const createBody = (await createRes.json()) as any;
      assert.equal(createBody.data.amount, 72000);
      const orderIdPart3 = createBody.data.razorpayOrderId;

      const rzpPayId3 = 'pay_inst1_final_72k';
      const sig3 = crypto
        .createHmac('sha256', env.razorpayKeySecret)
        .update(`${orderIdPart3}|${rzpPayId3}`)
        .digest('hex');

      const verifyRes = await fetch(`http://127.0.0.1:${port}/api/payments/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${clientToken1}` },
        body: JSON.stringify({
          razorpay_order_id: orderIdPart3,
          razorpay_payment_id: rzpPayId3,
          razorpay_signature: sig3,
        }),
      });
      assert.equal(verifyRes.status, 200);
      const verifyBody = (await verifyRes.json()) as any;
      assert.equal(verifyBody.data.amountPaid, 72000);
      assert.equal(verifyBody.data.outstandingAmount, 0);
      assert.equal(verifyBody.data.isFullyPaid, true);
      assert.equal(verifyBody.data.installmentStatus, 'Paid');
      assert.equal(verifyBody.data.eventStatus, 'confirmed');

      // Database state verification
      const ev = await Event.findById(partialEventId);
      assert.equal(ev?.status, 'confirmed');

      const qtn = await Quotation.findById(partialQuotationId);
      assert.equal(qtn?.paymentPlan?.[1]?.status, 'Paid');
    });

    it('63. Schedule reflects fully settled contract: outstanding balance ₹0 and installment status Paid', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/api/payments/schedule/${partialEventId}`, {
        headers: { Authorization: `Bearer ${clientToken1}` },
      });
      assert.equal(res.status, 200);
      const body = (await res.json()) as any;
      assert.equal(body.data.totalPaidAmount, 372000);
      assert.equal(body.data.totalOutstandingAmount, 0);
      const inst1 = body.data.installments[1];
      assert.equal(inst1.status, 'Paid');
      assert.equal(inst1.paidAmount, 272000);
      assert.equal(inst1.outstandingAmount, 0);
      assert.equal(inst1.isEligibleForPayment, false);
    });

    it('64. Fully paid installment cannot be paid again -> 400', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/api/payments/create-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${clientToken1}` },
        body: JSON.stringify({ eventId: partialEventId, installmentIndex: 1 }),
      });
      assert.equal(res.status, 400);
      const body = (await res.json()) as any;
      assert.ok(body.message.includes('fully paid'));
    });

    it('65. Fully paid installment cannot be renewed by Admin -> 400', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/api/payments/renew-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ eventId: partialEventId, installmentIndex: 1, newExpiryDays: 7 }),
      });
      assert.equal(res.status, 400);
      const body = (await res.json()) as any;
      assert.ok(body.message.includes('already fully paid'));
    });

    it('66. Overdue installment status derived when past due date with outstanding balance', async () => {
      // Event with an overdue installment
      const pastDue = new Date(Date.now() - 86400000 * 5);
      const futureExpiry = new Date(Date.now() + 86400000 * 5);
      const evOverdue = await Event.create({
        clientId: clientId1,
        title: 'Overdue Installment Event',
        eventType: 'Corporate',
        date: new Date(Date.now() + 86400000 * 30),
        startTime: '10:00',
        endTime: '14:00',
        location: { address: 'Overdue Hall' },
        guestCount: 50,
        status: 'confirmed',
      });

      await Quotation.create({
        quotationNumber: 'QTN-OVERDUE-1',
        revision: 1,
        eventId: evOverdue.id,
        clientId: clientId1,
        status: 'accepted',
        createdBy: adminId,
        items: [{ serviceId, quantity: 1, unitPrice: 20000, name: 'DJ', description: 'DJ Package', pricingType: 'package', amount: 20000 }],
        subtotal: 20000,
        discount: 0,
        taxableAmount: 20000,
        finalAmount: 20000,
        advanceAmount: 5000,
        remainingAmount: 15000,
        validUntil: new Date(Date.now() + 86400000),
        paymentPlan: [
          {
            title: 'Advance',
            amount: 5000,
            dueDate: new Date(Date.now() - 86400000 * 10),
            expiryDate: futureExpiry,
            status: 'Paid',
          },
          {
            title: 'Installment 2',
            amount: 15000,
            dueDate: pastDue,
            expiryDate: futureExpiry,
            status: 'Pending',
          },
        ],
      });

      // Advance payment record to satisfy advance prerequisite
      await Payment.create({
        eventId: evOverdue.id,
        clientId: clientId1,
        quotationId: new mongoose.Types.ObjectId(),
        quotationRevision: 1,
        receiptReference: 'REC-TEST-OVERDUE',
        paymentType: 'advance',
        installmentIndex: 0,
        amount: 5000,
        currency: 'INR',
        razorpayOrderId: 'order_overdue_adv',
        razorpayPaymentId: 'pay_overdue_adv',
        status: 'paid',
        paymentMethod: 'razorpay',
      });

      const res = await fetch(`http://127.0.0.1:${port}/api/payments/schedule/${evOverdue.id}`, {
        headers: { Authorization: `Bearer ${clientToken1}` },
      });
      assert.equal(res.status, 200);
      const body = (await res.json()) as any;
      const overdueInst = body.data.installments[1];
      assert.equal(overdueInst.isOverdue, true);
      assert.equal(overdueInst.status, 'Overdue');
    });
  });

  describe('Payment Milestone 2 Extension: Full Payment, Excess Allocation & Validation', () => {
    const futureExpiry = new Date(Date.now() + 86400000 * 7);
    const futureDue1 = new Date(Date.now() + 86400000 * 3);
    const futureDue2 = new Date(Date.now() + 86400000 * 14);

    // Test A: Pay current advance (₹1,00,000)
    it('Test A: Pay current advance (₹1,00,000) -> Advance fully paid, event confirmed, no duplicate allocation', async () => {
      const evA = await Event.create({
        clientId: clientId1,
        title: 'Milestone 2 Extension Event A',
        eventType: 'Corporate',
        date: new Date(Date.now() + 86400000 * 20),
        startTime: '10:00',
        endTime: '16:00',
        location: { address: 'Hall A' },
        guestCount: 80,
        status: 'awaiting_payment',
      });

      const qtnA = await Quotation.create({
        quotationNumber: 'QTN-M2-EXT-A',
        revision: 1,
        eventId: evA.id,
        clientId: clientId1,
        status: 'accepted',
        createdBy: adminId,
        items: [{ serviceId, quantity: 1, unitPrice: 372000, name: 'DJ', description: 'Package', pricingType: 'package', amount: 372000 }],
        subtotal: 372000,
        discount: 0,
        taxableAmount: 372000,
        finalAmount: 372000,
        advanceAmount: 100000,
        remainingAmount: 272000,
        validUntil: new Date(Date.now() + 86400000),
        paymentPlan: [
          { title: 'Booking Advance', amount: 100000, dueDate: futureDue1, expiryDate: futureExpiry, status: 'Pending' },
          { title: 'Final Settlement', amount: 272000, dueDate: futureDue2, expiryDate: futureExpiry, status: 'Pending' },
        ],
      });

      // 1. Create order for advance (Option A)
      const resOrder = await fetch(`http://127.0.0.1:${port}/api/payments/create-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${clientToken1}` },
        body: JSON.stringify({ eventId: evA.id }),
      });
      assert.equal(resOrder.status, 201);
      const orderBody = (await resOrder.json()) as any;
      assert.equal(orderBody.data.amount, 100000);
      assert.equal(orderBody.data.requiredAdvance, 100000);

      // 2. Verify payment
      const pId = 'pay_ext_a_' + Date.now();
      const sig = crypto.createHmac('sha256', env.razorpayKeySecret).update(`${orderBody.data.razorpayOrderId}|${pId}`).digest('hex');

      const resVerify = await fetch(`http://127.0.0.1:${port}/api/payments/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${clientToken1}` },
        body: JSON.stringify({
          razorpay_order_id: orderBody.data.razorpayOrderId,
          razorpay_payment_id: pId,
          razorpay_signature: sig,
        }),
      });
      assert.equal(resVerify.status, 200);
      const verifyBody = (await resVerify.json()) as any;
      assert.equal(verifyBody.data.amountPaid, 100000);
      assert.equal(verifyBody.data.totalAdvancePaid, 100000);
      assert.equal(verifyBody.data.outstandingAdvance, 0);
      assert.equal(verifyBody.data.isFullyPaid, true);
      assert.equal(verifyBody.data.eventStatus, 'confirmed');

      // Verify DB state
      const evUpdated = await Event.findById(evA.id);
      assert.equal(evUpdated?.status, 'confirmed');

      const qtnUpdated = await Quotation.findById(qtnA.id);
      assert.equal(qtnUpdated?.paymentPlan?.[0]?.status, 'Paid');
      assert.equal(qtnUpdated?.paymentPlan?.[1]?.status, 'Pending');

      const payments = await Payment.find({ eventId: evA.id });
      assert.equal(payments.length, 1);
      assert.equal(payments[0].status, 'paid');
    });

    // Test B: Custom payment exceeding advance (₹1,50,000 paid)
    it('Test B: Custom payment exceeding advance (₹1,50,000) -> ₹100,000 to advance, ₹50,000 to final settlement, event confirmed, single provider transaction', async () => {
      const evB = await Event.create({
        clientId: clientId1,
        title: 'Milestone 2 Extension Event B',
        eventType: 'Wedding',
        date: new Date(Date.now() + 86400000 * 25),
        startTime: '11:00',
        endTime: '18:00',
        location: { address: 'Hall B' },
        guestCount: 120,
        status: 'awaiting_payment',
      });

      const qtnB = await Quotation.create({
        quotationNumber: 'QTN-M2-EXT-B',
        revision: 1,
        eventId: evB.id,
        clientId: clientId1,
        status: 'accepted',
        createdBy: adminId,
        items: [{ serviceId, quantity: 1, unitPrice: 372000, name: 'DJ', description: 'Package', pricingType: 'package', amount: 372000 }],
        subtotal: 372000,
        discount: 0,
        taxableAmount: 372000,
        finalAmount: 372000,
        advanceAmount: 100000,
        remainingAmount: 272000,
        validUntil: new Date(Date.now() + 86400000),
        paymentPlan: [
          { title: 'Booking Advance', amount: 100000, dueDate: futureDue1, expiryDate: futureExpiry, status: 'Pending' },
          { title: 'Final Settlement', amount: 272000, dueDate: futureDue2, expiryDate: futureExpiry, status: 'Pending' },
        ],
      });

      // 1. Create order for custom amount ₹1,50,000 with paymentOption: 'custom'
      const resOrder = await fetch(`http://127.0.0.1:${port}/api/payments/create-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${clientToken1}` },
        body: JSON.stringify({ eventId: evB.id, customAmount: 150000, paymentOption: 'custom' }),
      });
      assert.equal(resOrder.status, 201);
      const orderBody = (await resOrder.json()) as any;
      assert.equal(orderBody.data.amount, 150000);

      // Allocations should cover advance and spill into final settlement
      assert.ok(Array.isArray(orderBody.data.allocations));
      assert.equal(orderBody.data.allocations.length, 2);
      assert.equal(orderBody.data.allocations[0].installmentIndex, 0);
      assert.equal(orderBody.data.allocations[0].allocatedAmount, 100000);
      assert.equal(orderBody.data.allocations[1].installmentIndex, 1);
      assert.equal(orderBody.data.allocations[1].allocatedAmount, 50000);

      // 2. Verify payment
      const pId = 'pay_ext_b_' + Date.now();
      const sig = crypto.createHmac('sha256', env.razorpayKeySecret).update(`${orderBody.data.razorpayOrderId}|${pId}`).digest('hex');

      const resVerify = await fetch(`http://127.0.0.1:${port}/api/payments/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${clientToken1}` },
        body: JSON.stringify({
          razorpay_order_id: orderBody.data.razorpayOrderId,
          razorpay_payment_id: pId,
          razorpay_signature: sig,
        }),
      });
      assert.equal(resVerify.status, 200);
      const verifyBody = (await resVerify.json()) as any;
      assert.equal(verifyBody.data.amountPaid, 150000);
      assert.equal(verifyBody.data.totalAdvancePaid, 100000);
      assert.equal(verifyBody.data.outstandingAdvance, 0);
      assert.equal(verifyBody.data.eventStatus, 'confirmed');

      // 3. Inspect schedule balances
      const resSchedule = await fetch(`http://127.0.0.1:${port}/api/payments/schedule/${evB.id}`, {
        headers: { Authorization: `Bearer ${clientToken1}` },
      });
      assert.equal(resSchedule.status, 200);
      const scheduleBody = (await resSchedule.json()) as any;

      const inst0 = scheduleBody.data.installments[0];
      assert.equal(inst0.verifiedPaidAmount, 100000);
      assert.equal(inst0.outstandingAmount, 0);
      assert.equal(inst0.baseStatus, 'Paid');

      const inst1 = scheduleBody.data.installments[1];
      assert.equal(inst1.verifiedPaidAmount, 50000);
      assert.equal(inst1.outstandingAmount, 222000);
      assert.equal(inst1.baseStatus, 'Partially Paid');

      // Single provider transaction identity in DB
      const payments = await Payment.find({ eventId: evB.id });
      assert.equal(payments.length, 1);
      assert.equal(payments[0].amount, 150000);
      assert.equal(payments[0].allocations?.length, 2);
    });

    // Test C: Full quotation payment (₹3,72,000)
    it('Test C: Full quotation payment (₹3,72,000) -> Advance fully paid, final settlement fully paid, outstanding ₹0, event confirmed', async () => {
      const evC = await Event.create({
        clientId: clientId1,
        title: 'Milestone 2 Extension Event C',
        eventType: 'Corporate',
        date: new Date(Date.now() + 86400000 * 30),
        startTime: '09:00',
        endTime: '17:00',
        location: { address: 'Hall C' },
        guestCount: 150,
        status: 'awaiting_payment',
      });

      await Quotation.create({
        quotationNumber: 'QTN-M2-EXT-C',
        revision: 1,
        eventId: evC.id,
        clientId: clientId1,
        status: 'accepted',
        createdBy: adminId,
        items: [{ serviceId, quantity: 1, unitPrice: 372000, name: 'DJ', description: 'Package', pricingType: 'package', amount: 372000 }],
        subtotal: 372000,
        discount: 0,
        taxableAmount: 372000,
        finalAmount: 372000,
        advanceAmount: 100000,
        remainingAmount: 272000,
        validUntil: new Date(Date.now() + 86400000),
        paymentPlan: [
          { title: 'Booking Advance', amount: 100000, dueDate: futureDue1, expiryDate: futureExpiry, status: 'Pending' },
          { title: 'Final Settlement', amount: 272000, dueDate: futureDue2, expiryDate: futureExpiry, status: 'Pending' },
        ],
      });

      // 1. Order full balance
      const resOrder = await fetch(`http://127.0.0.1:${port}/api/payments/create-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${clientToken1}` },
        body: JSON.stringify({ eventId: evC.id, isFullPayment: true, paymentOption: 'full_balance' }),
      });
      assert.equal(resOrder.status, 201);
      const orderBody = (await resOrder.json()) as any;
      assert.equal(orderBody.data.amount, 372000);

      // 2. Verify payment
      const pId = 'pay_ext_c_' + Date.now();
      const sig = crypto.createHmac('sha256', env.razorpayKeySecret).update(`${orderBody.data.razorpayOrderId}|${pId}`).digest('hex');

      const resVerify = await fetch(`http://127.0.0.1:${port}/api/payments/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${clientToken1}` },
        body: JSON.stringify({
          razorpay_order_id: orderBody.data.razorpayOrderId,
          razorpay_payment_id: pId,
          razorpay_signature: sig,
        }),
      });
      assert.equal(resVerify.status, 200);
      const verifyBody = (await resVerify.json()) as any;
      assert.equal(verifyBody.data.amountPaid, 372000);
      assert.equal(verifyBody.data.totalPaidAmount, 372000);
      assert.equal(verifyBody.data.totalOutstandingAmount, 0);
      assert.equal(verifyBody.data.isQuotationFullyPaid, true);
      assert.equal(verifyBody.data.eventStatus, 'confirmed');

      // Schedule verification
      const resSchedule = await fetch(`http://127.0.0.1:${port}/api/payments/schedule/${evC.id}`, {
        headers: { Authorization: `Bearer ${clientToken1}` },
      });
      assert.equal(resSchedule.status, 200);
      const scheduleBody = (await resSchedule.json()) as any;
      assert.equal(scheduleBody.data.totalPaidAmount, 372000);
      assert.equal(scheduleBody.data.totalOutstandingAmount, 0);
      assert.equal(scheduleBody.data.isQuotationFullyPaid, true);
      assert.equal(scheduleBody.data.canPayFullBalance, false);
      assert.equal(scheduleBody.data.installments[0].baseStatus, 'Paid');
      assert.equal(scheduleBody.data.installments[1].baseStatus, 'Paid');
    });

    // Test D: Full remaining balance after a partial payment (₹40,000 paid, then ₹3,32,000 paid)
    it('Test D: Full remaining balance after a partial payment (₹40,000 paid, then ₹3,32,000 paid) -> ₹60,000 to advance, ₹2,72,000 to final, total verified ₹3,72,000', async () => {
      const evD = await Event.create({
        clientId: clientId1,
        title: 'Milestone 2 Extension Event D',
        eventType: 'Corporate',
        date: new Date(Date.now() + 86400000 * 35),
        startTime: '10:00',
        endTime: '15:00',
        location: { address: 'Hall D' },
        guestCount: 60,
        status: 'awaiting_payment',
      });

      const qtnD = await Quotation.create({
        quotationNumber: 'QTN-M2-EXT-D',
        revision: 1,
        eventId: evD.id,
        clientId: clientId1,
        status: 'accepted',
        createdBy: adminId,
        items: [{ serviceId, quantity: 1, unitPrice: 372000, name: 'DJ', description: 'Package', pricingType: 'package', amount: 372000 }],
        subtotal: 372000,
        discount: 0,
        taxableAmount: 372000,
        finalAmount: 372000,
        advanceAmount: 100000,
        remainingAmount: 272000,
        validUntil: new Date(Date.now() + 86400000),
        paymentPlan: [
          { title: 'Booking Advance', amount: 100000, dueDate: futureDue1, expiryDate: futureExpiry, status: 'Pending' },
          { title: 'Final Settlement', amount: 272000, dueDate: futureDue2, expiryDate: futureExpiry, status: 'Pending' },
        ],
      });

      // 1. Initial partial payment: ₹40,000
      const resP1 = await fetch(`http://127.0.0.1:${port}/api/payments/create-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${clientToken1}` },
        body: JSON.stringify({ eventId: evD.id, partialAmount: 40000 }),
      });
      assert.equal(resP1.status, 201);
      const b1 = (await resP1.json()) as any;

      const pId1 = 'pay_ext_d1_' + Date.now();
      const sig1 = crypto.createHmac('sha256', env.razorpayKeySecret).update(`${b1.data.razorpayOrderId}|${pId1}`).digest('hex');
      const resV1 = await fetch(`http://127.0.0.1:${port}/api/payments/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${clientToken1}` },
        body: JSON.stringify({
          razorpay_order_id: b1.data.razorpayOrderId,
          razorpay_payment_id: pId1,
          razorpay_signature: sig1,
        }),
      });
      assert.equal(resV1.status, 200);

      // Verify event is not yet confirmed
      const evAfterPart = await Event.findById(evD.id);
      assert.equal(evAfterPart?.status, 'awaiting_payment');

      // 2. Client chooses Pay Full Remaining Balance
      const resOrderFull = await fetch(`http://127.0.0.1:${port}/api/payments/create-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${clientToken1}` },
        body: JSON.stringify({ eventId: evD.id, isFullPayment: true, paymentOption: 'full_balance' }),
      });
      assert.equal(resOrderFull.status, 201);
      const bFull = (await resOrderFull.json()) as any;
      // Authoritative remaining balance: 372,000 - 40,000 = 332,000
      assert.equal(bFull.data.amount, 332000);

      // Check planned allocations
      assert.equal(bFull.data.allocations?.length, 2);
      assert.equal(bFull.data.allocations[0].installmentIndex, 0);
      assert.equal(bFull.data.allocations[0].allocatedAmount, 60000);
      assert.equal(bFull.data.allocations[1].installmentIndex, 1);
      assert.equal(bFull.data.allocations[1].allocatedAmount, 272000);

      // 3. Verify the full balance payment
      const pId2 = 'pay_ext_d2_' + Date.now();
      const sig2 = crypto.createHmac('sha256', env.razorpayKeySecret).update(`${bFull.data.razorpayOrderId}|${pId2}`).digest('hex');
      const resV2 = await fetch(`http://127.0.0.1:${port}/api/payments/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${clientToken1}` },
        body: JSON.stringify({
          razorpay_order_id: bFull.data.razorpayOrderId,
          razorpay_payment_id: pId2,
          razorpay_signature: sig2,
        }),
      });
      assert.equal(resV2.status, 200);
      const v2Body = (await resV2.json()) as any;
      assert.equal(v2Body.data.amountPaid, 332000);
      assert.equal(v2Body.data.totalPaidAmount, 372000);
      assert.equal(v2Body.data.totalOutstandingAmount, 0);
      assert.equal(v2Body.data.isQuotationFullyPaid, true);
      assert.equal(v2Body.data.eventStatus, 'confirmed');

      const evFinal = await Event.findById(evD.id);
      assert.equal(evFinal?.status, 'confirmed');
    });

    // Test E: Reject overpayment (Outstanding: ₹22,000, attempt: ₹30,000)
    it('Test E: Reject overpayment (Outstanding: ₹22,000, attempt: ₹30,000) -> 400 Bad Request with clear balance message', async () => {
      const evE = await Event.create({
        clientId: clientId1,
        title: 'Milestone 2 Extension Event E',
        eventType: 'Corporate',
        date: new Date(Date.now() + 86400000 * 40),
        startTime: '10:00',
        endTime: '15:00',
        location: { address: 'Hall E' },
        guestCount: 50,
        status: 'confirmed',
      });

      const qtnE = await Quotation.create({
        quotationNumber: 'QTN-M2-EXT-E',
        revision: 1,
        eventId: evE.id,
        clientId: clientId1,
        status: 'accepted',
        createdBy: adminId,
        items: [{ serviceId, quantity: 1, unitPrice: 372000, name: 'DJ', description: 'Package', pricingType: 'package', amount: 372000 }],
        subtotal: 372000,
        discount: 0,
        taxableAmount: 372000,
        finalAmount: 372000,
        advanceAmount: 100000,
        remainingAmount: 272000,
        validUntil: new Date(Date.now() + 86400000),
        paymentPlan: [
          { title: 'Booking Advance', amount: 100000, dueDate: futureDue1, expiryDate: futureExpiry, status: 'Paid' },
          { title: 'Final Settlement', amount: 272000, dueDate: futureDue2, expiryDate: futureExpiry, status: 'Partially Paid' },
        ],
      });

      // Existing verified payments: ₹100,000 advance + ₹250,000 towards final settlement = ₹350,000 total
      await Payment.create({
        eventId: evE.id,
        clientId: clientId1,
        quotationId: qtnE.id,
        quotationRevision: 1,
        receiptReference: 'REC-TEST-E1',
        paymentType: 'advance',
        installmentIndex: 0,
        amount: 100000,
        currency: 'INR',
        razorpayOrderId: 'order_e1',
        razorpayPaymentId: 'pay_e1',
        status: 'paid',
        paymentMethod: 'razorpay',
      });

      await Payment.create({
        eventId: evE.id,
        clientId: clientId1,
        quotationId: qtnE.id,
        quotationRevision: 1,
        receiptReference: 'REC-TEST-E2',
        paymentType: 'installment',
        installmentIndex: 1,
        amount: 250000,
        currency: 'INR',
        razorpayOrderId: 'order_e2',
        razorpayPaymentId: 'pay_e2',
        status: 'paid',
        paymentMethod: 'razorpay',
      });

      // Client attempts to pay ₹30,000 (when only ₹22,000 is outstanding)
      const res = await fetch(`http://127.0.0.1:${port}/api/payments/create-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${clientToken1}` },
        body: JSON.stringify({ eventId: evE.id, installmentIndex: 1, customAmount: 30000, paymentOption: 'custom' }),
      });
      assert.equal(res.status, 400);
      const body = (await res.json()) as any;
      assert.ok(
        body.message.includes('Payment amount cannot exceed the total outstanding balance of ₹22,000'),
        `Expected authoritative balance message, got: ${body.message}`
      );

      // Verify no new Payment record was created
      const payments = await Payment.find({ eventId: evE.id });
      assert.equal(payments.length, 2);
    });

    // Test F: Reject overpayment through a single transaction (Quotation: ₹3,72,000, attempt: ₹4,00,000)
    it('Test F: Reject overpayment through a single transaction (Quotation: ₹3,72,000, attempt: ₹4,00,000) -> 400 before order creation', async () => {
      const evF = await Event.create({
        clientId: clientId1,
        title: 'Milestone 2 Extension Event F',
        eventType: 'Corporate',
        date: new Date(Date.now() + 86400000 * 45),
        startTime: '10:00',
        endTime: '15:00',
        location: { address: 'Hall F' },
        guestCount: 50,
        status: 'awaiting_payment',
      });

      await Quotation.create({
        quotationNumber: 'QTN-M2-EXT-F',
        revision: 1,
        eventId: evF.id,
        clientId: clientId1,
        status: 'accepted',
        createdBy: adminId,
        items: [{ serviceId, quantity: 1, unitPrice: 372000, name: 'DJ', description: 'Package', pricingType: 'package', amount: 372000 }],
        subtotal: 372000,
        discount: 0,
        taxableAmount: 372000,
        finalAmount: 372000,
        advanceAmount: 100000,
        remainingAmount: 272000,
        validUntil: new Date(Date.now() + 86400000),
        paymentPlan: [
          { title: 'Booking Advance', amount: 100000, dueDate: futureDue1, expiryDate: futureExpiry, status: 'Pending' },
          { title: 'Final Settlement', amount: 272000, dueDate: futureDue2, expiryDate: futureExpiry, status: 'Pending' },
        ],
      });

      const res = await fetch(`http://127.0.0.1:${port}/api/payments/create-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${clientToken1}` },
        body: JSON.stringify({ eventId: evF.id, customAmount: 400000, paymentOption: 'custom' }),
      });
      assert.equal(res.status, 400);
      const body = (await res.json()) as any;
      assert.ok(
        body.message.includes('Payment amount cannot exceed the total outstanding balance of ₹3,72,000'),
        `Expected authoritative balance message, got: ${body.message}`
      );

      // No payment records exist
      const payments = await Payment.find({ eventId: evF.id });
      assert.equal(payments.length, 0);
    });

    // Test G: Invalid schedule (Plan totals ₹3,80,000 vs finalAmount ₹3,72,000 and ₹3,60,000 vs ₹3,72,000)
    it('Test G: Invalid schedule (Plan totals ₹3,80,000 vs quotation ₹3,72,000) -> Blocks full payment and cross-installment, identifies mismatch', async () => {
      const evG = await Event.create({
        clientId: clientId1,
        title: 'Milestone 2 Extension Event G',
        eventType: 'Corporate',
        date: new Date(Date.now() + 86400000 * 50),
        startTime: '10:00',
        endTime: '15:00',
        location: { address: 'Hall G' },
        guestCount: 50,
        status: 'awaiting_payment',
      });

      // Schedule sum = 100,000 + 280,000 = 380,000 != 372,000
      const qtnG = await Quotation.create({
        quotationNumber: 'QTN-M2-EXT-G',
        revision: 1,
        eventId: evG.id,
        clientId: clientId1,
        status: 'accepted',
        createdBy: adminId,
        items: [{ serviceId, quantity: 1, unitPrice: 372000, name: 'DJ', description: 'Package', pricingType: 'package', amount: 372000 }],
        subtotal: 372000,
        discount: 0,
        taxableAmount: 372000,
        finalAmount: 372000,
        advanceAmount: 100000,
        remainingAmount: 272000,
        validUntil: new Date(Date.now() + 86400000),
        paymentPlan: [
          { title: 'Booking Advance', amount: 100000, dueDate: futureDue1, expiryDate: futureExpiry, status: 'Pending' },
          { title: 'Final Settlement', amount: 280000, dueDate: futureDue2, expiryDate: futureExpiry, status: 'Pending' },
        ],
      });

      // 1. Full balance attempt blocked
      const resFull = await fetch(`http://127.0.0.1:${port}/api/payments/create-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${clientToken1}` },
        body: JSON.stringify({ eventId: evG.id, isFullPayment: true }),
      });
      assert.equal(resFull.status, 400);
      const fullBody = (await resFull.json()) as any;
      assert.ok(fullBody.message.includes('₹3,80,000'), `Expected 380,000 in error, got: ${fullBody.message}`);
      assert.ok(fullBody.message.includes('₹3,72,000'), `Expected 372,000 in error, got: ${fullBody.message}`);

      // 2. Excess cross-installment payment attempt blocked
      const resExcess = await fetch(`http://127.0.0.1:${port}/api/payments/create-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${clientToken1}` },
        body: JSON.stringify({ eventId: evG.id, customAmount: 150000, paymentOption: 'custom' }),
      });
      assert.equal(resExcess.status, 400);
      const excessBody = (await resExcess.json()) as any;
      assert.ok(excessBody.message.includes('₹3,80,000'), `Expected 380,000 in error, got: ${excessBody.message}`);

      // 3. Repeat with plan total below quotation final amount (₹3,60,000 vs ₹3,72,000)
      qtnG.paymentPlan![1].amount = 260000;
      await qtnG.save();

      const resBelow = await fetch(`http://127.0.0.1:${port}/api/payments/create-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${clientToken1}` },
        body: JSON.stringify({ eventId: evG.id, isFullPayment: true }),
      });
      assert.equal(resBelow.status, 400);
      const belowBody = (await resBelow.json()) as any;
      assert.ok(belowBody.message.includes('₹3,60,000'), `Expected 360,000 in error, got: ${belowBody.message}`);
    });

    // Test H: Duplicate verification idempotency
    it('Test H: Duplicate verification -> Payment and allocations not duplicated, balances not reduced twice', async () => {
      const evH = await Event.create({
        clientId: clientId1,
        title: 'Milestone 2 Extension Event H',
        eventType: 'Corporate',
        date: new Date(Date.now() + 86400000 * 55),
        startTime: '10:00',
        endTime: '15:00',
        location: { address: 'Hall H' },
        guestCount: 50,
        status: 'awaiting_payment',
      });

      await Quotation.create({
        quotationNumber: 'QTN-M2-EXT-H',
        revision: 1,
        eventId: evH.id,
        clientId: clientId1,
        status: 'accepted',
        createdBy: adminId,
        items: [{ serviceId, quantity: 1, unitPrice: 372000, name: 'DJ', description: 'Package', pricingType: 'package', amount: 372000 }],
        subtotal: 372000,
        discount: 0,
        taxableAmount: 372000,
        finalAmount: 372000,
        advanceAmount: 100000,
        remainingAmount: 272000,
        validUntil: new Date(Date.now() + 86400000),
        paymentPlan: [
          { title: 'Booking Advance', amount: 100000, dueDate: futureDue1, expiryDate: futureExpiry, status: 'Pending' },
          { title: 'Final Settlement', amount: 272000, dueDate: futureDue2, expiryDate: futureExpiry, status: 'Pending' },
        ],
      });

      const resOrder = await fetch(`http://127.0.0.1:${port}/api/payments/create-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${clientToken1}` },
        body: JSON.stringify({ eventId: evH.id, customAmount: 150000, paymentOption: 'custom' }),
      });
      assert.equal(resOrder.status, 201);
      const orderBody = (await resOrder.json()) as any;

      const pId = 'pay_ext_h_' + Date.now();
      const sig = crypto.createHmac('sha256', env.razorpayKeySecret).update(`${orderBody.data.razorpayOrderId}|${pId}`).digest('hex');

      // First verification
      const resV1 = await fetch(`http://127.0.0.1:${port}/api/payments/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${clientToken1}` },
        body: JSON.stringify({
          razorpay_order_id: orderBody.data.razorpayOrderId,
          razorpay_payment_id: pId,
          razorpay_signature: sig,
        }),
      });
      assert.equal(resV1.status, 200);

      // Duplicate verification call with exact same details
      const resV2 = await fetch(`http://127.0.0.1:${port}/api/payments/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${clientToken1}` },
        body: JSON.stringify({
          razorpay_order_id: orderBody.data.razorpayOrderId,
          razorpay_payment_id: pId,
          razorpay_signature: sig,
        }),
      });
      assert.equal(resV2.status, 200);
      const b2 = (await resV2.json()) as any;
      assert.equal(b2.data.status, 'paid');
      assert.equal(b2.data.amountPaid, 150000);

      // Verify DB count has exactly 1 Payment record
      const payments = await Payment.find({ eventId: evH.id });
      assert.equal(payments.length, 1);

      // Verify schedule total paid is exactly ₹1,50,000 (not ₹3,00,000)
      const resSchedule = await fetch(`http://127.0.0.1:${port}/api/payments/schedule/${evH.id}`, {
        headers: { Authorization: `Bearer ${clientToken1}` },
      });
      assert.equal(resSchedule.status, 200);
      const scheduleBody = (await resSchedule.json()) as any;
      assert.equal(scheduleBody.data.totalPaidAmount, 150000);
      assert.equal(scheduleBody.data.totalOutstandingAmount, 222000);
    });

    // Test I: Authorization - Client A cannot initiate or retrieve a payment for Client B's quotation or event
    it('Test I: Authorization -> Client A cannot initiate or retrieve a payment for Client B quotation or event', async () => {
      const evI = await Event.create({
        clientId: clientId2, // Belongs to Client 2
        title: 'Client 2 Event',
        eventType: 'Corporate',
        date: new Date(Date.now() + 86400000 * 60),
        startTime: '10:00',
        endTime: '15:00',
        location: { address: 'Hall I' },
        guestCount: 50,
        status: 'awaiting_payment',
      });

      await Quotation.create({
        quotationNumber: 'QTN-M2-EXT-I',
        revision: 1,
        eventId: evI.id,
        clientId: clientId2,
        status: 'accepted',
        createdBy: adminId,
        items: [{ serviceId, quantity: 1, unitPrice: 372000, name: 'DJ', description: 'Package', pricingType: 'package', amount: 372000 }],
        subtotal: 372000,
        discount: 0,
        taxableAmount: 372000,
        finalAmount: 372000,
        advanceAmount: 100000,
        remainingAmount: 272000,
        validUntil: new Date(Date.now() + 86400000),
        paymentPlan: [
          { title: 'Booking Advance', amount: 100000, dueDate: futureDue1, expiryDate: futureExpiry, status: 'Pending' },
          { title: 'Final Settlement', amount: 272000, dueDate: futureDue2, expiryDate: futureExpiry, status: 'Pending' },
        ],
      });

      // Client 1 tries to create order for Client 2's event
      const resCreate = await fetch(`http://127.0.0.1:${port}/api/payments/create-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${clientToken1}` },
        body: JSON.stringify({ eventId: evI.id }),
      });
      assert.equal(resCreate.status, 403);

      // Client 1 tries to preview allocation for Client 2's event
      const resPreview = await fetch(`http://127.0.0.1:${port}/api/payments/preview-allocation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${clientToken1}` },
        body: JSON.stringify({ eventId: evI.id, amount: 150000 }),
      });
      assert.equal(resPreview.status, 403);

      // Client 1 tries to access Client 2's schedule
      const resSched = await fetch(`http://127.0.0.1:${port}/api/payments/schedule/${evI.id}`, {
        headers: { Authorization: `Bearer ${clientToken1}` },
      });
      assert.equal(resSched.status, 403);
    });

    // Test J: Allocation Preview Endpoint
    it('Test J: Allocation Preview Endpoint -> Returns planned allocation and resulting balances before checkout', async () => {
      const evJ = await Event.create({
        clientId: clientId1,
        title: 'Milestone 2 Extension Event J',
        eventType: 'Corporate',
        date: new Date(Date.now() + 86400000 * 65),
        startTime: '10:00',
        endTime: '15:00',
        location: { address: 'Hall J' },
        guestCount: 50,
        status: 'awaiting_payment',
      });

      await Quotation.create({
        quotationNumber: 'QTN-M2-EXT-J',
        revision: 1,
        eventId: evJ.id,
        clientId: clientId1,
        status: 'accepted',
        createdBy: adminId,
        items: [{ serviceId, quantity: 1, unitPrice: 372000, name: 'DJ', description: 'Package', pricingType: 'package', amount: 372000 }],
        subtotal: 372000,
        discount: 0,
        taxableAmount: 372000,
        finalAmount: 372000,
        advanceAmount: 100000,
        remainingAmount: 272000,
        validUntil: new Date(Date.now() + 86400000),
        paymentPlan: [
          { title: 'Booking Advance', amount: 100000, dueDate: futureDue1, expiryDate: futureExpiry, status: 'Pending' },
          { title: 'Final Settlement', amount: 272000, dueDate: futureDue2, expiryDate: futureExpiry, status: 'Pending' },
        ],
      });

      const res = await fetch(`http://127.0.0.1:${port}/api/payments/preview-allocation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${clientToken1}` },
        body: JSON.stringify({ eventId: evJ.id, amount: 150000 }),
      });
      assert.equal(res.status, 200);
      const body = (await res.json()) as any;
      assert.equal(body.data.targetAmount, 150000);
      assert.equal(body.data.willConfirmEvent, true);
      assert.equal(body.data.allocations.length, 2);
      assert.equal(body.data.allocations[0].allocatedAmount, 100000);
      assert.equal(body.data.allocations[1].allocatedAmount, 50000);
      assert.equal(body.data.resultingBalances[0].resultingOutstanding, 0);
      assert.equal(body.data.resultingBalances[0].resultingStatus, 'Paid');
      assert.equal(body.data.resultingBalances[1].resultingOutstanding, 222000);
      assert.equal(body.data.resultingBalances[1].resultingStatus, 'Partially Paid');
    });

    it('Test K: Option A deducts previously paid advance amount (₹100,000 of ₹200,000 paid) and validates correctly', async () => {
      const evK = await Event.create({
        clientId: clientId1,
        title: 'Advance Deduction Event',
        eventType: 'Corporate',
        date: new Date('2026-11-20'),
        startTime: '10:00',
        endTime: '18:00',
        location: { address: 'Hall K' },
        guestCount: 200,
        status: 'awaiting_payment',
      });

      const qtnK = await Quotation.create({
        quotationNumber: 'QTN-M2-EXT-K',
        revision: 1,
        eventId: evK.id,
        clientId: clientId1,
        status: 'accepted',
        createdBy: adminId,
        items: [{ serviceId, quantity: 1, unitPrice: 400000, name: 'Corporate Package', description: 'Package', pricingType: 'package', amount: 400000 }],
        subtotal: 400000,
        discount: 0,
        taxableAmount: 400000,
        finalAmount: 400000,
        advanceAmount: 200000,
        remainingAmount: 200000,
        validUntil: new Date(Date.now() + 86400000),
        paymentPlan: [
          { title: 'Booking Advance', amount: 200000, dueDate: futureDue1, expiryDate: futureExpiry, status: 'Pending' },
          { title: 'Final Settlement', amount: 200000, dueDate: futureDue2, expiryDate: futureExpiry, status: 'Pending' },
        ],
      });

      // 1. Client pays first ₹100,000 towards the ₹200,000 advance
      const order1Res = await fetch(`http://127.0.0.1:${port}/api/payments/create-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${clientToken1}` },
        body: JSON.stringify({ eventId: evK.id, partialAmount: 100000 }),
      });
      assert.equal(order1Res.status, 201);
      const order1Data = (await order1Res.json()) as any;
      assert.equal(order1Data.data.amount, 100000);

      const rzpPayId1 = 'pay_k_part1';
      const sig1 = crypto.createHmac('sha256', env.razorpayKeySecret).update(`${order1Data.data.razorpayOrderId}|${rzpPayId1}`).digest('hex');
      const verify1Res = await fetch(`http://127.0.0.1:${port}/api/payments/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${clientToken1}` },
        body: JSON.stringify({
          razorpay_order_id: order1Data.data.razorpayOrderId,
          razorpay_payment_id: rzpPayId1,
          razorpay_signature: sig1,
        }),
      });
      assert.equal(verify1Res.status, 200);

      // Verify event is still awaiting_payment and advance has ₹100,000 remaining
      const evCheck1 = await Event.findById(evK.id);
      assert.equal(evCheck1?.status, 'awaiting_payment');

      // 2. Advance summary and schedule summary show deducted remaining balance
      const summaryRes = await fetch(`http://127.0.0.1:${port}/api/payments/advance-summary/${evK.id}`, {
        headers: { Authorization: `Bearer ${clientToken1}` },
      });
      assert.equal(summaryRes.status, 200);
      const summaryBody = (await summaryRes.json()) as any;
      assert.equal(summaryBody.data.requiredAdvance, 200000);
      assert.equal(summaryBody.data.advancePaidAmount, 100000);
      assert.equal(summaryBody.data.outstandingAdvance, 100000);
      assert.equal(summaryBody.data.installments[0].outstandingAmount, 100000);

      // 3. Preview for Option A (current_installment) reflects deducted amount (₹100,000)
      const prevRes = await fetch(`http://127.0.0.1:${port}/api/payments/preview-allocation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${clientToken1}` },
        body: JSON.stringify({ eventId: evK.id, paymentOption: 'current_installment' }),
      });
      assert.equal(prevRes.status, 200);
      const prevBody = (await prevRes.json()) as any;
      assert.equal(prevBody.data.targetAmount, 100000);

      // 4. Option A rejection validation: if caller tries to pay ₹150,000 under current_installment -> 400
      const exceedRes = await fetch(`http://127.0.0.1:${port}/api/payments/create-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${clientToken1}` },
        body: JSON.stringify({ eventId: evK.id, paymentOption: 'current_installment', customAmount: 150000 }),
      });
      assert.equal(exceedRes.status, 400);
      const exceedBody = (await exceedRes.json()) as any;
      assert.ok(exceedBody.message.includes('cannot exceed the outstanding advance balance of ₹1,00,000'));

      // 5. Option A creates order for deducted remaining advance (₹100,000)
      const order2Res = await fetch(`http://127.0.0.1:${port}/api/payments/create-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${clientToken1}` },
        body: JSON.stringify({ eventId: evK.id, paymentOption: 'current_installment' }),
      });
      assert.equal(order2Res.status, 201);
      const order2Data = (await order2Res.json()) as any;
      assert.equal(order2Data.data.amount, 100000);

      // 6. Completing the remaining ₹100,000 settles full advance and confirms event
      const rzpPayId2 = 'pay_k_part2';
      const sig2 = crypto.createHmac('sha256', env.razorpayKeySecret).update(`${order2Data.data.razorpayOrderId}|${rzpPayId2}`).digest('hex');
      const verify2Res = await fetch(`http://127.0.0.1:${port}/api/payments/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${clientToken1}` },
        body: JSON.stringify({
          razorpay_order_id: order2Data.data.razorpayOrderId,
          razorpay_payment_id: rzpPayId2,
          razorpay_signature: sig2,
        }),
      });
      assert.equal(verify2Res.status, 200);
      const verify2Data = (await verify2Res.json()) as any;
      assert.equal(verify2Data.data.totalAdvancePaid, 200000);
      assert.equal(verify2Data.data.outstandingAdvance, 0);
      assert.equal(verify2Data.data.eventStatus, 'confirmed');

      const evFinal = await Event.findById(evK.id);
      assert.equal(evFinal?.status, 'confirmed');
    });
  });

  describe('Razorpay Payment Link Synchronization (Webhook + Callback URL + Reconciliation)', () => {
    const makeWebhookSignature = (rawPayload: string, secret = env.razorpayWebhookSecret) => {
      return crypto.createHmac('sha256', secret).update(rawPayload).digest('hex');
    };

    it('A.1. Webhook rejects request when signature header is missing -> 400', async () => {
      const payload = JSON.stringify({ event: 'payment_link.paid' });
      const res = await fetch(`http://127.0.0.1:${port}/api/webhooks/razorpay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
      });
      assert.equal(res.status, 400);
      const data = (await res.json()) as any;
      assert.ok(data.message.includes('Missing Razorpay webhook signature header'));
    });

    it('A.2. Webhook rejects request when signature is invalid -> 400', async () => {
      const payload = JSON.stringify({ event: 'payment_link.paid' });
      const res = await fetch(`http://127.0.0.1:${port}/api/webhooks/razorpay`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-razorpay-signature': 'invalid_hex_signature_here',
        },
        body: payload,
      });
      assert.equal(res.status, 400);
      const data = (await res.json()) as any;
      assert.ok(data.message.includes('Invalid Razorpay webhook signature'));
    });

    it('A.3. Webhook rejects request when raw payload is altered after signing -> 400', async () => {
      const originalPayload = JSON.stringify({ event: 'payment_link.paid', amount: 5000 });
      const sig = makeWebhookSignature(originalPayload);
      const tamperedPayload = JSON.stringify({ event: 'payment_link.paid', amount: 999999 });

      const res = await fetch(`http://127.0.0.1:${port}/api/webhooks/razorpay`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-razorpay-signature': sig,
        },
        body: tamperedPayload,
      });
      assert.equal(res.status, 400);
      const data = (await res.json()) as any;
      assert.ok(data.message.includes('Invalid Razorpay webhook signature'));
    });

    it('A.4. Webhook returns 200 and ignores unsupported events', async () => {
      const payload = JSON.stringify({ event: 'order.paid', payload: {} });
      const sig = makeWebhookSignature(payload);

      const res = await fetch(`http://127.0.0.1:${port}/api/webhooks/razorpay`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-razorpay-signature': sig,
        },
        body: payload,
      });
      assert.equal(res.status, 200);
      const data = (await res.json()) as any;
      assert.equal(data.received, true);
      assert.equal(data.status, 'ignored');
    });

    it('B.1. Full advance payment via payment_link.paid confirms the event', async () => {
      const evAdv = await Event.create({
        clientId: clientId1,
        title: 'Full Advance Link Event',
        eventType: 'Corporate',
        date: new Date(Date.now() + 864000000),
        startTime: '10:00',
        endTime: '18:00',
        location: { address: 'Auditorium A' },
        guestCount: 150,
        status: 'awaiting_payment',
      });

      const qtnAdv = await Quotation.create({
        quotationNumber: 'QTN-SYNC-ADV1',
        revision: 1,
        eventId: evAdv.id,
        clientId: clientId1,
        status: 'accepted',
        createdBy: adminId,
        items: [{ serviceId, quantity: 1, unitPrice: 100000, name: 'DJ', description: 'DJ', pricingType: 'package', amount: 100000 }],
        subtotal: 100000,
        discount: 0,
        taxableAmount: 100000,
        finalAmount: 100000,
        advanceAmount: 40000,
        remainingAmount: 60000,
        paymentPlan: [
          { title: 'Advance', percentage: 40, amount: 40000, dueDate: new Date(), expiryDate: new Date(Date.now() + 86400000) },
          { title: 'Balance', percentage: 60, amount: 60000, dueDate: new Date(Date.now() + 864000000), expiryDate: new Date(Date.now() + 864000000) },
        ],
        validUntil: new Date(Date.now() + 86400000),
      });

      const linkPayment = await Payment.create({
        eventId: evAdv.id,
        quotationId: qtnAdv.id,
        clientId: clientId1,
        paymentType: 'advance',
        installmentIndex: 0,
        installmentTitle: 'Advance',
        amount: 40000,
        currency: 'INR',
        status: 'created',
        receiptReference: 'rcpt_sync_adv1',
        razorpayPaymentLinkId: 'plink_full_adv_100',
        linkStatus: 'active',
        paymentLinkUrl: 'https://rzp.io/i/plink_full_adv_100',
        allocations: [{ installmentIndex: 0, installmentTitle: 'Advance', allocatedAmount: 40000 }],
      });

      const webhookBody = JSON.stringify({
        event: 'payment_link.paid',
        payload: {
          payment_link: {
            entity: {
              id: 'plink_full_adv_100',
              status: 'paid',
              amount_paid: 4000000, // 40000 in paise
            },
          },
          payment: {
            entity: {
              id: 'pay_full_adv_100',
              amount: 4000000,
              currency: 'INR',
              status: 'captured',
            },
          },
        },
      });

      const sig = makeWebhookSignature(webhookBody);
      const res = await fetch(`http://127.0.0.1:${port}/api/webhooks/razorpay`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-razorpay-signature': sig,
          'x-razorpay-event-id': 'evt_full_adv_001',
        },
        body: webhookBody,
      });

      assert.equal(res.status, 200);
      const data = (await res.json()) as any;
      assert.equal(data.received, true);
      assert.equal(data.status, 'processed');

      const updatedPayment = await Payment.findById(linkPayment.id);
      assert.equal(updatedPayment?.status, 'paid');
      assert.equal(updatedPayment?.razorpayPaymentId, 'pay_full_adv_100');

      const updatedQuotation = await Quotation.findById(qtnAdv.id);
      assert.equal(updatedQuotation?.paymentPlan?.[0]?.status, 'Paid');

      const updatedEvent = await Event.findById(evAdv.id);
      assert.equal(updatedEvent?.status, 'confirmed');
    });

    it('B.2. Partial payment leaves event awaiting_payment; subsequent completion confirms it', async () => {
      const evPart = await Event.create({
        clientId: clientId1,
        title: 'Partial Advance Link Event',
        eventType: 'Wedding',
        date: new Date(Date.now() + 864000000),
        startTime: '10:00',
        endTime: '18:00',
        location: { address: 'Grand Ballroom' },
        guestCount: 200,
        status: 'awaiting_payment',
      });

      const qtnPart = await Quotation.create({
        quotationNumber: 'QTN-SYNC-PART1',
        revision: 1,
        eventId: evPart.id,
        clientId: clientId1,
        status: 'accepted',
        createdBy: adminId,
        items: [{ serviceId, quantity: 1, unitPrice: 100000, name: 'DJ', description: 'DJ', pricingType: 'package', amount: 100000 }],
        subtotal: 100000,
        discount: 0,
        taxableAmount: 100000,
        finalAmount: 100000,
        advanceAmount: 40000,
        remainingAmount: 60000,
        paymentPlan: [
          { title: 'Advance', percentage: 40, amount: 40000, dueDate: new Date(), expiryDate: new Date(Date.now() + 86400000) },
          { title: 'Final', percentage: 60, amount: 60000, dueDate: new Date(Date.now() + 864000000), expiryDate: new Date(Date.now() + 864000000) },
        ],
        validUntil: new Date(Date.now() + 86400000),
      });

      await Payment.create({
        eventId: evPart.id,
        quotationId: qtnPart.id,
        clientId: clientId1,
        paymentType: 'advance',
        installmentIndex: 0,
        installmentTitle: 'Advance',
        amount: 40000,
        currency: 'INR',
        status: 'created',
        receiptReference: 'rcpt_sync_part1',
        razorpayPaymentLinkId: 'plink_part_adv_200',
        linkStatus: 'active',
        paymentLinkUrl: 'https://rzp.io/i/plink_part_adv_200',
      });

      // 1. First partial payment of ₹15,000 via payment_link.partially_paid
      const partBody1 = JSON.stringify({
        event: 'payment_link.partially_paid',
        payload: {
          payment_link: {
            entity: {
              id: 'plink_part_adv_200',
              status: 'partially_paid',
              amount_paid: 1500000,
            },
          },
          payment: {
            entity: {
              id: 'pay_part_adv_001',
              amount: 1500000,
              currency: 'INR',
              status: 'captured',
            },
          },
        },
      });

      const sig1 = makeWebhookSignature(partBody1);
      const res1 = await fetch(`http://127.0.0.1:${port}/api/webhooks/razorpay`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-razorpay-signature': sig1,
          'x-razorpay-event-id': 'evt_part_adv_001',
        },
        body: partBody1,
      });

      assert.equal(res1.status, 200);

      const qtnAfterPart1 = await Quotation.findById(qtnPart.id);
      assert.equal(qtnAfterPart1?.paymentPlan?.[0]?.status, 'Partially Paid');

      const evAfterPart1 = await Event.findById(evPart.id);
      assert.equal(evAfterPart1?.status, 'awaiting_payment');

      // 2. Second payment of remaining ₹25,000 via payment_link.paid
      const partBody2 = JSON.stringify({
        event: 'payment_link.paid',
        payload: {
          payment_link: {
            entity: {
              id: 'plink_part_adv_200',
              status: 'paid',
              amount_paid: 4000000,
            },
          },
          payment: {
            entity: {
              id: 'pay_part_adv_002',
              amount: 2500000,
              currency: 'INR',
              status: 'captured',
            },
          },
        },
      });

      const sig2 = makeWebhookSignature(partBody2);
      const res2 = await fetch(`http://127.0.0.1:${port}/api/webhooks/razorpay`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-razorpay-signature': sig2,
          'x-razorpay-event-id': 'evt_part_adv_002',
        },
        body: partBody2,
      });

      assert.equal(res2.status, 200);

      const qtnAfterPart2 = await Quotation.findById(qtnPart.id);
      assert.equal(qtnAfterPart2?.paymentPlan?.[0]?.status, 'Paid');

      const evAfterPart2 = await Event.findById(evPart.id);
      assert.equal(evAfterPart2?.status, 'confirmed');
    });

    it('B.3. payment_link.expired updates local linkStatus without altering finances or event', async () => {
      const evExp = await Event.create({
        clientId: clientId1,
        title: 'Expiry Test Event',
        eventType: 'Corporate',
        date: new Date(Date.now() + 864000000),
        startTime: '10:00',
        endTime: '18:00',
        location: { address: 'Hall B' },
        guestCount: 50,
        status: 'awaiting_payment',
      });

      const qtnExp = await Quotation.create({
        quotationNumber: 'QTN-SYNC-EXP1',
        revision: 1,
        eventId: evExp.id,
        clientId: clientId1,
        status: 'accepted',
        createdBy: adminId,
        items: [{ serviceId, quantity: 1, unitPrice: 20000, name: 'DJ', description: 'DJ', pricingType: 'package', amount: 20000 }],
        subtotal: 20000,
        discount: 0,
        taxableAmount: 20000,
        finalAmount: 20000,
        advanceAmount: 10000,
        remainingAmount: 10000,
        paymentPlan: [
          { title: 'Advance', percentage: 50, amount: 10000, dueDate: new Date(), expiryDate: new Date(Date.now() + 86400000) },
          { title: 'Balance', percentage: 50, amount: 10000, dueDate: new Date(Date.now() + 864000000), expiryDate: new Date(Date.now() + 864000000) },
        ],
        validUntil: new Date(Date.now() + 86400000),
      });

      const linkExp = await Payment.create({
        eventId: evExp.id,
        quotationId: qtnExp.id,
        clientId: clientId1,
        paymentType: 'advance',
        installmentIndex: 0,
        installmentTitle: 'Advance',
        amount: 10000,
        currency: 'INR',
        status: 'created',
        receiptReference: 'rcpt_sync_exp1',
        razorpayPaymentLinkId: 'plink_expire_test_001',
        linkStatus: 'active',
      });

      const expBody = JSON.stringify({
        event: 'payment_link.expired',
        payload: {
          payment_link: {
            entity: {
              id: 'plink_expire_test_001',
              status: 'expired',
            },
          },
        },
      });

      const sig = makeWebhookSignature(expBody);
      const res = await fetch(`http://127.0.0.1:${port}/api/webhooks/razorpay`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-razorpay-signature': sig,
          'x-razorpay-event-id': 'evt_expire_001',
        },
        body: expBody,
      });

      assert.equal(res.status, 200);
      const data = (await res.json()) as any;
      assert.equal(data.status, 'expired_updated');

      const updatedExpPayment = await Payment.findById(linkExp.id);
      assert.equal(updatedExpPayment?.linkStatus, 'expired');
      assert.equal(updatedExpPayment?.status, 'created');

      const checkEv = await Event.findById(evExp.id);
      assert.equal(checkEv?.status, 'awaiting_payment');
    });

    it('B.4. payment_link.cancelled updates local linkStatus without recording payment', async () => {
      const evCanc = await Event.create({
        clientId: clientId1,
        title: 'Cancel Test Event',
        eventType: 'Corporate',
        date: new Date(Date.now() + 864000000),
        startTime: '10:00',
        endTime: '18:00',
        location: { address: 'Hall C' },
        guestCount: 60,
        status: 'awaiting_payment',
      });

      const qtnCanc = await Quotation.create({
        quotationNumber: 'QTN-SYNC-CANC1',
        revision: 1,
        eventId: evCanc.id,
        clientId: clientId1,
        status: 'accepted',
        createdBy: adminId,
        items: [{ serviceId, quantity: 1, unitPrice: 20000, name: 'DJ', description: 'DJ', pricingType: 'package', amount: 20000 }],
        subtotal: 20000,
        discount: 0,
        taxableAmount: 20000,
        finalAmount: 20000,
        advanceAmount: 10000,
        remainingAmount: 10000,
        paymentPlan: [
          { title: 'Advance', percentage: 50, amount: 10000, dueDate: new Date(), expiryDate: new Date(Date.now() + 86400000) },
          { title: 'Balance', percentage: 50, amount: 10000, dueDate: new Date(Date.now() + 864000000), expiryDate: new Date(Date.now() + 864000000) },
        ],
        validUntil: new Date(Date.now() + 86400000),
      });

      const linkCanc = await Payment.create({
        eventId: evCanc.id,
        quotationId: qtnCanc.id,
        clientId: clientId1,
        paymentType: 'installment',
        installmentIndex: 1,
        installmentTitle: 'Balance',
        amount: 10000,
        currency: 'INR',
        status: 'created',
        receiptReference: 'rcpt_sync_canc1',
        razorpayPaymentLinkId: 'plink_cancel_test_001',
        linkStatus: 'active',
      });

      const cancBody = JSON.stringify({
        event: 'payment_link.cancelled',
        payload: {
          payment_link: {
            entity: {
              id: 'plink_cancel_test_001',
              status: 'cancelled',
            },
          },
        },
      });

      const sig = makeWebhookSignature(cancBody);
      const res = await fetch(`http://127.0.0.1:${port}/api/webhooks/razorpay`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-razorpay-signature': sig,
        },
        body: cancBody,
      });

      assert.equal(res.status, 200);
      const updatedPayment = await Payment.findById(linkCanc.id);
      assert.equal(updatedPayment?.linkStatus, 'cancelled');
      assert.equal(updatedPayment?.status, 'created');
    });

    it('C.1. Webhook deduplication: Repeated delivery with same x-razorpay-event-id is ignored idempotently', async () => {
      const webhookBody = JSON.stringify({
        event: 'payment_link.paid',
        payload: {
          payment_link: {
            entity: {
              id: 'plink_full_adv_100',
              status: 'paid',
              amount_paid: 4000000,
            },
          },
          payment: {
            entity: {
              id: 'pay_full_adv_100',
              amount: 4000000,
              currency: 'INR',
              status: 'captured',
            },
          },
        },
      });

      const sig = makeWebhookSignature(webhookBody);
      const res = await fetch(`http://127.0.0.1:${port}/api/webhooks/razorpay`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-razorpay-signature': sig,
          'x-razorpay-event-id': 'evt_full_adv_001',
        },
        body: webhookBody,
      });

      assert.equal(res.status, 200);
      const data = (await res.json()) as any;
      assert.equal(data.status, 'duplicate');
    });

    it('C.2. Duplicate provider payment ID is not credited twice', async () => {
      const webhookBody = JSON.stringify({
        event: 'payment_link.paid',
        payload: {
          payment_link: {
            entity: {
              id: 'plink_full_adv_100',
              status: 'paid',
              amount_paid: 4000000,
            },
          },
          payment: {
            entity: {
              id: 'pay_full_adv_100',
              amount: 4000000,
              currency: 'INR',
              status: 'captured',
            },
          },
        },
      });

      const sig = makeWebhookSignature(webhookBody);
      const res = await fetch(`http://127.0.0.1:${port}/api/webhooks/razorpay`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-razorpay-signature': sig,
          'x-razorpay-event-id': 'evt_new_event_id_same_pay_id',
        },
        body: webhookBody,
      });

      assert.equal(res.status, 200);
      const data = (await res.json()) as any;
      assert.equal(data.status, 'already_paid');
    });

    it('D.1. Unmapped payment link returns safe unmapped response without guessing', async () => {
      const unmappedBody = JSON.stringify({
        event: 'payment_link.paid',
        payload: {
          payment_link: {
            entity: {
              id: 'plink_non_existent_99999',
              status: 'paid',
              amount_paid: 500000,
            },
          },
        },
      });

      const sig = makeWebhookSignature(unmappedBody);
      const res = await fetch(`http://127.0.0.1:${port}/api/webhooks/razorpay`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-razorpay-signature': sig,
        },
        body: unmappedBody,
      });

      assert.equal(res.status, 200);
      const data = (await res.json()) as any;
      assert.equal(data.status, 'unmapped');
    });

    it('D.2. Webhook rejects unsupported currency -> 400', async () => {
      await Payment.create({
        eventId: eventId1,
        quotationId: eventId1,
        clientId: clientId1,
        paymentType: 'advance',
        installmentIndex: 0,
        amount: 2000,
        currency: 'INR',
        status: 'created',
        receiptReference: 'rcpt_curr_test_1',
        razorpayPaymentLinkId: 'plink_curr_test_001',
        linkStatus: 'active',
      });

      const currBody = JSON.stringify({
        event: 'payment_link.paid',
        payload: {
          payment_link: { entity: { id: 'plink_curr_test_001', status: 'paid', amount_paid: 200000 } },
          payment: { entity: { id: 'pay_usd_001', amount: 200000, currency: 'USD', status: 'captured' } },
        },
      });

      const sig = makeWebhookSignature(currBody);
      const res = await fetch(`http://127.0.0.1:${port}/api/webhooks/razorpay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-razorpay-signature': sig },
        body: currBody,
      });

      assert.equal(res.status, 400);
      const data = (await res.json()) as any;
      assert.ok(data.message.includes('Unsupported currency: USD'));
    });

    it('D.3. Webhook rejects uncaptured / failed provider payment -> 400', async () => {
      const failBody = JSON.stringify({
        event: 'payment_link.paid',
        payload: {
          payment_link: { entity: { id: 'plink_curr_test_001', status: 'paid', amount_paid: 200000 } },
          payment: { entity: { id: 'pay_failed_001', amount: 200000, currency: 'INR', status: 'failed' } },
        },
      });

      const sig = makeWebhookSignature(failBody);
      const res = await fetch(`http://127.0.0.1:${port}/api/webhooks/razorpay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-razorpay-signature': sig },
        body: failBody,
      });

      assert.equal(res.status, 400);
      const data = (await res.json()) as any;
      assert.ok(data.message.includes('Provider payment status is not captured'));
    });

    it('E.1. Callback reconciliation: Unauthenticated request -> 401', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/api/payments/reconcile-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentLinkId: 'plink_test_reconcile_001' }),
      });
      assert.equal(res.status, 401);
    });

    it('E.2. Callback reconciliation: Unauthorized client accessing another client payment link -> 403', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/api/payments/reconcile-link`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${clientToken2}`,
        },
        body: JSON.stringify({ paymentLinkId: 'plink_full_adv_100' }),
      });
      assert.equal(res.status, 403);
    });

    it('E.3. Callback reconciliation returns authoritative state without duplicate increments', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/api/payments/reconcile-link`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${clientToken1}`,
        },
        body: JSON.stringify({ paymentLinkId: 'plink_full_adv_100' }),
      });

      assert.equal(res.status, 200);
      const data = (await res.json()) as any;
      assert.equal(data.success, true);
      assert.equal(data.data.eventStatus, 'confirmed');
      assert.equal(data.data.totalAdvancePaid, 40000);
      assert.equal(data.data.outstandingAdvance, 0);
    });

    it('E.4. Callback reconciliation before webhook delivery processes payment; subsequent webhook is idempotent', async () => {
      const evReconcileFirst = await Event.create({
        clientId: clientId1,
        title: 'Reconcile First Event',
        eventType: 'Corporate',
        date: new Date(Date.now() + 864000000),
        startTime: '10:00',
        endTime: '18:00',
        location: { address: 'Tech Park' },
        guestCount: 80,
        status: 'awaiting_payment',
      });

      const qtnReconcileFirst = await Quotation.create({
        quotationNumber: 'QTN-SYNC-REC1',
        revision: 1,
        eventId: evReconcileFirst.id,
        clientId: clientId1,
        status: 'accepted',
        createdBy: adminId,
        items: [{ serviceId, quantity: 1, unitPrice: 30000, name: 'DJ', description: 'DJ', pricingType: 'package', amount: 30000 }],
        subtotal: 30000,
        discount: 0,
        taxableAmount: 30000,
        finalAmount: 30000,
        advanceAmount: 15000,
        remainingAmount: 15000,
        paymentPlan: [
          { title: 'Advance', percentage: 50, amount: 15000, dueDate: new Date(), expiryDate: new Date(Date.now() + 86400000) },
          { title: 'Final', percentage: 50, amount: 15000, dueDate: new Date(Date.now() + 864000000), expiryDate: new Date(Date.now() + 864000000) },
        ],
        validUntil: new Date(Date.now() + 86400000),
      });

      await Payment.create({
        eventId: evReconcileFirst.id,
        quotationId: qtnReconcileFirst.id,
        clientId: clientId1,
        paymentType: 'advance',
        installmentIndex: 0,
        installmentTitle: 'Advance',
        amount: 15000,
        currency: 'INR',
        status: 'created',
        receiptReference: 'rcpt_sync_rec1',
        razorpayPaymentLinkId: 'plink_reconcile_first_001',
        linkStatus: 'active',
      });

      // 1. Client callback executes reconciliation before webhook arrives
      const recRes = await fetch(`http://127.0.0.1:${port}/api/payments/reconcile-link`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${clientToken1}`,
        },
        body: JSON.stringify({
          paymentLinkId: 'plink_reconcile_first_001',
          paymentId: 'pay_rec_first_999',
        }),
      });

      assert.equal(recRes.status, 200);
      const recData = (await recRes.json()) as any;
      assert.equal(recData.data.eventStatus, 'confirmed');
      assert.equal(recData.data.totalAdvancePaid, 15000);

      // 2. Webhook arrives afterwards with the same payment
      const wbBody = JSON.stringify({
        event: 'payment_link.paid',
        payload: {
          payment_link: {
            entity: {
              id: 'plink_reconcile_first_001',
              status: 'paid',
              amount_paid: 1500000,
            },
          },
          payment: {
            entity: {
              id: 'pay_rec_first_999',
              amount: 1500000,
              currency: 'INR',
              status: 'captured',
            },
          },
        },
      });

      const sig = makeWebhookSignature(wbBody);
      const wbRes = await fetch(`http://127.0.0.1:${port}/api/webhooks/razorpay`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-razorpay-signature': sig,
          'x-razorpay-event-id': 'evt_rec_first_wb_001',
        },
        body: wbBody,
      });

      assert.equal(wbRes.status, 200);
      const wbData = (await wbRes.json()) as any;
      assert.equal(wbData.status, 'already_paid');

      const finalQtn = await Quotation.findById(qtnReconcileFirst.id);
      assert.equal(finalQtn?.paymentPlan?.[0]?.status, 'Paid');
    });

    it('F.1. Payment Link for subsequent installment updates installment and preserves confirmed event status', async () => {
      const qtnAdv = await Quotation.findOne({ quotationNumber: 'QTN-SYNC-ADV1' });
      assert.ok(qtnAdv);

      const instPayment = await Payment.create({
        eventId: qtnAdv.eventId,
        quotationId: qtnAdv.id,
        clientId: clientId1,
        paymentType: 'installment',
        installmentIndex: 1,
        installmentTitle: 'Balance',
        amount: 60000,
        currency: 'INR',
        status: 'created',
        receiptReference: 'rcpt_sync_inst1',
        razorpayPaymentLinkId: 'plink_inst_balance_001',
        linkStatus: 'active',
      });

      const instBody = JSON.stringify({
        event: 'payment_link.paid',
        payload: {
          payment_link: {
            entity: {
              id: 'plink_inst_balance_001',
              status: 'paid',
              amount_paid: 6000000,
            },
          },
          payment: {
            entity: {
              id: 'pay_inst_balance_001',
              amount: 6000000,
              currency: 'INR',
              status: 'captured',
            },
          },
        },
      });

      const sig = makeWebhookSignature(instBody);
      const res = await fetch(`http://127.0.0.1:${port}/api/webhooks/razorpay`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-razorpay-signature': sig,
          'x-razorpay-event-id': 'evt_inst_bal_001',
        },
        body: instBody,
      });

      assert.equal(res.status, 200);

      const qtnAfterInst = await Quotation.findById(qtnAdv.id);
      assert.equal(qtnAfterInst?.paymentPlan?.[1]?.status, 'Paid');

      const checkPayment = await Payment.findById(instPayment.id);
      assert.equal(checkPayment?.status, 'paid');
      assert.equal(checkPayment?.amount, 60000);

      const evAfterInst = await Event.findById(qtnAdv.eventId);
      assert.equal(evAfterInst?.status, 'confirmed');
    });
  });

  describe('Payment Milestone 3: Automated Reminders, Expiry Warnings & Scheduler', () => {
    let m3EventId: string;
    let m3QuotationId: string;
    let m3ClientId: string;
    let m3ClientToken: string;
    let m3ClientEmail: string;
    let m3QuotationNumber: string;

    beforeEach(async () => {
      // Clear reminder logs, previous test users, quotations, events, and payments
      await PaymentReminderLog.deleteMany({});
      await User.deleteMany({ email: /m3client/ });
      await Quotation.deleteMany({ quotationNumber: /QTN-M3/ });
      await Event.deleteMany({ title: 'M3 Gala Dinner' });

      m3ClientEmail = `m3client_${Date.now()}_${Math.floor(Math.random() * 100000)}@test.com`;
      m3QuotationNumber = `QTN-M3-${Date.now()}-${Math.floor(Math.random() * 100000)}`;

      const m3Client = await User.create({
        name: 'M3 Client',
        email: m3ClientEmail,
        password: 'hash',
        role: 'client',
      });
      m3ClientId = m3Client.id;
      m3ClientToken = generateToken(m3ClientId, 'client');

      const evM3 = await Event.create({
        clientId: m3ClientId,
        title: 'M3 Gala Dinner',
        eventType: 'Corporate',
        date: new Date('2026-11-25'),
        startTime: '18:00',
        endTime: '23:00',
        location: { address: 'Grand Ballroom' },
        guestCount: 200,
        status: 'confirmed', // Already confirmed advance
      });
      m3EventId = evM3.id;

      const qtnM3 = await Quotation.create({
        quotationNumber: m3QuotationNumber,
        revision: 1,
        eventId: m3EventId,
        clientId: m3ClientId,
        status: 'accepted',
        createdBy: adminId,
        items: [
          {
            serviceId,
            quantity: 1,
            unitPrice: 372000,
            name: 'Gala Package',
            description: 'Full Event',
            pricingType: 'package',
            amount: 372000,
          },
        ],
        subtotal: 372000,
        discount: 0,
        taxableAmount: 372000,
        finalAmount: 372000,
        advanceAmount: 100000,
        remainingAmount: 272000,
        validUntil: new Date(Date.now() + 86400000),
        paymentPlan: [
          {
            title: 'Booking Advance',
            amount: 100000,
            dueDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
            expiryDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            status: 'Paid',
          },
          {
            title: 'Final Settlement',
            amount: 272000,
            dueDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000 - 3600000), // Due in ~47 hours (within 2 days)
            expiryDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
            status: 'Pending',
          },
        ],
      });
      m3QuotationId = qtnM3.id;

      // Seed verified advance payment of ₹100,000 so installment 1 is eligible
      await Payment.create({
        eventId: m3EventId,
        quotationId: m3QuotationId,
        clientId: m3ClientId,
        paymentType: 'advance',
        installmentIndex: 0,
        installmentTitle: 'Booking Advance',
        allocations: [{ installmentIndex: 0, installmentTitle: 'Booking Advance', allocatedAmount: 100000 }],
        amount: 100000,
        currency: 'INR',
        status: 'paid',
        receiptReference: `rcpt_m3_adv_${Date.now()}`,
      });
    });

    it('81. Due-date reminder: Eligible installment receives reminder 2 days before due date', async () => {
      const candidates = await paymentReminderService.findEligibleDueDateReminders(new Date(), m3EventId);
      assert.equal(candidates.length, 1);
      assert.equal(candidates[0].installmentTitle, 'Final Settlement');
      assert.equal(candidates[0].outstandingAmount, 272000);
      assert.equal(candidates[0].scheduledAmount, 272000);

      const runResults = await paymentReminderService.runAllReminders(new Date(), m3EventId);
      assert.equal(runResults.dueDateReminders.length, 1);
      assert.equal(runResults.dueDateReminders[0].status, 'sent');

      const log = await PaymentReminderLog.findOne({
        quotationId: m3QuotationId,
        installmentIndex: 1,
        reminderType: 'due_date',
      });
      assert.ok(log);
      assert.equal(log.status, 'sent');
      assert.equal(log.outstandingAmount, 272000);
      assert.equal(log.recipientEmail, m3ClientEmail);
      assert.ok(log.sentAt);
    });

    it('82. Due-date reminder on partially paid installment: Uses actual authoritative outstanding amount', async () => {
      // Record verified partial payment of ₹200,000 on installment 1
      await Payment.create({
        eventId: m3EventId,
        quotationId: m3QuotationId,
        clientId: m3ClientId,
        paymentType: 'installment',
        installmentIndex: 1,
        installmentTitle: 'Final Settlement',
        allocations: [{ installmentIndex: 1, installmentTitle: 'Final Settlement', allocatedAmount: 200000 }],
        amount: 200000,
        currency: 'INR',
        status: 'paid',
        receiptReference: `rcpt_m3_part_${Date.now()}`,
      });

      const candidates = await paymentReminderService.findEligibleDueDateReminders(new Date(), m3EventId);
      assert.equal(candidates.length, 1);
      assert.equal(candidates[0].scheduledAmount, 272000);
      assert.equal(candidates[0].verifiedPaidAmount, 200000);
      assert.equal(candidates[0].outstandingAmount, 72000); // Authoritative outstanding ₹72,000

      const runResults = await paymentReminderService.runAllReminders(new Date(), m3EventId);
      assert.equal(runResults.dueDateReminders[0].status, 'sent');

      const log = await PaymentReminderLog.findOne({
        quotationId: m3QuotationId,
        installmentIndex: 1,
        reminderType: 'due_date',
      });
      assert.ok(log);
      assert.equal(log.scheduledAmount, 272000);
      assert.equal(log.paidAmount, 200000);
      assert.equal(log.outstandingAmount, 72000);
    });

    it('83. Fully paid installment: Skipped and receives no reminder', async () => {
      // Record full payment of ₹272,000 on installment 1
      await Payment.create({
        eventId: m3EventId,
        quotationId: m3QuotationId,
        clientId: m3ClientId,
        paymentType: 'installment',
        installmentIndex: 1,
        installmentTitle: 'Final Settlement',
        allocations: [{ installmentIndex: 1, installmentTitle: 'Final Settlement', allocatedAmount: 272000 }],
        amount: 272000,
        currency: 'INR',
        status: 'paid',
        receiptReference: `rcpt_m3_full_${Date.now()}`,
      });

      const candidates = await paymentReminderService.findEligibleDueDateReminders(new Date(), m3EventId);
      assert.equal(candidates.length, 0); // No candidates!

      const runResults = await paymentReminderService.runAllReminders(new Date(), m3EventId);
      assert.equal(runResults.dueDateReminders.length, 0);

      const logsCount = await PaymentReminderLog.countDocuments({
        quotationId: m3QuotationId,
        installmentIndex: 1,
      });
      assert.equal(logsCount, 0);
    });

    it('84. Overdue installment handling: Catch-up policy skips flood of old past reminders', async () => {
      // Update installment 1 due date to 5 days ago
      await Quotation.findByIdAndUpdate(m3QuotationId, {
        'paymentPlan.1.dueDate': new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
      });

      const candidates = await paymentReminderService.findEligibleDueDateReminders(new Date(), m3EventId);
      assert.equal(candidates.length, 0); // Excluded by catch-up policy (daysUntilDue < 0)
    });

    it('85. Persistent deduplication: Repeated execution does not send duplicate reminders', async () => {
      // 1. First run sends reminder
      const firstRun = await paymentReminderService.runAllReminders(new Date(), m3EventId);
      assert.equal(firstRun.dueDateReminders.length, 1);
      assert.equal(firstRun.dueDateReminders[0].status, 'sent');

      // 2. Second run detects existing log and skips
      const candidatesSecond = await paymentReminderService.findEligibleDueDateReminders(new Date(), m3EventId);
      assert.equal(candidatesSecond.length, 0);

      const secondRun = await paymentReminderService.runAllReminders(new Date(), m3EventId);
      assert.equal(secondRun.dueDateReminders.length, 0);

      // Verify only 1 log exists
      const logsCount = await PaymentReminderLog.countDocuments({
        quotationId: m3QuotationId,
        installmentIndex: 1,
        reminderType: 'due_date',
      });
      assert.equal(logsCount, 1);
    });

    it('86. Server restart / process re-run: Preserves sent record and does not resend', async () => {
      // Run first time
      await paymentReminderService.runAllReminders(new Date(), m3EventId);

      // Simulate new server instance
      const freshReminderService = new PaymentReminderService();
      const freshCandidates = await freshReminderService.findEligibleDueDateReminders(new Date(), m3EventId);
      assert.equal(freshCandidates.length, 0);

      const freshRun = await freshReminderService.runAllReminders(new Date(), m3EventId);
      assert.equal(freshRun.dueDateReminders.length, 0);
    });

    it('87. Payment link expiry warning: Active link expiring in <24h receives warning', async () => {
      // Create active payment link expiring in 12 hours
      const linkExpiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000);
      await Payment.create({
        eventId: m3EventId,
        quotationId: m3QuotationId,
        clientId: m3ClientId,
        paymentType: 'installment',
        installmentIndex: 1,
        installmentTitle: 'Final Settlement',
        amount: 272000,
        currency: 'INR',
        status: 'created',
        receiptReference: `rcpt_m3_plink_${Date.now()}`,
        razorpayPaymentLinkId: 'plink_m3_exp_001',
        paymentLinkUrl: 'https://rzp.io/i/m3link1',
        linkExpiresAt,
        linkStatus: 'active',
      });

      const candidates = await paymentReminderService.findEligibleExpiryWarnings(new Date(), m3EventId);
      assert.equal(candidates.length, 1);
      assert.equal(candidates[0].paymentLinkId, 'plink_m3_exp_001');
      assert.equal(candidates[0].outstandingAmount, 272000);

      const runResults = await paymentReminderService.runAllReminders(new Date(), m3EventId);
      assert.equal(runResults.expiryWarnings.length, 1);
      assert.equal(runResults.expiryWarnings[0].status, 'sent');

      const log = await PaymentReminderLog.findOne({
        paymentLinkId: 'plink_m3_exp_001',
        reminderType: 'link_expiry',
      });
      assert.ok(log);
      assert.equal(log.status, 'sent');
      assert.equal(log.paymentLinkUrl, 'https://rzp.io/i/m3link1');
    });

    it('88. Expired link: Never warned as active', async () => {
      // Create link that is already expired
      await Payment.create({
        eventId: m3EventId,
        quotationId: m3QuotationId,
        clientId: m3ClientId,
        paymentType: 'installment',
        installmentIndex: 1,
        installmentTitle: 'Final Settlement',
        amount: 272000,
        currency: 'INR',
        status: 'created',
        receiptReference: `rcpt_m3_expired_${Date.now()}`,
        razorpayPaymentLinkId: 'plink_m3_already_expired',
        paymentLinkUrl: 'https://rzp.io/i/expired',
        linkExpiresAt: new Date(Date.now() - 3600000), // Expired 1 hour ago
        linkStatus: 'expired',
      });

      const candidates = await paymentReminderService.findEligibleExpiryWarnings(new Date(), m3EventId);
      assert.equal(candidates.length, 0); // Never warned
    });

    it('89. Superseded link: Skipped after Admin renewal', async () => {
      // Create superseded link
      await Payment.create({
        eventId: m3EventId,
        quotationId: m3QuotationId,
        clientId: m3ClientId,
        paymentType: 'installment',
        installmentIndex: 1,
        installmentTitle: 'Final Settlement',
        amount: 272000,
        currency: 'INR',
        status: 'created',
        receiptReference: `rcpt_m3_replaced_${Date.now()}`,
        razorpayPaymentLinkId: 'plink_m3_old_replaced',
        paymentLinkUrl: 'https://rzp.io/i/old',
        linkExpiresAt: new Date(Date.now() + 10 * 60 * 60 * 1000),
        linkStatus: 'replaced',
      });

      const candidates = await paymentReminderService.findEligibleExpiryWarnings(new Date(), m3EventId);
      assert.equal(candidates.length, 0); // Replaced links skipped
    });

    it('90. Replacement link after Admin renewal: Warned before new expiry date with outstanding balance', async () => {
      // Partial payment of ₹200,000 on installment 1
      await Payment.create({
        eventId: m3EventId,
        quotationId: m3QuotationId,
        clientId: m3ClientId,
        paymentType: 'installment',
        installmentIndex: 1,
        installmentTitle: 'Final Settlement',
        allocations: [{ installmentIndex: 1, installmentTitle: 'Final Settlement', allocatedAmount: 200000 }],
        amount: 200000,
        currency: 'INR',
        status: 'paid',
        receiptReference: `rcpt_m3_part_rep_${Date.now()}`,
      });

      // Old superseded link
      await Payment.create({
        eventId: m3EventId,
        quotationId: m3QuotationId,
        clientId: m3ClientId,
        paymentType: 'installment',
        installmentIndex: 1,
        installmentTitle: 'Final Settlement',
        amount: 272000,
        currency: 'INR',
        status: 'created',
        receiptReference: `rcpt_m3_old_${Date.now()}`,
        razorpayPaymentLinkId: 'plink_m3_old',
        paymentLinkUrl: 'https://rzp.io/i/old',
        linkExpiresAt: new Date(Date.now() - 3600000),
        linkStatus: 'replaced',
      });

      // Replacement link for ₹72,000 expiring in 18 hours
      const newExpiry = new Date(Date.now() + 18 * 60 * 60 * 1000);
      await Payment.create({
        eventId: m3EventId,
        quotationId: m3QuotationId,
        clientId: m3ClientId,
        paymentType: 'installment',
        installmentIndex: 1,
        installmentTitle: 'Final Settlement',
        amount: 72000,
        currency: 'INR',
        status: 'created',
        receiptReference: `rcpt_m3_new_${Date.now()}`,
        razorpayPaymentLinkId: 'plink_m3_replacement_002',
        paymentLinkUrl: 'https://rzp.io/i/replacement',
        linkExpiresAt: newExpiry,
        linkStatus: 'active',
      });

      const candidates = await paymentReminderService.findEligibleExpiryWarnings(new Date(), m3EventId);
      assert.equal(candidates.length, 1);
      assert.equal(candidates[0].paymentLinkId, 'plink_m3_replacement_002');
      assert.equal(candidates[0].outstandingAmount, 72000);
      assert.equal(candidates[0].scheduledAmount, 272000);

      const runResults = await paymentReminderService.runAllReminders(new Date(), m3EventId);
      assert.equal(runResults.expiryWarnings.length, 1);
      assert.equal(runResults.expiryWarnings[0].status, 'sent');

      const log = await PaymentReminderLog.findOne({
        paymentLinkId: 'plink_m3_replacement_002',
      });
      assert.ok(log);
      assert.equal(log.outstandingAmount, 72000);
      assert.equal(log.paymentLinkUrl, 'https://rzp.io/i/replacement');
    });

    it('91. Just-in-time check: Full payment immediately before reminder cancels/skips reminder', async () => {
      const candidates = await paymentReminderService.findEligibleDueDateReminders(new Date(), m3EventId);
      assert.equal(candidates.length, 1);

      // Simulate full payment arriving right before candidate processing
      await Payment.create({
        eventId: m3EventId,
        quotationId: m3QuotationId,
        clientId: m3ClientId,
        paymentType: 'installment',
        installmentIndex: 1,
        installmentTitle: 'Final Settlement',
        allocations: [{ installmentIndex: 1, installmentTitle: 'Final Settlement', allocatedAmount: 272000 }],
        amount: 272000,
        currency: 'INR',
        status: 'paid',
        receiptReference: `rcpt_m3_jit_${Date.now()}`,
      });

      const result = await paymentReminderService.processDueDateReminder(candidates[0]);
      assert.equal(result.status, 'skipped');
      assert.equal(result.reason, 'fully_paid');

      const log = await PaymentReminderLog.findOne({
        quotationId: m3QuotationId,
        installmentIndex: 1,
        reminderType: 'due_date',
      });
      assert.ok(log);
      assert.equal(log.status, 'skipped');
      assert.equal(log.failureReason, 'Installment settled before email delivery');
    });

    it('92. Email delivery failure handling: Diagnostic failure recorded, payment/event state untouched', async () => {
      const candidates = await paymentReminderService.findEligibleDueDateReminders(new Date(), m3EventId);
      assert.equal(candidates.length, 1);

      // Temporarily mock emailService to simulate SMTP failure
      const originalSend = emailService.sendPaymentDueDateReminder;
      emailService.sendPaymentDueDateReminder = async () => {
        throw new Error('SMTP connection timeout: Connection refused by mail server');
      };

      try {
        const result = await paymentReminderService.processDueDateReminder(candidates[0]);
        assert.equal(result.status, 'failed');
        assert.ok(result.error?.includes('SMTP connection timeout'));

        const log = await PaymentReminderLog.findOne({
          quotationId: m3QuotationId,
          installmentIndex: 1,
          reminderType: 'due_date',
        });
        assert.ok(log);
        assert.equal(log.status, 'failed');
        assert.ok(log.failureReason?.includes('SMTP connection timeout'));

        // Crucial guarantee: Verify payment & event state remain completely untouched
        const eventAfterFail = await Event.findById(m3EventId);
        assert.equal(eventAfterFail?.status, 'confirmed');

        const qtnAfterFail = await Quotation.findById(m3QuotationId);
        assert.equal(qtnAfterFail?.finalAmount, 372000);
        assert.equal(qtnAfterFail?.paymentPlan?.[1]?.amount, 272000);
      } finally {
        // Restore original method
        emailService.sendPaymentDueDateReminder = originalSend;
      }
    });

    it('93. Admin trigger and visibility: POST /api/payments/reminders/trigger and schedule summary reflection', async () => {
      // 1. Non-admin forbidden
      const forbiddenRes = await fetch(`http://127.0.0.1:${port}/api/payments/reminders/trigger`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${clientToken1}` },
      });
      assert.equal(forbiddenRes.status, 403);

      // 2. Admin trigger successful (enqueues scan job via BullMQ)
      const triggerRes = await fetch(`http://127.0.0.1:${port}/api/payments/reminders/trigger`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ eventId: m3EventId }),
      });
      assert.equal(triggerRes.status, 200);
      const triggerData = (await triggerRes.json()) as any;
      assert.ok(triggerData.success);
      assert.equal(triggerData.data.status, 'queued');
      assert.ok(triggerData.data.jobId);

      // 2b. Background worker executes the enqueued scan job
      const scanJobs = paymentReminderQueueService.getMockScanJobs();
      assert.ok(scanJobs.length > 0);
      const latestScanJob = scanJobs[scanJobs.length - 1];
      const scanResult = await paymentReminderQueueService.processScanJob(latestScanJob as any);
      assert.equal(scanResult.dueRemindersQueued, 1);

      // 2c. Background worker executes the enqueued individual email job
      const emailJobs = paymentReminderQueueService.getMockEmailJobs();
      assert.ok(emailJobs.length > 0);
      const latestEmailJob = emailJobs[emailJobs.length - 1];
      const emailResult = await paymentReminderQueueService.processEmailJob(latestEmailJob as any);
      assert.equal(emailResult.status, 'sent');

      // 3. Admin schedule summary includes reminder metadata
      const summaryRes = await fetch(`http://127.0.0.1:${port}/api/payments/schedule/${m3EventId}`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      assert.equal(summaryRes.status, 200);
      const summaryData = (await summaryRes.json()) as any;
      const inst1 = summaryData.data.installments[1];
      assert.ok(inst1.latestDueDateReminder);
      assert.equal(inst1.latestDueDateReminder.status, 'sent');
      assert.equal(inst1.latestDueDateReminder.recipientEmail, m3ClientEmail);
      assert.ok(inst1.reminderLogs.length > 0);

      // 4. Get event reminder logs API
      const logsRes = await fetch(`http://127.0.0.1:${port}/api/payments/event/${m3EventId}/reminders`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      assert.equal(logsRes.status, 200);
      const logsData = (await logsRes.json()) as any;
      assert.ok(Array.isArray(logsData.data));
      assert.equal(logsData.data.length, 1);
      assert.equal(logsData.data[0].reminderType, 'due_date');
    });
  });
});


