/**
 * src/workers/notificationWorker.ts
 *
 * EventOps ERP — Notification Background Worker
 *
 * Responsibilities:
 * 1. Initialize BullMQ Worker for 'notification-processing' queue.
 * 2. Process asynchronous Work Requirement publication announcements.
 * 3. Process asynchronous Worker Selection completion notifications and manager summaries.
 * 4. Scan and recover any pending unannounced requirements or unsent selection summaries.
 * 5. Clean shutdown via exported handle.
 * 6. Standalone execution support for troubleshooting (e.g. npm run worker:notification).
 */
import '../config/env.js';
import { env } from '../config/env.js';
import { connectDB } from '../config/db.js';
import mongoose from 'mongoose';
import { isMainModule } from '../utils/isMainModule.js';

// Ensure all required Mongoose models are registered
import '../modules/auth/model/user.model.js';
import '../modules/services/model/service.model.js';
import '../modules/events/model/event.model.js';
import '../modules/work-requirements/model/work-requirement.model.js';
import '../modules/work-requirements/model/work-response.model.js';
import '../modules/work-requirements/model/worker-location-history.model.js';
import '../modules/notifications/model/notification.model.js';

import { notificationQueueService } from '../modules/notifications/queues/notification.queue.js';
import { notificationTransport } from '../sockets/notification-transport.js';

export interface NotificationWorkerHandle {
  name: 'notification-worker';
  close: () => Promise<void>;
}

export interface StartNotificationWorkerOptions {
  autoConnectDB?: boolean;
}

/**
 * Explicit startup function for Notification background worker.
 * Can be called by the Unified Worker orchestrator or standalone runner.
 */
export async function startNotificationWorker(
  options?: StartNotificationWorkerOptions
): Promise<NotificationWorkerHandle> {
  console.log('🚀 [NotificationWorker] Bootstrapping background notification worker...');

  // 1. Verify Redis configuration
  if (!env.redisUrl && env.nodeEnv !== 'test') {
    throw new Error('[NotificationWorker] Fatal: REDIS_URL is not configured in environment.');
  }

  // 2. Connect to MongoDB only if explicitly requested and disconnected
  if (options?.autoConnectDB && mongoose.connection.readyState === 0) {
    await connectDB();
    console.log('✅ [NotificationWorker] Connected to MongoDB.');
  }

  // 3. Start BullMQ notification worker
  try {
    if (env.nodeEnv !== 'test') {
      notificationQueueService.setMockMode(false);
    }
    notificationQueueService.startWorker();
    console.log('✅ [NotificationWorker] BullMQ Worker started (Queue: notification-processing, Concurrency: 3)');
  } catch (queueErr: any) {
    console.error('❌ [NotificationWorker] Failed to initialize worker:', queueErr.message);
    throw queueErr;
  }

  // 4. Initial recovery scan for un-dispatched announcements and selection summaries
  try {
    const recovered = await notificationQueueService.scanAndRecoverPendingNotifications();
    if (recovered > 0) {
      console.log(`🔍 [NotificationWorker] Recovered ${recovered} pending notification task(s) during startup.`);
    }
  } catch (scanErr: any) {
    console.error('⚠️ [NotificationWorker] Warning during startup scan:', scanErr.message);
  }

  console.log('🎯 [NotificationWorker] Ready and awaiting notification jobs.');

  return {
    name: 'notification-worker',
    close: async () => {
      console.log('🛑 [NotificationWorker] Closing notification worker and resources...');
      await notificationQueueService.close();
      console.log('✅ [NotificationWorker] Notification queue and worker closed.');

      await notificationTransport.close();
      console.log('✅ [NotificationWorker] Notification transport closed.');
    },
  };
}

// ─── Standalone Execution Handler (Troubleshooting / Independent Run) ──────────

if (isMainModule(import.meta.url)) {
  let isShuttingDown = false;
  let activeHandle: NotificationWorkerHandle | null = null;

  const standaloneShutdown = async (signal: string): Promise<void> => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    console.log(`\n🛑 [NotificationWorker] Received ${signal}. Initiating graceful shutdown...`);

    try {
      if (activeHandle) {
        await activeHandle.close();
      }

      if (mongoose.connection.readyState !== 0) {
        await mongoose.disconnect();
        console.log('✅ [NotificationWorker] MongoDB disconnected.');
      }

      console.log('👋 [NotificationWorker] Shutdown complete.');
      process.exit(0);
    } catch (err: any) {
      console.error('❌ [NotificationWorker] Error during shutdown:', err);
      process.exit(1);
    }
  };

  process.on('SIGINT', () => standaloneShutdown('SIGINT'));
  process.on('SIGTERM', () => standaloneShutdown('SIGTERM'));

  process.on('unhandledRejection', (reason: unknown) => {
    console.error('❌ [NotificationWorker] Unhandled Rejection:', reason);
  });

  process.on('uncaughtException', (error: Error) => {
    console.error('❌ [NotificationWorker] Uncaught Exception:', error);
    standaloneShutdown('uncaughtException').finally(() => process.exit(1));
  });

  (async () => {
    try {
      await connectDB();
      activeHandle = await startNotificationWorker();
    } catch (err: any) {
      console.error('❌ [NotificationWorker] Fatal startup error:', err);
      process.exit(1);
    }
  })();
}

