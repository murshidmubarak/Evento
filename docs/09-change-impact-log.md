
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
2. **`WorkRequirementsSection.tsx`**: Streamlined filtration interface using a single dropdown `<select>` with dynamic badge counts per status alongside accessible search input. Removed repetitive briefcase icon containers from table rows and modal headers for clean typography; optimized mobile layout alignment with edge-to-edge touch targets, uniform search and filter heights, responsive table scrolling (`min-w-[560px]`), and balanced spacing.
3. **`RequirementDetailsModal.tsx`**: Modernized requirement inspection dossier with key operational metrics (Reporting Time with 12h formatting, Maximum Distance with radius limit guidance, Headcount Progress, Interest Window), role instructions card, assigned personnel roster with phone links and distance indicators, extension audit trail, and distinct role action footers.
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
