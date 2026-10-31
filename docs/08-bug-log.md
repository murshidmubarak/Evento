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

---

## BUG-006 — Quotation Revision Auto-Incrementing + "Validation Failed" on Issue Quotation

### Date

2026-10-06

### Feature / Module

Quotations / AdminCreateQuotation.tsx / quotation.validation.ts / quotation.service.ts

### Severity

High

### Status

Fixed / Verified

### Error / Symptom

1. Every click of the "Issue Quotation" button created a new quotation revision for the same event, resulting in revision 4 after just a few clicks (expected: revision 1 per event thread unless admin explicitly revises).

2. The "Issue Quotation" button sometimes showed "Validation failed" error.

### Root Cause

**Revision incrementing:**
The `handleSave(issue=true)` in `AdminCreateQuotation.tsx` always called `createQuotation` (which creates a new quotation doc → new revision per business logic) then `sendQuotation`. No guard existed against double-clicks. Each click = new revision.

**Validation failed:**
- `quantity` was set via `Number(e.target.value) || 0`. If the field was `0` or empty, it would pass `0`, which fails the backend check `item.quantity < 1 || !Number.isInteger(item.quantity)`.
- `Number(e.target.value)` can produce a float (e.g., `1.5`) which fails `Number.isInteger()`.
- Empty `detailedContent` sections with empty strings were sent, passing through unnecessarily.

### Solution

1. Added `if (isSaving) return;` guard at the top of `handleSave` to prevent double-click from submitting multiple times.
2. Changed `navigate()` to be called once after both `createQuotation` and `sendQuotation` (if issue=true), preventing duplicate navigation attempts.
3. Added a `sanitizedItems` step inside `handleSave` that enforces:
   - `quantity = Math.max(1, Math.floor(Number(quantity) || 1))` → always a positive integer.
   - `unitPrice = Math.max(0, Number(unitPrice) || 0)` → always non-negative.
   - `requirements` and `scope` default to `''` (never undefined/null).
   - `detailedContent` filtered to remove empty/blank sections.
4. Updated the quantity `<input>` to use `step="1"` and `Math.floor` on change.

### Rule

Always sanitize numeric inputs to meet backend validation requirements before submitting. Backend validation uses strict `Number.isInteger()` for quantity — never pass `0`, `NaN`, or floats.

---

## BUG-007 — Quotation Creation Fails with "Path `content` is required"

### Date

2026-10-06

### Feature / Module

Quotations / AdminCreateQuotation.tsx / quotation.model.ts / quotation.service.ts

### Severity

High

### Status

Fixed / Verified

### Error / Symptom

When saving or issuing a quotation from `AdminCreateQuotation.tsx`, the submission fails with:
`Validation failed`
`• Path `content` is required.`
`• Path `content` is required.`

### Root Cause

1. In `quotation.model.ts`, `structuredTermSchema` defined `content: { type: String, required: true }`.
2. When the admin added structured terms in `AdminCreateQuotation.tsx` (e.g. entering titles like "Validity" or "Cancellation" but leaving the content textarea blank, or leaving rows empty), empty strings `""` were sent for `content`.
3. Mongoose treats empty string `""` as missing for required string paths, triggering Mongoose `ValidationError` on the document.
4. Neither frontend nor backend sanitized `structuredTerms`, `schedules`, or `paymentPlan` before database persistence.

### Solution

1. Updated `quotation.model.ts`:
   - `structuredTermSchema.content`: changed from `required: true` to `default: ''`.
   - `quotationScheduleSchema.time`: changed to `default: ''`.
   - `paymentInstallmentSchema.dueDateDescription`: changed to `default: ''`.
2. Updated `quotation.service.ts` to sanitize `structuredTerms`, `schedules`, `paymentPlan`, and `detailedContent` before calling `quotationRepository.create()`.
3. Updated `AdminCreateQuotation.tsx` `handleSave` to sanitize `structuredTerms`, `schedules`, and `paymentPlan` (filtering empty rows and setting safe defaults) before submitting the request.
4. Updated the placeholder in `AdminCreateQuotation.tsx` to `Content (optional)...`.

### Rule

Never mark subdocument detail fields as `required: true` in Mongoose schemas if they can be omitted in user forms. Always sanitize array inputs on both client and service layers before persistence.

---

## BUG-009 — Accidental Development Database Deletion During Test Execution and TypeScript Overload Error

### Date

2026-10-10

### Affected Modules

- `backend/tests/adminCreation.test.ts`
- `backend/tests/profile.test.ts`
- `backend/tests/authRegistration.test.ts`
- `backend/tests/eventMedia.test.ts`
- `backend/tests/setup.ts`
- `backend/src/config/db.ts`
- `backend/src/config/env.ts`

### Severity

Critical

### Status

Fixed / Verified

### Error / Symptom

1. **TypeScript Overload Error in `adminCreation.test.ts`:**
   ```
   No overload matches this call.
     Overload 1 of 2, '(password: string, hash: string): Promise<boolean>', gave the following error.
       Argument of type 'string | undefined' is not assignable to parameter of type 'string'.
   ```
2. **Accidental Database Wiping:**
   Running tests unintentionally wiped users, admins, and documents in the local development database (`eventops`).

### Root Cause

1. In `adminCreation.test.ts`, `dbAdmin.password` has type `string | undefined` because `IUser.password` is optional. Passing it to `bcrypt.compare(rawPassword, dbAdmin.password)` caused a TypeScript overload mismatch.
2. `profile.test.ts`, `authRegistration.test.ts`, and `eventMedia.test.ts` did not import `./setup.js`.
3. In `profile.test.ts`, `await mongoose.connect(env.mongodbUri)` was called with `await User.deleteMany({})`. Because `setup.js` had not run, `env.mongodbUri` was pointed to `mongodb://127.0.0.1:27017/eventops`, wiping the developer's live database.
4. `env.mongodbUri` was a static string property evaluated at load time, causing stale database URI references if `env.ts` was loaded before `process.env.MONGODB_URI` was updated.
5. `connectDB()` lacked a check preventing tests from connecting to non-test databases.

### Solution

1. In `adminCreation.test.ts`, passed `dbAdmin.password || ''` to satisfy the `string` requirement of `bcrypt.compare`.
2. Added `import './setup.js'` to `authRegistration.test.ts`, `eventMedia.test.ts`, and `profile.test.ts`.
3. Switched `env.mongodbUri`, `env.nodeEnv`, `env.isDevelopment`, and `env.isProduction` to dynamic ES getters in `env.ts`.
4. Added a hard safety guard in `src/config/db.ts` that immediately throws an error and aborts if `NODE_ENV === 'test'` and the URI does not contain `_test`.
5. Preloaded `./tests/setup.ts` via `--import ./tests/setup.ts` in `package.json` test script.
6. Hooked `mongoose.disconnect` in `tests/setup.ts` to automatically drop the isolated test database (`eventops_test`) before disconnecting.
7. Documented the complete test isolation architecture in `docs/10-test-database-isolation.md`.

### Rule

Never connect to a development database during tests. All tests must run strictly against isolated test databases ending in `_test`, which must be automatically dropped upon test completion.

---

## BUG-010 — Duplicate Schema Index on receiptReference in Payment Model and Razorpay Environment Config in Tests

### Date

2026-10-12

### Affected Modules

- `backend/src/modules/payments/model/payment.model.ts`
- `backend/src/config/env.ts`
- `backend/tests/setup.ts`
- `backend/tests/payments.test.ts`

### Severity

Medium

### Status

Fixed / Verified

### Error / Symptom

1. **Duplicate Schema Index Warning:**
   Mongoose threw a duplicate index warning on model compilation: `An index with the same specification already exists: { receiptReference: 1 }`.
2. **Missing Test Gateway Credentials:**
   Running payment tests in an isolated test environment without `.env` caused Razorpay initialization to fail or miss expected dummy key values.
3. **Cannot Assign to Readonly Property:**
   Tests attempting `(env as any).nodeEnv = 'production'` threw a TypeError because `nodeEnv` is a readonly getter on `env`.

### Root Cause

1. `receiptReference: { type: String, required: true, unique: true }` automatically creates a unique index on the path in Mongoose. A duplicate `PaymentSchema.index({ receiptReference: 1 }, { unique: true })` was also declared below the schema.
2. In `backend/src/config/env.ts`, `razorpayKeyId` and `razorpayKeySecret` were defined as static properties instead of dynamic getters.
3. `tests/setup.ts` did not define fallback dummy credentials for Razorpay, causing test runs to rely on developer `.env` files.
4. Direct mutation of `(env as any).nodeEnv` conflicted with the dynamic getter pattern introduced in BUG-009.

### Solution

1. Removed the redundant `PaymentSchema.index({ receiptReference: 1 })` in `payment.model.ts`.
2. Switched `razorpayKeyId` and `razorpayKeySecret` in `backend/src/config/env.ts` to dynamic ES getters (`get razorpayKeyId() { return process.env.RAZORPAY_KEY_ID || ''; }`).
3. Added default test dummy Razorpay credentials to `backend/tests/setup.ts` (`process.env.RAZORPAY_KEY_ID = 'rzp_test_dummy_key_id'`).
4. Updated `payments.test.ts` to mutate `process.env.NODE_ENV` instead of the readonly `env.nodeEnv` getter.

### Rule

Never declare explicit `.index()` definitions for schema paths already configured with `unique: true`. Always use dynamic ES getters for environment variables that may be dynamically altered during test runs.

---

## BUG-011 — Razorpay Payment Link External Synchronization Gap (Webhooks + Return Callback Reconciliation)

### Date

2026-10-13

### Affected Modules

- `backend/src/modules/payments/service/payment.service.ts`
- `backend/src/modules/payments/repository/payment.repository.ts`
- `backend/src/modules/payments/controller/payment.controller.ts`
- `backend/src/modules/payments/routes/webhook.routes.ts`
- `backend/src/modules/payments/routes/payment.routes.ts`
- `backend/src/modules/payments/utils/webhook-signature.ts`
- `backend/src/modules/payments/model/webhook-receipt.model.ts`
- `backend/src/app.ts`
- `backend/src/config/env.ts`
- `frontend/src/pages/client/ClientPaymentReturn.tsx`
- `frontend/src/features/payments/paymentsApi.ts`
- `frontend/src/routes/AppRoutes.tsx`

### Severity

High

### Status

Fixed / Verified

### Error / Symptom

When a Client paid an advance or installment balance using an external Razorpay Payment Link (`https://rzp.io/...`) in another browser tab or outside the application:
1. Razorpay Payment Link showed payment as completed.
2. The corresponding EventOps Payment record in MongoDB remained pending/created.
3. Quotation installment paid and outstanding amounts did not update.
4. The event remained in `awaiting_payment` instead of transitioning to `confirmed` after paying the full required advance.
5. The Client and Admin continued seeing outstanding balances and pending payment actions.

### Root Cause

1. **Missing Webhook Infrastructure**: EventOps had no webhook handling infrastructure to receive asynchronous server-to-server notifications (`payment_link.paid`, etc.) from Razorpay.
2. **Raw Body Loss**: Standard `express.json()` parses the request stream into a JavaScript object without retaining the raw network byte buffer, making cryptographic HMAC-SHA256 signature verification impossible without corrupting body parsing.
3. **Missing Callback URL**: Payment links created by EventOps did not configure `callback_url` or `callback_method`, leaving the client on Razorpay's completion screen without returning them to the application.
4. **Missing Callback Reconciliation**: No endpoint existed for the frontend callback return page to initiate authoritative backend reconciliation.
5. **Coupled Verification Logic**: Payment verification was tightly bound to the in-app Checkout `razorpay_order_id` verification routine, lacking a unified authoritative state transition method.

### Solution

1. Added `verify` hook in `app.ts` to capture `req.rawBody` as a `Buffer` on incoming requests without disturbing normal JSON body parsing.
2. Configured dedicated `RAZORPAY_WEBHOOK_SECRET` and `FRONTEND_URL` in environment configuration and `.env.example`.
3. Implemented `verifyRazorpayWebhookSignature` using `crypto.timingSafeEqual` and HMAC-SHA256.
4. Created `WebhookReceipt` model with unique index on `eventId` for persistent idempotency and deduplication.
5. Built public `POST /api/webhooks/razorpay` supporting `payment_link.paid`, `payment_link.partially_paid`, `payment_link.expired`, and `payment_link.cancelled`.
6. Configured `callback_url: ${frontendUrl}/client/payment-return` and `callback_method: 'get'` during payment link creation and renewal.
7. Created frontend return page `ClientPaymentReturn.tsx` on route `/client/payment-return`.
8. Built authenticated callback reconciliation endpoint `POST /api/payments/reconcile-link`.
9. Refactored payment state application into shared `applyAuthoritativePaymentSuccess` across in-app checkout, webhook, and callback reconciliation flows.
10. Added 19 comprehensive automated tests in `payments.test.ts` (80/80 passed, 301/301 full suite passed).

### Rule

External payment links must always synchronize via both server-to-server signed webhooks and frontend return callback reconciliation. Neither channel may trust client browser parameters; both must verify actual gateway status and converge idempotently on the same shared backend financial processing method.

---

## BUG-012 — Payment Test Fixture Hardcoded Expiry Date Expired at Real-Time Clock Boundary

### Date

2026-10-15

### Affected Modules

- `backend/tests/payments.test.ts`

### Severity

Low (Test Infrastructure only)

### Status

Fixed / Verified

### Error / Symptom

Running `npm test` produced 17 test failures in `payments.test.ts` with error message:
```text
This payment link expired on 15 Oct 2026. Please contact the Admin for further assistance.
```
Tests 39 through 65 failed to create or verify payment orders because the backend link expiration guard correctly detected that the booking advance payment link had expired.

### Root Cause

In `backend/tests/payments.test.ts` lines 548 & 557, the test fixture for `Partial Advance Payments` had hardcoded static calendar dates:
```ts
dueDate: new Date('2026-10-11'),
expiryDate: new Date('2026-10-15'),
```
When authored, `2026-10-15` was a future date. However, as the real-time clock reached October 15, 2026, JavaScript's `new Date('2026-10-15')` evaluated to midnight UTC (`2026-10-15T00:00:00.000Z`), which was in the past relative to runtime execution time (`2026-10-15T13:50:00Z`). Consequently, the application's genuine business rule (`linkExpiresAt < new Date()`) was correctly triggered, blocking order creation in the test fixture.

### Solution

Updated the test fixture in `backend/tests/payments.test.ts` to use resilient relative future timestamps:
```ts
expiryDate: new Date(Date.now() + 86400000 * 7),
```
For installment `dueDate` on test 55 in `payments.test.ts`, line 556 had `dueDate: new Date('2026-10-16')`. When the clock progressed to October 16, 2026 UTC, midnight evaluated to the past relative to execution time, causing derived status to evaluate to `'Overdue'` instead of `'Partially Paid'`. Fixed by specifying end-of-day UTC `dueDate: new Date('2026-10-16T23:59:59.999Z')` so the fixture remains active on October 16 while satisfying subsequent assertion checks for due date on October 16.

All 93 payments tests and all 327 backend test suite tests now pass 100%.

### Rule

Never hardcode fixed calendar dates for future expiry dates in test fixtures. Always use dynamic relative offsets (`Date.now() + offsetMs`) or explicit end-of-day UTC timestamps so tests remain evergreen and resilient to time progression.

---

## BUG-013 — Admin Route Guard Inadvertently Permitted Event Manager Access

### Date

2026-10-16

### Affected Modules

- `frontend/src/routes/AppRoutes.tsx`

### Severity

Medium

### Status

Fixed / Verified

### Error / Symptom

The `/admin` route guard permitted authenticated users with the `event_manager` role to access the Admin layout and Admin portal screens (`/admin`, `/admin/managers`, `/admin/events`, etc.), violating the security boundary: "A Manager must not access Admin-only screens or perform Admin-only operations."

### Root Cause

In commit `fdce42e7`, the route guard on the `/admin` path in `AppRoutes.tsx` was configured with `allowedRoles={['admin', 'event_manager']}` instead of strictly restricting to `allowedRole="admin"`.

### Solution

Restored `allowedRole="admin"` on the `/admin` route guard in `frontend/src/routes/AppRoutes.tsx`. Added automated regression tests in `frontend/src/tests/auth.test.tsx` verifying that:
1. An authenticated `event_manager` attempting to access `/admin` is denied access.
2. An authenticated `admin` attempting to access `/manager` is denied access.
3. Authenticated `client` and `worker` roles cannot access `/manager`.
4. Only `event_manager` can access `/manager`.

### Rule

Admin routes must never allow non-admin roles. Protected route hierarchies must maintain strict role isolation.








---

## BUG-014 — TypeScript Type Mismatch in Notification Queue Test (Excess Job Data Properties & Optional resourceId)

### Date

2026-10-29

### Feature / Module

Notifications / BullMQ Queue / `backend/tests/notificationQueue.test.ts`

### Severity

Low (Test suite TypeScript compilation error)

### Status

Fixed / Verified

### Error / Symptom

TypeScript compilation errors reported in `backend/tests/notificationQueue.test.ts`:
1. `Object literal may only specify known properties, and 'workerType' does not exist in type 'RequirementAnnouncementJobData'.` (lines 223, 265, 388)
2. `'workerNotif.resourceId' is possibly 'undefined'.` (line 323)

### Root Cause

1. `RequirementAnnouncementJobData` interface in `notification.queue.ts` is intentionally minimal (`requirementId: string`, optional `publishedAt`, `enqueuedAt`), adhering to the architecture rule that queue jobs carry identifiers rather than snapshotting domain attributes, with worker processors fetching authoritative data from MongoDB. The test fixture included redundant properties `workerType: 'Catering Boy'` and `eventId`, which failed TypeScript's excess property checking for object literals.
2. In `INotification` (`notification.model.ts`), `resourceId` is an optional field (`resourceId?: string`). Calling `.toString()` on `workerNotif.resourceId` failed strict null checks since it can be `undefined`. Furthermore, calling `.toString()` on a field that is already a `string` was redundant.

### Solution

1. Removed the redundant `workerType` and `eventId` properties from the test `RequirementAnnouncementJobData` objects in `backend/tests/notificationQueue.test.ts` (lines 220, 260, 385).
2. Changed `assert.strictEqual(workerNotif.resourceId.toString(), requirement._id.toString())` to `assert.strictEqual(workerNotif.resourceId, requirement._id.toString())`, directly comparing string values without calling `.toString()` on an optional property. Applied the same safe assertion to `managerNotif.resourceId`.

### Rule

Queue job payloads should only provide properties declared on their respective job data contract. In tests, assert optional Mongoose document string properties directly without invoking `.toString()`.


---

## BUG-015 — Generic BullMQ Outbox Job Mapping and In-Flight Dispatch Race Condition in Outbox Tests

### Date

2026-10-31

### Feature / Module

Notifications / Transactional Outbox / Notification Queue / Dispatcher (`notification.queue.ts`, `notification-outbox-dispatcher.service.ts`, `work-requirement.service.ts`, `notifications.test.ts`)

### Severity

Medium

### Status

Fixed / Verified

### Error / Symptom

1. **Generic Job Name Mapping**: In `notification.queue.ts`, `enqueueOutboxJob()` submitted all outbox events to BullMQ under a generic job name `'outbox-event'` (`JOB_OUTBOX_EVENT`). Although processors handled it, this degraded BullMQ typed job observability and caused `notificationMilestone2.test.ts` to fail when querying BullMQ by typed job names (`requirement-cancellation`, `requirement-update`, `deadline-extension`).
2. **Dispatch Concurrency Race in Tests**: In `work-requirement.service.ts`, immediate dispatch was invoked non-blockingly via `.catch(() => {})` with swallowed errors. When automated tests in `notificationOutbox.test.ts` called `await triggerImmediateDispatch()` right after a service call, `this.isPolling` was already `true` from the background trigger, causing the test's call to return `{ processedCount: 0, errorsCount: 0 }` immediately while the background cycle was still in-flight. The test then asserted `status === 'queued'` before the background write finished, causing intermittent test failures.
3. **Unfiltered Recipient Query in Opportunity Test**: In `backend/tests/notifications.test.ts` line 522, a test checking that updating an event requirement does not duplicate work opportunity announcements queried `notificationRepository.getUserNotifications(worker._id)`. Because Milestone 2 correctly delivers a `requirement_updated` notification on material changes, the returned array contained 2 notifications (1 opportunity + 1 update), failing the `assert.strictEqual(notifications.length, 1)` check.

### Root Cause

1. `enqueueOutboxJob` defaulted to the generic string constant `JOB_OUTBOX_EVENT` instead of mapping `event.eventType` to the corresponding typed constants (`JOB_REQUIREMENT_CANCELLATION`, `JOB_REQUIREMENT_UPDATE`, `JOB_DEADLINE_EXTENSION`).
2. `notification-outbox-dispatcher.service.ts` had boolean flag guard `if (this.isPolling) return;` which did not provide a way for concurrent callers to await the in-flight dispatch cycle.
3. The test assertion in `notifications.test.ts` was not scoped to `type: 'work_opportunity'`.

### Solution

1. In `backend/src/modules/notifications/queues/notification.queue.ts`, updated `enqueueOutboxJob()` to map `event.eventType` to:
   - `'requirement_cancelled'` -> `JOB_REQUIREMENT_CANCELLATION` (`'requirement-cancellation'`)
   - `'requirement_updated'` -> `JOB_REQUIREMENT_UPDATE` (`'requirement-update'`)
   - `'deadline_extended'` -> `JOB_DEADLINE_EXTENSION` (`'deadline-extension'`)
   Updated the mock processor in `notification.queue.ts` to dispatch to the appropriate handler and mark the outbox event `processed`.
2. In `notification-outbox-dispatcher.service.ts`, introduced `private activeDispatchPromise: Promise<DispatchCycleResult> | null = null`. When a poll or immediate trigger is called while a cycle is active, it returns `activeDispatchPromise`, ensuring all callers can deterministically await cycle completion. Replaced empty `.catch(() => {})` in `work-requirement.service.ts` with structured warning logs via `logger.warn`.
3. In `backend/tests/notifications.test.ts`, updated the query to `{ recipientId: worker._id, type: 'work_opportunity' }` on lines 513 and 522.

### Rule

1. Always submit BullMQ jobs with their specific typed job names to preserve queue observability and monitoring contracts.
2. Background background-worker dispatchers must expose awaitable in-flight cycle promises to eliminate race conditions between immediate post-commit triggers and test harnesses.
3. When asserting against notification counts for a specific business event, filter queries by `type` to prevent legitimate orthogonal notifications from failing the test.
