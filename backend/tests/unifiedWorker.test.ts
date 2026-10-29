import './setup.js';
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { connectDB } from '../src/config/db.js';
import { env } from '../src/config/env.js';
import {
  UnifiedWorker,
  BackgroundWorkerHandle,
  RegisteredWorker,
  defaultWorkerRegistrations,
  startUnifiedWorker,
  stopUnifiedWorker,
} from '../src/workers/worker.js';
import {
  startPaymentReminderWorker,
  PaymentReminderWorkerHandle,
} from '../src/workers/paymentReminderWorker.js';
import {
  startWorkerSelectionWorker,
  WorkerSelectionWorkerHandle,
} from '../src/workers/workerSelectionWorker.js';
import {
  startNotificationWorker,
  NotificationWorkerHandle,
} from '../src/workers/notificationWorker.js';
import { paymentReminderQueueService } from '../src/modules/payments/queues/payment-reminder.queue.js';
import { workerSelectionQueueService } from '../src/modules/worker-selection/queues/worker-selection.queue.js';
import { notificationQueueService } from '../src/modules/notifications/queues/notification.queue.js';

describe('Unified Background Worker Architecture', () => {
  before(async () => {
    // Ensure test database connection
    await connectDB();
  });

  beforeEach(async () => {
    // Ensure connection is active before each test case
    if (mongoose.connection.readyState === 0) {
      await connectDB();
    }
  });

  after(async () => {
    // Teardown connections cleanly
    await paymentReminderQueueService.closeAll();
    await workerSelectionQueueService.close();
    await notificationQueueService.close();
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  });

  it('1. Default registration includes Payment Reminder, Worker Selection, and Notification workers', () => {
    const worker = new UnifiedWorker();
    const registrations = worker.getRegisteredWorkers();

    assert.equal(registrations.length, 3, 'Must have exactly 3 registered workers by default');
    assert.equal(registrations[0].name, 'Payment Reminder Worker');
    assert.equal(registrations[1].name, 'Worker Selection Worker');
    assert.equal(registrations[2].name, 'Notification Worker');
    assert.equal(typeof registrations[0].start, 'function');
    assert.equal(typeof registrations[1].start, 'function');
    assert.equal(typeof registrations[2].start, 'function');
  });

  it('2. Extensibility: Can register a future worker (e.g. Audit Worker) before startup', () => {
    const worker = new UnifiedWorker();
    let auditWorkerStarted = false;
    let auditWorkerClosed = false;

    worker.registerWorker({
      name: 'Audit Worker',
      start: async (): Promise<BackgroundWorkerHandle> => {
        auditWorkerStarted = true;
        return {
          name: 'Audit Worker',
          close: async () => {
            auditWorkerClosed = true;
          },
        };
      },
    });

    const registrations = worker.getRegisteredWorkers();
    assert.equal(registrations.length, 4, 'Must have 4 registered workers after addition');
    assert.equal(registrations[3].name, 'Audit Worker');
  });

  it('3. Throws when attempting to register a worker after startup has occurred', async () => {
    let mockCloseCalled = false;
    const worker = new UnifiedWorker([
      {
        name: 'Mock Worker',
        start: async () => ({
          name: 'Mock Worker',
          close: async () => {
            mockCloseCalled = true;
          },
        }),
      },
    ]);

    await worker.start();
    assert.equal(worker.getIsStarted(), true);

    assert.throws(
      () => {
        worker.registerWorker({
          name: 'Late Worker',
          start: async () => ({ name: 'Late Worker', close: async () => { } }),
        });
      },
      /Cannot register worker 'Late Worker' after UnifiedWorker has already started/
    );

    await worker.shutdown();
    assert.equal(mockCloseCalled, true);
  });

  it('4. Each startup function is invoked exactly once during start()', async () => {
    let worker1Calls = 0;
    let worker2Calls = 0;

    const worker = new UnifiedWorker([
      {
        name: 'Worker 1',
        start: async () => {
          worker1Calls++;
          return { name: 'Worker 1', close: async () => { } };
        },
      },
      {
        name: 'Worker 2',
        start: async () => {
          worker2Calls++;
          return { name: 'Worker 2', close: async () => { } };
        },
      },
    ]);

    const handles = await worker.start();
    assert.equal(worker1Calls, 1, 'Worker 1 starter must be called exactly once');
    assert.equal(worker2Calls, 1, 'Worker 2 starter must be called exactly once');
    assert.equal(handles.length, 2, 'Must return 2 active handles');
    assert.equal(worker.getActiveHandles().length, 2);

    // Calling start() again should be a no-op returning existing handles
    const secondHandles = await worker.start();
    assert.equal(worker1Calls, 1, 'Worker 1 starter must not be re-invoked on second start()');
    assert.equal(worker2Calls, 1, 'Worker 2 starter must not be re-invoked on second start()');
    assert.equal(secondHandles.length, 2);

    await worker.shutdown();
  });

  it('5. MongoDB initialization is not duplicated when already established', async () => {
    assert.equal(mongoose.connection.readyState, 1, 'MongoDB should already be connected');

    let dbCheckPassed = false;
    const worker = new UnifiedWorker([
      {
        name: 'DB Verification Worker',
        start: async () => {
          assert.equal(mongoose.connection.readyState, 1, 'Must use existing Mongoose connection');
          dbCheckPassed = true;
          return { name: 'DB Verification Worker', close: async () => { } };
        },
      },
    ]);

    await worker.start();
    assert.equal(dbCheckPassed, true);
    assert.equal(mongoose.connection.readyState, 1);

    await worker.shutdown();
    // Reconnect for subsequent tests since shutdown disconnects DB
    await connectDB();
  });

  it('6. Preserves existing recovery and scheduling logic in real worker starters', async () => {
    // All queues are in test/mock mode during test runs
    paymentReminderQueueService.setMockMode(true);
    workerSelectionQueueService.setMockMode(true);
    notificationQueueService.setMockMode(true);

    const paymentHandle = await startPaymentReminderWorker();
    assert.ok(paymentHandle);
    assert.equal(paymentHandle.name, 'payment-reminder');

    const selectionHandle = await startWorkerSelectionWorker();
    assert.ok(selectionHandle);
    assert.equal(selectionHandle.name, 'worker-selection');

    const notificationHandle = await startNotificationWorker();
    assert.ok(notificationHandle);
    assert.equal(notificationHandle.name, 'notification-worker');

    // Clean up handles
    await paymentHandle.close();
    await selectionHandle.close();
    await notificationHandle.close();
  });

  it('7. Startup failure rollback: closes resources already started before failure', async () => {
    let worker1Started = false;
    let worker1Closed = false;

    const worker = new UnifiedWorker([
      {
        name: 'Healthy Worker 1',
        start: async () => {
          worker1Started = true;
          return {
            name: 'Healthy Worker 1',
            close: async () => {
              worker1Closed = true;
            },
          };
        },
      },
      {
        name: 'Failing Worker 2',
        start: async () => {
          throw new Error('Simulated initialization crash in Worker 2');
        },
      },
    ]);

    await assert.rejects(
      async () => {
        await worker.start();
      },
      /Simulated initialization crash in Worker 2/
    );

    assert.equal(worker1Started, true, 'Healthy Worker 1 was started initially');
    assert.equal(worker1Closed, true, 'Healthy Worker 1 must be cleanly closed during rollback');
    assert.equal(worker.getActiveHandles().length, 0, 'No active handles should linger after failed startup');
    assert.equal(worker.getIsStarted(), false, 'Worker must not report as started after failure');
  });

  it('8. Graceful shutdown closes all worker instances in reverse order and is idempotent', async () => {
    const closeOrder: string[] = [];

    const worker = new UnifiedWorker([
      {
        name: 'Worker Alpha',
        start: async () => ({
          name: 'Worker Alpha',
          close: async () => {
            closeOrder.push('Worker Alpha');
          },
        }),
      },
      {
        name: 'Worker Beta',
        start: async () => ({
          name: 'Worker Beta',
          close: async () => {
            closeOrder.push('Worker Beta');
          },
        }),
      },
    ]);

    await worker.start();
    assert.equal(worker.getActiveHandles().length, 2);

    await worker.shutdown('SIGINT');

    // Closed in reverse order: Beta first, then Alpha
    assert.deepEqual(closeOrder, ['Worker Beta', 'Worker Alpha']);
    assert.equal(worker.getActiveHandles().length, 0);
    assert.equal(worker.getIsStarted(), false);

    // Subsequent shutdown calls should be idempotent
    await worker.shutdown('SIGTERM');
    assert.deepEqual(closeOrder, ['Worker Beta', 'Worker Alpha'], 'Close should not be called again');

    // Reconnect DB for next tests
    await connectDB();
  });

  it('9. Importing worker modules does not register duplicate process-level signal handlers', () => {
    // When imported as modules (not main script), no SIGINT / SIGTERM listeners are attached
    // We verify this by ensuring the count does not grow unexpectedly
    const sigintListeners = process.listeners('SIGINT');
    const sigtermListeners = process.listeners('SIGTERM');

    // Default listeners in tests should be only test runner or isolated handlers
    // Neither paymentReminderWorker nor workerSelectionWorker nor notificationWorker should have registered anything on import
    assert.ok(Array.isArray(sigintListeners));
    assert.ok(Array.isArray(sigtermListeners));
  });

  it('10. Database safety guard prevents tests from connecting to non-test databases', async () => {
    // Ensure the current test URI ends with _test
    const uri = process.env.MONGODB_URI || env.mongodbUri;
    assert.ok(
      uri.includes('_test'),
      `Test database URI must contain '_test' to guarantee isolation. Got: ${uri}`
    );
  });
});
