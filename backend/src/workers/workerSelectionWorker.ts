/**
 * src/workers/workerSelectionWorker.ts
 *
 * EventOps ERP — Dedicated Background Worker for Worker Selection
 *
 * Responsibilities:
 * 1. Initialize MongoDB connection.
 * 2. Connect to Redis via BullMQ.
 * 3. Initialize BullMQ Worker for 'worker-selection' queue.
 * 4. Scan and process any overdue/expired interest deadlines surviving service restarts.
 * 5. Graceful shutdown on SIGINT / SIGTERM.
 */
import '../config/env.js';
import { env } from '../config/env.js';
import { connectDB } from '../config/db.js';
import mongoose from 'mongoose';

// Ensure Mongoose models are registered
import '../modules/auth/model/user.model.js';
import '../modules/services/model/service.model.js';
import '../modules/events/model/event.model.js';
import '../modules/work-requirements/model/work-requirement.model.js';
import '../modules/work-requirements/model/work-response.model.js';

import { workerSelectionQueueService } from '../modules/worker-selection/queues/worker-selection.queue.js';

let isShuttingDown = false;

async function startWorker(): Promise<void> {
  console.log('🚀 [WorkerSelectionWorker] Bootstrapping background selection worker...');

  // 1. Verify Redis configuration
  if (!env.redisUrl) {
    console.error('❌ [WorkerSelectionWorker] Fatal: REDIS_URL is not configured in environment.');
    process.exit(1);
  }

  // 2. Connect to MongoDB
  try {
    await connectDB();
    console.log('✅ [WorkerSelectionWorker] Connected to MongoDB.');
  } catch (dbErr: any) {
    console.error('❌ [WorkerSelectionWorker] Failed to connect to MongoDB:', dbErr.message);
    process.exit(1);
  }

  // 3. Start BullMQ selection worker
  try {
    workerSelectionQueueService.setMockMode(false);
    workerSelectionQueueService.startWorker();
    console.log('✅ [WorkerSelectionWorker] BullMQ Worker started (Queue: worker-selection, Concurrency: 2)');
  } catch (queueErr: any) {
    console.error('❌ [WorkerSelectionWorker] Failed to initialize worker:', queueErr.message);
    process.exit(1);
  }

  // 4. Initial scan for any missed/expired deadlines
  try {
    const scanned = await workerSelectionQueueService.scanAndProcessExpiredDeadlines();
    if (scanned > 0) {
      console.log(`🔍 [WorkerSelectionWorker] Processed ${scanned} overdue requirements during startup.`);
    }
  } catch (scanErr: any) {
    console.error('⚠️ [WorkerSelectionWorker] Warning during startup scan:', scanErr.message);
  }

  console.log('🎯 [WorkerSelectionWorker] Ready and awaiting deadline selection jobs.');
}

async function gracefulShutdown(signal: string): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log(`\n🛑 [WorkerSelectionWorker] Received ${signal}. Initiating graceful shutdown...`);

  try {
    await workerSelectionQueueService.close();
    console.log('✅ [WorkerSelectionWorker] Selection queue and worker closed.');

    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
      console.log('✅ [WorkerSelectionWorker] MongoDB disconnected.');
    }

    console.log('👋 [WorkerSelectionWorker] Shutdown complete.');
    process.exit(0);
  } catch (err: any) {
    console.error('❌ [WorkerSelectionWorker] Error during shutdown:', err);
    process.exit(1);
  }
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

process.on('unhandledRejection', (reason: unknown) => {
  console.error('❌ [WorkerSelectionWorker] Unhandled Rejection:', reason);
});

startWorker().catch((err) => {
  console.error('❌ [WorkerSelectionWorker] Fatal startup error:', err);
  process.exit(1);
});
