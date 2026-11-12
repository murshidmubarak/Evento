
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


## Payment Milestone 3: Automatic Payment Reminders, Expiry Warnings & Background Scheduler
- **Impact Classification**: Medium (Backward-compatible background scheduler, persistent reminder audit logging, email integration, and Admin visibility)
- **Date**: 2026-10-13
- **Modules Affected**:
  - `backend/src/config/env.ts` (`reminderCheckIntervalMs`, `enableReminderScheduler`)
  - `backend/src/server.ts`
  - `backend/src/modules/email/service/email.service.ts` (`sendPaymentDueDateReminder`, `sendPaymentLinkExpiryWarning`)
  - `backend/src/modules/payments/model/payment-reminder-log.model.ts`
  - `backend/src/modules/payments/service/payment-reminder.service.ts`
  - `backend/src/modules/payments/service/reminder-scheduler.service.ts`
  - `backend/src/modules/payments/service/payment.service.ts`
  - `backend/src/modules/payments/controller/payment.controller.ts`
  - `backend/src/modules/payments/routes/payment.routes.ts`
  - `backend/tests/payments.test.ts`
  - `backend/tests/setup.ts`
  - `frontend/src/features/payments/payment.types.ts`
  - `frontend/src/pages/admin/AdminEventDetails.tsx`
- **Database Schema Changes**:
  - Added `PaymentReminderLog` model (`payment_reminder_logs` collection):
    - `dedupKey` (String, unique index): persistent atomic deduplication key.
    - `eventId` (ObjectId, ref: `events`, indexed)
    - `quotationId` (ObjectId, ref: `quotations`, indexed)
    - `quotationRevision` (Number)
    - `installmentIndex` (Number)
    - `installmentTitle` (String)
    - `reminderType` (String, enum: `['due_date', 'link_expiry']`)
    - `reminderWindow` (String)
    - `paymentLinkId` (String, optional)
    - `scheduledAmount`, `amountPaid`, `outstandingAmount` (Number)
    - `dueDate`, `expiryDate` (Date, optional)
    - `recipientEmail`, `recipientName` (String)
    - `status` (String, enum: `['pending', 'sent', 'failed', 'skipped']`, indexed)
    - `sentAt` (Date, optional)
    - `failureReason` (String, optional)
    - `retryCount` (Number, default 0)
    - `skipReason` (String, optional)
- **API Contracts Added/Updated**:
  - `POST /api/payments/reminders/trigger`: Admin-only manual execution endpoint with optional `referenceDate` and `eventId` scoping.
  - `GET /api/payments/event/:eventId/reminders`: Event reminder audit log history for Client, Admin, and Event Manager.
  - `GET /api/payments/schedule/:eventId`: Extended with `latestDueDateReminder`, `latestExpiryWarning`, and `reminderLogs` per installment.
- **Environment Configuration**:
  - Added `REMINDER_CHECK_INTERVAL_MS` (default `3600000`, 1 hour) and `ENABLE_REMINDER_SCHEDULER` (default `true`) to centralized `env.ts` and `.env.example`.
- **Financial & Business Rule Guarantees**:
  - Authoritative balance calculation: Reminder emails always use actual runtime outstanding balance (e.g. ₹72,000 remaining on a ₹2,72,000 installment, never the scheduled amount).
  - Just-in-time settlement check: Revalidates installment status immediately before dispatch; fully settled installments are recorded as `skipped` and receive no emails.
  - Replacement link handling: Expired links are archived with `linkStatus: 'replaced'`; replacement links are evaluated using their new expiry date and payable balance.
  - Catch-up policy: Overdue installments outside the active reminder window are skipped to prevent flooding clients with stale emails.
  - Persistent deduplication: Atomic MongoDB reservation with unique index on `dedupKey` guarantees single send across restarts and concurrent instances.
  - Failure isolation: SMTP connection failures, timeouts, and provider errors are logged diagnostically in `PaymentReminderLog` without altering transaction records, balances, or event status.
- **Verification & Test Status**:
  - Payment test suite: 93/93 tests pass (`backend/tests/payments.test.ts`).
  - Repository test suite: 314/314 tests pass across all 34 test suites.
  - Frontend test suite: 20/20 tests pass (`vitest run`).
  - Frontend production build: `npm run build` cleanly succeeds in 7.66s.

## Payment Architecture: BullMQ + Redis + Background Worker Payment Reminder Scheduler
- **Impact Classification**: Medium (Architectural transport replacement: in-process setInterval scheduler replaced with BullMQ, Redis, and dedicated background worker without altering financial models, MongoDB collections, or business authorization)
- **Date**: 2026-10-14
- **Modules Affected**:
  - `backend/package.json` (`bullmq`, `ioredis`, added `worker` and `worker:prod` scripts)
  - `backend/src/config/env.ts` (centralized `redisUrl` getter validation)
  - `backend/.env.example` (`REDIS_URL=redis://127.0.0.1:6379`)
  - `backend/src/modules/payments/queues/payment-reminder.queue.ts` (BullMQ queues: `payment-reminder-scan` & `payment-reminder-email`, deterministic job IDs, retry policy, test mock isolation)
  - `backend/src/workers/paymentReminderWorker.ts` (dedicated background worker entry point with graceful shutdown on SIGINT/SIGTERM)
  - `backend/src/modules/payments/service/payment-reminder.service.ts` (`dispatchQueuedDueDateReminder`, `dispatchQueuedExpiryWarning`, return types)
  - `backend/src/modules/payments/service/reminder-scheduler.service.ts` (deprecated in-process setInterval, routed `triggerManualRun` to BullMQ scan queue)
  - `backend/src/modules/payments/controller/payment.controller.ts` (`triggerReminders` enqueues scan job asynchronously)
  - `backend/src/server.ts` (decoupled Express HTTP lifecycle from reminder scheduler)
  - `backend/tests/reminderQueue.test.ts` (10 dedicated tests covering queues, workers, JIT revalidation, idempotency, retry, boundary conditions)
  - `backend/tests/payments.test.ts` (updated Test 93 assertions for asynchronous queue contract)
  - `docs/04-status-and-business-rules.md`, `docs/05-api-design.md`, `docs/06-architecture.md`
- **Database Schema Changes**:
  - None. Preserved and reused existing `PaymentReminderLog` schema and atomic unique `dedupKey` deduplication.
- **API Contracts Added/Updated**:
  - `POST /api/payments/reminders/trigger`: Converted from synchronous email sending to asynchronous scan job enqueuing, returning `{ success: true, message: 'Payment reminder scan job enqueued successfully', data: { jobId, status: 'queued', enqueuedAt } }`.
  - `GET /api/payments/event/:eventId/reminders`: Fully preserved without changes.
  - `GET /api/payments/schedule/:eventId`: Fully preserved without changes.
- **Financial & Business Rule Guarantees**:
  - Core financial calculations (`round2`, line item taxes, remaining balance) and event confirmation gates preserved with zero regressions.
  - Reminder boundary conditions preserved: Due-date reminders strictly within `0 <= daysUntilDue <= 2`; Link expiry warnings strictly within `0 < hoursUntilExpiry <= 24`.
  - Authoritative JIT balance revalidation: If an installment is paid before worker execution, email is skipped and marked `status: 'skipped'`.
  - Persistent deduplication: MongoDB `PaymentReminderLog.dedupKey` remains the source of truth, preventing double-sends even under worker crashes.
  - Retry & backoff: 3 attempts with 5s exponential backoff; failures recorded diagnostically as `status: 'failed'`.
- **Verification & Test Status**:
  - Dedicated queue test suite: 10/10 tests pass (`backend/tests/reminderQueue.test.ts`).
## CI Pipeline: GitHub Actions Continuous Integration (`.github/workflows/ci.yml`)
- **Impact Classification**: Low (Non-intrusive automated quality pipeline; adds CI workflow and test fixture resiliency without altering application business logic, models, or APIs)
- **Date**: 2026-10-15
- **Modules Affected**:
  - `.github/workflows/ci.yml` (New GitHub Actions workflow for automated CI)
  - `README.MD` (Added CI overview, pipeline stages, inspection guidelines, and merge policy)
  - `backend/tests/payments.test.ts` (Resilient relative dates for test fixture expiry)
  - `docs/08-bug-log.md` (Documented BUG-012 for test fixture clock-boundary expiration)
- **Workflow Pipeline Architecture**:
  - `backend-ci`: Isolated job running on `ubuntu-latest` with `node-version: 24` and dedicated `mongo:8.0` and `redis:7-alpine` service containers (with container healthchecks). Runs `npm ci`, `npm run type-check`, `npm test` (isolated test database `eventops_test`), and `npm run build`.
  - `frontend-ci`: Isolated job running on `ubuntu-latest` with `node-version: 24`. Runs `npm ci`, `npm run lint` (oxlint reporting 21 pre-existing warnings, 0 errors), `npm test` (vitest 20 tests pass), and `npm run build` (vite production bundle).
- **Security & Least Privilege**:
  - Workflow permissions restricted to `contents: read`.
  - Zero deployment or external production service coupling.
  - Zero exposure of real secrets; only safe, isolated dummy placeholders used for test execution.
- **Verification & Local Test Results**:
  - Backend Type Check (`npm run type-check`): 0 errors, exit code 0.
  - Backend Production Build (`npm run build`): compiled `dist/` cleanly, exit code 0.
  - Backend Test Suite (`npm test`): 324/324 passing across 35 suites, exit code 0.
  - Frontend Lint (`npm run lint`): 21 warnings, 0 errors, exit code 0.
  - Frontend Test Suite (`npm test`): 20/20 passing across 2 test files, exit code 0.
  - Frontend Production Build (`npm run build`): built production bundle in 11.01s, exit code 0.
- **Remote GitHub Actions Verification**:
  - Target Commit: `b9206271c6ac2a2a52b98546525b7642ac00560b` (`main` branch)
  - `backend-ci`: ✅ Green — successful (MongoDB 8.0 + Redis 7 services, Node.js 24 LTS, `npm ci`, type-check, tests, and build)
  - `frontend-ci`: ✅ Green — successful (Node.js 24 LTS, `npm ci`, oxlint, vitest, and production build)
  - CI Verdict: **PASS — REMOTE CI VERIFIED**

---

## Milestone 1: Event Manager Secure Onboarding (Admin Creation → Invitation Email → Password Setup → Account Activation → Manager Login → Protected Dashboard)

- **Impact Classification**: Medium (Extends User schema with invitation token hash, expiration, and accepted timestamp; makes password optional at schema level to allow invitation-pending account creation; adds invitation email delivery to existing email service; adds token validation, password setup, and activation APIs; updates Admin Event Managers interface to invitation flow with resend capabilities; implements public `/accept-invitation` page; preserves existing authentication, client signup, and payment systems intact)
- **Date**: 2026-10-16
- **Modules Affected**:
  - `backend/src/config/env.ts` (Added `invitationTokenExpiresInHours` with default 24 hours)
  - `backend/src/modules/auth/model/user.model.ts` (Added `invitationTokenHash?: string`, `invitationTokenExpiresAt?: Date`, `invitationAcceptedAt?: Date`; changed `password` to optional on schema level)
  - `backend/src/modules/email/service/email.service.ts` (Added `sendInvitationEmail` method with branded HTML template and dev console logging)
  - `backend/src/modules/auth/repository/user.repository.ts` (Added `findByInvitationTokenHash`, `updateInvitationToken`, and `acceptInvitation`)
  - `backend/src/modules/auth/service/user.service.ts` (Updated `createEventManager` to generate 32-byte secure random token, hash with SHA-256, set `isActive: false`, `emailVerified: false`, send invitation email; added `resendEventManagerInvitation`, `getInvitationDetails`, `acceptInvitation`; updated `loginUser` to block unactivated accounts with 401)
  - `backend/src/modules/auth/validation/user.validation.ts` (Added `validateEventManagerCreation` without password requirement; added `validateAcceptInvitation`)
  - `backend/src/modules/users/controller/user-management.controller.ts` (Added `resendInvitation` handler)
  - `backend/src/modules/users/routes/user.routes.ts` (Added `POST /api/users/event-managers/:id/resend-invitation` protected by Admin RBAC)
  - `backend/src/modules/auth/controller/user.controller.ts` (Added `getInvitationDetails` and `acceptInvitation` public handlers)
  - `backend/src/modules/auth/routes/auth.routes.ts` (Registered `GET /api/auth/invitation/:token` and `POST /api/auth/accept-invitation`)
  - `backend/tests/managerOnboarding.test.ts` (Created comprehensive 8-step test suite covering token creation, expiration, pending login block, resend, password setup, acceptance replay rejection, activated login)
  - `backend/tests/businessId.test.ts` (Updated test 9 to activate user prior to login test)
  - `backend/tests/userManagement.test.ts` (Updated test 4 to verify pending manager cannot login before activation, and logs in after activation)
  - `backend/tests/profile.test.ts` (Activated manager user in test setup before login)
  - `frontend/src/types/auth.ts` (Added `emailVerified` and `invitationAcceptedAt` to User interface)
  - `frontend/src/features/users/usersApi.ts` (Removed password from `CreateEventManagerPayload`, added `resendInvitation`)
  - `frontend/src/features/auth/invitationApi.ts` (Created client API for invitation token validation and password setup)
  - `frontend/src/pages/admin/AdminEventManagers.tsx` (Removed password from creation modal, added "Pending Invitation" badge, added "Resend Invitation" button with feedback)
  - `frontend/src/pages/auth/AcceptInvitation.tsx` (Created invitation acceptance and password setup page with token verification, form validation, error states, and login redirect)
  - `frontend/src/routes/AppRoutes.tsx` (Registered `/accept-invitation` route)
  - `frontend/src/pages/manager/ManagerDashboard.tsx` (Updated empty state text to exact specification)
  - `frontend/src/tests/adminEventManagers.test.tsx` (Updated tests for invitation modal without password and resend action)
  - `frontend/src/tests/acceptInvitation.test.tsx` (Created dedicated test suite for invitation acceptance page)
  - `frontend/src/tests/managerDashboard.test.tsx` (Updated empty state text assertion)
- **Database Schema Changes**:
  - `User.password`: changed from `required: true` to `required: false` to allow invitation-pending accounts prior to password setup.
  - `User.invitationTokenHash`: `String`, `select: false`.
  - `User.invitationTokenExpiresAt`: `Date`, `select: false`.
  - `User.invitationAcceptedAt`: `Date`.
- **API Contracts Added/Updated**:
  - `POST /api/users/event-managers`: Admin provisions manager without password; sets `isActive: false`, `emailVerified: false`; generates 32-byte cryptographic token, hashes with SHA-256 for storage, emails setup link.
  - `POST /api/users/event-managers/:id/resend-invitation`: Admin resends invitation; generates new token, supersedes previous token, resets 24h expiration, dispatches email.
  - `GET /api/auth/invitation/:token`: Public endpoint validating unexpired token and returning recipient details (`name`, `email`, `role`).
  - `POST /api/auth/accept-invitation`: Public endpoint accepting `{ token, password, confirmPassword }`, validating token, hashing password with bcrypt (10 rounds), activating account (`isActive: true`, `emailVerified: true`), unsetting token hash at rest.
- **Security Guarantees**:
  - Token entropy: 32 cryptographically secure random bytes generated with `crypto.randomBytes(32)`.
  - Token hashing at rest: SHA-256 hash stored in database; raw token never stored in database or logged.
  - Single-use enforcement: Token hash unset from user document upon acceptance; replay attempts rejected with 400.
  - Expiration enforcement: 24-hour expiration policy; expired tokens rejected during validation and acceptance.
  - Inactive account lock: Pending invitation accounts cannot authenticate via `POST /api/auth/login`.
  - Password security: bcrypt hashing with 10 salt rounds; plaintext passwords never stored or logged.
  - Role protection: Public registration cannot self-assign `event_manager`; `/manager` strictly protected for `event_manager` role.
- **Verification & Test Status**:
  - Backend Type Check (`npm run type-check`): 0 errors, exit code 0.
  - Backend Production Build (`npm run build`): compiled `dist/` cleanly, exit code 0.
  - Backend Test Suite (`npm test`): 343/343 passing across 38 suites, exit code 0.
  - Frontend Lint (`npm run lint`): 25 pre-existing warnings, 0 errors, exit code 0.
  - Frontend Test Suite (`npm test`): 38/38 passing across 5 test files, exit code 0.
  - Frontend Production Build (`npm run build`): built production bundle cleanly in 7.47s, exit code 0.

---

## Milestone 2: Event Manager Assignment and Assigned Events Dashboard

- **Impact Classification**: Medium (Extends existing Admin Event Details with eligibility retrieval and manager assignment modal; adds backend atomic assignment with concurrency rollback protection; enhances Manager Dashboard with live metrics; adds dedicated Manager Event List and operational Event Details screen; preserves existing User and Event models, authentication, and RBAC without introducing duplicate collections or breaking payment workflows; strictly excludes Work Requirements Management)
- **Date**: 2026-10-17
- **Modules & Files Affected**:
  - `backend/src/modules/auth/repository/user.repository.ts`:
    - Updated `findActiveEventManagers()` to exclude accounts with pending invitations (`invitationTokenHash: { $exists: false }`).
    - Added `findByIdWithInvitation(id)` to inspect internal invitation status.
  - `backend/src/modules/events/repository/event.repository.ts`:
    - Updated `findByManagerId()` to populate `clientId` with safe client contact info (`name email phone`).
  - `backend/src/modules/events/validation/admin-event.validation.ts`:
    - Created validation middleware for `validateGetAvailableManagers` and `validateAssignManager` validating MongoDB ObjectIds.
  - `backend/src/modules/events/routes/admin-event.routes.ts`:
    - Integrated validation middleware into `GET /api/admin/events/:id/available-managers` and `PATCH /api/admin/events/:id/manager`.
  - `backend/src/modules/events/service/admin-event.service.ts`:
    - Enforced event status eligibility (`confirmed` or `in_progress`).
    - Validated candidate manager account (exists, `event_manager` role, `isActive: true`, no pending invitation).
    - Implemented atomic conditional update (`findOneAndUpdate({ _id, status: { $in: ['confirmed', 'in_progress'] } })`).
    - Added post-write collision verification with automatic rollback if concurrent assignment causes an overlapping conflict.
  - `backend/tests/adminEventAssignment.test.ts`:
    - Added tests 10–14 covering pending invitation exclusion, reassignment to another manager, invalid ID validation, 404 for nonexistent manager, and idempotent reassignment.
  - `backend/tests/managerControlCenter.test.ts`:
    - Added tests 9–11 verifying manager event isolation (`/api/manager/events`), dashboard metrics calculation (`/api/manager/dashboard`), and RBAC protection against unauthenticated/unauthorized roles.
  - `backend/tests/payments.test.ts`:
    - Resolved pre-existing dynamic date discrepancy in test 55 while preserving October 16 due date required by test 59.
  - `frontend/src/features/events/eventsApi.ts`:
    - Added `AvailableManager` interface, `getAvailableManagers(eventId)`, and `assignEventManager(eventId, managerId)`.
  - `frontend/src/features/manager/managerApi.ts`:
    - Enriched `ManagerEvent` interface with client contact, coordinates, and operational details; added `getManagerEventById(id)`.
  - `frontend/src/pages/admin/AdminEventDetails.tsx`:
    - Added manager assignment status card and modal with live eligible manager retrieval, radio selection, and feedback.
  - `frontend/src/pages/manager/ManagerDashboard.tsx`:
    - Enhanced dashboard with metric cards (`Total Assigned`, `Upcoming`, `In Progress`, `Completed`), preserved empty state, and event cards linking to details.
  - `frontend/src/pages/manager/ManagerEventList.tsx`:
    - Created dedicated assigned events list with status filtering tabs (`All`, `Confirmed`, `In Progress`, `Completed`), search filter, and cards.
  - `frontend/src/pages/manager/ManagerEventDetails.tsx`:
    - Created operational event details page with schedule, host contact info, venue map via `ReadOnlyMap`, service preferences, notes, and 403 authorization guard.
  - `frontend/src/layouts/ManagerLayout.tsx`:
    - Added "Assigned Events" navigation link with `CalendarDays` icon.
  - `frontend/src/routes/AppRoutes.tsx`:
    - Mounted `/manager/events` and `/manager/events/:id` within `ManagerLayout`.
  - `frontend/src/tests/managerDashboard.test.tsx`:
    - Updated test mock for `getDashboardStats`.
  - `frontend/src/tests/managerEventDetails.test.tsx`:
    - Created tests for operational details rendering, 403 Forbidden access denial, and 404 handling.
  - `frontend/src/tests/managerEventList.test.tsx`:
    - Created tests for list rendering, status filtering tabs, text search, and empty state.
  - `frontend/src/tests/adminEventAssignment.test.tsx`:
    - Created tests for Admin Event Manager assignment modal, eligible manager selection, and API submission.
- **Database Schema**:
  - Reused existing `Event` (`eventManagerId`) and `User` models; no new database models or collections introduced.
- **API Contracts**:
  - `GET /api/admin/events/:id/available-managers`: Admin-only; returns active, activated event managers without time overlaps.
  - `PATCH /api/admin/events/:id/manager`: Admin-only; validates eligibility and assigns manager atomically.
  - `GET /api/manager/dashboard`: Event Manager only; returns aggregate stats for authenticated manager.
  - `GET /api/manager/events`: Event Manager only; returns assigned events with safe projection.
  - `GET /api/manager/events/:id`: Event Manager only; validates ownership and returns operational event details.
- **Security Guarantees**:
  - Strict server-side authoritative validation: frontend eligibility state is never trusted.
  - Data isolation: Managers can only view their own events; unauthorized access returns 403 Forbidden.
  - Safe projection: Quotation profit margins, gateway tokens, and worker payroll details are omitted.
  - Work Requirements Management is strictly deferred to future milestones.
- **Verification & Test Results**:
  - Backend Test Suite (`npm test`): 343/343 passing across 37 suites, exit code 0.
  - Backend Type Check (`npm run type-check`): 0 errors, exit code 0.
  - Frontend Lint (`npm run lint`): 29 pre-existing warnings, 0 errors, exit code 0.
  - Frontend Test Suite (`npm test`): 46/46 passing across 8 test files, exit code 0.
  - Frontend Production Build (`npm run build`): compiled cleanly in 9.87s, exit code 0.

---

## Entry 23: Worker Onboarding Milestone (Event Manager Creates Workers + Invitation + Worker Login + Worker Dashboard)

- **Date**: 2026-10-19
- **Author**: Antigravity Assistant & Engineering Team
- **Milestone**: EventOps ERP — Worker Onboarding Milestone
- **Classification**: Moderate / Business Rule Expansion (Approved)
- **Scope & Objective**:
  - Implement the business-rule change allowing active, authorized Event Managers to onboard Workers through an invitation-based flow in the Manager Portal.
  - Preserve all existing Admin Worker management privileges and direct password creation capabilities.
  - Full end-to-end flow: Event Manager creates Worker → Backend initializes pending account (`isActive: false`, `emailVerified: false`, `createdBy: creator.id`) → Dispatches 32-byte cryptographic invitation token (SHA-256 hashed at rest, 24h expiry) via centralized email service → Worker accepts invitation & sets password via `/accept-invitation` → Account activated & email verified → Worker logs in via `/login` → Redirected to `/worker` (Worker Dashboard).
  - Strictly out of scope: Work Requirements Management, Worker Selection Engine, on-site attendance, wage calculations, payroll, or worker-to-event assignment.
- **Affected Components & Files**:
  - `backend/src/modules/auth/model/user.model.ts`: Added optional `location` (`address`, `lat`, `lng`) and `createdBy` (`ObjectId` ref: `'User'`).
  - `backend/src/modules/auth/repository/user.repository.ts`: Supported filtering users by `createdBy` in `findUsers`.
  - `backend/src/modules/auth/validation/user.validation.ts`: Made `password` optional in `validateWorkerCreation` to accommodate invitation-based onboarding.
  - `backend/src/modules/auth/service/user.service.ts`:
    - `createWorker`: If caller is `event_manager`, verifies active creator status, forces `role = 'worker'`, records `createdBy = creator.id`, assigns business ID in worker type category range (2000–9999), creates pending account with hashed token, and sends invitation email. If caller is `admin` with password, creates active worker.
    - `loginUser`: Pre-emptively checks pending activation (`!user.isActive && !user.emailVerified`) and throws 401 with explicit instructions before password check.
    - `getInvitationDetails` & `acceptInvitation`: Expanded role validation to accept both `'event_manager'` and `'worker'` roles and returns `workerType`.
    - `resendWorkerInvitation`: Enforces creator isolation (`event_manager` can only resend for workers they created; Admin can resend for any worker).
    - `getWorkers`: Returns workers filtered by `createdBy` for Event Managers, all workers for Admin.
    - `toSafeUser`: Returns `location`, `createdBy`, and `invitationAcceptedAt`.
  - `backend/src/modules/users/controller/user-management.controller.ts`: Passed `req.user` to `createWorker`, added `getWorkers` and `resendWorkerInvitation`.
  - `backend/src/modules/users/routes/user.routes.ts`: Mounted `GET /api/users/workers`, `POST /api/users/workers`, and `POST /api/users/workers/:id/resend-invitation`.
  - `backend/src/modules/events/routes/manager-event.routes.ts`: Mounted `/workers` and `/workers/:id/resend-invitation` on `/api/manager`.
  - `backend/tests/workerOnboarding.test.ts`: Added 14 comprehensive integration and unit tests covering creation, role forcing, isolation, token validation, login blocking, acceptance, and activation.
  - `frontend/src/types/auth.ts`: Added `location` and `createdBy` to `User` interface.
  - `frontend/src/features/auth/invitationApi.ts`: Added `workerType` to `InvitationDetails`.
  - `frontend/src/features/workers/workersApi.ts`: Created API service with `createWorker`, `getWorkers`, and `resendInvitation`.
  - `frontend/src/pages/auth/AcceptInvitation.tsx`: Made role display, page titles, and success text dynamic for both Event Managers and Workers.
  - `frontend/src/pages/manager/ManagerWorkers.tsx`: Created Manage Workers interface with directory table, filters, search, "Create Worker" modal, and resend action.
  - `frontend/src/layouts/ManagerLayout.tsx`: Added "Manage Workers" navigation link (`Users` icon).
  - `frontend/src/routes/AppRoutes.tsx`: Mounted `/manager/workers` route with `RoleRoute`.
  - `frontend/src/pages/worker/WorkerDashboard.tsx`: Built full Worker Dashboard with profile summary and authentic empty state message.
  - `frontend/src/layouts/WorkerLayout.tsx`: Updated to use `react-router-dom` `Link` and refined layout styling.
  - `frontend/src/tests/managerWorkers.test.tsx`: 5 tests covering listing, filtering, modal creation, and resending invitation.
  - `frontend/src/tests/workerDashboard.test.tsx`: 4 tests covering profile rendering, empty state, and refresh action.
  - `frontend/src/tests/acceptInvitation.test.tsx`: Added test verifying Worker invitation acceptance and activation.
- **Database Schema**:
  - Reused existing `User` model; added `location` (`{ address?, lat?, lng? }`) and `createdBy` (`ObjectId`, ref: `'User'`).
  - No separate worker collection or duplicate schema introduced.
- **API Contracts**:
  - `POST /api/users/workers` / `POST /api/manager/workers`: Event Manager & Admin; initiates invitation-based onboarding.
  - `GET /api/users/workers` / `GET /api/manager/workers`: Event Manager (scoped to creator) & Admin (all workers).
  - `POST /api/users/workers/:id/resend-invitation` / `POST /api/manager/workers/:id/resend-invitation`: Resends invitation with fresh 24h token.
- **Security & Authorization**:
  - Authoritative backend validation: identity, creator attribution, and role forcing derive exclusively from JWT context.
  - Data isolation: Managers can only view and resend invitations for workers they created; non-creator managers receive 403 Forbidden.
  - Worker pool preservation: `createdBy` is purely for audit/management and does not partition workers from future event staffing.
  - Credentials & tokens hashed at rest with bcrypt and SHA-256 respectively; raw tokens never logged or exposed in list/create endpoints.
- **Verification & Test Results**:
  - Backend Test Suite (`npm test`): 357/357 passing across 38 suites, exit code 0.
  - Backend Type Check (`npm run type-check`): 0 errors, exit code 0.
  - Backend Build (`npm run build`): compiled cleanly, exit code 0.
  - Frontend Lint (`npm run lint`): 29 pre-existing warnings, 0 errors, exit code 0.
  - Frontend Test Suite (`npm test`): 56/56 passing across 10 test files, exit code 0.
  - Frontend Production Build (`npm run build`): compiled cleanly in 34.03s, exit code 0.

---

## Entry 24: Work Requirements Management Milestone (Event Manager Creates & Manages Staffing Requirements)

- **Date**: 2026-10-20
- **Author**: Antigravity Assistant & Engineering Team
- **Milestone**: EventOps ERP — Work Requirements Management Milestone
- **Classification**: Moderate / Business Rule Expansion (Approved)
- **Scope & Objective**:
  - Implement full Work Requirements access, listing, creation, draft editing, cancellation, and staffing demand summary within the Manager Portal for assigned, confirmed events.
  - Preserve established backend architecture: Express, TypeScript ESM, Mongoose, centralized config, RBAC middleware, and repository-service pattern.
  - Strictly reuse existing `WorkRequirement` Mongoose collection and existing module (`backend/src/modules/work-requirements/`).
  - Enforce authoritative server-side validation: 8-item worker type enum, integer `requiredCount >= 1`, non-empty `reportingTime`, length bounds on `description`.
  - Enforce assignment & event eligibility authorization: Event Manager must be assigned to the event (`event.eventManagerId === req.user.id`) and the event must be in `confirmed` status. Non-assigned managers receive 403 Forbidden; non-confirmed events receive 400 Bad Request. Admins retain full oversight access.
  - Status lifecycle authority: Initial requirements are strictly created as `draft`. Modifying fields (`workerType`, `requiredCount`, `reportingTime`, `description`) is permitted ONLY while in `draft` status. Permitted status transitions are `draft -> open` (recruitment announcement) and `draft -> cancelled`, `open -> cancelled`. Prohibited status transitions via client input: `selection_in_progress`, `filled`, and `closed` cannot be set by frontend PATCH calls and are reserved for the Worker Selection Engine.
  - Staffing demand calculation: Active workers needed sums `requiredCount` across active requirements, while `cancelled` requirements are strictly excluded from demand calculations.
  - Provide complete UX: Responsive data table, search/filter controls, loading/saving indicators, disabled submit states, dedicated empty state with "+ Create First Requirement" action, locked explanation banner for non-confirmed events, and distinct recoverable error state with retry.
  - Strictly out of scope: Worker Selection Engine, manual worker assignment, automated worker allocation, attendance, performance scoring, wages, payroll, changes to payment reminders or BullMQ/Redis infrastructure.
- **Affected Components & Files**:
  - `backend/src/modules/work-requirements/validation/work-requirement.validation.ts`:
    - Created validation middleware: `validateCreateWorkRequirement`, `validateUpdateWorkRequirement`, `validateEventIdParam`, `validateRequirementIdParam`.
    - Enforced valid MongoDB ObjectId formatting, 8 canonical worker types, integer `requiredCount >= 1`, non-empty `reportingTime`, description length limits, and status transition whitelist (`open`, `cancelled`).
  - `backend/src/modules/work-requirements/service/work-requirement.service.ts`:
    - Added ObjectId format pre-validation in `getRequirementsByEvent` and `createRequirement`.
    - Enforced `event.status === 'confirmed'` check for requirement creation.
    - Updated `updateRequirement`: Permitted `workerType` editing while in `draft` status, allowed cancellation from `draft` and `open`, prohibited direct client transition to `filled`/`selection_in_progress`/`closed`, and protected `eventId` from mutation.
    - Added `cancelRequirement` method transitioning eligible requirements to `cancelled`.
  - `backend/src/modules/work-requirements/routes/work-requirement.routes.ts`:
    - Attached `validateEventIdParam`, `validateCreateWorkRequirement`, and `validateUpdateWorkRequirement` to `/api/manager/events/:eventId/work-requirements`.
  - `backend/src/modules/work-requirements/routes/work-requirement-root.routes.ts`:
    - Attached `validateRequirementIdParam` and `validateUpdateWorkRequirement` to `/api/manager/work-requirements/:id`.
  - `backend/tests/workRequirements.test.ts`:
    - Expanded test suite from 15 to 23 tests covering validation errors, invalid ObjectIds, non-confirmed event rejection, draft field editing, non-draft edit blocking, cancellation from draft and open, and invalid status transition rejection.
  - `frontend/src/features/work-requirements/workRequirementsApi.ts`:
    - Created typed API client with `getRequirementsByEvent`, `createRequirement`, `updateRequirement`, and `cancelRequirement`.
  - `frontend/src/components/manager/WorkRequirementsSummary.tsx`:
    - Built staffing demand summary displaying active workers needed, total requirements, draft/open count, and role breakdown pills.
  - `frontend/src/components/manager/CreateRequirementModal.tsx`:
    - Created creation modal with 8-option worker type dropdown, integer count validation, reporting time input, instructions, loading state, and duplicate submission prevention (`noValidate` attribute and disabled states).
  - `frontend/src/components/manager/EditRequirementModal.tsx`:
    - Created modal for editing draft requirements with prefilled data and validation.
  - `frontend/src/components/manager/CancelRequirementModal.tsx`:
    - Created confirmation modal before cancelling a requirement.
  - `frontend/src/components/manager/WorkRequirementsSection.tsx`:
    - Built comprehensive requirements workspace with summary, search, status filters, data table, action buttons, empty state, locked state, and distinct error state with retry.
  - `frontend/src/pages/manager/ManagerEventDetails.tsx`:
    - Added dual-tab switcher (`Event Overview` vs `Work Requirements`) with URL search param synchronization (`?tab=requirements`) and quick staffing overview banner.
  - `frontend/src/pages/manager/ManagerEventList.tsx`:
    - Added direct "Requirements" link on event cards for confirmed events.
  - `frontend/src/tests/workRequirements.test.tsx`:
    - Added 7 comprehensive tests covering empty state, summary calculations, creation, draft editing, cancellation, non-confirmed locked state, and error handling.
  - `docs/04-status-and-business-rules.md`:
    - Updated Section 10 and Section 4 with authoritative validation, assignment checks, draft editing, cancellation lifecycle, and staffing summary rules.
  - `docs/05-api-design.md`:
    - Documented Section 27 Work Requirements API contracts, request/response bodies, validation rules, and error codes.
  - `docs/07-decvelopment-plan.md`:
    - Added Milestone 4 completion details and verified Phase 11 alignment.
- **Database Schema**:
  - Reused existing `WorkRequirement` schema; no schema changes or duplicate collections introduced.
- **API Contracts**:
  - `GET /api/manager/events/:eventId/work-requirements`: Event Manager (assigned only) & Admin; returns requirement list.
  - `POST /api/manager/events/:eventId/work-requirements`: Event Manager (assigned only) & Admin; creates requirement in `draft` status.
  - `PATCH /api/manager/work-requirements/:id`: Event Manager (assigned only) & Admin; updates fields in `draft` or transitions status (`open`, `cancelled`).
  - `PATCH /api/manager/events/:eventId/work-requirements/:id`: Alternate route with event verification.
  - `POST /api/manager/work-requirements/:id/cancel`: Dedicated cancellation endpoint transitioning `draft` or `open` requirement to `cancelled`.
- **Security & Authorization**:
  - Authoritative backend validation: Manager identity extracted from JWT context (`req.user.id`).
  - Event ownership check: Manager cannot view or modify requirements for events assigned to other managers (403 Forbidden).
  - Event status guard: Requirements can only be managed for `confirmed` events (400 Bad Request).
  - Time input constraint: `reportingTime` is strictly required upon creation, selected via browser time picker widget (`HH:mm`), and validated against valid time formats. Freeform plain text (e.g. "sometime in morning") is rejected by backend validation (400 Bad Request).
  - Status mutation guard: Direct transition to `selection_in_progress`, `filled`, or `closed` via user input is rejected (400 Bad Request).
- **Verification & Test Results**:
  - Backend Test Suite (`npm test`): 367/367 passing across 38 suites, exit code 0.
  - Backend Type Check (`npm run type-check`): 0 errors, exit code 0.
  - Backend Build (`npm run build`): compiled cleanly, exit code 0.
  - Frontend Lint (`npm run lint`): 34 pre-existing warnings, 0 errors, exit code 0.
  - Frontend Test Suite (`npm test`): 63/63 passing across 11 test files, exit code 0.
  - Frontend Production Build (`npm run build`): compiled cleanly in 3.85s, exit code 0.

---

## 2026-10-22 — Milestone 5: Worker Interest, Deterministic Worker Selection Engine, Distance Limits, and Safe Re-Selection

- **Change Classification**: Moderate (Feature expansion within existing Work Requirements & Worker modules, additive schema fields, dedicated queue infrastructure).
- **Motivation**:
  - Implement worker-facing interest expression and discovery for open staffing opportunities.
  - Implement deterministic backend selection engine using distance ranking and authoritative server timestamps.
  - Enforce manager-configured maximum permitted distance and mandatory same-calendar-day conflict exclusion across events and requirements.
  - Support automatic deadline processing via BullMQ with stale-job protection.
  - Support partial staffing and safe deadline extension that strictly preserves already assigned workers and fills only remaining unfilled positions.
  - Architect for future 55% performance / 45% distance scoring without fabricating performance data.
- **Affected Components**:
  - `backend/src/modules/work-requirements/model/work-requirement.model.ts`:
    - Added additive fields: `maxDistanceKm`, `interestDeadlineAt`, `selectionRound`, `assignedWorkers` subdocument array (`IAssignedWorker`), and `extensionHistory` subdocument array (`IExtensionHistory`).
    - Preserved existing 6 statuses: `draft`, `open`, `selection_in_progress`, `filled`, `closed`, `cancelled`.
  - `backend/src/modules/work-requirements/model/work-response.model.ts`:
    - Created `WorkResponse` model with compound unique index `{ requirementId: 1, workerId: 1 }` preventing duplicate interest submissions.
  - `backend/src/modules/worker-selection/utils/distance.util.ts`:
    - Implemented Haversine geographic distance calculation and 0–100 distance score normalization.
  - `backend/src/modules/worker-selection/utils/calendar-day.util.ts`:
    - Standardized ISO `YYYY-MM-DD` same-calendar-day parsing and conflict detection.
  - `backend/src/modules/worker-selection/ranking/`:
    - `IRankingStrategy`: Pluggable strategy interface.
    - `DistanceOnlyRankingStrategy`: Live strategy ranking by distance, server timestamp, and stable ID tie-breakers.
    - `CombinedPerformanceDistanceRankingStrategy`: Future-ready strategy implementing approved 55/45 formula.
  - `backend/src/modules/worker-selection/service/worker-selection.service.ts`:
    - Implemented core selection engine: candidate eligibility filtering, same-day exclusion, deterministic ranking, atomic `$push` persistence, and lifecycle transitions.
  - `backend/src/modules/worker-selection/queues/worker-selection.queue.ts`:
    - Dedicated BullMQ queue `'worker-selection'` isolated from payment queues.
  - `backend/src/workers/workerSelectionWorker.ts`:
    - Dedicated standalone background worker process for staffing selection.
  - `backend/src/modules/work-requirements/service/work-requirement.service.ts`:
    - Added distance and deadline validation upon creation/editing/opening, automatic BullMQ scheduling, deadline extension preserving assigned workers, and selection results retrieval.
  - `backend/src/modules/work-requirements/service/worker-opportunity.service.ts`:
    - Implemented worker opportunity browsing, interest expression with atomic conflict check, and confirmed shifts schedule.
  - `frontend/src/features/work-requirements/workRequirementsApi.ts`:
    - Added types and API methods for worker opportunities, express interest, worker assignments, selection results, and deadline extension.
  - `frontend/src/components/manager/CreateRequirementModal.tsx` & `EditRequirementModal.tsx`:
    - Added Maximum Worker Distance (km) and Interest Deadline fields.
  - `frontend/src/components/manager/ExtendDeadlineModal.tsx`:
    - Created modal with clear worker preservation banner, current staffing summary, and future deadline validation.
  - `frontend/src/components/manager/SelectionResultsModal.tsx`:
    - Created modal with Assigned Workers, Candidate Pool (with distance and limit-exceeded badges), Extension History, and manual trigger action.
  - `frontend/src/components/manager/WorkRequirementsSection.tsx`:
    - Integrated Staffing Results and Extend Deadline actions, added Max Distance and Interest Deadline columns.
  - `frontend/src/pages/worker/WorkerDashboard.tsx`:
    - Implemented Worker Opportunity browsing with real-time distance and deadline display, Express Interest action, and Confirmed Shifts table.
  - Automated Tests:
    - `backend/tests/workerSelection.test.ts`: 17 comprehensive backend tests covering interest submission, duplicate prevention, distance ranking, same-calendar-day exclusion, partial selection, deadline extension worker preservation, stale job rejection, and synthetic 55/45 scoring.
    - `frontend/src/tests/workerSelectionUI.test.tsx`: 4 frontend tests for ExtendDeadlineModal, SelectionResultsModal, and WorkerDashboard.
- **Verification Results**:
  - Backend Selection Tests: 17/17 passed (100%).
  - Backend Work Requirements Regression Tests: 32/32 passed (100%).
  - Backend Type Check (`npm run type-check`): 0 errors, exit code 0.
  - Backend Production Build (`npm run build`): compiled cleanly, exit code 0.
  - Frontend Test Suite (`npm test`): 67/67 passed across 12 test files (100%).
  - Frontend Lint (`npm run lint`): 0 errors, exit code 0.
  - Frontend Production Build (`npm run build`): compiled cleanly in 7.67s, exit code 0.

---

### [Mandatory Worker Location Selection & Distance Gate]
**Date:** 2026-10-22  
**Impact Level:** HIGH (Security, Access Control, and Selection Consistency)  
**Description:**
Enforced mandatory Worker location selection and confirmation prior to browsing available work opportunities or expressing interest. Integrated straight-line distance calculations against manager-defined maximum distance limits.

**Components & Files Changed:**
- **Backend Schema & Models**:
  - `backend/src/modules/auth/model/user.model.ts`: Extended `IUser.location` and schema with `confirmedAt?: Date`.
  - `backend/src/modules/work-requirements/model/work-response.model.ts`: Added `locationSnapshot` field to `IWorkResponse` and schema to record worker coordinates, address, and confirmed timestamp at time of application.
- **Backend Services & Validation**:
  - `backend/src/modules/auth/service/user.service.ts`: Enforced coordinate boundary validation (-90..90, -180..180, finite) and automatic `confirmedAt` timestamping on user updates.
  - `backend/src/modules/work-requirements/validation/work-requirement.validation.ts`: Added `validateWorkerLocationPayload` middleware.
  - `backend/src/modules/work-requirements/service/worker-opportunity.service.ts`:
    - Enforced mandatory location gate on `getAvailableOpportunities` and `expressInterest` (returns `400 Bad Request` with `LOCATION_REQUIRED` if location is unconfigured or invalid).
    - Hard distance eligibility filtering: `actualDistanceKm <= maxDistanceKm`.
    - Added `getWorkerLocation` and `updateWorkerLocation`: Updates user location, re-calculates distances, and updates `locationSnapshot` on pending interested applications without modifying the original server `respondedAt` timestamp.
    - Preserves established assignments: Selected workers are never altered or removed when declared profile locations change.
  - `backend/src/modules/work-requirements/controller/worker-opportunity.controller.ts` & `routes/worker-opportunity.routes.ts`:
    - Added `GET /api/worker/location` and `PATCH /api/worker/location`.
- **Frontend State, Routing & UI**:
  - `frontend/src/types/auth.ts`: Added `confirmedAt?: string` to `User.location`.
  - `frontend/src/features/auth/authSlice.ts`: Added `setUserLocation` reducer to sync confirmed coordinates into Redux store instantly.
  - `frontend/src/features/work-requirements/workRequirementsApi.ts`: Added `WorkerLocationPayload`, `WorkerLocationResponse`, `getWorkerLocation()`, and `updateWorkerLocation()`.
  - `frontend/src/features/events/components/LocationMapSelector.tsx`: Made labels, placeholders, and empty warnings configurable to support worker declared locations alongside event venues.
  - `frontend/src/pages/worker/WorkerLocationSetup.tsx`: Built dedicated worker location setup page at `/worker/location` implementing all 7 UX states (location not configured, permission denied, location loading, invalid location, location saved, location review/update, and privacy notices). Supports both browser geolocation ("Use Current Location") and manual search/map pin placement.
  - `frontend/src/routes/AppRoutes.tsx`: Added `/worker/location` route under `WorkerLayout`.
  - `frontend/src/layouts/WorkerLayout.tsx`: Added "My Location" navigation item with `MapPin` icon.
  - `frontend/src/pages/worker/WorkerDashboard.tsx`: Integrated location gate check. Displays location status pill in welcome banner, warning alert banner, location gate empty state on opportunities tab with direct CTA to `/worker/location`, and location update action in profile summary.
- **Automated Tests**:
  - `backend/tests/workerLocation.test.ts`: 18 tests covering location setup validation, out-of-range/NaN rejection, role authorization, mandatory location gate access control, distance limit exclusion, interest snapshot creation, tie-breaker preservation, and assignment preservation.
  - `frontend/src/tests/workerDashboard.test.tsx`: Updated and expanded with mandatory location gate tests.
  - `frontend/src/tests/workerSelectionUI.test.tsx`: Updated mock worker with valid confirmed coordinates.
- **Verification Results**:
  - Backend Location Gate Tests (`tests/workerLocation.test.ts`): 18/18 passed (100%).
  - Backend Selection Engine Tests (`tests/workerSelection.test.ts`): 17/17 passed (100%).
  - Backend Work Requirements Tests (`tests/workRequirements.test.ts`): 32/32 passed (100%).
  - Total Backend Tests Verified: 67/67 passed (100%).
  - Backend Type Check (`npm run type-check`): 0 errors, exit code 0.
  - Frontend Test Suite (`npm run test`): 70/70 passed across 13 test files (100%).
  - Frontend Lint (`npm run lint`): 0 errors, exit code 0.
  - Frontend Production Build (`npm run build`): compiled cleanly in 9.90s, exit code 0.

### [Worker Selection Engine — Immutable Location History & Anti-Manipulation]
**Date:** 2026-10-22
**Level:** Medium (Shared schemas and business rules; zero regression on existing payment/reminder/auth infrastructure)

**Description:**
Implemented immutable Worker location versioning, publication cutoff (`interestPublishedAt`), anti-manipulation distance verification, and deterministic selection rules. Guarantees that a Worker's location valid at requirement publication is frozen for that opportunity, preventing workers from manipulating rankings by updating their location after learning about an opportunity.

**Components & Files Changed:**
- **Backend Schema & Models**:
  - `backend/src/modules/work-requirements/model/worker-location-history.model.ts`: Created new immutable Mongoose collection `WorkerLocationHistory` with fields `workerId`, `address`, `lat`, `lng`, `effectiveFrom`, and `versionId`, indexed on `{ workerId: 1, effectiveFrom: -1 }`.
  - `backend/src/modules/work-requirements/model/work-requirement.model.ts`: Added `interestPublishedAt?: Date` to `IWorkRequirement` interface and schema with index.
  - `backend/src/modules/work-requirements/model/work-response.model.ts`: Added `versionId?: string` to `locationSnapshot`.
- **Backend Repositories & Services**:
  - `backend/src/modules/work-requirements/repository/worker-location-history.repository.ts`: Created repository with `createVersion`, `findEffectiveLocationAt(workerId, cutoffTimestamp)` (with safe legacy worker fallback), `findLatestByWorker`, and `getHistoryByWorker`.
  - `backend/src/modules/work-requirements/service/work-requirement.service.ts`: Authoritatively stamps `interestPublishedAt = new Date()` when a requirement transitions from `draft` to `open`. Strictly preserves `interestPublishedAt` on deadline extensions.
  - `backend/src/modules/work-requirements/service/worker-opportunity.service.ts`:
    - In `getAvailableOpportunities`: Resolves historical location valid at publication cutoff (`req.interestPublishedAt`). Excludes unresponded opportunities if worker had no valid location at cutoff.
    - In `expressInterest`: Resolves historical location valid at publication cutoff. Rejects with `400 Bad Request` if no valid location was on file at cutoff. Snapshots historical `versionId` and coordinates in `WorkResponse`.
    - In `updateWorkerLocation`: Creates immutable version in `WorkerLocationHistory` on material change (skips redundant versions if identical). Updates `User.location`. Removed the previous pending response mutation loop to prevent manipulation of existing opportunities.
  - `backend/src/modules/worker-selection/service/worker-selection.service.ts`: Resolves candidates' historical location as of `lockedRequirement.interestPublishedAt`. Excludes candidates without valid historical coordinates at cutoff.
  - `backend/src/modules/auth/service/user.service.ts`: Creates immutable location version in `WorkerLocationHistory` when a worker profile updates location coordinates.
- **Frontend Types**:
  - `frontend/src/features/work-requirements/workRequirementsApi.ts`: Added `interestPublishedAt?: string` to `WorkRequirement` and `WorkerOpportunity`.
- **Automated Tests**:
  - `backend/tests/workerSelectionAntiManipulation.test.ts`: Created comprehensive 7-test suite covering the mandatory 13-step lifecycle, distant worker manipulation prevention, missing historical location exclusion, anti-redundancy versioning, historical selection execution, and deterministic tie-breaking.
  - `backend/tests/workerLocation.test.ts`: Updated response snapshot test to verify anti-manipulation preservation of historical response snapshot.
- **Verification Results**:
  - Anti-Manipulation Test Suite (`tests/workerSelectionAntiManipulation.test.ts`): 7/7 passed (100%).
  - Selection Engine Test Suite (`tests/workerSelection.test.ts`): 17/17 passed (100%).
  - Location Gate Test Suite (`tests/workerLocation.test.ts`): 18/18 passed (100%).
  - Work Requirements Test Suite (`tests/workRequirements.test.ts`): 32/32 passed (100%).
  - Total Backend Domain Tests: 74/74 passed (100%).
  - Backend Type Check (`npm run type-check`): 0 errors, exit code 0.
  - Backend Build (`npm run build`): compiled cleanly, exit code 0.
  - Frontend Test Suite (`npm test`): 71/71 passed across 13 test files (100%).
  - Frontend Lint (`npm run lint`): 0 errors, exit code 0.
  - Frontend Production Build (`npm run build`): compiled cleanly in 3.50s, exit code 0.

### [Milestone 1 — Persistent Notifications, Socket.IO, and Core Business Integration]
**Date:** 2026-10-27
**Level:** Medium (Shared notification model and transport; zero regression on existing authentication, RBAC, payment, reminder, selection, or financial infrastructure)

**Description:**
Implemented Milestone 1 notification foundation, Socket.IO real-time server with user room isolation, cross-process Redis Pub/Sub delivery from `workerSelectionWorker.ts`, REST APIs (`GET /api/notifications`, `PATCH /api/notifications/:id/read`, `PATCH /api/notifications/read-all`), frontend notification UI with unread badge, and end-to-end integration with Business Workflow A (requirement announcement to eligible workers) and Business Workflow B (worker assignment confirmation and manager selection summary).

**Components & Files Changed:**
- **Backend Infrastructure & Sockets**:
  - `backend/src/modules/notifications/model/notification.model.ts`: Notification schema with recipient, type, title, message, isRead, readAt, resourceType, resourceId, destinationRoute, deduplicationKey (unique sparse), and compound indexes.
  - `backend/src/modules/notifications/repository/notification.repository.ts`: Safe atomic batch inserts, pagination, unread counting, read marking, deduplication pre-checks.
  - `backend/src/sockets/socket.server.ts`: Initialized Socket.IO attached to single HTTP server via `http.createServer(app)`; handshake JWT auth; joined private room `user:<userId>`.
  - `backend/src/sockets/notification-transport.ts`: Cross-process delivery service via Redis Pub/Sub (`eventops:notifications:realtime`) with local in-memory mock fallback for tests without Redis.
  - `backend/src/server.ts`: Converted Express listener to unified HTTP server, attached Socket.IO, initialized Redis notification subscriber, and configured graceful shutdown.
  - `backend/src/workers/workerSelectionWorker.ts`: Integrated `notificationTransport.close()` into worker shutdown lifecycle.
- **Backend Services & Controllers**:
  - `backend/src/modules/notifications/service/notification.service.ts`: Internal notification creation with safe deduplication, recipient verification, batch creation, and non-blocking real-time delivery.
  - `backend/src/modules/notifications/controller/notification.controller.ts` & `routes/notification.routes.ts`: `GET /api/notifications`, `PATCH /api/notifications/:id/read`, `PATCH /api/notifications/read-all`.
  - `backend/src/app.ts`: Registered `/api/notifications` routes.
- **Business Workflow A Integration (Requirement Publication Announcements)**:
  - `backend/src/modules/work-requirements/service/worker-opportunity.service.ts`: Added `findEligibleWorkersForOpportunity` evaluating all 8 canonical criteria (active account, workerType match, calendar day conflict check, valid venue location, valid worker location, cutoff at `interestPublishedAt`, maxDistanceKm limit).
  - `backend/src/modules/work-requirements/service/work-requirement.service.ts`: Dispatched `work_opportunity` notifications upon `draft -> open` transition with deduplication key `req_opp_${reqId}_${workerId}`.
- **Business Workflow B Integration (Selection Confirmations & Manager Summary)**:
  - `backend/src/modules/worker-selection/service/worker-selection.service.ts`: Dispatched `assignment_confirmed` to selected workers (`destinationRoute: '/worker'`) and `selection_summary` to responsible Event Manager (`destinationRoute: '/manager/events/:id'`) upon persisting assignments, with deduplication keys `sel_confirm_${reqId}_round${round}_${workerId}` and `sel_summary_${reqId}_round${round}_${managerId}`.
- **Frontend State, Services & UI**:
  - `frontend/src/features/notifications/notificationsApi.ts`: Axios client for notification listing and read status mutations.
  - `frontend/src/features/notifications/notificationSlice.ts`: Redux state tracking items, unreadCount, real-time arrivals, and reset on logout.
  - `frontend/src/services/socketClient.ts`: Socket.IO client instance with JWT auth, auto-reconnect, and reconnect resynchronization.
  - `frontend/src/components/common/NotificationBell.tsx`: Reusable notification bell with unread badge, dropdown panel, newest-first list, time-ago formatting, mark as read, mark all read, load more, empty state, and safe internal navigation.
  - `frontend/src/features/auth/authSlice.ts`: Disconnected socket and cleared notifications on user logout.
  - `frontend/src/layouts/AdminLayout.tsx`, `ClientLayout.tsx`, `ManagerLayout.tsx`, `WorkerLayout.tsx`: Embedded `NotificationBell` in headers.
- **Automated Tests**:
  - `backend/tests/notifications.test.ts`: 11 backend integration tests covering model persistence, deduplication, REST APIs, cross-user denial, Socket.IO handshake auth and room isolation, eligible worker filtering on announcement, and assignment confirmation/summary dispatch.
  - `frontend/src/tests/notificationsUI.test.tsx`: 7 Vitest tests covering badge rendering, panel toggle, empty state, filtering tabs, mark as read, navigation, and real-time socket events.
- **Verification Results**:
  - Backend Notifications Test Suite (`tests/notifications.test.ts`): 11/11 passed (100%).
  - Full Backend Test Suite (`npm test`): 430/430 passed across 53 suites (100%).
  - Backend Type Check (`npm run type-check`): 0 errors, exit code 0.
  - Backend Production Build (`npm run build`): compiled cleanly, exit code 0.
  - Frontend Test Suite (`npm test`): 84/84 passed across 16 test files (100%).
  - Frontend Lint (`npm run lint`): 0 errors, exit code 0.
  - Frontend Production Build (`npm run build`): compiled cleanly in 40.06s, exit code 0.

---

### [Unified Background Worker Architecture Refactor]
**Date:** 2026-10-29
**Impact Classification:** Medium (Internal architectural refactoring of background worker process lifecycle: unified orchestrator, single Node.js process startup, shared database initialization, graceful shutdown, and notification-ready worker registration with zero breaking changes to business logic, queues, models, or APIs)

**Description:**
Refactored the EventOps ERP background worker architecture so a single command (`npm run worker`) starts both the Payment Reminder worker and the Worker Selection worker within a single Node.js process using a lightweight orchestrator (`src/workers/worker.ts`). Refactored individual worker entry points (`paymentReminderWorker.ts`, `workerSelectionWorker.ts`) into explicit exported startup functions (`startPaymentReminderWorker`, `startWorkerSelectionWorker`) returning resource handles (`BackgroundWorkerHandle`), while preserving independent standalone execution wrappers for troubleshooting (`npm run worker:payment`, `npm run worker:selection`). Established single-connection MongoDB lifecycle management, safe rollback on startup errors, reverse-order graceful shutdown, and an extensible registry for future background workers (e.g. `startNotificationWorker`).

**Components & Files Changed:**
- `backend/src/workers/worker.ts`:
  - Created `UnifiedWorker` orchestrator managing shared infrastructure and worker lifecycles.
  - Implemented single-connection MongoDB initialization via `connectDB()`.
  - Implemented deterministic startup sequence: Payment Reminder Worker -> Worker Selection Worker.
  - Implemented safe startup rollback closing partially initialized workers if an error occurs.
  - Implemented reverse-order graceful shutdown (`SIGINT` / `SIGTERM`) closing workers, queues, Redis resources, and disconnecting MongoDB.
  - Provided extensible `registerWorker()` mechanism for future notification processing.
- `backend/src/workers/paymentReminderWorker.ts`:
  - Refactored into exported startup function `startPaymentReminderWorker()`.
  - Preserved BullMQ scan & email worker initialization, recurring scan scheduler (`REMINDER_CHECK_INTERVAL_MS`), and queue configurations.
  - Added standalone runner guard using `isMainModule` to prevent auto-start and duplicate signal handlers when imported.
- `backend/src/workers/workerSelectionWorker.ts`:
  - Refactored into exported startup function `startWorkerSelectionWorker()`.
  - Preserved BullMQ selection worker initialization, deadline recovery scan (`scanAndProcessExpiredDeadlines`), and notification transport cleanup.
  - Added standalone runner guard using `isMainModule` to prevent auto-start and duplicate signal handlers when imported.
- `backend/src/utils/isMainModule.ts`:
  - Added shared utility to cleanly differentiate standalone process execution from ESM module imports.
- `backend/package.json`:
  - Updated `"worker"` script to run `src/workers/worker.ts`.
  - Updated `"worker:prod"` script to run `dist/workers/worker.js`.
  - Added `"worker:payment"` and `"worker:payment:prod"` scripts for isolated payment reminder worker troubleshooting.
  - Preserved `"worker:selection"` and `"worker:selection:prod"` scripts for isolated selection worker troubleshooting.
- `backend/tests/unifiedWorker.test.ts`:
  - Added 10 automated test cases verifying single-process registration, single MongoDB initialization, startup invocation, rollback on error, graceful shutdown, recovery logic preservation, signal handler isolation, and test DB safety guard.

**Verification Results:**
- Backend Type Check (`npm run type-check`): 0 errors, exit code 0.
- Backend Build (`npm run build`): compiled cleanly to `dist/`, exit code 0.
- Unified Worker Test Suite (`tests/unifiedWorker.test.ts`): 10/10 passed (100%), exit code 0.
- Payment Reminder Queue Test Suite (`tests/reminderQueue.test.ts`): 10/10 passed (100%), exit code 0.
- Worker Selection Test Suite (`tests/workerSelection.test.ts`): 17/17 passed (100%), exit code 0.
- Full Backend Test Suite (`npm test`): 442/442 passed across 54 suites (100%), exit code 0.

---



---

### [BullMQ-Based Notification Processing & Unified Worker Registration]
**Date:** 2026-10-29
**Impact Classification:** Medium (Adds dedicated BullMQ notification queue and background processor to the Unified Worker architecture; replaces synchronous notification dispatch with resilient asynchronous job queueing; maintains MongoDB as single source of truth, persistent deduplication, bounded batch processing, and cross-process Socket.IO delivery without changes to business rules, financial calculations, or worker selection logic)

**Description:**
Integrated asynchronous notification processing as a third independent BullMQ worker within the EventOps ERP Unified Worker process. Introduced a dedicated BullMQ queue (`notification-processing`) with typed job payloads (`requirement-announcement`, `selection-completion`), bounded concurrency (3), exponential backoff retries (3 attempts), and startup recovery scanning (`scanAndRecoverPendingNotifications`). Refactored Work Requirement publication and Worker Selection completion producers to submit jobs to the queue rather than dispatching synchronously. MongoDB remains the authoritative source of truth: notifications use `deduplicationKey` for persistent idempotency, job processors re-validate persisted document state to prevent stale job execution, and failures in notification enqueuing/processing never roll back persisted domain states. Registered `startNotificationWorker()` as worker #3 in `src/workers/worker.ts`, preserving single-command execution (`npm run worker` starts Payment Reminders + Worker Selection + Notifications), reverse-order graceful shutdown, and standalone debugging (`npm run worker:notification`).

**Components & Files Changed:**
- `backend/src/modules/notifications/queues/notification.queue.ts`:
  - Created `NotificationQueueService` managing the `notification-processing` BullMQ queue.
  - Defined typed jobs: `requirement-announcement` (`RequirementAnnouncementJobData`) and `selection-completion` (`SelectionCompletionJobData`).
  - Implemented `InMemoryNotificationQueue` for isolated test environments (`NODE_ENV === 'test'`).
  - Implemented producer methods: `enqueueRequirementAnnouncements` and `enqueueSelectionNotifications` with deterministic, stable job IDs.
  - Implemented worker processors:
    - `processRequirementAnnouncements`: Validates active requirement state, evaluates `workerOpportunityService.findEligibleWorkersForOpportunity`, batches notifications with deduplication keys (`req_opp_${reqId}_${workerId}`), persists to MongoDB, and triggers real-time delivery.
    - `processSelectionCompletion`: Validates requirement and selection round, batches `assignment_confirmed` notifications (`sel_confirm_${reqId}_round${round}_${workerId}`) for assigned workers, and dispatches `selection_summary` (`sel_summary_${reqId}_round${round}_${managerId}`) to responsible Event Manager.
  - Implemented startup recovery: `scanAndRecoverPendingNotifications` scans and recovers unannounced open requirements and unnotified completed selections.
  - Added queue configuration getters: `getQueueName()`, `getConcurrency()`, and `getMaxRetries()`.
- `backend/src/modules/notifications/repository/notification.repository.ts`:
  - Enhanced `createManySafe` so that when a duplicate key error (`11000`) occurs during bulk insertion (e.g. during retries or recovery), existing records matching the deduplication keys are retrieved and returned along with newly inserted documents, ensuring real-time socket delivery is not skipped on retries.
- `backend/src/workers/notificationWorker.ts`:
  - Implemented `startNotificationWorker()` returning `NotificationWorkerHandle` (`name: 'notification-worker', close: () => Promise<void>`).
  - Added startup recovery invocation (`scanAndRecoverPendingNotifications`).
  - Added standalone runner guard using `isMainModule` for isolated troubleshooting (`npm run worker:notification`).
- `backend/src/workers/worker.ts`:
  - Imported `startNotificationWorker` and registered it as default worker #3 (`Notification Worker`).
  - Unified Worker now orchestrates Payment Reminder, Worker Selection, and Notification workers in one single process.
  - Reverse-order graceful shutdown closes Notification Worker, Worker Selection Worker, and Payment Reminder Worker before closing MongoDB.
- `backend/src/modules/work-requirements/service/work-requirement.service.ts`:
  - Updated `updateRequirement`: On `draft -> open` transition, enqueues announcements asynchronously via `notificationQueueService.enqueueRequirementAnnouncements(...)`.
  - Maintained `sendOpportunityAnnouncements` delegating to `notificationQueueService.processRequirementAnnouncements(...)` for backward compatibility.
- `backend/src/modules/worker-selection/service/worker-selection.service.ts`:
  - Migrated step 9 notification dispatch to `notificationQueueService.enqueueSelectionNotifications(...)`.
- `backend/package.json`:
  - Added `"worker:notification": "tsx src/workers/notificationWorker.ts"`.
  - Added `"worker:notification:prod": "node dist/workers/notificationWorker.js"`.
- `backend/tests/notificationQueue.test.ts`:
  - Created 9 comprehensive automated tests verifying queue naming, concurrency (3), retries (3), Unified Worker registration, announcement processing for eligible workers, skipping stale/draft requirements, selection completion dispatches, stale round rejection, deduplication idempotency, and startup recovery.
- `backend/tests/unifiedWorker.test.ts`:
  - Updated test suite to verify 3 default registered workers (Payment Reminder, Worker Selection, Notification Worker), dynamic registration, lifecycle execution, and reverse graceful shutdown.

**Verification Results:**
- Backend Type Check (`npm run type-check`): 0 errors, exit code 0.
- Backend Production Build (`npm run build`): compiled `dist/` cleanly, exit code 0.
- Notification Queue Test Suite (`tests/notificationQueue.test.ts`): 9/9 passed (100%), exit code 0.
- Unified Worker Test Suite (`tests/unifiedWorker.test.ts`): 10/10 passed (100%), exit code 0.
- Persistent Notifications & Socket.IO Test Suite (`tests/notifications.test.ts`): 11/11 passed (100%), exit code 0.
- Frontend Notification UI Test Suite (`src/tests/notificationsUI.test.tsx`): 7/7 passed (100%), exit code 0.


---

### [Notification Queue Test Fixes]
**Date:** 2026-10-29
**Changes:**
- Fixed TypeScript compiler errors in `backend/tests/notificationQueue.test.ts`.
- Removed redundant `workerType` and `eventId` properties from `RequirementAnnouncementJobData` test fixtures (lines 220, 260, 385), aligning them with the minimal BullMQ queue data contract.
- Safely asserted optional `resourceId` on Mongoose documents (`workerNotif.resourceId` and `managerNotif.resourceId`) by removing `.toString()` invocation that triggered `'workerNotif.resourceId' is possibly 'undefined'`.
**Impact:**
- Low impact. Isolated strictly to `backend/tests/notificationQueue.test.ts`. Production models, queue services, and schemas remain unchanged.


---

### [Notification Milestone 2 — Advanced Work Requirement Lifecycle & Staffing Notifications]
**Date:** 2026-10-30
**Impact Classification:** Medium (Extends existing BullMQ notification processing and Unified Worker architecture with four specialized Work Requirement lifecycle events: cancellations, material updates with conditional recipient selection, deadline extensions with location invariance, and unfilled staffing alerts to Event Managers; strictly preserves MongoDB source-of-truth authority, persistent deduplication, and zero-downtime backward compatibility)

**Description:**
Implemented Notification Milestone 2 on top of the established EventOps ERP notification infrastructure. Added conditional recipient selection algorithms matching workers and managers to Work Requirements based on their actual database-persisted relationship:
1. **Event A — Cancellation Notifications**: Notifies assigned workers (`WorkRequirement.assignedWorkers`) and active interested workers (`WorkResponse` with `responseStatus: 'interested'`), deduplicated by Worker ID. Differentiates messaging between confirmed assignment cancellation and opportunity cancellation.
2. **Event B — Work Requirement Changes**: Compares old and new persisted values for material operational fields (`workerType`, `requiredCount`, `reportingTime`, `maxDistanceKm`). Excludes irrelevant metadata changes. Evaluates staffing count and interest window state to select recipients conditionally:
   - *Scenario A (Fully Filled)*: Notifies ONLY assigned workers.
   - *Scenario B (Unfilled & Interest Window Open)*: Notifies assigned + active interested + currently eligible workers (from `workerOpportunityService.findEligibleWorkersForOpportunity`), deduplicated.
   - *Scenario C (Unfilled & Interest Window Closed)*: Notifies assigned + active interested workers only.
3. **Event C — Deadline Extensions**: Triggered upon persisted deadline extension (`extendDeadline`). Notifies active interested workers and currently eligible candidates, deduplicated. Excludes assigned workers (their confirmed work is strictly preserved). Preserves the requirement's original publication timestamp (`interestPublishedAt`) and historical worker location versions.
4. **Event D — Unfilled Staffing Alerts**: Triggered upon worker selection completion when vacancies remain (`remainingCount = max(0, requiredCount - assignedCount) > 0`). Sends alert titled `Staffing Requirement Still Unfilled` exclusively to the responsible Event Manager. When all positions are filled, suppresses the unfilled alert and delivers the standard positive completion summary.
5. **Frontend Notification Bell**: Updated `NotificationBell.tsx` with dedicated Lucide-react iconography: `XCircle` for cancellations, `RefreshCw` for updates, `Clock` for deadline extensions, and `AlertTriangle` for unfilled staffing alerts.

**Components & Files Changed:**
- `backend/src/modules/notifications/model/notification.model.ts`:
  - Extended `NotificationType` with `'requirement_cancelled' | 'requirement_updated' | 'deadline_extended' | 'staffing_unfilled'`.
- `backend/src/modules/work-requirements/repository/work-response.repository.ts`:
  - Exported singleton instance `export const workResponseRepository = new WorkResponseRepository();` for centralized access.
- `backend/src/modules/notifications/queues/notification.queue.ts`:
  - Added BullMQ job constants: `JOB_REQUIREMENT_CANCELLATION`, `JOB_REQUIREMENT_UPDATE`, `JOB_DEADLINE_EXTENSION`.
  - Added typed job interfaces: `RequirementCancellationJobData`, `RequirementUpdateJobData`, `DeadlineExtensionJobData`.
  - Added queue producer methods: `enqueueRequirementCancellation`, `enqueueRequirementUpdate`, `enqueueDeadlineExtension`.
  - Implemented background processor methods: `processRequirementCancellation`, `processRequirementUpdate`, `processDeadlineExtension`.
  - Updated `processSelectionCompletion` to generate `staffing_unfilled` alerts when vacancies remain and `selection_summary` when fully filled.
  - Registered job processors in `startWorker()` and in-memory mock handler.
- `backend/src/modules/work-requirements/service/work-requirement.service.ts`:
  - Removed outdated restriction blocking updates on non-draft requirements; added status guards for closed/cancelled requirements.
  - Added operational field change detection (`changedFields`).
  - Integrated `enqueueRequirementCancellation` on transition to `cancelled`.
  - Integrated `enqueueRequirementUpdate` on active non-draft requirement changes.
  - Integrated `enqueueDeadlineExtension` inside `extendDeadline`.
- `frontend/src/components/common/NotificationBell.tsx`:
  - Added icon and styling mappings for `requirement_cancelled`, `requirement_updated`, `deadline_extended`, `staffing_unfilled`.
- `backend/tests/notificationMilestone2.test.ts`:
  - Created 19 comprehensive automated test cases covering Event A (1-4), Event B (1-5), Event C (1-3), Event D (1-4), and End-to-End service integration (1-3).
- `docs/04-status-and-business-rules.md`:
  - Documented Section 8: Notification Milestone 2 rules, candidate groups, scenarios, and constraints.
- `docs/05-api-design.md`:
  - Documented Section 10: Event schemas, queue job payloads, and notification delivery contracts.

**Verification Results:**
- Backend Type Check (`npm run type-check`): 0 errors, exit code 0.
- Backend Compilation (`npm run build`): compiled cleanly, exit code 0.
- Frontend Lint (`npm run lint`): 0 errors, exit code 0.
- Frontend Build (`npm run build`): compiled cleanly in 4.08s, exit code 0.
- Milestone 2 Test Suite (`tests/notificationMilestone2.test.ts`): 19/19 passed (100%), exit code 0.
- Existing Notifications Test Suite (`tests/notifications.test.ts`): 11/11 passed (100%), exit code 0.
- Notification Queue Test Suite (`tests/notificationQueue.test.ts`): 9/9 passed (100%), exit code 0.
- Work Requirements Test Suite (`tests/workRequirements.test.ts`): 32/32 passed (100%), exit code 0.
- Worker Selection Test Suite (`tests/workerSelection.test.ts`): 17/17 passed (100%), exit code 0.
- Unified Worker Test Suite (`tests/unifiedWorker.test.ts`): 10/10 passed (100%), exit code 0.


---

### [Manager Work Requirements UI Redesign & Accessibility Optimization]
**Date:** 2026-10-30
**Impact Classification:** Low (Isolated frontend visual, accessibility, and interaction redesign strictly scoped to the Event Manager portal work requirement workspace and dialogs; zero modifications to backend routes, business logic, financial models, database collections, or queue contracts)

**Description:**
Elevated the Event Manager work requirement user experience across all related components using the `frontend-design` and `ui-ux-pro-max` design systems. Upgraded the visual hierarchy, micro-interactions, accessibility (WCAG 4.5:1 text contrast, `role="alert"`, `aria-modal="true"`, visible focus rings), and responsive layouts:
1. **`WorkRequirementsSummary.tsx`**: Executive-grade KPI statistics cards with fill ratio percentage ring, active headcount needed, defined requirements count, editable drafts, and active recruitment counters. Enhanced demanded roles breakdown with role capacity badges; omitted explicit cancellation banners and counts to keep focus purely on active staffing demand.
2. **`WorkRequirementsSection.tsx`**: Streamlined filtration interface using a single dropdown `<select>` with dynamic badge counts per status alongside accessible search input. Status badges redesigned into square shapes (`rounded-md`) with uniform fixed width (`w-24`) for consistent alignment. "Add Requirement" button in mobile view refined to a compact, non-stretching natural size (`px-3.5 py-2`). Simplified "Staffing Progress" column to an executive-grade plain fraction (`X / Y filled`) without colorful progress bars. Moved recruitment round badges exclusively to the details modal to keep the table clean.
3. **`RequirementDetailsModal.tsx`**: Modernized requirement inspection dossier with key operational metrics (Reporting Time with 12h formatting, Maximum Distance with radius limit guidance, Headcount Progress, Interest Window), role instructions card, selection round indicators, assigned personnel roster with phone links and distance indicators, extension audit trail, and square status badges.
4. **`CreateRequirementModal.tsx` & `EditRequirementModal.tsx`**: Added quick headcount stepper buttons (`+` / `-`), radius distance preset pills (`10km`, `15km`, `25km`, `50km`), reporting time formatting preview, accessible field error alerts, and disabled state spinners.
5. **`AnnounceRequirementModal.tsx`**: Added quick deadline preset shortcuts (`Tomorrow`, `+2 Days`, `+3 Days`), radius distance preset pills, and educational guidance regarding deterministic AI candidate selection.
6. **`SelectionResultsModal.tsx`**: Executive staffing KPI metrics, AI deterministic ranking criteria callout, tabbed navigation between assigned workers, interested candidate pool, and extension audit history with distance and status pills.
7. **`ExtendDeadlineModal.tsx` & `CancelRequirementModal.tsx`**: High-contrast worker assignment preservation reassurance, unfilled position counters, preset hour extensions, and accessible confirmation dialogs.
8. **Test Fixture Resiliency (`workerSelectionUI.test.tsx`)**: Replaced hardcoded past date with evergreen relative future timestamp offset for deadline extension test assertion.

**Components & Files Changed:**
- `frontend/src/components/manager/WorkRequirementsSummary.tsx`
- `frontend/src/components/manager/WorkRequirementsSection.tsx`
- `frontend/src/components/manager/RequirementDetailsModal.tsx`
- `frontend/src/components/manager/CreateRequirementModal.tsx`
- `frontend/src/components/manager/EditRequirementModal.tsx`
- `frontend/src/components/manager/AnnounceRequirementModal.tsx`
- `frontend/src/components/manager/SelectionResultsModal.tsx`
- `frontend/src/components/manager/ExtendDeadlineModal.tsx`
- `frontend/src/components/manager/CancelRequirementModal.tsx`
- `frontend/src/tests/workerSelectionUI.test.tsx`

**Verification Results:**
- Frontend Type Check & Build (`npm run build`): Compiled cleanly in 7.52s with 0 errors.
- Frontend Linter (`npm run lint`): 0 errors, exit code 0.
- Work Requirements UI Test Suite (`src/tests/workRequirements.test.tsx`): 7/7 passed (100%).
- Announce Requirement UI Test Suite (`src/tests/announceRequirementUI.test.tsx`): 2/2 passed (100%).
- Completed Events Requirements Test Suite (`src/tests/workRequirementsCompletedEvent.test.tsx`): 3/3 passed (100%).
- Modal UI & Actions Test Suite (`src/tests/workRequirementsModalUI.test.tsx`): 3/3 passed (100%).
- Worker Selection UI Test Suite (`src/tests/workerSelectionUI.test.tsx`): 5/5 passed (100%).
- Full Frontend Test Suite (`npm test`): 84/84 passed across 16 test files (100%), exit code 0.


---

### [Notification Reliability Upgrade — Path A: Transactional Outbox Pattern + BullMQ Recovery]
**Date:** 2026-10-31
**Impact Classification:** High (Introduces durable MongoDB Transactional Outbox pattern, multi-document ACID transactions with Replica Set rs0, dedicated outbox dispatcher background worker, and outbox event models/repositories while preserving all existing EventOps business rules and BullMQ queues)

**Description:**
Resolved the dual-write vulnerability identified in the Notification Milestone 2 audit, where successful MongoDB business writes for Work Requirement cancellations, operational updates, and deadline extensions could fail to enqueue BullMQ jobs if Redis was temporarily down or partitioned:
1. **Dedicated Outbox Collection (`notification_outboxes`)**:
   - Implemented `backend/src/modules/notifications/model/notification-outbox.model.ts` with strict schema, status state machine (`pending`, `dispatching`, `queued`, `processed`, `dead_letter`), generation tracking, lease management, and compound indexes.
2. **Outbox Repository (`notification-outbox.repository.ts`)**:
   - Implemented atomic operations: `create`, `claimEvent`, `markQueued`, `markProcessed`, `recordDispatchFailure`, `recoverExpiredLeases`, and `redriveDeadLetter`.
3. **Multi-Document ACID Transactions (`work-requirement.service.ts`)**:
   - Refactored `cancelRequirement`, `updateRequirement`, and `extendDeadline` to execute business state mutations and outbox record insertions atomically inside `session.withTransaction()`.
   - Any failure aborts the entire transaction with zero partial state or orphaned events.
4. **Outbox Dispatcher Service (`notification-outbox-dispatcher.service.ts`)**:
   - Registered as worker #4 in `backend/src/workers/worker.ts` under the Unified Worker runtime.
   - Bounded indexed polling (every 2000ms, batch size: 10).
   - Atomic distributed lease locking (`findOneAndUpdate` with PID/UUID token and 30-second TTL).
   - Enqueues typed BullMQ jobs (`requirement-cancellation`, `requirement-update`, `deadline-extension`) to `notification-processing` queue.
   - Waits for BullMQ acknowledgment before marking outbox records `queued`.
   - Automatically recovers stale leases from crashed worker instances.
   - Bounded exponential backoff when Redis is unavailable, resuming automatically upon reconnection.
5. **Worker Notification Processors (`notification.queue.ts`)**:
   - Updated processor functions (`processRequirementCancellation`, `processRequirementUpdate`, `processDeadlineExtension`) to mark outbox records `processed` upon successful notification persistence.
6. **Automated Reliability Test Suite (`backend/tests/notificationOutbox.test.ts`)**:
   - 8 comprehensive automated tests:
     1. Transactional Atomicity on cancellation (commits requirement + outbox atomically).
     2. Transactional Rollback on simulated outbox failure (aborts requirement update).
     3. Material Update Atomicity (material changes insert outbox, unchanged updates skip).
     4. Deadline Extension Atomicity (preserves assigned workers, inserts outbox).
     5. Redis Outage Simulation & Automatic Recovery (retains outbox, exponential backoff, recovers on reconnect).
     6. Concurrent Dispatcher Distributed Lease Locking (second dispatcher claim rejected).
     7. Expired Lease Recovery (stale leases returned to pending).
     8. Exhausted Retries Dead-Letter Transition & Redrive (transitions to dead_letter, redrives cleanly).

**Components & Files Changed:**
- `backend/src/modules/notifications/model/notification-outbox.model.ts` (New)
- `backend/src/modules/notifications/repository/notification-outbox.repository.ts` (New)
- `backend/src/modules/notifications/service/notification-outbox-dispatcher.service.ts` (New)
- `backend/src/modules/notifications/queues/notification.queue.ts` (Updated)
- `backend/src/modules/work-requirements/service/work-requirement.service.ts` (Updated)
- `backend/src/workers/worker.ts` (Updated)
- `backend/tests/notificationOutbox.test.ts` (New)
- `backend/tests/notificationMilestone2.test.ts` (Verified 19/19 passing)
- `backend/tests/notificationQueue.test.ts` (Updated for worker #4, 9/9 passing)
- `backend/tests/unifiedWorker.test.ts` (Updated for worker #4, 10/10 passing)
- `docs/06-architecture.md` (Updated with Section 20)
- `docs/09-change-impact-log.md` (Updated)

**Verification Results:**
- Backend Type Check (`npm run type-check`): 0 errors, exit code 0.
- Backend Compilation (`npm run build`): compiled cleanly, exit code 0.
- Outbox Reliability Test Suite (`backend/tests/notificationOutbox.test.ts`): 8/8 passed (100%), exit code 0.
- Milestone 2 Test Suite (`backend/tests/notificationMilestone2.test.ts`): 19/19 passed (100%), exit code 0.
- Notification Queue Test Suite (`backend/tests/notificationQueue.test.ts`): 9/9 passed (100%), exit code 0.
- Unified Worker Test Suite (`backend/tests/unifiedWorker.test.ts`): 10/10 passed (100%), exit code 0.
- Frontend Test Suite (`npm test`): 84/84 passed across 16 test files (100%), exit code 0.
- Frontend Production Build (`npm run build`): compiled cleanly in 7.36s, exit code 0.

---

### [Notification Reliability Upgrade — Fixes 1, 2, and 3 (Prepare for Milestone 3)]
**Date:** 2026-10-31
**Impact Classification:** Medium (Standardizes BullMQ job typing, improves background dispatcher promise orchestration and logging, and tightens test assertions without altering any database models, API contracts, or business rules)

**Description:**
Resolved the three targeted reliability and test harness issues identified during the Transactional Outbox verification:
1. **Fix 1 — Typed BullMQ Outbox Job Names (`notification.queue.ts`)**:
   - `enqueueOutboxJob()` now dynamically maps `event.eventType` to specific typed job constants:
     - `'requirement_cancelled'` -> `JOB_REQUIREMENT_CANCELLATION` (`'requirement-cancellation'`)
     - `'requirement_updated'` -> `JOB_REQUIREMENT_UPDATE` (`'requirement-update'`)
     - `'deadline_extended'` -> `JOB_DEADLINE_EXTENSION` (`'deadline-extension'`)
   - Preserved stable `eventId`, dispatch generation tracking, retry and backoff options (`attempts: 5`, exponential backoff), and job deduplication (`jobId: outbox:<id>:<generation>`).
   - Updated processor failure listeners to record dead-letter transitions on retry exhaustion.
   - Updated mock queue runner to route typed jobs to their respective domain processors and mark outbox records `processed`.
2. **Fix 2 — Post-Commit Immediate Dispatch Orchestration & Warning Logging (`work-requirement.service.ts` & `notification-outbox-dispatcher.service.ts`)**:
   - Replaced silent `.catch(() => {})` in `work-requirement.service.ts` (`cancelRequirement`, `updateRequirement`, `extendDeadline`) with structured warning logs via `logger.warn` to preserve production observability.
   - Enhanced `NotificationOutboxDispatcherService` with `activeDispatchPromise` tracking. When immediate dispatch or polling is triggered while a cycle is already active, callers receive and await `activeDispatchPromise`, eliminating test race conditions between background triggers and assertion checks.
3. **Fix 3 — Scoped Opportunity Assertion Query (`backend/tests/notifications.test.ts`)**:
   - Filtered recipient notifications query by `{ recipientId: worker._id, type: 'work_opportunity' }` on lines 513 and 522 to prevent unrelated `requirement_updated` notifications from failing the opportunity duplicate assertion.
4. **Test Suite Enhancements (`backend/tests/notificationOutbox.test.ts`)**:
   - Added Test 9 verifying exact typed job name mapping (`requirement-cancellation`, `requirement-update`, `deadline-extension`) and mock processor routing.
   - Standardized deterministic triggers in outbox tests.

**Components & Files Changed:**
- `backend/src/modules/notifications/queues/notification.queue.ts`
- `backend/src/modules/notifications/service/notification-outbox-dispatcher.service.ts`
- `backend/src/modules/work-requirements/service/work-requirement.service.ts`
- `backend/tests/notifications.test.ts`
- `backend/tests/notificationOutbox.test.ts`
- `docs/08-bug-log.md`
- `docs/09-change-impact-log.md`

**Verification Results:**
- Backend Type Check (`npm run type-check`): 0 errors, exit code 0.
- Backend Compilation (`npm run build`): compiled cleanly, exit code 0.
- Outbox Reliability Suite (`backend/tests/notificationOutbox.test.ts`): 9/9 passed (100%), exit code 0.
- Milestone 2 Suite (`backend/tests/notificationMilestone2.test.ts`): 19/19 passed (100%), exit code 0.
- Notification Suite (`backend/tests/notifications.test.ts`): 11/11 passed (100%), exit code 0.
- Notification Queue Suite (`backend/tests/notificationQueue.test.ts`): 9/9 passed (100%), exit code 0.
- Unified Worker Suite (`backend/tests/unifiedWorker.test.ts`): 10/10 passed (100%), exit code 0.

---

### [Notification Milestone 3 — Web Push API + VAPID + Service Workers + BullMQ]
**Date:** 2026-10-31
**Impact Classification:** Medium (Adds dedicated Web Push capability, new device subscription and push delivery collections, separate BullMQ push queue, and frontend Service Worker integration without altering existing business models, database records, Transactional Outbox, or Socket.IO real-time channels)

**Description:**
Implemented complete browser and device push notification system for EventOps ERP across three verified stages:
1. **Part 3A — Device Subscription Management & VAPID**:
   - Integrated `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT` in `backend/src/config/env.ts` with mutual inclusion validation and graceful optional degradation when unconfigured.
   - VAPID keys generated via standard Web Push CLI (`npx web-push generate-vapid-keys`).
   - Created `PushSubscription` model with SHA-256 `endpointHash` unique index, `{ userId: 1, status: 1 }` index, and sensitive encryption keys (`p256dh`, `auth`) marked `select: false` and stripped in `toJSON()`.
   - Created `PushSubscriptionRepository` with atomic upsert and shared-device handover logic.
   - Built secure REST APIs: `GET /api/notifications/push/config`, `POST /api/notifications/push/subscriptions`, `GET /api/notifications/push/subscriptions`, `DELETE /api/notifications/push/subscriptions/current`, and `DELETE /api/notifications/push/subscriptions/:id`.
2. **Part 3B — Background Push Delivery & BullMQ**:
   - Created durable `PushDelivery` per-device intent model with compound unique index `{ notificationId: 1, subscriptionId: 1 }`, status state machine (`pending`, `queued`, `sending`, `sent`, `retry_pending`, `invalid_subscription`, `dead_letter`), `dispatchGeneration`, and lease tracking.
   - Created `PushDeliveryRepository` with atomic lease claiming (`claimDueDeliveries`), lease recovery, and state transitions.
   - Created dedicated BullMQ queue `notification-push` with concurrency 5, isolated from domain queues.
   - Created `PushDeliveryService` with standard Web Push payload encryption, VAPID signing, provider response handling (HTTP 201 sent, 404/410 deactivation, 429/5xx exponential backoff, dead-letter transitions), and pre-dispatch shared-device ownership revalidation guard.
   - Created `PushDeliveryDispatcherService` with distributed lease locking, lease recovery, and post-commit immediate dispatch triggers.
   - Extended `NotificationService` to automatically persist `PushDelivery` intents for all active subscriptions of the recipient upon notification creation.
   - Registered `PushDeliveryWorker` as Worker #5 and `PushDeliveryDispatcher` as Worker #6 in `backend/src/workers/worker.ts` with coordinated reverse-order shutdown.
3. **Part 3C — Browser Service Worker & PWA Integration**:
   - Created PWA Web Manifest (`frontend/public/manifest.webmanifest`) and linked in `index.html` with mobile metadata.
   - Created Service Worker (`frontend/public/sw.js`) handling background `push` events with app branding and `notificationclick` navigation with origin verification.
   - Built client push subscription service (`frontend/src/services/pushSubscriptionService.ts`) with browser detection, permission requesting, VAPID public key conversion, registration, and logout cleanup.
   - Integrated logout device deactivation in `frontend/src/features/auth/authSlice.ts`.
   - Built reusable notification preferences modal (`frontend/src/components/common/NotificationSettingsModal.tsx`) with permission status, enable/disable toggle, registered devices list, device removal, and iOS Home Screen guidance.
   - Integrated settings modal and Service Worker postMessage navigation listener in `NotificationBell.tsx`.

**Components & Files Changed:**
- Backend:
  - `backend/src/config/env.ts`
  - `backend/src/modules/notifications/model/push-subscription.model.ts`
  - `backend/src/modules/notifications/model/push-delivery.model.ts`
  - `backend/src/modules/notifications/repository/push-subscription.repository.ts`
  - `backend/src/modules/notifications/repository/push-delivery.repository.ts`
  - `backend/src/modules/notifications/repository/notification.repository.ts`
  - `backend/src/modules/notifications/service/push-subscription.service.ts`
  - `backend/src/modules/notifications/service/push-delivery.service.ts`
  - `backend/src/modules/notifications/service/push-delivery-dispatcher.service.ts`
  - `backend/src/modules/notifications/service/notification.service.ts`
  - `backend/src/modules/notifications/controller/push-subscription.controller.ts`
  - `backend/src/modules/notifications/routes/notification.routes.ts`
  - `backend/src/modules/notifications/queues/push-delivery.queue.ts`
  - `backend/src/workers/pushDeliveryWorker.ts`
  - `backend/src/workers/worker.ts`
  - `backend/tests/pushSubscription.test.ts`
  - `backend/tests/pushDelivery.test.ts`
  - `backend/tests/unifiedWorker.test.ts`
  - `backend/tests/notificationQueue.test.ts`
- Frontend:
  - `frontend/public/manifest.webmanifest`
  - `frontend/public/sw.js`
  - `frontend/index.html`
  - `frontend/src/services/pushSubscriptionService.ts`
  - `frontend/src/features/auth/authSlice.ts`
  - `frontend/src/components/common/NotificationSettingsModal.tsx`
  - `frontend/src/components/common/NotificationBell.tsx`
  - `frontend/src/tests/pushSubscriptionUI.test.tsx`
- Documentation:
  - `docs/04-status-and-business-rules.md`
  - `docs/05-api-design.md`
  - `docs/06-architecture.md`
  - `docs/09-change-impact-log.md`

**Verification Results:**
- Backend Type Check (`npm run type-check`): 0 errors, exit code 0.
- Backend Compilation (`npm run build`): compiled cleanly, exit code 0.
- Push Subscription Test Suite (`backend/tests/pushSubscription.test.ts`): 13/13 passed (100%), exit code 0.
- Push Delivery Test Suite (`backend/tests/pushDelivery.test.ts`): 14/14 passed (100%), exit code 0.
- Unified Worker Test Suite (`backend/tests/unifiedWorker.test.ts`): 10/10 passed (100%), exit code 0.
- Outbox Reliability Suite (`backend/tests/notificationOutbox.test.ts`): 9/9 passed (100%), exit code 0.
- Notification Queue Suite (`backend/tests/notificationQueue.test.ts`): 9/9 passed (100%), exit code 0.
- Milestone 2 Suite (`backend/tests/notificationMilestone2.test.ts`): 19/19 passed (100%), exit code 0.
- Core Notification Suite (`backend/tests/notifications.test.ts`): 11/11 passed (100%), exit code 0.
- Frontend Test Suite (`npm test`): 94/94 passed across 17 test files (100%), exit code 0.
- Frontend Production Build (`npm run build`): compiled cleanly in 9.66s, exit code 0.

---

### [Notification Milestone 3 Final Fixes — Unified Worker Test, Missing VAPID Handling & Documentation]
**Impact Classification:** Low (Targeted improvements to worker test assertions, VAPID generation script, unconfigured VAPID pause mechanics, shared-device verification, and staging documentation without modifying business logic or API contracts)

**Affected Modules & Files:**
- `backend/tests/unifiedWorker.test.ts`: Updated worker count assertion from 5 to 7 to match registered default workers plus experimental worker; asserted all 7 worker names explicitly.
- `backend/package.json`: Added `"vapid:generate": "web-push generate-vapid-keys"` script.
- `backend/.env.example`: Clarified VAPID generation documentation (`npm run vapid:generate` or `npx web-push generate-vapid-keys`).
- `backend/src/modules/notifications/repository/push-delivery.repository.ts`: Added `markConfigurationPending` to pause unconfigured deliveries in pending state with delayed retry without penalty to device subscription.
- `backend/src/modules/notifications/service/push-delivery.service.ts`: Distinguished missing application configuration from invalid VAPID credentials and HTTP 401/403 push service rejections.
- `backend/src/modules/notifications/service/push-delivery-dispatcher.service.ts`: Added early exit check when VAPID is unconfigured to prevent churn.
- `backend/tests/pushDelivery.test.ts`: Added explicit assertions for Worker B subscription preservation, Worker A second device delivery, and missing VAPID pause behavior (15/15 tests passing).
- `docs/04-status-and-business-rules.md`: Added Section 9.8 distinguishing architectural readiness from live AWS staging and physical device testing boundaries.

---

### [Open -> Open Work Requirement Notification Reliability Fix]
**Date:** 2026-11-04
**Impact Classification:** Medium (Targeted bug fix in notification persistence error propagation, bulk write deduplication handling, and Outbox acknowledgment protection without altering API contracts, database schemas, or Draft -> Open flows)

**Affected Modules & Files:**
- `backend/src/modules/notifications/service/notification.service.ts`: Updated `createNotificationsBatch()` to re-throw batch persistence errors rather than silently swallowing them.
- `backend/src/modules/notifications/repository/notification.repository.ts`: Refined `createManySafe()` to safely ignore ONLY genuine duplicate key errors (11000) across driver bulk write error formats, re-throw all validation and network errors, and enforce complete persistence resolution.
- `backend/src/modules/notifications/queues/notification.queue.ts`: Added post-persistence count guard in `processRequirementUpdate()` ensuring `markProcessed()` is only called after 100% of required notifications are persisted.
- `backend/tests/notificationUpdateReliability.test.ts`: Added 12 comprehensive unit and integration tests covering multi-batch failures, transient errors, duplicate key tolerance, partial persistence recovery, and dead-letter routing.
- `docs/08-bug-log.md`: Logged BUG-016.
- `docs/09-change-impact-log.md`: Recorded change impact.

**Verification Results:**
- Backend Type Check (`npm run type-check`): 0 errors, exit code 0.
- Backend Compilation (`npm run build`): compiled cleanly, exit code 0.
- Notification Update Reliability Suite (`backend/tests/notificationUpdateReliability.test.ts`): 10/10 passed (100%), exit code 0.
- Notification Outbox Suite (`backend/tests/notificationOutbox.test.ts`): 9/9 passed (100%), exit code 0.
- Notification Milestone 2 Suite (`backend/tests/notificationMilestone2.test.ts`): 19/19 passed (100%), exit code 0.
- Notification Queue Suite (`backend/tests/notificationQueue.test.ts`): 9/9 passed (100%), exit code 0.

---

### [Draft -> Open Work Requirement Transactional Outbox Recovery]
**Date:** 2026-11-04
**Impact Classification:** Medium (Extended Transactional Outbox pattern to cover initial publication announcements from Draft -> Open, replacing weak direct post-commit enqueue with durable MongoDB transaction atomicity and scheduled dispatcher recovery)

**Affected Modules & Files:**
- `backend/src/modules/notifications/model/notification-outbox.model.ts`: Extended `OutboxEventType` type union and Mongoose schema enum to include `'requirement_published'`.
- `backend/src/modules/work-requirements/service/work-requirement.service.ts`: Switched Draft -> Open to atomically persist a `requirement_published` outbox event inside `session.withTransaction()`, generated stable event identity outside callback, removed direct post-commit `enqueueRequirementAnnouncements()`, and triggered immediate best-effort outbox polling.
- `backend/src/modules/notifications/queues/notification.queue.ts`: Mapped `'requirement_published'` outbox events to typed `JOB_REQUIREMENT_ANNOUNCEMENT` jobs with `outboxEventId`, updated `processRequirementAnnouncements()` to verify 100% persistence before acknowledging outbox, gracefully handled zero eligible workers and cancelled requirements, and updated `scanAndRecoverPendingNotifications()` to reconcile all intended recipients on legacy open requirements without relying on all-or-nothing `Notification.exists()`, backfilling Outbox records strictly after full resolution.
- `backend/src/modules/notifications/repository/notification.repository.ts`: Marked pre-existing duplicate records with `isExisting: true` during safe batch retrieval.
- `backend/src/modules/notifications/service/notification.service.ts`: Skipped real-time Socket.IO emission and push delivery intent creation for pre-existing notifications during batch recovery reconciliation.
- `backend/tests/notificationDraftToOpenReliability.test.ts`: Added 17 comprehensive unit and integration tests (covering 18 distinct scenarios) including partial legacy notification healing, zero/partial/all legacy recipients, concurrent scan deduplication, push/socket suppression for existing records, and outbox failure rollbacks.
- `docs/09-change-impact-log.md`: Recorded change impact.

**Verification Results:**
- Backend Type Check (`npm run type-check`): 0 errors, exit code 0.
- Backend Compilation (`npm run build`): compiled cleanly, exit code 0.
- Frontend Production Build (`npm run build`): compiled cleanly in 7.40s, exit code 0.
- Draft -> Open Reliability Suite (`backend/tests/notificationDraftToOpenReliability.test.ts`): 17/17 passed (100%), exit code 0.
- Open -> Open Update Reliability Suite (`backend/tests/notificationUpdateReliability.test.ts`): 10/10 passed (100%), exit code 0.
- Outbox Infrastructure Suite (`backend/tests/notificationOutbox.test.ts`): 9/9 passed (100%), exit code 0.
- Notification Queue Suite (`backend/tests/notificationQueue.test.ts`): 9/9 passed (100%), exit code 0.
- Notification Milestone 2 Suite (`backend/tests/notificationMilestone2.test.ts`): 19/19 passed (100%), exit code 0.
- Core Notifications Suite (`backend/tests/notifications.test.ts`): 11/11 passed (100%), exit code 0.
- Unified Worker Suite (`backend/tests/unifiedWorker.test.ts`): 10/10 passed (100%), exit code 0.
- Total sequential suite run: 85/85 passed (100%), exit code 0.

---

### [Legacy Recovery & PushDelivery Reliability Hardening]
**Date:** 2026-11-04
**Impact Classification:** Medium (Hardened PushDelivery intent persistence for existing notifications and isolated per-requirement errors with recurring recovery in legacy notification scanners)

**Affected Modules & Files:**
- `backend/src/modules/notifications/service/notification.service.ts`: Preserved real-time Socket.IO suppression for `isExisting: true` notifications while enabling PushDelivery intent verification/creation for all records; re-threw genuine push persistence errors for BullMQ retries; passed session consistently across batch persistence operations.
- `backend/src/modules/notifications/repository/push-delivery.repository.ts`: Added upfront deduplication on `deliveryKey`; strictly propagated non-11000 errors on `insertMany({ ordered: false })`; retrieved existing records and verified complete resolution on duplicate key code 11000.
- `backend/src/modules/notifications/repository/push-subscription.repository.ts`: Added optional `session?: ClientSession` to `findActiveByUserId`.
- `backend/src/modules/notifications/queues/notification.queue.ts`: Implemented per-requirement `try/catch` in `executeScanAndRecover()` for open requirements and selection summaries; added `startPeriodicRecovery(intervalMs)`, `stopPeriodicRecovery()`, and overlap prevention via `isScanningRecovery`.
- `backend/src/workers/notificationWorker.ts`: Started periodic legacy recovery scheduler on worker startup (default 60s in production); cleanly cleared recovery timers on worker shutdown.
- `backend/tests/notificationLegacyAndPushReliability.test.ts`: Added 14 unit and integration test scenarios covering existing notification push recovery, duplicate suppression, error propagation, per-requirement legacy isolation, periodic recovery, and worker shutdown.
- `docs/08-bug-log.md`: Logged BUG-017.
- `docs/09-change-impact-log.md`: Recorded change impact.

**Verification Results:**
- Backend Type Check (`npm run type-check`): 0 errors, exit code 0.
- Backend Compilation (`npm run build`): compiled cleanly, exit code 0.
- Frontend Production Build (`npm run build`): compiled cleanly in 6.12s, exit code 0.
- Legacy & Push Reliability Suite (`backend/tests/notificationLegacyAndPushReliability.test.ts`): 12/12 passed (100%), exit code 0.
- Draft -> Open Reliability Suite (`backend/tests/notificationDraftToOpenReliability.test.ts`): 18/18 passed (100%), exit code 0.
- Open -> Open Update Reliability Suite (`backend/tests/notificationUpdateReliability.test.ts`): 12/12 passed (100%), exit code 0.
- Outbox Infrastructure Suite (`backend/tests/notificationOutbox.test.ts`): 9/9 passed (100%), exit code 0.
- Notification Queue Suite (`backend/tests/notificationQueue.test.ts`): 9/9 passed (100%), exit code 0.
- Notification Milestone 2 Suite (`backend/tests/notificationMilestone2.test.ts`): 19/19 passed (100%), exit code 0.
- Core Notifications Suite (`backend/tests/notifications.test.ts`): 11/11 passed (100%), exit code 0.
- Unified Worker Suite (`backend/tests/unifiedWorker.test.ts`): 10/10 passed (100%), exit code 0.
- Total full regression suite run: 97/97 passed (100%), exit code 0.

---

### [CI Pipeline MongoDB Replica Set for Outbox Transactions]
**Date:** 2026-11-06
**Impact Classification:** Low (CI pipeline infrastructure update in `.github/workflows/ci.yml` enabling replica set for MongoDB ACID transactions without touching production code)

**Affected Modules & Files:**
- `.github/workflows/ci.yml`: Replaced native `services.mongodb` with a single-node replica set (`rs0`) container with `GLIBC_TUNABLES="glibc.pthread.rseq=1"`, initiated replica set via `mongosh`, updated `MONGODB_URI` / `MONGODB_TEST_URI` connection parameters (`?replicaSet=rs0&directConnection=true`), and added graceful container teardown hook.
- `docs/08-bug-log.md`: Logged BUG-018.
- `docs/09-change-impact-log.md`: Recorded change impact.

**Verification Results:**
- Backend Type Check (`npm run type-check`): 0 errors, exit code 0.
- Preserves test database isolation strictly against `eventops_test`.

---

### [Milestone 4 — Phase 4.1: Attendance Models, Validation & Repositories]
**Date:** 2026-11-06
**Impact Classification:** Low (Additive domain models, validation middlewares, and repositories for Exception-Based Attendance under `backend/src/modules/attendance/`; zero breaking changes to existing models, APIs, or business logic)

**Affected Modules & Files:**
- `backend/src/modules/attendance/model/attendance-session.model.ts`: Created `AttendanceSession` model managing event-level attendance lifecycle (`checkin_in_progress`, `checkin_finalized`, `checkout_finalized`, `cancelled`), finalization timestamps, finishing time configurations, idempotency audit subdocuments, and unique index on `eventId`.
- `backend/src/modules/attendance/model/attendance.model.ts`: Created `Attendance` model with snapshots (`reportingTimeSnapshot`, `applicableNormalFinishTimeSnapshot`), check-in / check-out timestamps, timestamp provenance sources (`system_default`, `manager_actual`), integer minute durations (`delayMinutes`, `earlyDepartureMinutes`, `overtimeMinutes`, `durationMinutes`), operational statuses, verification statuses, immutable `corrections[]` audit trail, compound unique index on `{ eventId: 1, workerId: 1 }`, and query indexes.
- `backend/src/modules/attendance/repository/attendance-session.repository.ts`: Created `AttendanceSessionRepository` with atomic `getOrCreateSession` upsert hardened against race collisions by safely catching E11000 duplicate key errors, `atomicFinalizeCheckIn` state precondition locking, `atomicFinalizeCheckOut` state precondition locking, and lifecycle status transition methods.
- `backend/src/modules/attendance/repository/attendance.repository.ts`: Created `AttendanceRepository` with high-performance `bulkUpsertAttendances` using MongoDB `bulkWrite` with `updateOne(upsert: true)`, ID and compound lookups, paginated worker queries, `addCorrection` with audit push, and `getEventAttendanceSummary` metric aggregation.
- `backend/src/modules/attendance/validation/attendance.validation.ts`: Created time parsing utility `isValidTimeString` (supporting 24h `HH:mm`, optional seconds `:ss`, 12h `hh:mm AM/PM`, `00:xx AM`, and ISO strings) and validation middlewares (`validateCheckInFinalization`, `validateCheckOutFinalization`, `validateAttendanceCorrection`, `validateAttendanceVerification`) strictly verifying mutual exclusivity and format rules.
- `backend/src/workers/worker.ts`: Confirmed existing unified background workers remain completely undisturbed; removed premature model imports so worker architecture stays isolated to background queues.
- `backend/tests/attendanceModelsAndRepositories.test.ts`: Added 27 unit and integration test scenarios across 7 test suites validating models, repositories, concurrent upsert safety, E11000 recovery, idempotency persistence, and validation rules.
- `docs/09-change-impact-log.md`: Recorded change impact.

**Verification Results:**
- Backend Type Check (`npm run type-check`): 0 errors, exit code 0.
- Backend Compilation (`npm run build`): compiled cleanly, exit code 0.
- Phase 4.1 Test Suite (`backend/tests/attendanceModelsAndRepositories.test.ts`): 27/27 passed (100%), exit code 0.
- Unified Worker Suite (`backend/tests/unifiedWorker.test.ts`): 10/10 passed (100%), exit code 0.
- Database Safety: Executed strictly against `eventops_test` with automatic database drop on teardown. Real database `eventops` untouched.

---

### [Milestone 4 — Phase 4.2: Exception-Based Check-in Backend Services & APIs]
**Date:** 2026-11-06
**Impact Classification:** Low (Additive services, controllers, and routes for Event Manager exception-based check-in finalization; mounted under `/api/attendance`; zero changes to existing cancellation logic or unrelated domains)

**Affected Modules & Files:**
- `backend/src/modules/attendance/service/attendance.service.ts`: Implemented `AttendanceService` featuring:
  - `getSession`: validates event ownership, checks event status, and retrieves or creates session.
  - `getRoster`: reads embedded assignments from `WorkRequirement.assignedWorkers`, merges with existing attendance records, derives reporting time snapshots, and computes timing guard eligibility.
  - `finalizeCheckIn`: validates exceptions, enforces mandatory `Idempotency-Key` header, verifies timing guard against latest assigned reporting timestamp, executes MongoDB multi-document transaction for atomic bulk upsert and session state finalization, and handles replay/conflict idempotency.
- `backend/src/modules/attendance/controller/attendance.controller.ts`: Implemented `AttendanceController` exposing `getSession`, `getRoster`, and `finalizeCheckIn` wrapped in `catchAsync` with `ApiResponse` standard envelopes.
- `backend/src/modules/attendance/routes/attendance.routes.ts`: Created attendance router protected by `authenticate` and `authorize('admin', 'event_manager')` with `validateCheckInFinalization` payload validation.
- `backend/src/app.ts`: Mounted `/api/attendance` router.
- `backend/tests/attendanceCheckIn.test.ts`: Created comprehensive integration test suite with 24 tests across 7 suites verifying authentication/authorization, session initialization, roster retrieval, check-in finalization, timing guard, and idempotency replays.
- `docs/09-change-impact-log.md`: Recorded change impact.

**Verification Results:**
- Backend Type Check (`npm run type-check`): 0 errors, exit code 0.
- Backend Compilation (`npm run build`): compiled cleanly, exit code 0.
- Phase 4.2 Test Suite (`backend/tests/attendanceCheckIn.test.ts`): 24/24 passed (100%), exit code 0.
- Phase 4.1 Test Suite (`backend/tests/attendanceModelsAndRepositories.test.ts`): 27/27 passed (100%), exit code 0.
- Combined Attendance Regression: 51/51 passed (100%), exit code 0.
- Database Safety: All tests executed strictly against `eventops_test` and cleaned up at teardown. Real database `eventops` untouched.
- Cancellation and Worker processes: Preserved 100% without modification.

---

### [Milestone 4 — Phase 4.3: Event Manager Check-in Frontend Integration]
**Date:** 2026-11-07
**Impact Classification:** Low (Additive frontend integration connecting Phase 4.2 attendance backend APIs to the Event Manager portal; zero breaking changes to existing models, APIs, cancellation logic, or background workers)

**Affected Modules & Files:**
- `frontend/src/features/attendance/attendance.types.ts`: Created TypeScript domain models matching Phase 4.2 backend responses (`AttendanceSession`, `AttendanceRosterResponse`, `AttendanceRosterItem`, `FinalizeCheckInPayload`, `FinalizeCheckInSummary`, `WorkerCheckInExceptionType`).
- `frontend/src/features/attendance/attendanceApi.ts`: Created API client methods (`getSession`, `getRoster`, `finalizeCheckIn`) with strict reliance on `import.meta.env.VITE_API_URL` and `Idempotency-Key` header injection; included time normalization and delay calculation utilities (`parseTimeToMinutes`, `calculateDelayMinutes`).
- `frontend/src/components/manager/attendance/AttendanceTimingBanner.tsx`: Built dynamic operational timing barrier banner explaining earliest finalization availability based on the latest scheduled worker shift, and locking/unlocking action buttons.
- `frontend/src/components/manager/attendance/AttendanceSummaryCards.tsx`: Built 6-metric responsive summary card component displaying Total Assigned, Default Present, Late Arrivals, Absent, Latest Shift, and Check-in State.
- `frontend/src/components/manager/attendance/AttendanceRosterTable.tsx`: Created interactive exception management table with quick search, category filter chips (All, Present, Late, Absent), worker role filters, segmented exception toggles, inline actual arrival time inputs with live delay preview, and format validation.
- `frontend/src/components/manager/attendance/ReviewCheckinModal.tsx`: Created finalization confirmation dialog displaying breakdown counts, the mandatory system-generated default timestamp audit disclaimer, detailed late/absent exception lists, generated `Idempotency-Key`, and retry mechanism preserving identical key and payload.
- `frontend/src/components/manager/attendance/FinalizedAttendanceView.tsx`: Created read-only finalized view displaying finalized banner, commitment timestamp, and table with official recorded check-in times, provenance source badges (`system_default`, `manager_actual`, `not_recorded`), and arrival statuses (`On Time`, `Late`, `Absent`).
- `frontend/src/components/manager/attendance/EventAttendanceWorkspace.tsx`: Created container workspace managing state orchestration, loading/error states, initial roster and session retrieval, exception tracking, idempotency hashing, and seamless transition to finalized view upon successful completion.
- `frontend/src/pages/manager/ManagerEventDetails.tsx`: Integrated Attendance tab and Quick Attendance Overview banner for confirmed, in-progress, and completed events.
- `frontend/src/tests/attendanceCheckInUI.test.tsx`: Created comprehensive Vitest/React Testing Library test suite (14 tests) verifying tab navigation, initial roster loading, timing barrier enforcement, exception selection, arrival time validation, confirmation modal disclaimer, idempotency key generation and retry reuse, read-only finalized view, and error handling.
- `docs/09-change-impact-log.md`: Recorded change impact.

**Verification Results:**
- Frontend Production Build (`npm run build`): compiled cleanly in 13.77s, 0 errors, exit code 0.
- Frontend Lint (`npm run lint`): 0 errors, exit code 0.
- Frontend Phase 4.3 Suite (`frontend/src/tests/attendanceCheckInUI.test.tsx`): 14/14 passed (100%), exit code 0.
- Full Frontend Regression Suite: 18 test files, 108/108 tests passed (100%), exit code 0.
- Backend Type Check (`npm run type-check`): 0 errors, exit code 0.
- Backend Compilation (`npm run build`): compiled cleanly, exit code 0.
- Preliminary Event Status Check: Confirmed `in_progress` is an established, valid status in `Event.status` schema and across existing backend services.
- Scope Boundaries: Checkout UI, overtime processing, and worker self-service were NOT implemented. Cancellation logic and Unified Worker were completely untouched.

---

### [Milestone 4 — Phase 4.4: Exception-Based Checkout Backend & Frontend Integration]
**Date:** 2026-11-07
**Impact Classification:** Medium (Additive checkout functionality connecting to Phase 4.2 check-in APIs and extending Phase 4.3 attendance workspace; atomic MongoDB multi-document transactions with idempotency replay safety; zero breaking changes to existing models, Event lifecycle, cancellation logic, or background workers)

**Affected Modules & Files:**
- `backend/src/modules/attendance/service/attendance.service.ts`: Implemented `finalizeCheckOut()` and updated `getRoster()`:
  - Validates session check-in finalization precondition (`checkInFinalized === true && checkOutFinalized === false`).
  - Implements hybrid finishing-time resolution: `applicableNormalFinish = requirementOverrides[reqId] ?? defaultFinishTime`.
  - Calculates exact working durations in integer minutes: `durationMinutes = (checkOut - checkIn) / 60000`.
  - Accurately computes `earlyDepartureMinutes = (applicableFinish - checkOut) / 60000` and `overtimeMinutes = (checkOut - applicableFinish) / 60000`, including cross-midnight shifts.
  - Automatically excludes absent workers from checkout (`checkOut: null`, `durationMinutes: 0`, `departureStatus: 'not_recorded'`).
  - Implements transaction safety: executes bulk upsert and atomic checkout locking within a MongoDB multi-document session with automatic rollback on error.
  - Enforces mandatory `Idempotency-Key` header with SHA-256 payload hashing for deterministic replays and 409 conflict detection.
- `backend/src/modules/attendance/controller/attendance.controller.ts`: Added `finalizeCheckOut` controller method with envelope response.
- `backend/src/modules/attendance/routes/attendance.routes.ts`: Mounted `POST /events/:eventId/finalize-checkout` protected by `authenticate`, `authorize('admin', 'event_manager')`, and `validateCheckOutFinalization`.
- `backend/tests/attendanceCheckOut.test.ts`: Created comprehensive 24-test integration test suite covering RBAC, timing guards, finishing-time resolution, exceptions, integer minute durations, overnight shift calculations, idempotency replays/conflicts, and roster reflection.
- `frontend/src/features/attendance/attendance.types.ts`: Extended types with `RequirementFinishOverrideInput`, `EarlyDepartureExceptionInput`, `OvertimeExceptionInput`, `FinalizeCheckOutPayload`, `FinalizeCheckOutSummary`, `AttendanceRequirementOverride`, and checkout roster properties.
- `frontend/src/features/attendance/attendanceApi.ts`: Added `finalizeCheckOut()` method, duration formatting helpers, and timezone-aware operational date helpers (`getOperationalDateString`, `isOvernightCheckout` with default `Asia/Kolkata`).
- `frontend/src/components/manager/attendance/CheckoutFinishingTimeCard.tsx`: Created finishing time configuration card with mandatory event default input, optional requirement-level overrides, and resolved schedule summary.
- `frontend/src/components/manager/attendance/CheckoutRosterTable.tsx`: Created checkout roster table with segmented toggle `[Normal]`, `[Early Departure]`, `[Overtime]`, absent exclusion badge, live duration preview, and validation.
- `frontend/src/components/manager/attendance/ReviewCheckoutModal.tsx`: Created review confirmation modal with metrics breakdown, finishing time audit notice, idempotency key tracking, and Section 12 409 conflict handling.
- `frontend/src/components/manager/attendance/FinalizedAttendanceView.tsx`: Enhanced to display dual-phase finalization (check-in and checkout) with arrival and departure timestamps, provenance badges, filter tabs, and duration metrics; corrected overnight `[+1 Day]` badge resolution using timezone-aware `isOvernightCheckout` (`Asia/Kolkata`).
- `frontend/src/components/manager/attendance/EventAttendanceWorkspace.tsx`: Created 3-stage lifecycle stepper (Check-in Pending, Checkout Stage Active, Complete Attendance Archive), seamlessly integrating Check-in Workspace, Checkout Workspace, and Check-in Baseline historical view.
- `frontend/src/tests/attendanceCheckOutUI.test.tsx`: Created 13 UI tests verifying rendering, finishing time validation, requirement overrides, roster exception toggles, modal disclaimers, successful commit, 409 conflict branches, and Asia/Kolkata timezone-aware overnight `[+1 Day]` display regression.
- `docs/09-change-impact-log.md`: Recorded change impact.

**Verification Results:**
- Backend Type Check (`npm --prefix backend run type-check`): 0 errors, exit code 0.
- Backend Compilation (`npm --prefix backend run build`): compiled cleanly, exit code 0.
- Backend Phase 4.4 Suite (`backend/tests/attendanceCheckOut.test.ts`): 24/24 passed (100%), exit code 0.
- Backend Phase 4.2 Suite (`backend/tests/attendanceCheckIn.test.ts`): 24/24 passed (100%), exit code 0.
- Backend Phase 4.1 Suite (`backend/tests/attendanceModelsAndRepositories.test.ts`): 27/27 passed (100%), exit code 0.
- Total Backend Attendance Tests: 75/75 passed (100%), exit code 0.
- Frontend Production Build (`npm --prefix frontend run build`): compiled cleanly (`tsc -b && vite build`), 0 errors, exit code 0.
- Frontend Lint (`npm --prefix frontend run lint`): 0 errors, exit code 0.
- Frontend Phase 4.4 Suite (`frontend/src/tests/attendanceCheckOutUI.test.tsx`): 13/13 passed (100%), exit code 0.
- Frontend Phase 4.3 Suite (`frontend/src/tests/attendanceCheckInUI.test.tsx`): 14/14 passed (100%), exit code 0.
- Full Frontend Regression Suite: 19 test files, 121/121 tests passed (100%), exit code 0.
- Database Safety: All tests executed strictly against `eventops_test` and dropped upon completion. Real database `eventops` remained completely untouched.
- Scope Boundaries: Wage calculations, payroll processing, and worker self-checkout were NOT implemented. Cancellation and Unified Worker remained completely untouched.

---

### [Milestone 4 — Phase 4.5: Attendance Corrections, Absence Reversal & Final Manager Approval]
**Date:** 2026-11-07
**Impact Classification:** Medium (Attendance audit trail corrections, absence reversal workflow, and final manager sign-off/verification; atomic MongoDB multi-document transactions with approval state invalidation cascade; zero breaking changes to existing models, Event lifecycle, or cancellation logic)

**Affected Modules & Files:**
- `backend/src/modules/attendance/model/attendance.model.ts`: Extended `IAttendanceCorrection` with `previousArrivalStatus`, `previousDepartureStatus`, `newArrivalStatus`, `newDepartureStatus`; added `verificationStatus` to `IAttendance` schema with enum `['pending_review', 'approved', 'rejected']`, `verifiedBy`, and `verifiedAt`.
- `backend/src/modules/attendance/model/attendance-session.model.ts`: Extended `IAttendanceSession` with `verificationStatus?: 'pending_review' | 'approved' | 'rejected'`, `verifiedBy?: Types.ObjectId`, `verifiedAt?: Date`, and `rejectionReason?: string`.
- `backend/src/modules/attendance/repository/attendance.repository.ts`: Added `updateVerificationStatusByEvent()` and `resetVerificationStatusByEvent()` supporting event-wide atomic approval updates and approval reset cascades.
- `backend/src/modules/attendance/repository/attendance-session.repository.ts`: Added `updateVerificationStatus()` and `resetVerificationStatus()` for session verification lifecycle management.
- `backend/src/modules/attendance/validation/attendance.validation.ts`: Enhanced `validateAttendanceCorrection` (supporting `:attendanceId` and `:id`, validating reason min length 5, arrival and departure status enums, time formats) and `validateAttendanceVerification` (requiring action `'approve' | 'reject'` and min 5-character rejection reason).
- `backend/src/modules/attendance/service/attendance.service.ts`:
  - Implemented `correctAttendance()`: handles absence reversal (to On Time vs Late; pre-checkout vs post-checkout with actual checkout time or `applyDefaultCheckout: true`), check-in/checkout timestamp corrections with overnight shift handling, integer metric recalculations, audit trail generation, and automatic invalidation/reset of approval state to `pending_review` across session and records in an ACID transaction.
  - Implemented `verifyAttendance()`: verifies check-in and checkout finalization preconditions, checks for incomplete attendance records, atomically persists `approved` or `rejected` status with mandatory reason.
  - Updated `getRoster()`: exposes verification fields and corrections audit history.
- `backend/src/modules/attendance/controller/attendance.controller.ts`: Added `correctAttendance` and `verifyAttendance` controller endpoints.
- `backend/src/modules/attendance/routes/attendance.routes.ts`: Mounted `PATCH /records/:attendanceId/correct` and `POST /events/:eventId/verify`.
- `backend/tests/attendanceCorrectionAndApproval.test.ts`: Created comprehensive 17-test integration test suite covering RBAC, reason validation, check-in/checkout timestamp corrections, delay/duration recalculations, absence reversal (pre- and post-checkout), approval precondition enforcement, rejection reasons, Admin overrides, and automatic approval invalidation cascades.
- `frontend/src/features/attendance/attendance.types.ts`: Added `AttendanceCorrection`, `CorrectAttendancePayload`, `VerifyAttendancePayload`, `AttendanceVerificationSummary`; updated `AttendanceSession` and `AttendanceRosterItem`.
- `frontend/src/features/attendance/attendanceApi.ts`: Added `correctAttendance()` and `verifyAttendance()` API client methods.
- `frontend/src/components/manager/attendance/CorrectionModal.tsx`: Created correction modal supporting absence reversal (On Time vs Late, default vs actual finish), live duration preview, mandatory reason validation (min 5 chars), and approval re-review warning.
- `frontend/src/components/manager/attendance/VerificationModal.tsx`: Created modal for approval confirmation (operational breakdown summary) and rejection (mandatory 5-character reason).
- `frontend/src/components/manager/attendance/FinalizedAttendanceView.tsx`: Integrated verification status banners (Pending Review, Approved, Rejected), action buttons (`Approve Attendance`, `Reject Attendance`), per-worker verification status pill, correction count indicator, and `Correct` action button on each worker row.
- `frontend/src/components/manager/attendance/EventAttendanceWorkspace.tsx`: Integrated correction and verification state management, opening respective modals and refreshing session/roster data on completion.
- `frontend/src/tests/attendanceCorrectionAndApprovalUI.test.tsx`: Created 10 UI tests verifying banners, approval modal, rejection validation, non-absent correction, absence reversal (on-time and late), and full workspace integration flow.
- `docs/08-bug-log.md`: Documented BUG-020.
- `docs/09-change-impact-log.md`: Recorded change impact.

**Verification Results:**
- Backend Type Check (`npm --prefix backend run type-check`): 0 errors, exit code 0.
- Backend Compilation (`npm --prefix backend run build`): compiled cleanly, exit code 0.
- Backend Phase 4.5 Suite (`backend/tests/attendanceCorrectionAndApproval.test.ts`): 17/17 passed (100%), exit code 0.
- Backend Phase 4.4 Suite (`backend/tests/attendanceCheckOut.test.ts`): 24/24 passed (100%), exit code 0.
- Backend Phase 4.2 Suite (`backend/tests/attendanceCheckIn.test.ts`): 24/24 passed (100%), exit code 0.
- Backend Phase 4.1 Suite (`backend/tests/attendanceModelsAndRepositories.test.ts`): 27/27 passed (100%), exit code 0.
- Total Backend Attendance Tests: 92/92 passed (100%), exit code 0.
- Frontend Production Build (`npm --prefix frontend run build`): compiled cleanly in 8.75s, 0 errors, exit code 0.
- Frontend Lint (`npm --prefix frontend run lint`): 0 errors, exit code 0.
- Frontend Phase 4.5 Suite (`frontend/src/tests/attendanceCorrectionAndApprovalUI.test.tsx`): 10/10 passed (100%), exit code 0.
- Frontend Phase 4.4 Suite (`frontend/src/tests/attendanceCheckOutUI.test.tsx`): 13/13 passed (100%), exit code 0.
- Frontend Phase 4.3 Suite (`frontend/src/tests/attendanceCheckInUI.test.tsx`): 14/14 passed (100%), exit code 0.
- Database Safety: All tests executed strictly against isolated test database `eventops_test` and dropped upon completion. Real database `eventops` remained completely untouched.
- Scope Boundaries: Wage & Earnings, overtime payments, payroll, break deductions, worker self-check-in/self-checkout, client approval, and GPS tracking were NOT implemented.

---

### [Milestone 4 — Attendance Workflow Refinement: Category-wise Normal Finishing Times, Immediate Check-in Persistence & Post-Finalization Corrections]
**Date:** 2026-11-07
**Impact Classification:** Medium (Attendance lifecycle refinement extending category-wise finishing times, immediate individual worker check-in persistence prior to batch finalization, and post-finalization attendance correction transitions to absent with approval state invalidation cascade; zero breaking changes to existing models, Event lifecycle, or cancellation logic)

**Affected Modules & Files:**
- `backend/src/modules/attendance/model/attendance-session.model.ts`: Extended `IAttendanceSession` and schema with `categoryFinishTimes` (`[{ workerType: string, normalFinishTime: string, normalFinishDate?: Date }]`).
- `backend/src/modules/attendance/repository/attendance-session.repository.ts`: Updated `getOrCreateSession` and `atomicFinalizeCheckOut` to support and persist `categoryFinishTimes`.
- `backend/src/modules/attendance/repository/attendance.repository.ts`: Added `upsertIndividualCheckIn(eventId, workerId, updateData, session)` using atomic `findOneAndUpdate` with isolated `$setOnInsert` for `{ eventId, workerId }`.
- `backend/src/modules/attendance/validation/attendance.validation.ts`:
  - Added `validateIndividualCheckIn`: enforces valid `:eventId`, `:workerId`, `arrivalStatus` (`'on_time' | 'late' | 'absent'`), and mandatory `actualArrivalTime` for late arrivals.
  - Updated `validateCheckOutFinalization`: accepts `categoryFinishTimes` and/or `actualNormalFinishTime`, validating format of each category finishing time.
  - Updated `validateAttendanceCorrection`: allows `arrivalStatus: 'absent'`.
- `backend/src/modules/attendance/service/attendance.service.ts`:
  - Implemented `recordWorkerCheckIn()`: validates event ownership and non-finalized check-in, resolves scheduled reporting time from `WorkRequirement`, validates arrival timestamps with overnight rollover handling, calculates `delayMinutes`, and atomically upserts `Attendance` into MongoDB.
  - Updated `finalizeCheckIn()`: preserves previously confirmed individual check-in records (`existingAttMap`), applies default On Time only to unrecorded workers, and calculates accurate summary counts.
  - Updated `finalizeCheckOut()`: processes `categoryFinishTimes`, resolves applicable finish time/date per worker from category finish times, handles overnight shifts (`finMins <= repMins`), snapshots `applicableNormalFinishTimeSnapshot` and `applicableNormalFinishDate`, and persists category finish times to session.
  - Updated `correctAttendance()`: handles transitions Present/Late $\rightarrow$ Absent (nullifies check-in, checkout, duration, delay), Late $\rightarrow$ Present (`system_default`), Late $\rightarrow$ Late, and resolves applicable finish time using `categoryFinishTimes`.
  - Updated `getEventRoster()`: returns `categoryFinishTimes` in `session`.
- `backend/src/modules/attendance/controller/attendance.controller.ts`: Added `recordWorkerCheckIn` controller endpoint.
- `backend/src/modules/attendance/routes/attendance.routes.ts`: Mounted `POST /events/:eventId/workers/:workerId/checkin`.
- `backend/tests/attendanceCategoryAndImmediateCheckIn.test.ts`: Created 19 integration tests covering immediate check-in persistence (Present, Late, Absent), idempotency & updating before finalization, batch finalization preserving confirmed states, category finish times & overnight shift calculations, post-finalization transitions (Present $\rightarrow$ Absent, Absent $\rightarrow$ Present, Late $\rightarrow$ Late), immutable audit log, and approval invalidation cascade.
- `frontend/src/features/attendance/attendance.types.ts`: Added `CategoryFinishTime`, `CategoryFinishTimeInput`, `IndividualCheckInPayload`; updated `AttendanceSession`, `AttendanceRosterResponse.session`, `FinalizeCheckOutPayload`, `CorrectAttendancePayload`.
- `frontend/src/features/attendance/attendanceApi.ts`: Added `recordWorkerCheckIn(eventId, workerId, payload)` API client method.
- `frontend/src/components/manager/attendance/AttendanceRosterTable.tsx`: Added `onSaveWorkerCheckIn` prop, `handleConfirmAndSave`, `handleCancelDraft`, saved badges (`Saved On-Time`, `Saved Late`, `Saved Absent`), row error handling, and inline "Confirm and Save" & "Cancel" buttons.
- `frontend/src/components/manager/attendance/CheckoutFinishingTimeCard.tsx`: Added Category-Wise Normal Finishing Times section with input per distinct category (`distinctCategories`), "Apply to all categories" shortcut, validation, and error display.
- `frontend/src/components/manager/attendance/CheckoutRosterTable.tsx`: Updated to accept `categoryFinishTimes` and resolve/display applicable category finish time per worker with `+1 Day` overnight indicator.
- `frontend/src/components/manager/attendance/ReviewCheckoutModal.tsx`: Updated to accept `categoryFinishTimes` and calculate applicable finish time per worker according to priority (Override > Category Finish > Default Finish).
- `frontend/src/components/manager/attendance/CorrectionModal.tsx`: Updated with `markAsAbsent` state, "Target Attendance Status" selector (On Time, Late, Mark as Absent), Absent warning notice, approval invalidation alert, and submission handling for absent transitions.
- `frontend/src/components/manager/attendance/EventAttendanceWorkspace.tsx`: Hooked up `categoryFinishTimes` state, loaded from session, passed to child components, updated payload hash and finalization validation.
- `frontend/src/tests/attendanceCategoryAndImmediateCheckInUI.test.tsx`: Created 11 UI tests verifying draft mode vs confirm & save, immediate save calls, category finish time inputs per distinct category, "Apply to all categories", and correction modal transitions to absent with approval invalidation notice.
- `docs/08-bug-log.md`: Documented BUG-021.
- `docs/09-change-impact-log.md`: Recorded change impact.

**Verification Results:**
- Backend Type Check (`npm --prefix backend run type-check`): 0 errors, exit code 0.
- Backend Compilation (`npm --prefix backend run build`): compiled cleanly, exit code 0.
- Backend Full Suite (`npm --prefix backend test`): 679/679 passed (100%), 116 suites, exit code 0.
- Frontend Full Suite (`npm --prefix frontend test -- --run`): 142/142 passed (100%), 21 test files, exit code 0.
- Frontend Production Build (`npm --prefix frontend run build`): compiled cleanly, exit code 0.
- Database Safety: All tests executed strictly against isolated test database `eventops_test` and dropped upon completion. Real database `eventops` remained completely untouched.
- Scope Boundaries: Wage calculations, payroll processing, worker self-check-in/self-checkout, client approval, and GPS tracking were NOT implemented.

---

### [Milestone 4 — EventAttendanceWorkspace Synchronization & Finishing-Time Priority Alignment]
**Date:** 2026-11-07
**Impact Classification:** Low/Medium (Frontend state synchronization on initial load/refresh in `EventAttendanceWorkspace.tsx`, category vs requirement override finishing-time priority unification across `CheckoutRosterTable.tsx`, `ReviewCheckoutModal.tsx`, and `attendance.service.ts`, and row error cleanup in `AttendanceRosterTable.tsx`)

**Affected Modules & Files:**
- `frontend/src/components/manager/attendance/EventAttendanceWorkspace.tsx`:
  - Synchronized `checkInExceptions` state from `rost.roster` during `loadAttendanceData` for all workers with committed database attendance records while preserving active manual drafts.
  - Refined `isFinishingTimeConfigured`: when event default finish time is empty, verified that every active category present in the roster has a valid finish time configured before enabling finalization review.
  - Filtered out empty/blank strings in `requirementOverrides` before constructing the finalization payload.
  - Safely passed `session || rosterData?.session` in historical baseline view and fallback finish time in `CorrectionModal`.
  - Destructured `eventTitle` and `eventDate` from props to satisfy linter and prevent unused prop warnings.
- `frontend/src/components/manager/attendance/AttendanceRosterTable.tsx`:
  - Reset `workerRowError` upon changing arrival time or selecting a new exception status.
  - Pre-populated existing check-in timestamp from database when switching to Late.
- `frontend/src/components/manager/attendance/CheckoutRosterTable.tsx`:
  - Unified applicable finish time priority: `Requirement Override > Category Normal Finish > Event Default Finish`.
  - Added visual provenance badges (`Override`, `Category`) in the Applicable Normal Finish Time column.
- `frontend/src/components/manager/attendance/CorrectionModal.tsx`:
  - Added safety guard preventing submission when `worker.attendanceId` is missing.
- `backend/src/modules/attendance/service/attendance.service.ts`:
  - Unified applicable finish time priority in `finalizeCheckOut()` and `correctAttendance()` to strictly evaluate `requirementOverrideMap` before `categoryFinishMap`.
- `frontend/src/tests/attendanceCategoryAndImmediateCheckInUI.test.tsx`:
  - Fixed TypeScript interface mismatches by adding `isAssigned: true` and adhering to `AttendanceRosterRequirementItem`.
- `docs/08-bug-log.md`: Documented BUG-022.
- `docs/09-change-impact-log.md`: Recorded change impact.

**Verification Results:**
- Backend Type Check (`npm --prefix backend run type-check`): 0 errors, exit code 0.
- Frontend Production Build (`npm --prefix frontend run build`): compiled cleanly in 5.3s, 0 errors, exit code 0.
- Frontend Full Suite (`npm --prefix frontend test -- --run`): 142/142 passed (100%), 21 test files, exit code 0.
- Database Safety: Real database `eventops` remained completely untouched. All tests executed with zero persistent artifacts.

---

### [Milestone 4 — Attendance Workflow Update: Prompt 1 Event-Day Exception Check-in, Immediate Persistence & Decoupled Checkout]
**Date:** 2026-11-09
**Impact Classification:** High (Decoupled checkout from check-in finalization, enforced event-day boundary check in `Asia/Kolkata`, immediate database persistence for Late/Absent exceptions with worker notification dispatch, and removed legacy Review & Finalize Check-in UI)

**Affected Modules & Files:**
- `backend/src/modules/attendance/repository/attendance-session.repository.ts`:
  - Removed `{ checkInFinalized: true }` constraint from `atomicFinalizeCheckOut` query filter to allow checkout finalization directly on sessions without prior check-in finalization.
- `backend/src/modules/attendance/repository/attendance.repository.ts`:
  - Enhanced `upsertIndividualCheckIn` to accept optional `correction` record and append it atomically to `corrections` history.
- `backend/src/modules/attendance/service/attendance.service.ts`:
  - Added `getOperationalDateString` for Indian Standard Time (`Asia/Kolkata`).
  - Added strict date-guard in `recordWorkerCheckIn`: initial marks rejected before or after event day.
  - Appended immutable correction record on subsequent check-in updates prior to checkout finalization.
  - Dispatched worker notifications with deduplication via `NotificationService` when a worker is confirmed Late or Absent.
  - In `finalizeCheckOut`: automatically provisions default `on_time` attendance records for all assigned workers not marked as Late/Absent.
  - In `verifyAttendanceSession`: decoupled from `checkInFinalized`, requiring only `checkOutFinalized`.
  - In `getRoster`: returned event-day boundary flags (`isEventDay`, `isBeforeEventDay`, `isAfterEventDay`, `eventOperationalDate`, `currentOperationalDate`).
- `frontend/src/features/attendance/attendance.types.ts`:
  - Added event-day date flags to `AttendanceRosterResponse`.
- `frontend/src/components/manager/attendance/AttendanceRosterTable.tsx`:
  - Removed the 3-state toggle; replaced with two exception buttons (`Mark Late`, `Mark Absent`).
  - Rendered "Present / On Time (Default)" indicator for unmarked workers.
  - Added notice banners when viewing outside the scheduled event day.
- `frontend/src/components/manager/attendance/EventAttendanceWorkspace.tsx`:
  - Removed legacy "Review & Finalize Check-in" button, state, and `ReviewCheckinModal`.
  - Added stage tab switcher (`checkout_form` / `checkin_history`) so managers can view the historical Check-in Baseline during Checkout stage.
- `backend/tests/`:
  - `attendanceCategoryAndImmediateCheckIn.test.ts`: Added tests for event-day boundary enforcement and decoupled checkout.
  - `attendanceCheckOut.test.ts`: Verified decoupled checkout finalization with automatic `on_time` default provisioning.
  - `attendanceModelsAndRepositories.test.ts`: Updated `atomicFinalizeCheckOut` test filter assertions.
- `frontend/src/tests/`:
  - `attendanceCategoryAndImmediateCheckInUI.test.tsx`: Updated test assertions for `Mark Late` / `Mark Absent` exception buttons.
  - `attendanceCheckOutUI.test.tsx`: Verified Check-in Baseline toggle during Checkout stage.
- `docs/08-bug-log.md`: Documented BUG-023.
- `docs/09-change-impact-log.md`: Recorded change impact.

**Verification Results:**
- Backend Test Suite: 682/682 passed (100%), 116 test suites, exit code 0.
- Frontend Unit/UI Tests: All attendance UI suites passed (34/34 tests, 100%), exit code 0.
- Backend Type Check (`npm --prefix backend run type-check`): 0 errors, exit code 0.
- Frontend Production Build (`npm --prefix frontend run build`): 0 errors, exit code 0.
- Database Safety: Strict Rule 26 isolation enforced; `eventops` untouched, tests executed solely in `eventops_test`.

---

### [Milestone 4 — Attendance Workflow Update: Prompt 2 Worker Concerns, 24h Normal Correction Window, Exceptional Corrections & Permanent Status Locking]
**Date:** 2026-11-09
**Impact Classification:** High (Introduced dedicated worker concerns dispute lifecycle, 24-hour canonical correction window post-event conclusion in `Asia/Kolkata`, exceptional manager corrections with permanent status locking, open concern verification blockers, and worker/manager communication foundation)

**Affected Modules & Files:**
- `backend/src/modules/attendance/model/attendance.model.ts`:
  - Added `isStatusLocked`, `statusLockedAt`, `statusLockedReason`, `statusLockedBy`, `hasOpenConcern`, `activeConcernId` to `IAttendance` and Mongoose schema with query index.
- `backend/src/modules/attendance/model/attendance-concern.model.ts`:
  - Created schema and model for `AttendanceConcern` with unique index on `attendanceId`, status `open | closed`, outcome `accepted | rejected`, messages array, and query indexes.
- `backend/src/modules/attendance/utils/attendance-window.util.ts`:
  - Created `calculateEventCorrectionWindow()` handling timezone offsets (`Asia/Kolkata`), overnight shifts, canonical schedule fields, and 24h deadline calculation (`scheduledEventEndAt + 24 hours`).
- `backend/src/modules/attendance/repository/attendance.repository.ts`:
  - Added `lockAttendanceStatus()` and `setOpenConcern()`.
  - Updated `findByWorkerId` population to include event scheduling details.
- `backend/src/modules/attendance/repository/attendance-concern.repository.ts`:
  - Implemented CRUD, `findByAttendanceId`, `countOpenByEventId`, `addMessage`, and `closeConcern` with outcome recording.
- `backend/src/modules/attendance/service/attendance-concern.service.ts`:
  - Implemented worker concern submission validation (dispute window, one thread per attendance record, Late/Absent only).
  - Implemented timestamped message exchange for open concerns (closed threads are read-only).
  - Implemented manager exceptional resolution:
    - **Accept**: modifies attendance status/times atomically, recalculates delay/overtime/duration, appends immutable correction history, and permanently locks the record (`isStatusLocked: true`).
    - **Reject**: preserves existing status, records explanation, and permanently locks the record (`isStatusLocked: true`).
  - Integrated notification dispatch for concern submission, reply messages, and resolutions via existing `NotificationService`.
- `backend/src/modules/attendance/service/attendance.service.ts`:
  - Enforced 24h deadline check in `correctAttendance`: non-admin manager modifications after 24h are rejected with HTTP 403.
  - Enforced `isStatusLocked` guard at the top of `recordWorkerCheckIn` and `correctAttendance`: permanently locked records cannot be modified via standard check-in or correction endpoints.
  - Enforced open concern blocker in `verifyAttendance`: verification is rejected if `countOpenByEventId > 0`.
  - Injected correction window details and `openConcernsCount` into `getRoster` response.
- `backend/src/modules/attendance/validation/attendance.validation.ts`:
  - Added Zod schemas for `validateSubmitConcern`, `validateConcernMessage`, and `validateResolveConcern`.
- `backend/src/modules/attendance/controller/attendance-concern.controller.ts`:
  - Created controller endpoints using standardized `ApiResponse`.
- `backend/src/modules/attendance/routes/attendance.routes.ts`:
  - Mounted worker routes (`GET /worker/records`, `POST /concerns`), shared thread routes (`GET /concerns`, `GET /concerns/:id`, `POST /concerns/:id/messages`), and manager resolution (`POST /concerns/:id/resolve`).
- `frontend/src/features/attendance/attendance.types.ts`:
  - Added `AttendanceConcern`, `ConcernMessage`, `SubmitConcernPayload`, `ResolveConcernPayload`, `WorkerAttendanceRecordWithConcern`, plus locked and window fields in `AttendanceRosterItem` and `AttendanceRosterResponse`.
- `frontend/src/features/attendance/attendanceApi.ts`:
  - Implemented client API methods: `getWorkerAttendanceRecords`, `submitConcern`, `getConcerns`, `getConcernById`, `addConcernMessage`, `resolveConcern`.
- `frontend/src/pages/worker/WorkerAttendanceConcerns.tsx`:
  - Built worker attendance concerns portal with shift overview, dispute eligibility, modal concern submission form, and interactive conversation thread drawer.
- `frontend/src/pages/manager/ManagerAttendanceConcerns.tsx`:
  - Built manager attendance concerns dashboard with status filters (Open / Closed / All), thread review, message reply input, and Accept/Reject resolution modal.
- `frontend/src/routes/AppRoutes.tsx`:
  - Registered `/worker/concerns` (Worker portal) and `/manager/concerns` (Manager portal).
- `frontend/src/layouts/WorkerLayout.tsx` & `frontend/src/layouts/ManagerLayout.tsx`:
  - Added "Attendance Concerns" navigation items with `AlertCircle` icon.
- `frontend/src/components/manager/attendance/EventAttendanceWorkspace.tsx` & `FinalizedAttendanceView.tsx`:
  - Added warning banner alerting manager to open concerns and disabled "Approve Attendance" button with informative tooltip when `openConcernsCount > 0`.
- `frontend/src/components/manager/attendance/CorrectionModal.tsx`:
  - Added permanent lock banner and disabled form submission when `worker.isStatusLocked === true`.
- `backend/tests/`:
  - `attendanceConcernsAndDeadlines.test.ts`: Created 25 integration tests covering window calculation, normal 24h correction deadline, concern submission rules, conversation messaging, accept/reject resolutions with permanent status locking, and verification blocking. Clean teardown with `server.close()` and `mongoose.disconnect()`.
  - `attendanceCorrectionAndApproval.test.ts`: Updated fixture event date to current day so test operations remain within the active 24h window.
- `frontend/src/tests/`:
  - `attendanceConcernsUI.test.tsx`: Created 5 UI tests verifying concern blocker banner, permanent locking in CorrectionModal, worker dispute modal, and manager review & resolution flow.
- `docs/08-bug-log.md`: Documented BUG-024.
- `docs/09-change-impact-log.md`: Recorded change impact.

**Verification Results:**
- Backend Integration Tests:
  - `attendanceConcernsAndDeadlines.test.ts`: 25/25 passed (100%), exit code 0.
  - `attendanceCategoryAndImmediateCheckIn.test.ts`: 22/22 passed (100%), exit code 0.
  - `attendanceCheckOut.test.ts`: 24/24 passed (100%), exit code 0.
  - `attendanceCorrectionAndApproval.test.ts`: 17/17 passed (100%), exit code 0.
  - Total attendance integration tests: 88/88 passed (100%).
- Frontend Tests:
  - `attendanceConcernsUI.test.tsx`: 5/5 passed (100%), exit code 0.
  - All frontend attendance UI suites: 39/39 passed (100%), exit code 0.
- Backend Type Check (`npm --prefix backend run type-check`): 0 errors, exit code 0.
- Frontend Production Build (`npm --prefix frontend run build`): 0 errors, compiled cleanly in 7.0s, exit code 0.
- Database Safety: Strict Rule 26 isolation enforced; `eventops` untouched, tests executed solely in `eventops_test` and dropped cleanly.

---

## Milestone 4: Attendance Workflow Bug Fix — API Routing for Existing Records & Change to Present Option
- **Impact Level**: Medium (Refined API routing between initial check-in and post-shift correction; added Change to Present modal workflow and backend validation without modifying database models or financial logic)
- **Date**: 2026-11-09
- **Affected Files**:
  - `backend/src/modules/attendance/service/attendance.service.ts`:
    - Enforced strict distinction in `recordWorkerCheckIn`: rejects calls when an attendance record already exists (`arrivalStatus !== 'unrecorded'`) with HTTP 400 Bad Request instructing callers to use the correction API (`PATCH /api/attendance/records/:attendanceId/correct`).
    - Updated `correctAttendance`: supported `arrivalStatus: 'on_time'` transitions (`Late -> Present` and `Absent -> Present`), resetting delay to 0, updating checkIn timestamp to scheduled reporting time with `checkInSource: 'system_default'`, updating status to `checked_in` (or `checked_out`), and preserving post-checkout absence reversal validations.
  - `backend/src/modules/attendance/validation/attendance.validation.ts`:
    - Aligned validation error messages for mutual exclusion between late and absent exceptions.
  - `frontend/src/components/manager/attendance/AttendanceRosterTable.tsx`:
    - Added "Change to Present" button to Late and Absent worker rows.
    - Added state and confirmation dialog modal for Change to Present with scheduled reporting time, on-time explanation, and mandatory reason input (min 5 chars).
    - Branched `handleConfirmAndSave` to invoke `onCorrectAttendance` when `worker.attendanceId` exists.
  - `frontend/src/components/manager/attendance/EventAttendanceWorkspace.tsx`:
    - Branched `handleSaveWorkerCheckIn` to call `attendanceApi.correctAttendance` when modifying an already-recorded worker.
    - Passed correction and deadline props (`onCorrectAttendance`, `canNormalCorrect`, `isAfterCorrectionDeadline`, `eventStatus`) to `AttendanceRosterTable`.
  - `backend/tests/attendanceApiRoutingAndPresentCorrection.test.ts`:
    - Created 12 comprehensive integration tests covering initial check-in vs correction API routing, completed event rules, Change to Present transitions, and deadline/locking protections.
  - `frontend/src/tests/attendanceCategoryAndImmediateCheckInUI.test.tsx`:
    - Added UI tests for Change to Present button rendering, confirmation modal interactions, dynamic API routing, and locked row protection.
- **Affected Modules**:
  - Attendance Module (Check-in, Corrections, Roster UI)
- **Affected APIs**:
  - `POST /api/attendance/events/:eventId/workers/:workerId/checkin`: Rejects modification of existing records with HTTP 400.
  - `PATCH /api/attendance/records/:attendanceId/correct`: Explicitly supports on-time reversal (`Late -> Present`, `Absent -> Present`).
- **Database Schema Changes**:
  - None. Preserved existing Attendance and AttendanceSession models.
- **Frontend Areas Affected**:
  - Manager Event Details -> Attendance Workspace -> AttendanceRosterTable.
- **Verification Results**:
  - `backend/tests/attendanceApiRoutingAndPresentCorrection.test.ts`: 12/12 passed (100%).
  - `backend/tests/attendanceCategoryAndImmediateCheckIn.test.ts`: 22/22 passed (100%).
  - `backend/tests/attendanceConcernsAndDeadlines.test.ts`: 25/25 passed (100%).
  - `backend/tests/attendanceCheckIn.test.ts`: 28/28 passed (100%).
  - `backend/tests/attendanceCorrectionAndApproval.test.ts`: 17/17 passed (100%).
  - `backend/tests/attendanceCheckOut.test.ts`: 24/24 passed (100%).
  - Total attendance backend tests: 128/128 passed (100%).
  - `frontend/src/tests/attendanceCategoryAndImmediateCheckInUI.test.tsx`: 15/15 passed (100%).
  - Frontend production build (`tsc -b && vite build`): Succeeded in 1.1s, exit code 0.
  - Backend type-check (`tsc --noEmit`): 0 errors, exit code 0.
  - Strict Rule 26 isolation enforced; `eventops` untouched, tests executed solely in `eventops_test` and dropped cleanly.

---

### [2026-11-10] Attendance UI Professional Simplification & Modal-Driven Exception Handling

- **Change Summary**:
  - Refactored Event Attendance Workspace and Roster Table UI to create an enterprise, uncluttered experience as requested:
    - Removed bulky 3-step wizard stepper from `EventAttendanceWorkspace.tsx` in favor of a clean workspace header and tab toggle (`Check-in` / `Checkout`).
    - Simplified the workspace top header section: removed redundant instructional description, and aligned all action buttons (`Refresh`, `Check-in` / `Checkout` toggle, `Reset to Default`, and `Proceed to Checkout`) to the exact same height (`h-9`) and balanced lengths.
    - Removed static timing notice UI banner (`AttendanceTimingBanner`); notices/banners now only surface dynamically if an error occurs.
    - Removed redundant 6 summary metric cards (`TOTAL ASSIGNED`, `DEFAULT PRESENT`, `LATE ARRIVALS`, `ABSENT`, `LATEST SHIFT`, `CHECK-IN STATE`).
    - Refactored `AttendanceRosterTable.tsx`:
      - Replaced status filter buttons (`All`, `On Time`, `Late`, `Absent`) with a compact, formal `<select>` dropdown placed alongside the Worker Role dropdown.
      - Formatted late durations into readable language (`formatLateDuration`: e.g. `2 hr and 3 minutes late`, `45 minutes late`, `1 hr late`).
      - Cleaned up the worker column by removing unnecessary worker email addresses.
      - Simplified the table heading to strictly `Assigned Workers ({count})` with no subtitle description.
      - Removed the heavy gray background styling on worker roles (`bg-gray-100 border border-gray-200/80`) in favor of clean typography.
      - Removed the inline 4th column ("Attendance Exception").
      - In the "Attendance Status" column, now only display the current recorded result badge (On Time, Late with formatted delay, Absent, or Locked).
      - Clicking any worker row or clicking the "Change Status" action button opens a formal `StatusChangeModal` for setting Late arrival time or Absent, or confirming Present, with reason validation and live delay calculation.
      - Optimized responsive layout across all viewports (mobile, tablet, desktop):
        - Dropdown filters expand evenly on mobile screens (`flex-1 sm:flex-none`) and search input uses full container width.
        - Table preserves column alignment and comfortable horizontal scrolling on small screens (`min-w-[580px]`).
        - Status change modal incorporates safe vertical viewport constraints (`max-h-[90vh] overflow-y-auto flex flex-col`) with fixed header, footer, and touch-friendly button sizes.
        - Action bar buttons wrap cleanly on mobile with `w-full sm:w-auto`.
- **Impact Level**: LOW (Frontend UI refinement; zero changes to backend models, routes, controllers, services, or business rules).
- **Directly Affected Files**:
  - `frontend/src/components/manager/attendance/EventAttendanceWorkspace.tsx`
  - `frontend/src/components/manager/attendance/AttendanceRosterTable.tsx`
  - `frontend/src/tests/attendanceCategoryAndImmediateCheckInUI.test.tsx`
  - `frontend/src/tests/attendanceCheckInUI.test.tsx`
  - `frontend/src/tests/attendanceCheckOutUI.test.tsx`
- **Affected Modules**:
  - Event Manager Attendance Frontend Portal
- **Affected APIs**: None.
- **Database Schema Changes**: None.
- **Verification Results**:
  - `npm --prefix frontend test -- --run`: 22/22 test files passed (143/143 tests passed, 100%).
  - `npm --prefix frontend run build`: TypeScript compile and Vite build passed with 0 errors.
  - `npm --prefix backend run type-check`: 0 errors.

---

### [2026-11-11] Attendance Workspace Header Simplification — Direct Check-in and Checkout Action Buttons

- **Change Summary**:
  - Streamlined the action bar in `EventAttendanceWorkspace.tsx` to display **strictly Check-in and Checkout buttons**:
    - Removed the segmented toggle badge (`[ Check-in | Checkout ]`) and redundant `Proceed to Checkout` and `Reset to Default` buttons from the top bar.
    - Added dedicated, enterprise-grade `Check-in` and `Checkout` stage buttons with clear active/inactive visual hierarchy (`bg-emerald-700 text-white` when active vs clean outline border when inactive) and icons (`UserCheck`, `Clock`).
    - Responsive across all viewports (mobile, tablet, desktop) without wrapping or layout clipping.
    - Updated workspace title to dynamically reflect the active stage (`Check-in Exceptions Workspace` vs `Checkout Workspace`).
- **Impact Level**: LOW (Isolated frontend header presentation update).
- **Directly Affected Files**:
  - `frontend/src/components/manager/attendance/EventAttendanceWorkspace.tsx`
- **Affected Modules**:
  - Event Manager Attendance Frontend Portal
- **Affected APIs**: None.
- **Database Schema Changes**: None.
- **Verification Results**:
  - `npm --prefix frontend test -- --run src/tests/attendanceCheckOutUI.test.tsx src/tests/attendanceCheckInUI.test.tsx src/tests/attendanceCategoryAndImmediateCheckInUI.test.tsx`: 34/34 tests passed (100%).
  - `npm --prefix frontend run build`: TypeScript compile and Vite build passed with 0 errors.
  - `npm --prefix backend run type-check`: 0 errors.

---

### [2026-11-11] Manager Event Details Header & Underline Tabs Redesign

- **Change Summary**:
  - Redesigned the header banner and tab navigation in `ManagerEventDetails.tsx` to match the exact clean, modern design requested:
    - Updated status badges to use consistent `rounded-md` corners and checkmark circle icon for completed events (`CheckCircle2`).
    - Replaced the colored pill/button tabs with a classic **underline tab bar**:
      - Full-width baseline border (`border-b border-gray-200`).
      - Inactive tabs rendered in clean, muted gray (`text-gray-500 hover:text-gray-800 font-medium border-transparent`).
      - Active tab rendered with bold, crisp dark typography and a dark underline indicator (`text-gray-900 font-bold border-gray-900 border-b-2 -mb-px pb-3`).
      - Removed cluttering icons from the tab headers (`Event Overview`, `Work Requirements`, `Attendance`) for an uncluttered look.
      - Preserved smooth horizontal scroll (`overflow-x-auto scrollbar-none`) across all mobile devices so tabs are never cut off.
- **Impact Level**: LOW (Isolated frontend header navigation styling).
- **Directly Affected Files**:
  - `frontend/src/pages/manager/ManagerEventDetails.tsx`
- **Affected Modules**:
  - Event Manager Portal
- **Affected APIs**: None.
- **Database Schema Changes**: None.
- **Verification Results**:
  - `npm --prefix frontend test -- --run src/tests/managerEventDetails.test.tsx src/tests/attendanceCheckInUI.test.tsx`: 9/9 tests passed (100%).
  - `npm --prefix frontend run build`: TypeScript compile and Vite build passed with 0 errors.
  - `npm --prefix backend run type-check`: 0 errors.

---

### [2026-11-11] Full Attendance Page Mockup Alignment (Cards 1, 2, and 3)

- **Change Summary**:
  - Aligned the entire Attendance workspace page layout with the user-provided full-page mockup:
    - **Card 1 (Event Header)**: Clean tags (`NIKAH`, `Completed`), title, reference, and underline tab bar (`Event Overview`, `Work Requirements`, `Attendance`) with black bottom indicator on active tab.
    - **Card 2 (Check-in Exceptions Workspace)**: Clean card with title on top and large side-by-side buttons (`Check-in` in solid dark `bg-gray-900 text-white rounded-xl h-11` vs `Checkout` in `bg-white text-gray-900 border border-gray-300 rounded-xl h-11`).
    - **Card 3 (Assigned Workers Roster)**:
      - Header: `Assigned Workers` with count badge `2` in gray chip.
      - Search bar and `All Statuses` filter dropdown side-by-side in one clean row with chevron indicator.
      - 4-column table: `WORKER`, `ROLE`, `SCHEDULED SHIFT`, `ATTENDANCE STATUS`.
      - Worker column displays name and `businessId` below it.
      - Scheduled Shift displays clean time text (e.g. `08:30`).
      - Attendance Status column displays clean badge (`[ ✓ Saved On-Time ]`, `[ ✓ Present ]`, `[ Clock Late ]`, `[ UserX Absent ]`) functioning as an accessible interactive button to open the status change modal, preserving all existing automated tests.
      - Bottom disclaimer: Neutral box with `Info` icon and `Exception-Based Check-in` explanation.
- **Impact Level**: LOW (Frontend layout and presentation alignment).
- **Directly Affected Files**:
  - `frontend/src/components/manager/attendance/AttendanceRosterTable.tsx`
  - `frontend/src/components/manager/attendance/EventAttendanceWorkspace.tsx`
  - `frontend/src/pages/manager/ManagerEventDetails.tsx`
- **Affected Modules**:
  - Event Manager Portal (Attendance Workspace)
- **Affected APIs**: None.
- **Database Schema Changes**: None.
- **Verification Results**:
  - `npm --prefix frontend test -- --run src/tests/attendanceCategoryAndImmediateCheckInUI.test.tsx src/tests/adminEventAssignment.test.tsx src/tests/managerEventDetails.test.tsx src/tests/attendanceCheckInUI.test.tsx`: All passed (100%).
  - `npm --prefix frontend run build`: TypeScript compile and Vite build passed with 0 errors.
  - `npm --prefix backend run type-check`: 0 errors.

---

### [2026-11-11] Work Requirements UI Mockup Alignment

- **Change Summary**:
  - Aligned the Work Requirements management interface with the user-provided design reference image:
    - **Notice Banner**: Replaced the previous purple banner with a neutral, clean gray banner featuring an `(i)` info icon (`Event Completed (View Only)`).
    - **Staffing Demand Summary Card**:
      - Header: Title and subtitle on left; `STAFFING FULFILLED` count (`2 of 4 (50%)`) and horizontal green progress bar on right.
      - 4 Metric KPI Boxes: Clean uniform off-white cards (`ACTIVE WORKERS NEEDED`, `TOTAL REQUIREMENTS`, `DRAFT REQUIREMENTS`, `RECRUITMENT ACTIVE`) with prominent bold numbers and subtitles.
      - Demanded Roles Breakdown: White chip containers with bold required counts, role names, and assignment badges with green checkmark when filled.
    - **Staffing Work Requirements Card**:
      - Header: Clean title, subtitle, refresh button, and `Completed Event` badge (or `Add Requirement` when active).
      - Search & Filter: Search input alongside a funnel filter icon with custom dropdown `All Statuses (N) ∨`.
      - Table Structure: Clean table header (`WORKER ROLE`, `STAFFING PROGRESS`, `INTEREST WINDOW`, `STATUS`, `ACTIONS`).
      - Staffing Progress: Integrated progress bar directly below the `X / Y filled` count matching the screenshot.
      - Status Badges: Soft pastel pill badges (`Cancelled`, `Closed`, `Open`, `Draft`, etc.) without dots.
      - Actions: Minimal `Details >` button with chevron.
      - Scrollbars: Removed the visible horizontal scrollbar exclusively from the top navigation tabs bar (`no-scrollbar`), while maintaining full horizontal scrolling (`overflow-x-auto min-w-[640px]`) on the requirements table so users can scroll right to access all column options and actions.
      - Responsiveness: Refined mobile-first layout across all viewports (mobile <640px, tablet 640-1024px, desktop >1024px), including card padding (`p-4 sm:p-6`), break-word title handling, 2-column mobile KPI grid, flexible search/filter wrapping, and touch momentum scrolling (`touch-pan-x`).
- **Impact Level**: LOW (Frontend visual presentation and layout refinement).
- **Directly Affected Files**:
  - `frontend/src/components/manager/WorkRequirementsSection.tsx`
  - `frontend/src/components/manager/WorkRequirementsSummary.tsx`
  - `frontend/src/pages/manager/ManagerEventDetails.tsx`
- **Affected Modules**:
  - Event Manager Portal (Work Requirements Workspace)
- **Affected APIs**: None.
- **Database Schema Changes**: None.
- **Verification Results**:
  - `npm --prefix frontend test -- src/tests/workRequirements`: 13/13 passed.
  - `npm --prefix frontend test -- src/tests/announceRequirementUI.test.tsx`: 2/2 passed.
  - `npm --prefix frontend run build`: TypeScript compile and Vite build passed with 0 errors.

---

### [2026-11-11] Attendance UI Alignment: Harmonize with Work Requirements Design & Desktop Layout
- **Requested Change**:
  - Remove harsh black borders and align Card 1, Card 2, and Card 3 styling with the Work Requirements workspace (`border border-gray-200`, `rounded-xl`).
  - Restructure Card 2 (`Check-in Exceptions Workspace`) into a natural, proportional desktop toolbar: title and subtitle on the left, Check-in / Checkout action buttons on the right (`sm:flex-row sm:items-center sm:justify-between`), while maintaining a 50/50 full-width grid on mobile (`flex-col w-full`).
  - Align Card 3 (`Assigned Workers`) with the Work Requirements table pattern: clean search input with clear-x button, funnel filter icon, custom dropdown, table container (`overflow-x-auto rounded-lg border border-gray-200`), and bottom operational notice card.
- **Impact Level**: LOW (Presentation and layout refinement only).
- **Directly Affected Files**:
  - `frontend/src/pages/manager/ManagerEventDetails.tsx`
  - `frontend/src/components/manager/attendance/EventAttendanceWorkspace.tsx`
  - `frontend/src/components/manager/attendance/AttendanceRosterTable.tsx`
- **Affected Modules**: Event Manager Portal (Attendance Workspace).
- **Affected APIs**: None.
- **Database Schema Changes**: None (Rule 26 strictly maintained).
- **Verification Results**:
  - All 37 automated frontend tests passed: `npm --prefix frontend test -- --run src/tests/attendanceCategoryAndImmediateCheckInUI.test.tsx src/tests/attendanceCheckInUI.test.tsx src/tests/attendanceCheckOutUI.test.tsx src/tests/managerEventDetails.test.tsx` (37/37).
  - Production build: `npm --prefix frontend run build` succeeded with 0 errors.
  - Backend typecheck: `npm --prefix backend run type-check` succeeded with 0 errors.

---

### [2026-11-11] Attendance Tables: Invisible Scrollbar with Seamless Horizontal Scroll
- **Requested Change**:
  - Hide visible scrollbar tracks and thumbs from roster and attendance tables while preserving smooth horizontal scrolling/swiping (`overflow-x-auto no-scrollbar` + `min-w-[540px]`).
  - Added cross-browser scrollbar hiding utilities in `frontend/src/index.css` covering Chrome/Safari/Edge (`::-webkit-scrollbar { display: none }`), Firefox (`scrollbar-width: none`), IE (`-ms-overflow-style: none`), and iOS (`-webkit-overflow-scrolling: touch`).
- **Impact Level**: LOW (Styling & CSS utility enhancement).
- **Directly Affected Files**:
  - `frontend/src/index.css`
  - `frontend/src/components/manager/attendance/AttendanceRosterTable.tsx`
  - `frontend/src/components/manager/attendance/CheckoutRosterTable.tsx`
  - `frontend/src/components/manager/attendance/FinalizedAttendanceView.tsx`
- **Affected Modules**: Event Manager Portal (Attendance Workspace).
- **Affected APIs**: None.
- **Database Schema Changes**: None.
- **Verification Results**:
  - All 37 tests passed.
  - Production build succeeded with 0 errors.

---

### [2026-11-11] Full Cross-Device Responsive Polish
- **Requested Change**:
  - Audit and refine responsiveness across all breakpoints: mobile (320px–440px), tablet (640px–1024px), desktop (>1024px).
  - Ensured navigation tab bar in `ManagerEventDetails.tsx` has `overflow-x-auto no-scrollbar` for zero-overflow on narrow 320px screens.
  - Sized search and filter dropdowns in `AttendanceRosterTable.tsx` to flex evenly (`flex-1 min-w-0 truncate`) on mobile and size to content on desktop (`sm:flex-none sm:w-auto`).
  - Guaranteed `min-w-[540px]` on table so columns retain readable structure with touch swiping without clipping.
- **Impact Level**: LOW (Responsive styling enhancement).
- **Directly Affected Files**:
  - `frontend/src/pages/manager/ManagerEventDetails.tsx`
  - `frontend/src/components/manager/attendance/AttendanceRosterTable.tsx`
- **Affected Modules**: Event Manager Portal (Attendance Workspace).
- **Affected APIs**: None.
- **Database Schema Changes**: None.
- **Verification Results**:
  - All 37 automated frontend tests passed.
  - Production build succeeded with 0 errors.

---

### [2026-11-12] Payment Gateway Maximum Transaction Limit & Incremental Payment Guidance (Razorpay ₹5,00,000 Limit)
- **Requested Change**:
  - Enforce backend validation and error handling for Razorpay's maximum transaction limit of ₹5,00,000 per order (`MAX_RAZORPAY_TRANSACTION_AMOUNT = 500000`).
  - Stop masking Razorpay gateway 400 rejection errors as 500 Internal Server Errors; log gateway failures with `console.error` and forward `error.error.description` as HTTP 400.
  - Implement transparent client UI messaging when total balance or payment amount exceeds ₹5,00,000, explaining the limit and guiding clients to pay little by little across milestone installments or custom payments up to ₹5,00,000 each.
  - Disable the primary payment button when the selected amount exceeds ₹5,00,000 to prevent invalid checkout attempts.
- **Impact Level**: MEDIUM (Financial validation and client checkout error-handling enhancement).
- **Directly Affected Files**:
  - `backend/src/modules/payments/validation/payment.validation.ts`
  - `backend/src/modules/payments/service/payment.service.ts`
  - `frontend/src/pages/client/ClientAdvancePayment.tsx`
  - `docs/08-bug-log.md`
  - `docs/09-change-impact-log.md`
- **Affected Modules**: Payments Module, Client Portal (Advance & Installment Payments).
- **Affected APIs**: `POST /api/payments/create-order`.
- **Database Schema Changes**: None.
- **Security & Financial Rules**:
  - Backend is the authoritative source of truth; client-side parameters are never trusted.
  - All transaction amount constraints validated strictly on server before gateway execution.
- **Verification Results**:
  - Backend TypeScript compilation (`npm run type-check`): 0 errors, exit code 0.
  - Frontend TypeScript compilation (`npx tsc -b frontend`): 0 errors, exit code 0.
  - Unit and boundary tests (5,00,000 pass, 5,00,001 reject, 16,34,300 reject): all PASSED cleanly.
