/**
 * src/workers/paymentReminderWorker.ts
 *
 * EventOps ERP — Dedicated Background Worker Process
 *
 * Responsibilities:
 * 1. Initialize MongoDB connection for authoritative balance revalidation & audit logging.
 * 2. Connect to Redis via BullMQ.
 * 3. Register BullMQ recurring JobScheduler for payment reminder scans.
 * 4. Process payment reminder scan jobs (discovering eligible installments & links).
 * 5. Process individual reminder email jobs with retry policies and exponential backoff.
 * 6. Graceful shutdown on SIGINT / SIGTERM.
 */
import '../config/env.js';
import { env } from '../config/env.js';
import { connectDB } from '../config/db.js';
import mongoose from 'mongoose';

// Ensure all Mongoose models are registered in this standalone worker process
import '../modules/auth/model/user.model.js';
import '../modules/services/model/service.model.js';
import '../modules/events/model/event.model.js';
import '../modules/quotations/model/quotation.model.js';
import '../modules/payments/model/payment.model.js';
import '../modules/payments/model/payment-reminder-log.model.js';

import { paymentReminderQueueService } from '../modules/payments/queues/payment-reminder.queue.js';

let isShuttingDown = false;

async function startWorker(): Promise<void> {
  console.log('🚀 [PaymentReminderWorker] Bootstrapping background worker...');

  // 1. Verify Redis URL configuration
  if (!env.redisUrl) {
    console.error('❌ [PaymentReminderWorker] Fatal: REDIS_URL is not configured in environment.');
    console.error('   Please provide a valid Redis URL (e.g., REDIS_URL=redis://127.0.0.1:6379 in .env).');
    process.exit(1);
  }

  // 2. Connect to MongoDB
  try {
    await connectDB();
    console.log('✅ [PaymentReminderWorker] Connected to MongoDB.');
  } catch (dbErr: any) {
    console.error('❌ [PaymentReminderWorker] Failed to connect to MongoDB:', dbErr.message);
    process.exit(1);
  }

  // 3. Initialize BullMQ Workers for Scan and Email queues
  try {
    const { scanWorker, emailWorker } = paymentReminderQueueService.startWorkers();
    console.log('✅ [PaymentReminderWorker] BullMQ workers initialized:');
    console.log('   - Scan Worker (Queue: payment-reminder-scan, Concurrency: 1)');
    console.log('   - Email Worker (Queue: payment-reminder-email, Concurrency: 5, Max Retries: 3)');
  } catch (queueErr: any) {
    console.error('❌ [PaymentReminderWorker] Failed to initialize BullMQ workers:', queueErr.message);
    process.exit(1);
  }

  // 4. Register Recurring Scan Scheduler if enabled
  if (env.enableReminderScheduler) {
    try {
      await paymentReminderQueueService.setupRecurringScanScheduler(env.reminderCheckIntervalMs);
      console.log(`⏰ [PaymentReminderWorker] Recurring scheduler registered (Every ${env.reminderCheckIntervalMs / 1000}s).`);
    } catch (schedErr: any) {
      console.error('⚠️ [PaymentReminderWorker] Warning: Failed to register recurring scan scheduler:', schedErr.message);
    }
  } else {
    console.log('ℹ️ [PaymentReminderWorker] Recurring scheduler is disabled via ENABLE_REMINDER_SCHEDULER=false.');
  }

  console.log('🎯 [PaymentReminderWorker] Ready and awaiting jobs.');
}

// ─── Graceful Shutdown ────────────────────────────────────────────────────────

async function gracefulShutdown(signal: string): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log(`\n🛑 [PaymentReminderWorker] Received ${signal}. Initiating graceful shutdown...`);

  try {
    // 1. Stop accepting new jobs and close BullMQ workers
    await paymentReminderQueueService.closeAll();
    console.log('✅ [PaymentReminderWorker] BullMQ queues and workers closed.');

    // 2. Disconnect MongoDB
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
      console.log('✅ [PaymentReminderWorker] MongoDB disconnected.');
    }

    console.log('👋 [PaymentReminderWorker] Shutdown complete.');
    process.exit(0);
  } catch (err: any) {
    console.error('❌ [PaymentReminderWorker] Error during shutdown:', err);
    process.exit(1);
  }
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

process.on('unhandledRejection', (reason: unknown) => {
  console.error('❌ [PaymentReminderWorker] Unhandled Rejection:', reason);
});

// Launch
startWorker().catch((err) => {
  console.error('❌ [PaymentReminderWorker] Fatal startup error:', err);
  process.exit(1);
});
