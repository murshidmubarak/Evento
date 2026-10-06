
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