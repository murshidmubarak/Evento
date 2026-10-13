
---

# 2. `docs/09-change-impact-log.md`

This one is especially useful for Antigravity because you want it to warn you before making a change that affects other parts of the system.

```md
# EventOps ERP — Change Impact Log

## Purpose

This document tracks changes that can affect other files, modules, APIs, database structures, frontend features, tests, or business workflows.

The purpose is to prevent unintended side effects and uncontrolled changes.

Every significant structural or shared change must record its expected impact.

---

# Mandatory Change Impact Workflow

Before modifying an existing file or shared component:

1. Identify the file being changed.
2. Identify what it provides or controls.
3. Search this document for existing impact information.
4. Identify all known affected files/modules.
5. Determine the impact level.
6. If the impact is Serious or Critical:
   - STOP before implementation.
   - Clearly report the impact to the developer.
   - List the files/modules that may be affected.
   - Explain why they are affected.
   - Wait for approval before proceeding.
7. If the impact is Low or Medium:
   - Continue only after reviewing the affected areas.
8. After implementation:
   - Verify the affected areas.
   - Update this document when necessary.

---

# Impact Levels

## LOW

Change is isolated and has little or no effect outside the target file/module.

Example:

Change local UI text in one page.
```

### [Service Catalog & Pricing]
**Date:** [Current Date]
**Changes:**
- Created Service Catalog API (CRUD).
- Implemented Client Event Request API.

### [Pricing Architecture Refactor]
**Date:** [Current Date]
**Changes:**
- Removed standalone Pricing Calculation Engine and `/api/services/:id/calculate` route.
- Removed `basePrice` from the Service model, validation, logic, and tests.
- Retained `pricingType` (per_guest, per_event, package) for future Quotation context.
- Updated database and dev plan documentation to reflect the new architecture.
**Impact:**
- Low impact. Refactored independent service module. Test suite adapted successfully. No consumer breakage because Quotations/Payments are not yet implemented.

### [Quotations Part 1]
**Date:** 2026-09-25
**Changes:**
- Implemented Multi-Revision Quotation Foundation (`Quotation` schema, repository, service, controller, and routes).
- Refined `IQuotationItem` schema to include `requirements` and `pricingType` snapshotting.
- Integrated quotation generation with sequence generation for thread-based identification and multiple revisions (`quotationNumber` + `revision`).
- Added robust access control preventing clients and workers from creating quotations while allowing clients to view their own event's quotes.
- Fixed non-atomic revision generation (BUG-002): replaced find-then-increment with atomic `getNextRevision()` via `SequenceRepository`.
- Fixed full test suite hang (BUG-001): added `mongoose.disconnect()` to `events.test.ts` and `quotations.test.ts` after() hooks.
- Fixed `businessId.test.ts` duplicate email failure: corrected the after() cleanup to delete all test users.
**Impact:**
- Low impact on existing systems. The quotation system builds upon the `Event` and `Service` architecture. Financial calculations are backend-owned within the Quotation domain. Full test suite: 116/116 pass, 0 fail, exit code 0. TypeScript: exit code 0.

### [Quotations Part 2]
**Date:** 2026-09-25
**Changes:**
- Implemented quotation lifecycle operations: `send`, `accept`, `reject`, `request-changes`.
- Integrated strict role-based access control for lifecycle changes.
- Added expiry validation (checked against `validUntil`).
- Ensured client can only modify their own Event's latest quotation.
- On quotation accept, Event status correctly transitions to `awaiting_payment` (not `confirmed`).
- Implemented immutability logic checking against historical revisions.
- Medium impact. Event status transition depends on quotation acceptance. Added state checks. No architectural shift. Full regression test suite passing.

### [Payments Part 1]
**Date:** 2026-09-25
**Changes:**
- Integrated `razorpay` SDK into the backend.
- Added `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` to environment variables and configuration.
- Created `Payment` model and repository for storing payment records.
- Implemented `createAdvanceOrder` in `PaymentService` to generate a Razorpay order from a quotation's `advanceAmount`.
- Established idempotency logic: returning an existing pending advance payment to prevent duplicate orders.
- Enforced strict business rules: Event must be in `awaiting_payment` state, amount originates solely from the authoritative Accepted Quotation `advanceAmount`.
- Implemented environment bypass logic to avoid real API calls during automated tests.
**Impact:**
- Low impact on existing systems. Modular implementation. Test suite verifies integration safety. Full suite (130 tests) passing successfully.

### [Quotations Part 3 — GST / Tax-Aware Commercial Structure]
**Date:** 2026-09-26
**Changes:**
- Designed and implemented a deterministic, backend-controlled tax structure for Quotations (`taxableAmount`, `ITaxDetails` with `taxType`, `taxRate`, `gstTreatment`, `taxAmount`, `cgst`, `sgst`, `igst`, `placeOfSupply`, `customerGstin`).
- Updated commercial calculation flow: Line Items → Subtotal → Discount → Taxable Amount → Tax → Final Amount → Advance Amount → Remaining Amount.
- Built reusable money precision utility (`round2`) using `Number.EPSILON` to enforce 2-decimal precision.
- Stored tax configuration and calculated tax amounts as an immutable snapshot within each Quotation revision document.
- Verified historical revisions remain completely immutable upon creation of subsequent revisions.
- Ensured clients cannot manipulate or override taxableAmount, taxAmount, cgst, sgst, igst, or finalAmount.
- Maintained strict compatibility with Payments Part 1 (authoritative `advanceAmount` retrieved from accepted quotation).
**Impact:**
- Medium impact within Quotation domain. Zero breaking changes to existing payment order creation or event workflows. Full regression test suite: 147/147 pass across 17 suites, 0 failures, exit code 0. TypeScript compile: clean, exit code 0.

### [Payments Part 2 — Razorpay Payment Verification + Event Confirmation]
**Date:** 2026-09-26
**Changes:**
- Implemented `POST /api/payments/verify` endpoint (controller, route, validation).
- Implemented `PaymentService.verifyPayment` with the full compliant verification chain:
  1. Role guard: client only.
  2. Payment record lookup by `razorpayOrderId`.
  3. Client ownership check (`payment.clientId` === calling user).
  4. Idempotency: if already `paid`, return 200 immediately.
  5. Quotation cross-check: `payment.quotationId` must match the current `accepted` quotation for the event — guards against stale-revision payments.
  6. HMAC-SHA256 signature verification using `RAZORPAY_KEY_SECRET`.
  7. Production-only: `razorpay.payments.fetch` to verify gateway amount (in paise) and currency match the authoritative local record.
  8. On success: `Payment.status = 'paid'`, `Event.status = 'confirmed'`.
- Extended `PaymentRepository` with `findByRazorpayOrderId` and `findById`.
- Added `validateVerifyOrder` middleware.
- Added 7 tests covering: auth, payload validation, tampered signature, non-owner 403, valid flow, idempotency, and stale-revision rejection.
- Fixed BUG-004: missing `import crypto from 'node:crypto'` in test file.
- Updated docs: 04-status-and-business-rules.md, 05-api-design.md, 08-bug-log.md, 09-change-impact-log.md.
**Impact:**
- Low impact on existing systems. Modular addition to Payments module. Event status transition (awaiting_payment → confirmed) now only triggered by verified payment. No changes to Quotation, Auth, or other modules. Full regression test suite: 154/154 pass, 0 fail, exit code 0. TypeScript compile: clean, exit code 0.

### [Admin Event Manager Assignment Part 1]
**Date:** 2026-09-26
**Changes:**
- Created `AdminEventService`, `AdminEventController`, and `AdminEventRoutes` for managing event assignments.
- Implemented `GET /api/admin/events/:id/available-managers` endpoint to retrieve active and available event managers based on time intervals.
- Implemented `PATCH /api/admin/events/:id/manager` endpoint to assign an eligible event manager to an event, avoiding overlaps.
- Extended `UserRepository` with `findActiveEventManagers` to fetch active managers excluding those busy during the requested time.
- Extended `EventRepository` with `findActiveAssignedEventsForDateRange` to identify potential scheduling conflicts.
- Verified test suite containing 163 passing tests verifying eligibility logic, status boundaries, time overlap detection, and RBAC security.
**Impact:**
- Low impact on existing functionality. The assignment logic is encapsulated under a new set of admin-only routes and explicitly integrates with existing status constraints. No modifications to existing user profiles or unrelated schemas. Full regression suite passing and TypeScript type checks succeed.

### [Manager Dashboard and My Events]
**Date:** 2026-09-26
**Changes:**
- Implemented `ManagerEventService`, `ManagerEventController`, and `ManagerEventRoutes`.
- Added `GET /api/manager/dashboard` for displaying event summary metrics to the Event Manager.
- Added `GET /api/manager/events` to list assigned events with status and date filtering.
- Re-architected Event Repository to support targeted Event Manager queries (`findByManagerId`, `getManagerDashboardStats`).
- Updated `GET /api/events/:id` to securely grant authorized Event Managers access, ensuring strict ownership validation.
- Validated via 7 specialized integration tests for dashboard access, metrics generation, strict ownership filters, and RBAC blockades.
**Impact:**
- Isolated, modular feature additions resolving previously missing manager functionality. Access bounds carefully crafted to strictly prevent manager-to-manager data leaking. Unaffected other core domains. Comprehensive type checking and 170/170 regression tests cleanly passed.

### [Event Manager Control Center Backend]
**Date:** 2026-09-26
**Changes:**
- Implemented `GET /api/manager/events/:id` for the Event Manager Control Center.
- Added `findByIdWithDetails` in `EventRepository` to safely populate `clientId` (returning only safe info: `name`, `email`, `phone`) and `eventManagerId`.
- Created `getManagerEventById` in `ManagerEventService` that strictly enforces manager ownership on the populated event document.
- Added comprehensive unit tests in `managerControlCenter.test.ts` to ensure unauthenticated users, clients, admins, and unassigned managers are met with proper HTTP status errors (401/403).
**Impact:**
- No impact on existing Client or Admin APIs. The custom repository method avoids modifying the generic `findById`, ensuring zero side-effects to existing quotation and payment checks. Safely retrieves client information for Event Managers. Regression tests pass (178/178). Type-checking passes.

### [Work Requirement API]
**Date:** 2026-09-26
**Changes:**
- Created `WorkRequirement` model (`workerType`, `requiredCount`, `reportingTime`, `description`, `status`) reusing existing User workerTypes.
- Created `WorkRequirementRepository` and `WorkRequirementService` to encapsulate creation, reading, and updates.
- Added `POST /api/manager/events/:eventId/work-requirements` to create a requirement (checks that the event is confirmed and manager owns it).
- Added `GET /api/manager/events/:eventId/work-requirements` to list requirements.
- Added `GET /api/manager/work-requirements/:id` to fetch a single requirement.
- Added `PATCH /api/manager/work-requirements/:id` to update requirements that are still in `draft`.
- Added 15 specialized tests in `workRequirements.test.ts` for RBAC, input validation (e.g. requiredCount <= 0 rejection), and strict manager ownership isolation.
**Impact:**
- Isolated addition for the new requirement functionality. The controller returns `filled: 0, pending: requiredCount` synthetically for UI integration before actual selection engines are built. No impact on generic Event flows, 193/193 regression tests passed. TypeScript type checking is clean.

### [Event Preferences Backend Contract Update]
**Date:** 2026-09-28
**Changes:**
- Converted `selectedServices.preferences` in the Event model from `String` to structured object (`Schema.Types.Mixed`).
- Added strict backend validation to reject primitive strings/numbers/arrays in preferences.
- Ensured protected Event fields (like `clientId`, `status`, `eventManagerId`) and pricing fields cannot be passed via the `preferences` object (mass assignment prevention).
- Updated frontend types to `Record<string, unknown>` and modified `CreateEventWizard` to wrap existing string notes into a `{ notes: string }` object during submission to maintain current UI compatibility.
- Added comprehensive backend tests for valid and invalid structured preferences.
**Impact:**
- Medium impact. Altered the Event schema data structure. Handled backward compatibility gracefully by normalizing frontend payloads. Event ownership and quotation logic remain completely unaffected. Tests pass, TypeScript is clean.

### [Event Service Reference Images]
**Date:** 2026-09-29
**Changes:**
- Installed `cloudinary` and `multer` for external media storage integration.
- Configured Cloudinary required environment variables in `env.ts` and `.env.example`.
- Created `MediaService` adapter to encapsulate all Cloudinary interactions.
- Created `upload.middleware.ts` using Multer (memory storage, max 5 files, 5MB limit, JPEG/PNG/WebP validation).
- Implemented `EventMediaService` to handle business logic for reference image uploads, including validation of ownership, service selection, and cleanup on failure.
- Updated `EventRepository` with an `updateById` method.
- Added `POST /api/events/:id/service-reference-images` endpoint in `event.routes.ts` and `event.controller.ts`.
- Structured metadata stored inside `selectedServices[...].preferences.referenceImages` array.
- Added test coverage in `eventMedia.test.ts` to verify authorization (401/403), validation (400/404), and successful storage, with mocked Cloudinary API.
- Low impact on existing systems. Isolated feature addition mapped safely into existing `preferences` contract without schema mutations. All existing event/manager APIs untouched. Regression suite passed successfully. TypeScript compile clean. No arbitrary file execution or binary storage in MongoDB.

### [Event clientInfo Field]
**Date:** 2026-10-06
**Changes:**
- Added optional `clientInfo` sub-document (`name`, `phone`, `email`) to the Event model (`event.model.ts`).
- Added validation for `clientInfo` in `event.validation.ts` (all sub-fields optional strings).
- Updated `event.service.ts` to pass `data.clientInfo` through when building the event document.
- Updated `CreateEventRequest` and `ClientEvent` frontend types to include `clientInfo`.
- Updated `CreateEventWizard.tsx` to pre-fill `clientName`, `clientPhone`, and `clientEmail` from the Redux auth user, make email disabled, and send `clientInfo` as a dedicated structured field.
- Updated `docs/02-databse-design.md` to document the new field.
**Impact:**
- Low impact. Purely additive optional field. No existing queries, validations, API contracts, or test files are broken. MongoDB schema is backward-compatible (field is optional with no default). No financial, payment, or worker logic is affected.

### [Event Catering Preferences - Starters]
**Date:** 2026-10-06
**Changes:**
- Added `starters` array to the catering preferences state in `CreateEventWizard.tsx`.
- Updated wizard review step and client `EventDetails.tsx` to render the `starters` array properly.
- No backend schema changes required, as `starters` natively uses the existing `Schema.Types.Mixed` in `event.model.ts` for structured JSON storage, identical to `mainDishes` and `juices`.
**Impact:**
- Low impact. Purely additive frontend data structure handled safely by the existing backend dynamic preferences object.

### [Client Quotation Review & Decision]
**Date:** 2026-10-07
**Changes:**
- Extended `GET /api/quotations` to allow authenticated Clients to list quotations for their own events (`findByClientId`), strictly enforcing client ownership on the backend.
- Added optional `clientNotes?: string` and `rejectionReason?: string` to `Quotation` model and schema to persist client revision request feedback and rejection rationale.
- Added `{ clientId: 1 }` index on `quotationSchema`.
- Updated `QuotationController` to pass `req.body.reason` to `rejectQuotation` and `requestChangesQuotation`.
- Frontend API: Exported `acceptQuotation`, `rejectQuotation`, and `requestChangesQuotation` from `quotationApi.ts`.
- Frontend Navigation: Added "Quotations" (`/client/quotations`, icon: `FileText`) to `ClientLayout.tsx` navigation.
- Frontend Routing: Registered `/client/quotations` (`ClientQuotations`) and `/client/quotations/:id` (`ClientViewQuotation`) under client `RoleRoute` in `AppRoutes.tsx`.
- Client Quotations List (`ClientQuotations.tsx`): Overview metrics, search, status filter, responsive table and card layouts, empty and loading states.
- Client Quotation Document & Review (`ClientViewQuotation.tsx`): A4 document presentation, dynamic status banner (Awaiting Decision, Accepted, Changes Requested, Rejected, Expired), decision action bar with double-click guarded modals for Accept, Request Changes, and Reject.
- Preserved existing EventOps business workflow: Quotation acceptance updates quotation to `accepted` and event to `awaiting_payment` (does not mark event `confirmed`). Event confirmation strictly requires backend-verified advance payment.
- Added tests 52, 53, 54 to `quotations.test.ts`. Full quotation test suite passes (34/34 tests).
**Impact:**
- Low impact. Additive client functionality reusing the existing quotation lifecycle and event architecture. Historical revisions remain immutable. Full regression tests passing, TypeScript check clean, production build passing.

### [Admin Handle Client Requested Changes — Revision & Re-issue Workflow]
**Date:** 2026-10-07
**Changes:**
- Backend Service: Added `getAllQuotations(user)` and `updateQuotation(user, quotationId, input)` in `quotation.service.ts`.
- Immutability Enforcement: `updateQuotation` strictly enforces that only quotations in `draft` status may be updated in place. Non-draft, sent, changes_requested, accepted, or rejected quotations immediately reject mutation with 400 Bad Request.
- Existing Revision Mechanism: Creating a revised quotation for an event that has requested changes reuses `createQuotation`, which automatically identifies the event's existing `quotationNumber` and atomically generates the incremented revision number via sequence generator.
- Historical Immutability: Previous quotation revisions (Revision 1, Revision 2, etc.) and their stored `clientNotes` remain completely unchanged and readable in MongoDB.
- Backend Routes: Added `PUT /api/quotations/:id` guarded by `authenticate`, `authorize('admin', 'event_manager')`, and `validateCreateQuotation`.
- Backend Tests: Added tests 55, 56, and 57 to `quotations.test.ts` verifying revision creation on changes_requested, draft updating, non-draft immutability, and multi-cycle revision progression (Rev 1 -> Rev 2 -> Rev 3). All 37/37 backend tests pass.
- Frontend Quotations List (`AdminQuotations.tsx`): Added "Changes Requested" visual badge, attention pulsing indicator, row highlight, revision indicator badge, and direct "Review Request" action button.
- Frontend Quotation Document (`AdminViewQuotation.tsx`): Implemented prominent "Client Requested Changes" panel showing client name, request date, request message, and "Review & Edit Quotation" action button. Implemented interactive "Quotation Revision History" grid linking to all revisions for the event.
- Frontend Quotation Builder (`AdminCreateQuotation.tsx`): Added support for `?revise=<id>` and `?draftId=<id>`. Pre-populates all items, scopes, requirements, detailed content, pricing, tax, discounts, advance, schedules, terms, and notes. Renders top Revision Context header (`Quotation Number`, `New Rev X based on Rev Y`) and prominent Client Change Request Banner. Added double-action "Save Revised Draft" and "Issue Revision X" with confirmation dialog.
- Frontend Quotation Success (`AdminQuotationSuccess.tsx`): Dynamically shows revision-specific success state (`Revision X Issued Successfully`, `The revised quotation has been sent back to the client for review`).
- Seed Script: Updated `backend/seed.ts` to ensure admin (`admin@eventops.com`), manager (`manager@eventops.com`), and client test credentials are created/seeded.
**Impact:**
- Low impact. Strictly preserved existing EventOps business workflows, quotation lifecycle statuses, payment logic, and event confirmation rules. Did not introduce duplicate quotation numbers or overwrite historical revisions. Frontend build clean, backend build clean, all 37 quotation integration tests pass.

### [Database Safety & Test Isolation Policy]
**Date:** 2026-10-07
**Changes:**
- Enforced strict database isolation in `backend/tests/setup.ts`: tests are forced to connect exclusively to `eventops_test` (or `MONGODB_TEST_URI`).
- Added hard runtime safety assertion: tests immediately throw a fatal error if the database connection does not contain `_test`, completely preventing accidental execution against development or production databases.
- Added teardown cleanup: exported `cleanupTestDatabase()` and added a process `beforeExit` hook to drop the test database completely after test execution.
- Added permanent rules to `AGENTS.md` (Section 26) and `docs/04-status-and-business-rules.md` (Section 33) forbidding insertion of dummy test data into the real database, forbidding deletion of real database records, and mandating complete post-test data teardown.
**Impact:**
- Zero breaking changes to application logic. Completely eliminates accidental data loss and test pollution in the development database. Tested and verified.

### [Payment Flow Milestone 1 — Advance Payments, Partial Payments, Razorpay Verification & Event Confirmation]
**Date:** 2026-10-12
**Classification:** Medium Impact (Additive and backward-compatible extension to payments architecture)
**Changes:**
- Backend Repository: Extended `PaymentRepository` with `findVerifiedAdvancePayments`, `cancelPendingAdvancePayments`, `findByEventId`, and `findAll`.
- Backend Service: Extended `PaymentService`:
  - `createAdvanceOrder`: computes backend-authoritative verified advance paid and outstanding advance; supports optional `partialAmount` (validated strictly: > 0 and <= `outstandingAdvance`); guards against repeated payments once advance is fully settled; reuses existing pending orders matching target amount.
  - `verifyPayment`: validates HMAC-SHA256 signature; prevents duplicate transaction processing; updates payment to `paid`; updates quotation advance installment status to `Partially Paid` or `Paid`; updates event status to `confirmed` strictly only when the full required advance has been received and verified.
  - `getAdvanceSummary`: returns authoritative financial calculations, payment eligibility, advance installment details, and verified payment history.
  - `getAdminPayments`: administrative query endpoint for payment transactions.
- Backend Routes: Added `GET /api/payments/advance-summary/:eventId` and `GET /api/payments/admin`. Updated `create-order` validation to allow optional numeric `partialAmount`.
- Database & Model Fix: Removed redundant duplicate index on `receiptReference` in `payment.model.ts`. Switched `razorpayKeyId` and `razorpayKeySecret` in `env.ts` to dynamic ES getters.
- Frontend Client Interface: Created `ClientAdvancePayment.tsx` with authoritative summary cards (Total Quotation, Required Advance, Verified Paid, Outstanding Advance), full or custom partial payment toggle, Razorpay Checkout SDK dynamic loading, payment processing and verification loading states, and verified transaction records.
- Frontend Routing: Registered `/client/events/:id/payment` in `AppRoutes.tsx`.
- Frontend Integration: Added Advance Payment navigation and action buttons in `ClientViewQuotation.tsx`, `EventDetails.tsx`, and `ClientQuotations.tsx`.
- Frontend Admin Visibility: Added Advance Payment summary card in `AdminEventDetails.tsx` displaying required advance, verified paid, outstanding advance, payment status, and transactions. Added installment status badges in `AdminViewQuotation.tsx`.
- Tests: Added integration tests 36–48 in `backend/tests/payments.test.ts` verifying the reference financial fixture (₹100,000 required, ₹40,000 partial payment keeping event `awaiting_payment`, ₹60,000 completion confirming event, idempotency, duplicate protection, and RBAC).
**Impact:**
- No breaking changes. Existing quotation builder, payment schedule configuration, and quotation revisions remain completely intact. No arbitrary financial calculations in browser. All 254 backend integration tests pass. Frontend production build and tests pass cleanly.


## Payment Milestone 2 of 3: Installments, Expiry, Admin Renewal & History
- **Impact Classification**: Medium (Backward-compatible schema and API extension)
- **Date**: 2026-10-13
- **Modules Affected**:
  - `backend/src/modules/payments/` (Model, Repository, Service, Validation, Controller, Routes)
  - `backend/src/modules/email/` (Renewal email notification)
  - `frontend/src/features/payments/` (Types, API client)
  - `frontend/src/pages/client/ClientAdvancePayment.tsx`
  - `frontend/src/pages/admin/AdminEventDetails.tsx`
- **Database Changes**:
  - `Payment` model extended with `paymentType`, `installmentIndex`, `installmentTitle`, `razorpayPaymentLinkId`, `paymentLinkUrl`, `linkExpiresAt`, `linkStatus`, `previousPaymentId`, `renewedAt`, `renewedBy`.
  - Added compound indexes for fast installment and link queries.
  - `Quotation` paymentPlan elements optionally store `installmentId`.
- **API Contracts Added/Updated**:
  - `POST /api/payments/create-order` (supports installmentIndex and partial installment payments)
  - `POST /api/payments/verify` (supports installment payments and quotation paymentPlan status sync)
  - `GET /api/payments/schedule/:eventId` (authoritative schedule summary)
  - `POST /api/payments/renew-link` (Admin-only payment link renewal)
- **Business Rule Guarantees**:
  - Authoritative calculation: outstanding balance = scheduled amount - sum of verified payments.
  - Advance prerequisite strictly enforced before later installments become payable.
  - Expired links rejected with exact message: "This payment link expired on [date]. Please contact the Admin for further assistance.".
  - Advance expiry preserves state without automatic cancellation; confirmed event status preserved on later installment expiry.
  - Admin renewal generates replacement link for strictly the current outstanding balance.
  - Previous link history preserved in payment records with replacement chain.
  - Reminder scheduler deferred to Milestone 3.


## Payment Milestone 2 Extension: Full Payment Option, Excess Payment Allocation & Financial Validation
- **Impact Classification**: Medium (Backward-compatible schema extension and financial validation enhancements)
- **Date**: 2026-10-13
- **Modules Affected**:
  - `backend/src/modules/payments/` (`payment.model.ts`, `payment.repository.ts`, `payment.service.ts`, `payment.validation.ts`, `payment.controller.ts`, `payment.routes.ts`)
  - `backend/tests/payments.test.ts`
  - `frontend/src/features/payments/` (`payment.types.ts`, `paymentsApi.ts`)
  - `frontend/src/pages/client/ClientAdvancePayment.tsx`
  - `frontend/src/pages/admin/AdminEventDetails.tsx`
- **Database Schema Changes**:
  - `Payment` model extended with:
    - `isFullPayment` (boolean): flags whether transaction was intended to settle full remaining quotation balance.
    - `allocations` (array of `IPaymentAllocation`): `{ installmentIndex, installmentId, installmentTitle, allocatedAmount }`.
  - Added indexes on `quotationRevision` and compound `quotationId` queries.
- **API Contracts Added/Updated**:
  - `POST /api/payments/preview-allocation`: provides live calculation of payment distribution across installments before checkout.
  - `POST /api/payments/create-order`: extended with `paymentOption: 'current_installment' | 'custom' | 'full_balance'`, `customAmount`, `isFullPayment`, and `allowExcess`.
  - `POST /api/payments/verify`: enhanced with multi-installment status synchronization, receipt details (`allocations`, `resultingBalances`, `isFullPayment`, `isQuotationFullyPaid`, `eventStatus`).
  - `GET /api/payments/schedule/:eventId`: includes `scheduleConsistency` report, `totalQuotationOutstanding`, `isQuotationFullyPaid`, `canPayFullBalance`, and verified payment records with durable itemized `allocations`.
- **Financial & Business Rule Guarantees**:
  - Authoritative financial values: Final quotation amounts and verified payment records remain the sole source of truth; no client-side financial computation trusted.
  - Automatic installment cascading: Excess payments beyond current installment automatically allocate to subsequent milestones in configured quotation schedule order.
  - Single provider transaction identity: One payment transaction spanning multiple installments generates exactly one Razorpay Order and one Payment document.
  - Quotation schedule consistency: Before enabling cross-installment or full payment, sum of installment amounts must equal quotation `finalAmount`. Inconsistent schedules are rejected with an informative error identifying both totals.
  - Strict overpayment prevention: Any payment exceeding total outstanding quotation balance is rejected before order creation with clear message (`"Payment amount cannot exceed the total outstanding balance of ₹[amount]."`).
  - Event confirmation rule preserved: Event confirmed only when required advance (index 0) has been fully settled and verified. Full payments or excess payments settling the advance immediately confirm the event in the same transaction.
  - Backward compatibility: Milestone 1 advance payments and Milestone 2 installment/renewal workflows fully operational with 0 regressions.
- **Verification & Test Status**:
  - Full payment test suite: 61/61 tests pass (`backend/tests/payments.test.ts`).
  - Repository test suite: 282/282 tests pass across all 32 test suites.
  - TypeScript type-check and production builds for both backend and frontend pass cleanly with 0 errors.


## Razorpay Payment Link Synchronization Fix: Webhooks, Callback URL & Reconciliation
- **Impact Classification**: Medium (Backward-compatible security, webhook, and payment reconciliation extension)
- **Date**: 2026-10-13
- **Modules Affected**:
  - `backend/src/config/env.ts` (`razorpayWebhookSecret`, `frontendUrl`)
  - `backend/src/app.ts` (`req.rawBody` capture on `express.json`)
  - `backend/src/modules/payments/` (`webhook-receipt.model.ts`, `webhook-signature.ts`, `payment.repository.ts`, `payment.service.ts`, `payment.controller.ts`, `webhook.routes.ts`, `payment.routes.ts`, `payment.validation.ts`)
  - `backend/tests/payments.test.ts`
  - `frontend/src/features/payments/` (`payment.types.ts`, `paymentsApi.ts`)
  - `frontend/src/pages/client/ClientPaymentReturn.tsx`
  - `frontend/src/routes/AppRoutes.tsx`
- **Database Schema Changes**:
  - Added `WebhookReceipt` model with unique index on `eventId` for permanent idempotency.
  - Reused existing `Payment` model and fields (`razorpayPaymentLinkId`, `razorpayPaymentId`, `linkStatus`, `allocations`).
- **API Contracts Added/Updated**:
  - `POST /api/webhooks/razorpay`: Public server-to-server webhook endpoint verified with raw-body HMAC-SHA256 signature against `RAZORPAY_WEBHOOK_SECRET`.
  - `POST /api/payments/reconcile-link`: Authenticated client reconciliation endpoint for the frontend callback return page.
- **Environment Configuration**:
  - Added `RAZORPAY_WEBHOOK_SECRET` and `FRONTEND_URL` to centralized environment config, `.env.example`, `.env`, and `tests/setup.ts`.
- **Payment Link Configuration**:
  - Configured `callback_url: ${frontendUrl}/client/payment-return` and `callback_method: 'get'` during payment link creation and renewal.
- **Financial & Business Rule Guarantees**:
  - Raw-body signature verification in constant time (`crypto.timingSafeEqual`).
  - Strict deduplication preventing duplicate payment records, double-counting, or duplicate arithmetic.
  - Cumulative vs. incremental decoupling: processes individual provider payment amounts, preserving existing partial payment credit.
  - Full advance confirmation rule preserved: only transitions event from `awaiting_payment` to `confirmed` once full advance balance is met.
  - Subsequent installment payments preserve existing confirmed event status.
  - Shared authoritative processing (`applyAuthoritativePaymentSuccess`) guarantees identical business logic across checkout modal, webhook, and callback reconciliation.
- **Verification & Test Status**:
  - Payment test suite: 80/80 tests pass (`backend/tests/payments.test.ts`).
  - Repository test suite: 301/301 tests pass across all 33 test suites.
  - Frontend production build: `npm run build` cleanly succeeds in 6.07s.


