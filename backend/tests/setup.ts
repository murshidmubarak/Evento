import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure .env is loaded from backend directory
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config();

process.env.NODE_ENV = 'test';
process.env.RAZORPAY_KEY_ID = 'rzp_test_dummy_key_id';
process.env.RAZORPAY_KEY_SECRET = 'dummy_secret';
process.env.RAZORPAY_WEBHOOK_SECRET = 'test_webhook_secret';
process.env.FRONTEND_URL = 'http://localhost:5173';
process.env.SMTP_USER = '';
process.env.SMTP_PASS = '';
process.env.REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

// ISOLATE TEST DATABASE:
// Ensure tests always run against eventops_test so that test cleanup
// (e.g. User.deleteMany, Event.deleteMany) never wipes the dev database.
if (process.env.MONGODB_TEST_URI) {
  process.env.MONGODB_URI = process.env.MONGODB_TEST_URI;
} else if (process.env.MONGODB_URI) {
  try {
    const url = new URL(process.env.MONGODB_URI);
    if (!url.pathname || url.pathname === '/') {
      url.pathname = '/eventops_test';
    } else if (!url.pathname.endsWith('_test')) {
      url.pathname = `${url.pathname}_test`;
    }
    process.env.MONGODB_URI = url.toString();
  } catch {
    process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/eventops_test';
  }
}

// Provide fallback values if environment variables are not set in the running shell
if (!process.env.MONGODB_URI) {
  throw new Error('MONGODB_URI is not set. Please check your .env file.');
}

// HARD SAFETY GUARD:
// Absolute protection against accidental execution on production/dev DB.
// Tests are forbidden from executing against any database that does not have '_test' in its URI.
if (!process.env.MONGODB_URI.includes('_test')) {
  throw new Error(
    `CRITICAL DATABASE SAFETY VIOLATION: Tests attempted to connect to '${process.env.MONGODB_URI}'. ` +
    'Tests must ONLY run against an isolated test database (e.g. eventops_test) to protect real data.'
  );
}

if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET is not set. Please check your .env file.');
}

/**
 * Drops the test database completely after test execution.
 * Only drops if the database name ends with '_test'.
 */
export const cleanupTestDatabase = async () => {
  try {
    const mongoose = (await import('mongoose')).default;
    if (mongoose.connection.readyState === 1 && mongoose.connection.name.endsWith('_test')) {
      const dbName = mongoose.connection.name;
      await mongoose.connection.dropDatabase();
      console.log(`🧹 Dropped isolated test database: ${dbName}`);
    }
  } catch (err) {
    console.error('Failed to drop test database:', err);
  }
};

// Automatically drop test database whenever mongoose.disconnect() is called in test teardown
(async () => {
  const mongoose = (await import('mongoose')).default;
  const originalDisconnect = mongoose.disconnect.bind(mongoose);
  mongoose.disconnect = async function () {
    await cleanupTestDatabase();
    return originalDisconnect();
  };
})();

// Automatic cleanup hook on test process completion in case disconnect was not invoked
process.on('beforeExit', async () => {
  try {
    await cleanupTestDatabase();
  } catch {
    // Ignore teardown errors
  }
});
