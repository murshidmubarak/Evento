# EventOps ERP — Test Database Isolation & Data Protection Guide

## Overview

This document defines the architecture, safety guards, and rules for test execution in the EventOps ERP codebase. 

It explains why development database data was previously wiped when running tests, the multi-layered safety guards implemented to completely prevent this behavior, how isolated test databases work, and how they are automatically deleted after test completion.

---

## 1. The Incident: Why Local DB Data Was Wiped

### Root Cause Analysis

When tests were executed, users and data in the local MongoDB development database (`eventops`) were unintentionally deleted due to a combination of three defects:

1. **Missing `setup.js` in Test Files:**
   - Test files like `backend/tests/profile.test.ts`, `backend/tests/authRegistration.test.ts`, and `backend/tests/eventMedia.test.ts` did not import `./setup.js`.
   - `profile.test.ts` directly invoked:
     ```typescript
     await mongoose.connect(env.mongodbUri);
     await User.deleteMany({});
     await Sequence.deleteMany({});
     ```
   - Because `setup.js` was never evaluated for that test runner process, `env.mongodbUri` pointed directly to the developer's local MongoDB database (`mongodb://127.0.0.1:27017/eventops`).
   - As a result, line 24 executed `User.deleteMany({})` directly on the developer's live local database, wiping all admin and user accounts.

2. **Static `env.mongodbUri` Caching:**
   - In `backend/src/config/env.ts`, `mongodbUri` was defined as a static property:
     ```typescript
     mongodbUri: process.env.MONGODB_URI as string
     ```
   - If `env.ts` was imported by any module before `setup.ts` could rewrite `process.env.MONGODB_URI`, `env.mongodbUri` was permanently stuck pointing to `eventops`.

3. **No Connection Guard in `connectDB()`:**
   - `connectDB()` in `src/config/db.ts` blindly connected to whatever URI was passed without verifying whether a test was attempting to run against a production or development database.

---

## 2. Multi-Layer Safety Architecture

To permanently guarantee that tests **never touch or delete real data**, four defensive layers have been implemented:

```
┌─────────────────────────────────────────────────────────────┐
│ 1. CLI Preload Layer (package.json)                         │
│    tsx --import ./tests/setup.ts --test ...                 │
│    Guarantees setup.ts runs before ANY test file loads      │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. Dynamic Environment Layer (env.ts)                       │
│    env.mongodbUri is now a dynamic getter                   │
│    Always reflects process.env.MONGODB_URI in real time     │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. Hard Safety Guard Layer (db.ts)                          │
│    In test mode, URI MUST contain '_test'                   │
│    Throws FATAL error and ABORTS if attempting dev DB       │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. Automatic Teardown & Deletion Layer (setup.ts)           │
│    mongoose.disconnect is hooked:                           │
│    Automatically drops the test DB before disconnecting     │
└─────────────────────────────────────────────────────────────┘
```

### Layer 1: Global Test Preload (`package.json`)
In `backend/package.json`, the test script uses `--import ./tests/setup.ts`:
```json
"test": "tsx --import ./tests/setup.ts --test --test-concurrency=1 tests/**/*.test.ts"
```
Even if a developer creates a new test file in the future and forgets to add `import './setup.js'`, Node/tsx executes `tests/setup.ts` before the test file is loaded.

### Layer 2: Dynamic URI Getters (`src/config/env.ts`)
`env.mongodbUri`, `env.nodeEnv`, `env.isDevelopment`, and `env.isProduction` are implemented as ES getters:
```typescript
export const env = {
  get mongodbUri(): string {
    return process.env.MONGODB_URI as string;
  },
  get nodeEnv(): string {
    return (process.env.NODE_ENV as string) || 'development';
  },
  // ...
}
```
Any mutation to `process.env.MONGODB_URI` made by `setup.ts` (e.g. redirecting to `eventops_test`) is immediately reflected throughout all backend modules.

### Layer 3: Hard Safety Guard in `connectDB()` (`src/config/db.ts`)
`connectDB()` refuses to connect if running under `NODE_ENV === 'test'` and the database does not end in `_test`:
```typescript
if (process.env.NODE_ENV === 'test' || env.nodeEnv === 'test') {
  if (!uri || !uri.includes('_test')) {
    throw new Error(
      `CRITICAL DATABASE SAFETY VIOLATION: Test process attempted to connect to '${uri}'. ` +
      `Tests must ONLY run against an isolated test database ending in '_test' (e.g. eventops_test) to protect real data.`
    );
  }
}
```
If any test ever tries to connect to `eventops`, it will immediately crash before a single query can run.

### Layer 4: Automatic Test Database Deletion (`tests/setup.ts`)
When tests complete and call `await mongoose.disconnect()`, `setup.ts` intercepts the call, drops the isolated database, and logs the deletion:
```typescript
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

// Hook mongoose.disconnect to ensure test DB is dropped before connection closes
(async () => {
  const mongoose = (await import('mongoose')).default;
  const originalDisconnect = mongoose.disconnect.bind(mongoose);
  mongoose.disconnect = async function () {
    await cleanupTestDatabase();
    return originalDisconnect();
  };
})();
```

---

## 3. Configuration & Overrides

### Default Behavior
If `MONGODB_TEST_URI` is not set:
1. `setup.ts` parses `MONGODB_URI` from `.env`.
2. It replaces the database name with `<dbname>_test` (e.g. `eventops` → `eventops_test`).
3. All test queries and model operations execute strictly inside `eventops_test`.
4. Upon test completion, `eventops_test` is dropped completely.

### Custom Test URI (Optional)
If you wish to specify a dedicated test MongoDB instance or database name, set `MONGODB_TEST_URI` in `.env`:
```env
MONGODB_TEST_URI=mongodb://127.0.0.1:27017/eventops_test
```
*Note: The database name in the URI MUST contain `_test` to satisfy the safety guard.*

---

## 4. Best Practices for Writing Backend Tests

When adding new tests to `backend/tests/`:

1. **Always import setup at line 1:**
   ```typescript
   import './setup.js';
   ```
2. **Use `connectDB()` rather than raw `mongoose.connect()`:**
   ```typescript
   import { connectDB } from '../src/config/db.js';
   
   before(async () => {
     await connectDB();
   });
   ```
3. **Always disconnect in the `after` hook:**
   ```typescript
   after(async () => {
     await mongoose.disconnect();
   });
   ```
   *Calling `mongoose.disconnect()` automatically triggers the test database drop.*
4. **Never hardcode production or development database names.**

---

## 5. Restoring Development Data

If your local development database was wiped prior to these protections:

- **Create an Admin Account via CLI:**
  ```bash
  npm run admin:create
  ```
  Follow the interactive prompts to create an admin with your desired name, email, and password.

- **Seed Default Development Data (Admin, Event Manager, Services):**
  ```bash
  npm run seed
  ```
  This creates default accounts (e.g., `admin@eventops.com` / `Admin@1234` and `manager@eventops.com`).

> [!CAUTION]
> **Environment Restriction**: **Avoid running `npm run seed` in staging or production environments.**
> The `seed.ts` script is strictly reserved for local development environments. It inserts mock users with predictable static passwords (`Admin@1234`, `Manager@1234`, `password123`). Running it on non-development environments exposes the platform to credential compromise. In staging and production environments, always create administrative accounts using the interactive tool: `npm run admin:create`.
