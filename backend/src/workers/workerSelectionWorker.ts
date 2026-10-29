/**
 * src/workers/workerSelectionWorker.ts
 *
 * EventOps ERP — Worker Selection Background Worker
 *
 * Responsibilities:
 * 1. Initialize BullMQ Worker for 'worker-selection' queue.
 * 2. Scan and process any overdue/expired interest deadlines surviving service restarts.
 * 3. Process scheduled worker selection deadline jobs.
 * 4. Graceful worker cleanup via exported handle.
 * 5. Standalone execution support for troubleshooting (e.g. npm run worker:selection).
 */
import '../config/env.js';
import { env } from '../config/env.js';
import { connectDB } from '../config/db.js';
import mongoose from 'mongoose';
import { isMainModule } from '../utils/isMainModule.js';

// Ensure Mongoose models are registered
import '../modules/auth/model/user.model.js';
import '../modules/services/model/service.model.js';
import '../modules/events/model/event.model.js';
import '../modules/work-requirements/model/work-requirement.model.js';
import '../modules/work-requirements/model/work-response.model.js';

import { workerSelectionQueueService } from '../modules/worker-selection/queues/worker-selection.queue.js';
import { notificationTransport } from '../sockets/notification-transport.js';

export interface WorkerSelectionWorkerHandle {
  name: 'worker-selection';
  close: () => Promise<void>;
}

export interface StartWorkerSelectionWorkerOptions {
  autoConnectDB?: boolean;
}

/**
 * Explicit startup function for Worker Selection background worker.
 * Can be called by the Unified Worker orchestrator or standalone runner.
 */
export async function startWorkerSelectionWorker(
  options?: StartWorkerSelectionWorkerOptions
): Promise<WorkerSelectionWorkerHandle> {
  console.log('🚀 [WorkerSelectionWorker] Bootstrapping background selection worker...');

  // 1. Verify Redis configuration
  if (!env.redisUrl && env.nodeEnv !== 'test') {
    throw new Error('[WorkerSelectionWorker] Fatal: REDIS_URL is not configured in environment.');
  }

  // 2. Connect to MongoDB only if explicitly requested and disconnected
  if (options?.autoConnectDB && mongoose.connection.readyState === 0) {
    await connectDB();
    console.log('✅ [WorkerSelectionWorker] Connected to MongoDB.');
  }

  // 3. Start BullMQ selection worker
  try {
    if (env.nodeEnv !== 'test') {
      workerSelectionQueueService.setMockMode(false);
    }
    workerSelectionQueueService.startWorker();
    console.log('✅ [WorkerSelectionWorker] BullMQ Worker started (Queue: worker-selection, Concurrency: 2)');
  } catch (queueErr: any) {
    console.error('❌ [WorkerSelectionWorker] Failed to initialize worker:', queueErr.message);
    throw queueErr;
  }

  // 4. Initial scan for any missed/expired deadlines surviving service restarts
  try {
    const scanned = await workerSelectionQueueService.scanAndProcessExpiredDeadlines();
    if (scanned > 0) {
      console.log(`🔍 [WorkerSelectionWorker] Processed ${scanned} overdue requirements during startup.`);
    }
  } catch (scanErr: any) {
    console.error('⚠️ [WorkerSelectionWorker] Warning during startup scan:', scanErr.message);
  }

  console.log('🎯 [WorkerSelectionWorker] Ready and awaiting deadline selection jobs.');

  return {
    name: 'worker-selection',
    close: async () => {
      console.log('🛑 [WorkerSelectionWorker] Closing selection worker and resources...');
      await workerSelectionQueueService.close();
      console.log('✅ [WorkerSelectionWorker] Selection queue and worker closed.');

      await notificationTransport.close();
      console.log('✅ [WorkerSelectionWorker] Notification transport closed.');
    },
  };
}

// ─── Standalone Execution Handler (Troubleshooting / Independent Run) ──────────

if (isMainModule(import.meta.url)) {
  let isShuttingDown = false;
  let activeHandle: WorkerSelectionWorkerHandle | null = null;

  const standaloneShutdown = async (signal: string): Promise<void> => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    console.log(`\n🛑 [WorkerSelectionWorker] Received ${signal}. Initiating graceful shutdown...`);

    try {
      if (activeHandle) {
        await activeHandle.close();
      }

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
  };

  process.on('SIGINT', () => standaloneShutdown('SIGINT'));
  process.on('SIGTERM', () => standaloneShutdown('SIGTERM'));

  process.on('unhandledRejection', (reason: unknown) => {
    console.error('❌ [WorkerSelectionWorker] Unhandled Rejection:', reason);
  });

  process.on('uncaughtException', (error: Error) => {
    console.error('❌ [WorkerSelectionWorker] Uncaught Exception:', error);
    standaloneShutdown('uncaughtException').finally(() => process.exit(1));
  });

  (async () => {
    try {
      await connectDB();
      activeHandle = await startWorkerSelectionWorker();
    } catch (err: any) {
      console.error('❌ [WorkerSelectionWorker] Fatal startup error:', err);
      process.exit(1);
    }
  })();
}
