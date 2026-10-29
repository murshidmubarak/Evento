/**
 * src/workers/paymentReminderWorker.ts
 *
 * EventOps ERP — Payment Reminder Background Worker
 *
 * Responsibilities:
 * 1. Initialize BullMQ Workers for payment reminder scan and email delivery.
 * 2. Register BullMQ recurring JobScheduler for payment reminder scans.
 * 3. Discover eligible installments/links and dispatch reminder emails.
 * 4. Graceful worker cleanup via exported handle.
 * 5. Standalone execution support for troubleshooting (e.g. npm run worker:payment).
 */
import '../config/env.js';
import { env } from '../config/env.js';
import { connectDB } from '../config/db.js';
import mongoose from 'mongoose';
import { isMainModule } from '../utils/isMainModule.js';

// Ensure all Mongoose models are registered
import '../modules/auth/model/user.model.js';
import '../modules/services/model/service.model.js';
import '../modules/events/model/event.model.js';
import '../modules/quotations/model/quotation.model.js';
import '../modules/payments/model/payment.model.js';
import '../modules/payments/model/payment-reminder-log.model.js';

import { paymentReminderQueueService } from '../modules/payments/queues/payment-reminder.queue.js';

export interface PaymentReminderWorkerHandle {
  name: 'payment-reminder';
  close: () => Promise<void>;
}

export interface StartPaymentReminderWorkerOptions {
  autoConnectDB?: boolean;
}

/**
 * Explicit startup function for Payment Reminder background worker.
 * Can be called by the Unified Worker orchestrator or standalone runner.
 */
export async function startPaymentReminderWorker(
  options?: StartPaymentReminderWorkerOptions
): Promise<PaymentReminderWorkerHandle> {
  console.log('🚀 [PaymentReminderWorker] Bootstrapping background worker...');

  // 1. Verify Redis configuration
  if (!env.redisUrl && env.nodeEnv !== 'test') {
    throw new Error('[PaymentReminderWorker] Fatal: REDIS_URL is not configured in environment.');
  }

  // 2. Connect to MongoDB only if explicitly requested and disconnected
  if (options?.autoConnectDB && mongoose.connection.readyState === 0) {
    await connectDB();
    console.log('✅ [PaymentReminderWorker] Connected to MongoDB.');
  }

  // 3. Initialize BullMQ Workers for Scan and Email queues
  try {
    paymentReminderQueueService.startWorkers();
    console.log('✅ [PaymentReminderWorker] BullMQ workers initialized:');
    console.log('   - Scan Worker (Queue: payment-reminder-scan, Concurrency: 1)');
    console.log('   - Email Worker (Queue: payment-reminder-email, Concurrency: 5, Max Retries: 3)');
  } catch (queueErr: any) {
    console.error('❌ [PaymentReminderWorker] Failed to initialize BullMQ workers:', queueErr.message);
    throw queueErr;
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

  return {
    name: 'payment-reminder',
    close: async () => {
      console.log('🛑 [PaymentReminderWorker] Closing payment reminder queues and workers...');
      await paymentReminderQueueService.closeAll();
      console.log('✅ [PaymentReminderWorker] BullMQ queues and workers closed.');
    },
  };
}

// ─── Standalone Execution Handler (Troubleshooting / Independent Run) ──────────

if (isMainModule(import.meta.url)) {
  let isShuttingDown = false;
  let activeHandle: PaymentReminderWorkerHandle | null = null;

  const standaloneShutdown = async (signal: string): Promise<void> => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    console.log(`\n🛑 [PaymentReminderWorker] Received ${signal}. Initiating graceful shutdown...`);

    try {
      if (activeHandle) {
        await activeHandle.close();
      }

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
  };

  process.on('SIGINT', () => standaloneShutdown('SIGINT'));
  process.on('SIGTERM', () => standaloneShutdown('SIGTERM'));

  process.on('unhandledRejection', (reason: unknown) => {
    console.error('❌ [PaymentReminderWorker] Unhandled Rejection:', reason);
  });

  process.on('uncaughtException', (error: Error) => {
    console.error('❌ [PaymentReminderWorker] Uncaught Exception:', error);
    standaloneShutdown('uncaughtException').finally(() => process.exit(1));
  });

  (async () => {
    try {
      await connectDB();
      activeHandle = await startPaymentReminderWorker();
    } catch (err: any) {
      console.error('❌ [PaymentReminderWorker] Fatal startup error:', err);
      process.exit(1);
    }
  })();
}
