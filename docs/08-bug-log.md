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

---

## BUG-004 — `crypto.createHmac is not a function` in Payment Verification Test Suite

### Date

2026-09-26

### Feature / Module

Payments / tests/payments.test.ts

### Severity

Medium

### Status

Fixed / Verified

### Error / Symptom

The `Payment Verification` describe block failed entirely during `npm test` with:

```text
error: 'crypto.createHmac is not a function'
failureType: 'hookFailed'
```

All 6 sub-tests inside `Payment Verification` were cancelled by their parent.

### Root Cause

`payments.test.ts` called `crypto.createHmac(...)` inside a `before()` hook to generate a test HMAC-SHA256 signature, but the `crypto` module was never imported in that file. The bare name `crypto` resolved to `undefined` at runtime.

### Solution

Added `import crypto from 'node:crypto';` at the top of `tests/payments.test.ts`.

### Rule

Never rely on ambient globals in TypeScript test files. Always import Node.js built-in modules explicitly using the `node:` protocol prefix.

---

## BUG-005 — Reference Image Upload Silently Fails (Stale Server Process + Silent catch)

### Date

2026-09-30

### Feature / Module

Event Reference Images / CreateEventWizard.tsx / EventMediaService / .env

### Severity

High

### Status

Fixed / Verified

### Error / Symptom

Client selects Decoration, uploads a reference image, submits the event. Event is created successfully and the wizard shows "Event Created Successfully." However, when opening Event Details, the Decoration section shows "No reference images uploaded." — even though `selectedServices` and `preferences` are persisted correctly.

### Root Cause (Multi-layer)

**Layer 1 — Broken CLOUDINARY_API_KEY in .env (Primary)**

The `.env` file had a malformed `CLOUDINARY_API_KEY` value. Instead of the numeric key, it contained the literal string `CLOUDINARY_URL=cloudinary://<your_api_key>:...`. This caused every Cloudinary upload attempt to fail with a 401 from Cloudinary's API.

**Layer 2 — Stale Running Server Process**

After the `.env` was corrected, the running backend (`npm run dev`) was NOT restarted. The server process kept the old broken credentials in memory. All upload requests continued to return HTTP 500 because Cloudinary still received the invalid API key.

**Layer 3 — Silent Upload Failure in Frontend Wizard**

`CreateEventWizard.tsx` wrapped the upload in a try-catch that only called `console.error()` on failure and then called `setSuccessData(created)` unconditionally. The user was told "Success!" even when the upload failed with a 500. No visible error was shown, no retry was offered. This masked both Layer 1 and Layer 2 completely.

**Layer 4 — Diagnostic Collection Name Error**

Audit scripts queried MongoDB collection `medias` (Mongoose default pluralization of `Media`), but the actual Mongoose model `Media` maps to collection `media` (singular). This caused false "0 media docs" results in early diagnostics, masking that the backend pipeline was actually working once credentials were fixed.

### Solution

1. **Fixed `.env`**: Replaced `CLOUDINARY_API_KEY=CLOUDINARY_URL=...` with the actual numeric Cloudinary API key.
2. **Restarted backend**: Hot-reload via `tsx` dev server picked up the corrected credentials.
3. **Fixed `CreateEventWizard.tsx`**: Replaced silent `console.error` catch with truthful `setUploadError(msg)` state. Success screen now shows an amber warning if upload failed, with the exact error message and a Retry Upload button. Upload success shows a green confirmation.
4. **Added `retryUpload` function**: Allows re-attempting the upload for an already-created event without losing the event or re-entering the wizard.

### Verification

- Direct Cloudinary auth: `cloudinary.api.ping()` → ✅ ok, Plan: Free
- Direct service-layer test: `EventMediaService.uploadReferenceImages()` → ✅ Cloudinary URL returned, Media document created
- End-to-end HTTP diagnostic: `POST /api/events/:id/service-reference-images` → HTTP 200, `referenceImages[0].url = https://res.cloudinary.com/...`
- MongoDB `media` collection: 2 docs with correct `eventId`, `serviceId`, `url`, `publicId`
- `GET /api/events/:id` → `referenceImages` array populated, correct service grouping
- Backend TypeScript: clean (exit 0)
- Frontend TypeScript: clean (exit 0)
- Frontend build: clean (exit 0)
- Backend tests: 206/206 pass, 0 fail

### Rule

1. NEVER silently swallow upload errors after a successful primary operation. Always set visible error state.
2. Always restart the backend server after changing `.env` — hot-reload does NOT pick up `.env` changes automatically in all environments.
3. When querying MongoDB collections by name in diagnostic scripts, use the exact collection name (`media` not `medias`) or query via the Mongoose model which resolves the name automatically.
