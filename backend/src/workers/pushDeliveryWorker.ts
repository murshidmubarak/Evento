/**
 * src/workers/pushDeliveryWorker.ts
 *
 * EventOps ERP — Web Push Delivery Background Worker
 *
 * Responsibilities:
 * 1. Initialize BullMQ Worker for 'notification-push' queue.
 * 2. Process asynchronous per-device push notification delivery jobs.
 * 3. Enforce cryptographic VAPID authentication and Web Push payload signing.
 * 4. Record provider acceptance or delivery failure in durable PushDelivery records.
 * 5. Handle unsubscription cleanup (HTTP 404/410) and bounded retry backoff.
 * 6. Clean shutdown via exported handle.
 */
import '../config/env.js';
import { env } from '../config/env.js';
import { connectDB } from '../config/db.js';
import mongoose from 'mongoose';
import { isMainModule } from '../utils/isMainModule.js';

// Ensure all required Mongoose models are registered
import '../modules/auth/model/user.model.js';
import '../modules/notifications/model/notification.model.js';
import '../modules/notifications/model/push-subscription.model.js';
import '../modules/notifications/model/push-delivery.model.js';

import { pushDeliveryQueueService } from '../modules/notifications/queues/push-delivery.queue.js';
import { pushDeliveryService } from '../modules/notifications/service/push-delivery.service.js';

export interface PushDeliveryWorkerHandle {
  name: 'push-delivery-worker';
  close: () => Promise<void>;
}

export interface StartPushDeliveryWorkerOptions {
  autoConnectDB?: boolean;
  concurrency?: number;
}

/**
 * Startup function for Web Push delivery worker.
 * Registered by the Unified Worker orchestrator or standalone runner.
 */
export async function startPushDeliveryWorker(
  options?: StartPushDeliveryWorkerOptions
): Promise<PushDeliveryWorkerHandle> {
  console.log('🚀 [PushDeliveryWorker] Bootstrapping background push delivery worker...');

  // 1. Verify Redis configuration in non-test mode
  if (!env.redisUrl && env.nodeEnv !== 'test') {
    throw new Error('[PushDeliveryWorker] Fatal: REDIS_URL is not configured in environment.');
  }

  // 2. Connect to MongoDB if disconnected and requested
  if (options?.autoConnectDB && mongoose.connection.readyState === 0) {
    await connectDB();
    console.log('✅ [PushDeliveryWorker] Connected to MongoDB.');
  }

  // 3. Initialize VAPID credentials
  pushDeliveryService.initVapid();

  // 4. Start BullMQ push worker
  try {
    if (env.nodeEnv !== 'test') {
      pushDeliveryQueueService.setMockMode(false);
    }
    const concurrency = options?.concurrency || 5;
    pushDeliveryQueueService.startWorker(concurrency);
    console.log(
      `✅ [PushDeliveryWorker] BullMQ Worker started (Queue: notification-push, Concurrency: ${concurrency})`
    );
  } catch (err: any) {
    console.error('❌ [PushDeliveryWorker] Failed to initialize worker:', err.message);
    throw err;
  }

  console.log('🎯 [PushDeliveryWorker] Ready and awaiting push delivery jobs.');

  return {
    name: 'push-delivery-worker',
    close: async () => {
      console.log('🛑 [PushDeliveryWorker] Closing push delivery worker and resources...');
      await pushDeliveryQueueService.close();
      console.log('✅ [PushDeliveryWorker] Push delivery queue and worker closed.');
    },
  };
}

// ─── Standalone Execution Handler ─────────────────────────────────────────────

if (isMainModule(import.meta.url)) {
  (async () => {
    try {
      console.log('⚡ [PushDeliveryWorker] Running in standalone diagnostic mode...');
      const handle = await startPushDeliveryWorker({ autoConnectDB: true });

      const shutdown = async () => {
        console.log('\n🛑 Standalone worker received termination signal.');
        await handle.close();
        if (mongoose.connection.readyState !== 0) {
          await mongoose.disconnect();
        }
        process.exit(0);
      };

      process.on('SIGINT', shutdown);
      process.on('SIGTERM', shutdown);
    } catch (err: any) {
      console.error('💥 [PushDeliveryWorker] Fatal error during standalone startup:', err.message);
      process.exit(1);
    }
  })();
}

