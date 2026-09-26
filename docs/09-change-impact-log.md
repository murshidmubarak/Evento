
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