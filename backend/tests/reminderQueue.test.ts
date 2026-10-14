import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose, { Types } from 'mongoose';
import { connectDB } from '../src/config/db.js';
import { env } from '../src/config/env.js';
import { User } from '../src/modules/auth/model/user.model.js';
import { Event } from '../src/modules/events/model/event.model.js';
import { Quotation } from '../src/modules/quotations/model/quotation.model.js';
import { Payment } from '../src/modules/payments/model/payment.model.js';
import { PaymentReminderLog } from '../src/modules/payments/model/payment-reminder-log.model.js';
import {
  paymentReminderQueueService,
  RECURRING_SCAN_SCHEDULER_ID,
} from '../src/modules/payments/queues/payment-reminder.queue.js';
import { reminderSchedulerService } from '../src/modules/payments/service/reminder-scheduler.service.js';
import { emailService } from '../src/modules/email/service/email.service.js';

describe('Payment Reminder BullMQ Queue & Background Worker Architecture', () => {
  let testClientId: string;
  let testClientEmail: string;
  let testEventId: string;
  let testQuotationId: string;
  let adminId: string;

  before(async () => {
    await connectDB();
  });

  after(async () => {
    await PaymentReminderLog.deleteMany({ eventId: testEventId });
    await Payment.deleteMany({ eventId: testEventId });
    await Quotation.deleteMany({ _id: testQuotationId });
    await Event.deleteMany({ _id: testEventId });
    await User.deleteMany({ email: /queue_test_/ });
    await paymentReminderQueueService.closeAll();
    await mongoose.disconnect();
  });

  beforeEach(async () => {
    paymentReminderQueueService.clearMockQueues();
    await PaymentReminderLog.deleteMany({});
    await Payment.deleteMany({ eventId: testEventId });

    // Create admin user for quotation createdBy
    let admin = await User.findOne({ role: 'admin' });
    if (!admin) {
      admin = await User.create({
        name: 'Admin User',
        email: `queue_test_admin_${Date.now()}@example.com`,
        phone: '9876543211',
        password: 'password123',
        role: 'admin',
        status: 'active',
        isVerified: true,
      });
    }
    adminId = admin.id;

    // Create unique test client
    testClientEmail = `queue_test_${Date.now()}_${Math.floor(Math.random() * 10000)}@example.com`;
    const client = await User.create({
      name: 'Queue Test Client',
      email: testClientEmail,
      phone: '9876543210',
      password: 'password123',
      role: 'client',
      status: 'active',
      isVerified: true,
    });
    testClientId = client.id;

    // Create base test event
    const event = await Event.create({
      clientId: testClientId,
      title: 'Queue Architecture Gala',
      eventType: 'Corporate',
      date: new Date('2026-11-25'),
      startTime: '18:00',
      endTime: '23:00',
      location: { address: 'Tech Park Hall' },
      guestCount: 200,
      status: 'confirmed',
    });
    testEventId = event.id;

    // Installment 1 due in ~47 hours (eligible for due date reminder: 0 <= daysUntilDue <= 2)
    const dueIn47Hours = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000 - 3600000);

    const quotation = await Quotation.create({
      quotationNumber: `QTN-Q-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
      revision: 1,
      eventId: testEventId,
      clientId: testClientId,
      status: 'accepted',
      createdBy: adminId,
      items: [
        {
          serviceId: new Types.ObjectId(),
          quantity: 1,
          unitPrice: 300000,
          name: 'Main Package',
          description: 'Grand venue & catering',
          pricingType: 'package',
          amount: 300000,
        },
      ],
      subtotal: 300000,
      discount: 0,
      taxableAmount: 300000,
      finalAmount: 300000,
      advanceAmount: 100000,
      remainingAmount: 200000,
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
          amount: 200000,
          dueDate: dueIn47Hours,
          expiryDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
          status: 'Pending',
        },
      ],
    });
    testQuotationId = quotation.id;

    // Seed verified advance payment of ₹100,000 so subsequent installments are eligible
    await Payment.create({
      eventId: testEventId,
      quotationId: testQuotationId,
      clientId: testClientId,
      paymentType: 'advance',
      installmentIndex: 0,
      installmentTitle: 'Booking Advance',
      allocations: [{ installmentIndex: 0, installmentTitle: 'Booking Advance', allocatedAmount: 100000 }],
      amount: 100000,
      currency: 'INR',
      status: 'paid',
      receiptReference: `rcpt_adv_${Date.now()}`,
      verifiedAt: new Date(),
      paymentMethod: 'razorpay',
      providerPaymentId: `pay_adv_${Date.now()}`,
    });

    // Seed active payment link expiring in 18 hours (0 < hoursUntilExpiry <= 24 -> eligible for expiry warning)
    const linkExpiresAt = new Date(Date.now() + 18 * 60 * 60 * 1000);
    await Payment.create({
      eventId: testEventId,
      quotationId: testQuotationId,
      clientId: testClientId,
      paymentType: 'installment',
      installmentIndex: 1,
      installmentTitle: 'Final Settlement',
      amount: 200000,
      currency: 'INR',
      status: 'created',
      receiptReference: `rcpt_q_${Date.now()}`,
      razorpayPaymentLinkId: `plink_q_exp_${Date.now()}`,
      paymentLinkUrl: 'https://rzp.io/i/qlink1',
      linkExpiresAt,
      linkStatus: 'active',
    });
  });

  // ─── 1. Queue Configuration & Schedulers ────────────────────────────────────

  it('1. Recurring JobScheduler registers with configured interval and scheduler ID', async () => {
    await paymentReminderQueueService.setupRecurringScanScheduler(env.reminderCheckIntervalMs);

    const scanQueue = paymentReminderQueueService.getScanQueue() as any;
    assert.ok(scanQueue.schedulers.has(RECURRING_SCAN_SCHEDULER_ID));

    const registered = scanQueue.schedulers.get(RECURRING_SCAN_SCHEDULER_ID);
    assert.equal(registered.repeat.every, env.reminderCheckIntervalMs);
    assert.equal(registered.template.name, 'periodic-scan');
  });

  it('2. Legacy in-process scheduler start() is deprecated and does not spawn timers', () => {
    reminderSchedulerService.start();
    assert.equal(reminderSchedulerService.isActive(), false, 'Legacy scheduler timer must remain inactive');
    reminderSchedulerService.stop();
  });

  it('3. Manual trigger enqueue produces a scan job with unique job ID and queued status', async () => {
    const result = await paymentReminderQueueService.enqueueReminderScan({
      eventId: testEventId,
      isManual: true,
      triggeredBy: adminId,
    });

    assert.equal(result.status, 'queued');
    assert.ok(result.jobId.startsWith('manual_scan_'));
    assert.ok(result.enqueuedAt instanceof Date);

    const jobs = paymentReminderQueueService.getMockScanJobs();
    assert.equal(jobs.length, 1);
    assert.equal(jobs[0].id, result.jobId);
    assert.equal(jobs[0].data.eventId, testEventId);
    assert.equal(jobs[0].data.isManual, true);
    assert.equal(jobs[0].data.triggeredBy, adminId);
  });

  // ─── 2. Worker Reminder Scanning & MongoDB Reservations ─────────────────────

  it('4. Worker processScanJob selects eligible due date candidate and link expiry candidate', async () => {
    await paymentReminderQueueService.enqueueReminderScan({
      eventId: testEventId,
      isManual: true,
    });

    const scanJobs = paymentReminderQueueService.getMockScanJobs();
    assert.equal(scanJobs.length, 1);

    const scanResult = await paymentReminderQueueService.processScanJob(scanJobs[0] as any);
    assert.equal(scanResult.dueRemindersQueued, 1, 'Should queue 1 due date reminder');
    assert.equal(scanResult.expiryWarningsQueued, 1, 'Should queue 1 link expiry warning');
    assert.equal(scanResult.skippedCount, 0);

    // MongoDB records created in pending status
    const logs = await PaymentReminderLog.find({ eventId: testEventId });
    assert.equal(logs.length, 2);

    const dueLog = logs.find((l) => l.reminderType === 'due_date');
    assert.ok(dueLog);
    assert.equal(dueLog.status, 'pending');
    assert.equal(dueLog.installmentIndex, 1);
    assert.equal(dueLog.outstandingAmount, 200000);
    assert.equal(dueLog.recipientEmail, testClientEmail);

    const expiryLog = logs.find((l) => l.reminderType === 'link_expiry');
    assert.ok(expiryLog);
    assert.equal(expiryLog.status, 'pending');
    assert.equal(expiryLog.installmentIndex, 1);

    // Individual email jobs enqueued with deterministic job IDs
    const emailJobs = paymentReminderQueueService.getMockEmailJobs();
    assert.equal(emailJobs.length, 2);
    assert.ok(emailJobs[0].opts.jobId.startsWith('email_'));
    assert.ok(emailJobs[1].opts.jobId.startsWith('email_'));
  });

  it('5. Repeated scan does not create duplicate jobs due to MongoDB deduplication', async () => {
    // First scan: queues 2 email jobs
    await paymentReminderQueueService.enqueueReminderScan({ eventId: testEventId });
    const scanJobs1 = paymentReminderQueueService.getMockScanJobs();
    const result1 = await paymentReminderQueueService.processScanJob(scanJobs1[0] as any);
    assert.equal(result1.dueRemindersQueued, 1);
    assert.equal(result1.expiryWarningsQueued, 1);

    // Second scan (immediate re-run): finds dedupKeys already reserved/present
    await paymentReminderQueueService.enqueueReminderScan({ eventId: testEventId });
    const scanJobs2 = paymentReminderQueueService.getMockScanJobs();
    const result2 = await paymentReminderQueueService.processScanJob(scanJobs2[1] as any);
    assert.equal(result2.dueRemindersQueued, 0, 'Second run must queue 0 due date reminders');
    assert.equal(result2.expiryWarningsQueued, 0, 'Second run must queue 0 expiry warnings');

    // Total logs in DB must remain exactly 2
    const totalLogs = await PaymentReminderLog.countDocuments({ eventId: testEventId });
    assert.equal(totalLogs, 2);
  });

  // ─── 3. Email Job Processing & Status Lifecycle ─────────────────────────────

  it('6. Worker processEmailJob delivers email and updates MongoDB status to sent', async () => {
    await paymentReminderQueueService.enqueueReminderScan({ eventId: testEventId });
    const scanJobs = paymentReminderQueueService.getMockScanJobs();
    await paymentReminderQueueService.processScanJob(scanJobs[0] as any);

    const emailJobs = paymentReminderQueueService.getMockEmailJobs();
    const dueEmailJob = emailJobs.find((j) => j.data.reminderType === 'due_date');
    assert.ok(dueEmailJob);

    // Execute email worker processor
    const deliveryResult = await paymentReminderQueueService.processEmailJob(dueEmailJob as any);
    assert.equal(deliveryResult.status, 'sent');

    // Verify MongoDB status updated to sent with sentAt timestamp
    const log = await PaymentReminderLog.findById(dueEmailJob.data.reminderLogId);
    assert.ok(log);
    assert.equal(log.status, 'sent');
    assert.ok(log.sentAt instanceof Date);
    assert.equal(log.failureReason, undefined);
  });

  it('7. Idempotency: Retrying an already-sent job returns already_sent and does not resend', async () => {
    await paymentReminderQueueService.enqueueReminderScan({ eventId: testEventId });
    const scanJobs = paymentReminderQueueService.getMockScanJobs();
    await paymentReminderQueueService.processScanJob(scanJobs[0] as any);

    const emailJobs = paymentReminderQueueService.getMockEmailJobs();
    const dueEmailJob = emailJobs.find((j) => j.data.reminderType === 'due_date')!;

    // Send first time
    await paymentReminderQueueService.processEmailJob(dueEmailJob as any);

    let sendCallCount = 0;
    const originalSend = emailService.sendPaymentDueDateReminder;
    emailService.sendPaymentDueDateReminder = async (...args: any[]) => {
      sendCallCount++;
      return originalSend.apply(emailService, args as any);
    };

    try {
      // Re-process identical job
      const duplicateResult = await paymentReminderQueueService.processEmailJob(dueEmailJob as any);
      assert.equal(duplicateResult.status, 'already_sent');
      assert.equal(sendCallCount, 0, 'emailService must not be invoked for already-sent reminders');
    } finally {
      emailService.sendPaymentDueDateReminder = originalSend;
    }
  });

  it('8. JIT recheck: If installment was paid while job was queued, worker skips sending', async () => {
    await paymentReminderQueueService.enqueueReminderScan({ eventId: testEventId });
    const scanJobs = paymentReminderQueueService.getMockScanJobs();
    await paymentReminderQueueService.processScanJob(scanJobs[0] as any);

    const emailJobs = paymentReminderQueueService.getMockEmailJobs();
    const dueEmailJob = emailJobs.find((j) => j.data.reminderType === 'due_date')!;

    // Client pays full remaining balance before worker processes email job
    await Payment.create({
      eventId: testEventId,
      quotationId: testQuotationId,
      clientId: testClientId,
      paymentType: 'installment',
      installmentIndex: 1,
      installmentTitle: 'Final Settlement',
      allocations: [{ installmentIndex: 1, installmentTitle: 'Final Settlement', allocatedAmount: 200000 }],
      amount: 200000,
      currency: 'INR',
      status: 'paid',
      receiptReference: `rcpt_jit_${Date.now()}`,
      verifiedAt: new Date(),
      paymentMethod: 'razorpay',
      providerPaymentId: `pay_jit_${Date.now()}`,
    });

    const quotation = await Quotation.findById(testQuotationId);
    quotation!.paymentPlan[1].status = 'Paid';
    await quotation!.save();

    // Worker executes JIT balance check
    const deliveryResult = await paymentReminderQueueService.processEmailJob(dueEmailJob as any);
    assert.equal(deliveryResult.status, 'skipped');

    // MongoDB record must reflect skipped with reason
    const log = await PaymentReminderLog.findById(dueEmailJob.data.reminderLogId);
    assert.ok(log);
    assert.equal(log.status, 'skipped');
    assert.ok(log.failureReason?.includes('settled') || log.failureReason?.includes('delivery'));
  });

  it('9. SMTP failure handling: Records diagnostic failure and allows retry', async () => {
    await paymentReminderQueueService.enqueueReminderScan({ eventId: testEventId });
    const scanJobs = paymentReminderQueueService.getMockScanJobs();
    await paymentReminderQueueService.processScanJob(scanJobs[0] as any);

    const emailJobs = paymentReminderQueueService.getMockEmailJobs();
    const dueEmailJob = emailJobs.find((j) => j.data.reminderType === 'due_date')!;

    // Mock SMTP server failure
    const originalSend = emailService.sendPaymentDueDateReminder;
    emailService.sendPaymentDueDateReminder = async () => {
      throw new Error('ECONNRESET: SMTP server disconnected unexpectedly');
    };

    try {
      const failResult = await paymentReminderQueueService.processEmailJob(dueEmailJob as any);
      assert.equal(failResult.status, 'failed');

      const log = await PaymentReminderLog.findById(dueEmailJob.data.reminderLogId);
      assert.ok(log);
      assert.equal(log.status, 'failed');
      assert.ok(log.failureReason?.includes('ECONNRESET'));
    } finally {
      emailService.sendPaymentDueDateReminder = originalSend;
    }
  });

  it('10. Boundary conditions: Installments due in >2 days or links expiring >24h are not queued', async () => {
    // Installment due in 5 days (> 2 days)
    const dueIn5Days = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);

    const quotation = await Quotation.findById(testQuotationId);
    quotation!.paymentPlan[1].dueDate = dueIn5Days;
    await quotation!.save();

    // Payment link expiring in 48 hours (> 24 hours)
    await Payment.updateMany(
      { eventId: testEventId, paymentType: 'installment' },
      { linkExpiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000) }
    );

    await paymentReminderQueueService.enqueueReminderScan({ eventId: testEventId });
    const scanJobs = paymentReminderQueueService.getMockScanJobs();
    const scanResult = await paymentReminderQueueService.processScanJob(scanJobs[0] as any);

    assert.equal(scanResult.dueRemindersQueued, 0, 'Far future installment (>2 days) must not be queued');
    assert.equal(scanResult.expiryWarningsQueued, 0, 'Far future expiry (>24h) must not be queued');
  });
});
