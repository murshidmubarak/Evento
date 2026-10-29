/**
 * src/workers/worker.ts
 *
 * EventOps ERP — Unified Background Worker
 *
 * Responsibilities:
 * 1. Initialize shared application infrastructure (MongoDB connection & Mongoose models) once.
 * 2. Start the Payment Reminder worker (payment-reminder-scan & payment-reminder-email queues).
 * 3. Start the Worker Selection worker (worker-selection queue & missed deadline scanner).
 * 4. Extensible architecture: structured to easily register future workers (e.g. Notification Worker).
 * 5. Track all active worker resource handles.
 * 6. Handle startup failures safely with automatic rollback and resource cleanup.
 * 7. Graceful process shutdown on SIGINT and SIGTERM.
 */
import '../config/env.js';
import { env } from '../config/env.js';
import { connectDB } from '../config/db.js';
import mongoose from 'mongoose';
import { isMainModule } from '../utils/isMainModule.js';

// Ensure all shared Mongoose models are registered in the unified worker process
import '../modules/auth/model/user.model.js';
import '../modules/services/model/service.model.js';
import '../modules/events/model/event.model.js';
import '../modules/quotations/model/quotation.model.js';
import '../modules/payments/model/payment.model.js';
import '../modules/payments/model/payment-reminder-log.model.js';
import '../modules/work-requirements/model/work-requirement.model.js';
import '../modules/work-requirements/model/work-response.model.js';
import '../modules/notifications/model/notification.model.js';

import {
  startPaymentReminderWorker,
  PaymentReminderWorkerHandle,
} from './paymentReminderWorker.js';
import {
  startWorkerSelectionWorker,
  WorkerSelectionWorkerHandle,
} from './workerSelectionWorker.js';
import {
  startNotificationWorker,
  NotificationWorkerHandle,
} from './notificationWorker.js';

export interface BackgroundWorkerHandle {
  name: string;
  close: () => Promise<void>;
}

export type WorkerStarter = () => Promise<BackgroundWorkerHandle>;

export interface RegisteredWorker {
  name: string;
  start: WorkerStarter;
}

/**
 * Standard registry of background workers started by the Unified Worker.
 * Starts all three independent BullMQ workloads:
 * 1. Payment Reminder worker (payment-reminder-scan, payment-reminder-email)
 * 2. Worker Selection worker (worker-selection)
 * 3. Notification worker (notification-processing)
 */
export const defaultWorkerRegistrations: RegisteredWorker[] = [
  { name: 'Payment Reminder Worker', start: startPaymentReminderWorker },
  { name: 'Worker Selection Worker', start: startWorkerSelectionWorker },
  { name: 'Notification Worker', start: startNotificationWorker },
];

export class UnifiedWorker {
  private registeredWorkers: RegisteredWorker[];
  private activeHandles: BackgroundWorkerHandle[] = [];
  private isStarted: boolean = false;
  private isShuttingDown: boolean = false;
  private signalHandlersAttached: boolean = false;

  constructor(registrations: RegisteredWorker[] = defaultWorkerRegistrations) {
    this.registeredWorkers = [...registrations];
  }

  /**
   * Registers an additional background worker before startup.
   * Enables clean registration of future workers (e.g. Notification Worker).
   */
  public registerWorker(worker: RegisteredWorker): void {
    if (this.isStarted) {
      throw new Error(`Cannot register worker '${worker.name}' after UnifiedWorker has already started.`);
    }
    this.registeredWorkers.push(worker);
  }

  public getActiveHandles(): BackgroundWorkerHandle[] {
    return [...this.activeHandles];
  }

  public getRegisteredWorkers(): RegisteredWorker[] {
    return [...this.registeredWorkers];
  }

  public getIsStarted(): boolean {
    return this.isStarted;
  }

  public getIsShuttingDown(): boolean {
    return this.isShuttingDown;
  }

  /**
   * Starts all registered workers in deterministic sequence.
   * If any worker fails during startup, all previously started workers are rolled back and closed safely.
   */
  public async start(): Promise<BackgroundWorkerHandle[]> {
    if (this.isStarted) {
      console.warn('⚠️ [UnifiedWorker] Unified worker is already started.');
      return this.activeHandles;
    }

    console.log('🚀 [UnifiedWorker] Bootstrapping unified background worker process...');

    // 1. Validate environment
    if (!env.redisUrl && env.nodeEnv !== 'test') {
      throw new Error('[UnifiedWorker] Fatal: REDIS_URL is not configured in environment.');
    }

    // 2. Initialize shared MongoDB connection once
    if (mongoose.connection.readyState === 0) {
      await connectDB();
      console.log('✅ [UnifiedWorker] Shared MongoDB connection established.');
    } else {
      console.log('ℹ️ [UnifiedWorker] Reusing established MongoDB connection.');
    }

    // 3. Start each registered background worker in deterministic sequence
    for (const reg of this.registeredWorkers) {
      try {
        console.log(`▶️ [UnifiedWorker] Starting ${reg.name}...`);
        const handle = await reg.start();
        this.activeHandles.push(handle);
        console.log(`✅ [UnifiedWorker] ${reg.name} started successfully.`);
      } catch (err: any) {
        console.error(`❌ [UnifiedWorker] Startup failed while starting ${reg.name}:`, err.message);
        // Rollback: safely close any workers that were already started
        await this.rollbackStartup();
        throw err;
      }
    }

    this.isStarted = true;
    console.log(`🎯 [UnifiedWorker] All ${this.activeHandles.length} background worker(s) are active and running.`);
    return this.activeHandles;
  }

  /**
   * Rolls back partially initialized workers on startup failure.
   */
  private async rollbackStartup(): Promise<void> {
    console.log('🔄 [UnifiedWorker] Rolling back partially started workers...');
    while (this.activeHandles.length > 0) {
      const handle = this.activeHandles.pop();
      if (handle) {
        try {
          console.log(`🛑 [UnifiedWorker] Rolling back ${handle.name}...`);
          await handle.close();
          console.log(`✅ [UnifiedWorker] ${handle.name} closed.`);
        } catch (closeErr: any) {
          console.error(`⚠️ [UnifiedWorker] Error during rollback of ${handle.name}:`, closeErr.message);
        }
      }
    }
    this.isStarted = false;
  }

  /**
   * Graceful shutdown of all active workers and shared database resources.
   */
  public async shutdown(signal: string = 'SIGTERM'): Promise<void> {
    if (this.isShuttingDown) return;
    this.isShuttingDown = true;

    console.log(`\n🛑 [UnifiedWorker] Received ${signal}. Initiating graceful shutdown...`);

    // 1. Stop and close all active workers in reverse order
    while (this.activeHandles.length > 0) {
      const handle = this.activeHandles.pop();
      if (handle) {
        try {
          console.log(`🛑 [UnifiedWorker] Shutting down ${handle.name}...`);
          await handle.close();
          console.log(`✅ [UnifiedWorker] ${handle.name} closed cleanly.`);
        } catch (err: any) {
          console.error(`❌ [UnifiedWorker] Error shutting down ${handle.name}:`, err.message);
        }
      }
    }

    // 2. Disconnect shared MongoDB connection after worker consumers have stopped
    if (mongoose.connection.readyState !== 0) {
      try {
        await mongoose.disconnect();
        console.log('✅ [UnifiedWorker] Shared MongoDB connection disconnected.');
      } catch (dbErr: any) {
        console.error('❌ [UnifiedWorker] Error disconnecting MongoDB:', dbErr.message);
      }
    }

    this.isStarted = false;
    console.log('👋 [UnifiedWorker] Graceful shutdown complete.');
  }

  /**
   * Attaches process signal listeners for standalone execution.
   */
  public attachSignalHandlers(): void {
    if (this.signalHandlersAttached) return;
    this.signalHandlersAttached = true;

    const handleSignal = async (signal: string) => {
      await this.shutdown(signal);
      process.exit(0);
    };

    process.on('SIGINT', () => handleSignal('SIGINT'));
    process.on('SIGTERM', () => handleSignal('SIGTERM'));

    process.on('unhandledRejection', (reason: unknown) => {
      console.error('❌ [UnifiedWorker] Unhandled Rejection:', reason);
    });

    process.on('uncaughtException', (error: Error) => {
      console.error('❌ [UnifiedWorker] Uncaught Exception:', error);
      this.shutdown('uncaughtException').finally(() => {
        process.exit(1);
      });
    });
  }
}

// ─── Convenience Singleton & Runner ──────────────────────────────────────────

export const unifiedWorker = new UnifiedWorker();

export async function startUnifiedWorker(): Promise<BackgroundWorkerHandle[]> {
  return unifiedWorker.start();
}

export async function stopUnifiedWorker(signal?: string): Promise<void> {
  return unifiedWorker.shutdown(signal);
}

// ─── Standalone Entry Point (npm run worker) ──────────────────────────────────

if (isMainModule(import.meta.url)) {
  const orchestrator = new UnifiedWorker();
  orchestrator.attachSignalHandlers();
  orchestrator.start().catch((err) => {
    console.error('❌ [UnifiedWorker] Fatal startup error:', err);
    process.exit(1);
  });
}

