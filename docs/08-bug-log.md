# EventOps ERP — Bug Log and Solutions

## Purpose

This document is the permanent project bug history.

Every important bug, error, failure, unexpected behavior, and its verified solution must be recorded here.

The purpose is to prevent solving the same problem repeatedly and to give future development work a reliable project-specific troubleshooting reference.

---

# Mandatory Bug Workflow

Before investigating a new error:

1. Read this document first.
2. Search for the current error, error message, affected file, module, or related symptom.
3. If the same or similar bug already exists:
   - Review the previous solution.
   - Verify whether the same conditions exist.
   - Prefer the documented solution when it is still applicable.
4. Do not blindly repeat an old solution if the architecture or dependencies have changed.
5. If the bug is new:
   - Investigate it.
   - Fix it.
   - Verify the fix.
   - Append the bug and verified solution to this document.

---

# Bug Record Format

Every bug entry should use the following format.

## BUG-[NUMBER] — [Short Bug Title]

### Date

YYYY-MM-DD

### Feature / Module

Example:

Authentication

### Severity

- Critical
- High
- Medium
- Low

### Status

- Open
- Investigating
- Fixed
- Verified
- Reopened

### Error / Symptom

Describe exactly what happened.

Include the exact error message where available.

Example:

```text
Error: Port 5000 is already in use
```

---

# Bug Entries

## BUG-001 — Test Suite Hangs After events.test.ts (Missing mongoose.disconnect)

### Date

2026-09-25

### Feature / Module

Test Infrastructure / events.test.ts / quotations.test.ts

### Severity

Medium

### Status

Fixed / Verified

### Error / Symptom

Running `npm test` (full suite) would hang indefinitely after the Event Requests API suite completed. No subsequent test file (quotations, services, userManagement, etc.) would execute.

Also, `businessId.test.ts` would fail on the second consecutive `npm test` run with:

```text
E11000 duplicate key error collection: eventops.users index: email_1 dup key: { email: "admin.businessid@example.com" }
```

### Root Cause

1. `events.test.ts` `after()` hook closed the HTTP server but did NOT call `await mongoose.disconnect()`. This left the MongoDB connection open, blocking the next test file's `connectDB()` call indefinitely.

2. `quotations.test.ts` had the same missing `mongoose.disconnect()` issue.

3. `businessId.test.ts` `after()` hook used `User.deleteMany({ email: { $ne: 'admin.businessid@example.com' } })`, which preserved the test admin user in the database. On the next `npm test` run, the `before()` hook failed trying to re-insert that user.

### Solution

- Added `await mongoose.disconnect()` to the `after()` hook in `events.test.ts` (line 69).
- Added `await mongoose.disconnect()` to the `after()` hook in `quotations.test.ts` (line 121).
- Changed `businessId.test.ts` `after()` hook to `User.deleteMany({})` to clean up all users including the test admin.

### Rule

Every test file that calls `connectDB()` inside `before()` MUST call `await mongoose.disconnect()` inside `after()`.

---

## BUG-002 — Non-Atomic Quotation Revision Generation (Race Condition)

### Date

2026-09-25

### Feature / Module

Quotations / quotation.service.ts / quotation.repository.ts

### Severity

Medium

### Status

Fixed / Verified

### Error / Symptom

The original quotation service used a find-then-insert pattern for determining the next revision number:

```ts
const latest = await quotationRepository.getLatestRevision(quotationNumber);
revision = latest.revision + 1;
// ... then insert with this revision
```

Under concurrent requests for the same quotation thread, two simultaneous callers could both read the same `latest.revision` and both try to insert the same `revision + 1`, causing a MongoDB duplicate key error (E11000) due to the `{ quotationNumber, revision }` unique index. This would surface as an unhandled 500 error.

### Root Cause

Non-atomic read-modify-write on the revision counter. The window between reading the latest revision and inserting the new quotation document is not protected.

### Solution

Added `getNextRevision(quotationNumber: string)` to `QuotationRepository` which uses the existing `SequenceRepository.getNextSequenceValue()` with a quotation-specific key (`qtn_rev:<quotationNumber>`). This is an atomic `findOneAndUpdate` with `$inc` on the Sequence collection, guaranteeing no two concurrent requests receive the same revision number.

The first revision (1) is assigned directly. All subsequent revisions are allocated atomically via the sequence.

The unique index on `{ quotationNumber, revision }` remains as a final safety net.

---

## BUG-003 — Razorpay API Call During Automated Tests (Missing Test Bypass)

### Date

2026-09-25

### Feature / Module

Payments / payment.service.ts / payments.test.ts

### Severity

Medium

### Status

Fixed / Verified

### Error / Symptom

The test suite failed with a 500 error: `Failed to create Razorpay order.` when running `payments.test.ts`. The `payment.service.ts` was attempting to execute a live Razorpay SDK call (`this.razorpay.orders.create`) using the dummy `rzp_test_dummy_key_id` configured for local test runs.

### Root Cause

The test runner `node:test` execution (`npx tsx --test`) did not inherently set `process.env.NODE_ENV = 'test'` (it evaluated as `'development'`). Since `payment.service.ts` only conditionally bypassed the external Razorpay API when `env.nodeEnv === 'test'`, it allowed the code execution to fall through to the real API call using invalid dummy credentials, resulting in a 500 rejection.

### Solution

Updated the conditional bypass in `payment.service.ts` to also check if `env.razorpayKeyId === 'rzp_test_dummy_key_id'`:
```ts
if (env.nodeEnv !== 'test' && env.razorpayKeyId !== 'rzp_test_dummy_key_id') {
  // execute real razorpay call
}
```
This safely defaults to the bypass behavior anytime the dummy test keys are active, regardless of `NODE_ENV`. Tests now properly simulate the order generation and pass securely.