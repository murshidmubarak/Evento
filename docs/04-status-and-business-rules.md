# EventOps ERP - Status and Business Rules

## 1. Purpose

This document defines:

- System statuses
- Allowed status transitions
- Business rules
- Role responsibilities
- Conditions required for important actions

All critical business rules must be enforced on the backend.

The frontend must not be treated as the source of truth.


# 2. User Account Status

Users use:

- `isActive: true`
- `isActive: false`

## Active

The user can log in and use permitted features.

## Inactive

The user cannot access protected application features.

## Rules

- Admin can activate or deactivate users.
- Users cannot activate or deactivate other users.
- Inactive Workers must not be considered for new Worker selection.
- Inactive Event Managers must not be assigned new Events.
- Event Manager accounts are created exclusively by authorized Admins (`POST /api/users/event-managers`). Public registration cannot assign the `event_manager` role.
- Newly created Event Manager accounts receive `role: 'event_manager'`, `isActive: false`, and `emailVerified: false`. Admin does not set the manager's password.
- The backend generates a cryptographically secure random 32-byte invitation token (hashed at rest using SHA-256 with 24-hour expiration) and sends an invitation email.
- Pending managers cannot authenticate (`401 Unauthorized` with explicit activation message).
- Managers open the secure link (`/accept-invitation?token=<raw-token>`), validate the token, and set their password.
- Upon valid password setup (`POST /api/auth/accept-invitation`), the password is hashed with bcrypt, the account is activated (`isActive: true`), email verified (`emailVerified: true`), token invalidated, and manager redirected to login.
- Authorized Admins can resend invitations to pending managers via `POST /api/users/event-managers/:id/resend-invitation`, superseding old tokens with a new 24-hour expiration.
- Business IDs for Event Managers are generated in the category range `1000–1999` (prefixed as `EM-xxxx` in user-facing UI).
- Worker accounts can be created by authorized, active Event Managers (`POST /api/users/workers` or `POST /api/manager/workers`) as well as Admins.
- The backend derives the creating manager's identity authoritative from the verified JWT context and records `createdBy: ObjectId`. The caller cannot supply an arbitrary creator ID or role; the backend forces `role: 'worker'`.
- Newly created Worker accounts receive `role: 'worker'`, `isActive: false`, and `emailVerified: false`. The manager does not set the worker's password.
- Worker types are strictly validated against the 8 canonical types: `Catering Boy`, `Catering Supervisor`, `Chef`, `Cameraman / Photographer`, `Videographer`, `Decoration Worker`, `Juice Worker`, and `Host`.
- Business IDs for Workers are generated sequentially in category ranges matching their worker type (Catering Boy: 2000–2999, Catering Supervisor: 3000–3999, Chef: 4000–4999, Cameraman / Photographer: 5000–5999, Videographer: 6000–6999, Decoration Worker: 7000–7999, Juice Worker: 8000–8999, Host: 9000–9999), prefixed as `W-xxxx` in user-facing UI.
- The backend generates a cryptographically secure random 32-byte invitation token (hashed at rest using SHA-256 with 24-hour expiration) and sends an invitation email via the centralized email service.
- Pending workers cannot authenticate (`401 Unauthorized` with activation message: "Your account is pending activation. Please accept your invitation email to set your password.").
- Workers open the secure link (`/accept-invitation?token=<raw-token>`), validate the token, and set their password.
- Upon valid password setup (`POST /api/auth/accept-invitation`), the password is hashed with bcrypt, the account is activated (`isActive: true`), email verified (`emailVerified: true`), token invalidated, and worker redirected to login.
- Creating Event Managers can view and resend invitations to pending workers they created (`POST /api/users/workers/:id/resend-invitation` or `POST /api/manager/workers/:id/resend-invitation`). Non-creator managers cannot resend invitations to workers created by other managers (`403 Forbidden`). Admins retain permissions to view and resend invitations for all workers.
- Workers belong to the company's shared workforce pool; creating a worker account does not assign the worker to an event, manager, or staffing requirement.
- Authenticated Workers log in via the unified `/login` page and are redirected to the protected Worker Dashboard at `/worker`.


# 3. Event Status

Main Event lifecycle:

```text
requested
    ↓
quoted
    ↓
awaiting_payment
    ↓
confirmed
    ↓
in_progress
    ↓
completed

Cancellation may happen before completion:

requested → cancelled
quoted → cancelled
awaiting_payment → cancelled
confirmed → cancelled
Event Status Definitions
requested

The Client has submitted an Event request.

At this stage:

Event exists.
Admin can review the request.
Event is not confirmed.
Event Manager is not normally assigned yet.
quoted

A quotation has been prepared and sent to the Client.

At this stage:

Client can view the quotation.
Client can accept, reject or request changes.
Event is not confirmed.
awaiting_payment

The Client has accepted the quotation and the required advance payment is pending.

At this stage:

Client must complete the required advance payment.
Event is not confirmed.
Payment must be verified by the backend.
confirmed

The required advance payment has been successfully verified.

At this stage:

Event is officially confirmed.
Admin can assign an Event Manager.
Event preparation can begin.
Worker recruitment can begin when appropriate.
in_progress

The Event is currently taking place.

completed

The Event has finished.

At this stage:

Attendance can be finalized.
Worker performance can be recorded.
Worker wages can be finalized.
Worker payments can be processed.
Client feedback becomes available.
Gallery can be finalized.
Admin reporting can include the Event.
cancelled

The Event has been cancelled.

Normal Event workflow actions are no longer allowed.

4. Event Status Transition Rules

Normal flow:

requested
    ↓
quoted
    ↓
awaiting_payment
    ↓
confirmed
    ↓
in_progress
    ↓
completed

Cancellation:

requested → cancelled
quoted → cancelled
awaiting_payment → cancelled
confirmed → cancelled

Rules:

Client can create an Event request.
Authorized staff can create and send a quotation.
Client can accept the quotation.
After quotation acceptance, the Event moves to awaiting_payment.
Event becomes confirmed only after the required advance payment is successfully verified by the backend.
Admin assigns the Event Manager after the Event is confirmed.
Event Manager can manage only assigned Events.
Completed Events cannot return to normal active states.
Cancelled Events cannot return to normal active states unless a future reactivation feature is explicitly approved.
5. Quotation Status

Quotation lifecycle:

draft
  ↓
sent
  ↓
awaiting_approval
  ├── accepted
  ├── changes_requested
  └── rejected

A quotation may also become:

expired
Quotation Status Definitions
draft

Quotation is being prepared.

Client cannot approve a draft.

sent

Quotation has been sent to the Client.

Client can review it.

awaiting_approval

Quotation is waiting for Client action.

Client can:

Accept
Reject
Request Changes
changes_requested

Client has requested changes.

The authorized staff member can revise the quotation.

After revision:

changes_requested
        ↓
sent
accepted

Client has accepted the quotation.

The related Event moves to:

awaiting_payment

when the required advance payment is applicable.

rejected

Client has rejected the quotation.

The quotation cannot proceed unless a new quotation is created.

expired

Quotation validity period has ended.

Expired quotations cannot be accepted.

6. Quotation & Tax Rules
- Client cannot modify quotation prices.
- Client cannot modify subtotal, discount, taxable amount, tax amounts, final amount or advance amount.
- All financial and commercial values are calculated and validated strictly on the backend.
- Commercial calculation flow:
  1. Line items → subtotal = sum(quantity * unitPrice)
  2. discount = validated non-negative discount (discount <= subtotal)
  3. taxableAmount = subtotal - discount
  4. taxAmount = calculated based on quotation tax configuration (taxRate, taxType, gstTreatment)
  5. finalAmount = taxableAmount + taxAmount
  6. advanceAmount = validated non-negative advance (advanceAmount <= finalAmount)
  7. remainingAmount = finalAmount - advanceAmount
- Money precision: All calculations use deterministic 2-decimal precision.
- GST Treatment:
  - Intra-state supply: splits taxAmount evenly into CGST (50%) and SGST (50%).
  - Inter-state supply: allocates taxAmount to IGST (100%) with 0 CGST and SGST.
  - Exempt or non-tax: zero tax values.
- Tax Snapshot: Every quotation revision permanently stores its own tax configuration and computed tax breakdown as a snapshot. Historical revisions remain immutable and are never recalculated.
- Tax rates are configurable and not hardcoded to a fixed universal rate.
- Place of supply (state/location) and customer GSTIN are optional context captured in the quotation snapshot when applicable.
- Quotation is a commercial offer, not an accounting tax invoice.
- Client can request changes instead of directly changing pricing.
- Only authorized users (Admin, assigned Event Manager) can create or revise quotations.
- A quotation must belong to the correct Event and Client.
- Only the Client who owns the Event can accept, reject or request changes.
- Expired quotations cannot be accepted.
- A quotation revision must preserve the correct Event and Client relationship.
7. Payment Status

Payment statuses:

pending
paid
failed

Optional future status:

refunded

Normal flow:

pending
   ↓
paid

Failure:

pending
   ↓
failed

Optional refund:

paid
   ↓
refunded
### Payment Rules
- **Payment Lifecycle**: Payment starts as `created`, then moves to `pending` when the Razorpay gateway order is generated, and finally `paid` upon HMAC signature verification.
- **Payment Eligibility**: An advance payment can only be initiated if:
  - The Event belongs to the authenticated Client.
  - The Event status is `awaiting_payment`.
  - A valid accepted quotation exists for the event with `advanceAmount > 0`.
  - The required advance has not already been fully settled (`outstandingAdvance > 0`).
- **Gateway Security**: Creating a Razorpay order does not mean payment is successful. Frontend payment success is never treated as authoritative confirmation.
- **Idempotency & Order Reuse**: If a pending payment order already exists for an Event, Quotation, and matching amount, it is reused to prevent duplicate gateway orders.
- **Backend Verification**: The backend strictly verifies the Razorpay signature using HMAC-SHA256. In live environments, gateway transaction details (currency and paise amount) are validated directly with the Razorpay API before capture.
- **Authoritative Financial Calculations**:
  - `Advance Paid Amount` = Sum of all verified (`status: 'paid'`) advance transactions for the event and accepted quotation.
  - `Outstanding Advance` = `round2(Required Advance - Advance Paid Amount)`.
  - Neither the client nor browser calculations are trusted for financial balances.
- **Partial Advance Payments**:
  - The client may make partial milestone payments towards the required advance.
  - Partial amounts must be greater than zero and must not exceed the current `Outstanding Advance`.
  - If a partial payment is verified and `Outstanding Advance > 0`:
    - The quotation advance installment status is marked as `Partially Paid`.
    - The Event status remains `awaiting_payment` (the event is **NOT** confirmed).
- **Full Advance Settlement & Event Confirmation**:
  - When cumulative verified advance payments equal the `Required Advance` (`Outstanding Advance === 0`):
    - The quotation advance installment status is marked as `Paid`.
    - The Event status transitions from `awaiting_payment` to `confirmed`.
  - No event may be confirmed until the complete required advance has been received and verified.
- **Duplicate Transaction Safeguards**:
  - Subsequent verification requests for an already verified transaction return the authoritative state idempotently without double-counting amounts.
  - Repeated orders or stale revisions cannot alter historical verified records.
- **Subsequent Installment Eligibility**:
  - The Event must belong to the authenticated Client.
  - The quotation must be in `accepted` status and match the active revision.
  - Prerequisite: Initial required advance must be fully paid (`outstandingAdvance === 0`) and the Event must be in `confirmed` (or `in_progress`) status.
  - The installment index must be valid, not expired, and have an outstanding balance (`outstandingAmount > 0`).
  - Fully paid installments are not eligible for payment.
- **Installment-Level Payment & Partial Tracking**:
  - `Verified Paid Amount` = Sum of all verified (`status: 'paid'`) payments associated with that specific installment index.
  - `Outstanding Amount` = Scheduled Installment Amount − Verified Paid Amount.
  - Only verified provider payments reduce the outstanding balance. Failed, pending, or unverified attempts are excluded.
  - When partial payment is received on an installment, its status transitions to `Partially Paid`.
  - When cumulative verified payments equal the scheduled installment amount (`Outstanding Amount === 0`), the installment status transitions to `Paid`.
  - Paying an installment on a confirmed event preserves the Event's `confirmed` status at all times.
- **Due Date and Overdue Handling**:
  - Derived from the scheduled `dueDate` configured in the quotation builder `paymentPlan`.
  - If the due date passes while `Outstanding Amount > 0`, the installment is derived as overdue (`isOverdue: true`, status `Overdue`).
  - An installment becoming overdue does not cancel or invalidate an already-confirmed event.
- **Payment-Link Expiry Validation**:
  - Payment link expiry is enforced strictly on the backend by comparing against the installment's `expiryDate`.
  - Expired link payment attempts are rejected with HTTP 400 and exact message: `"This payment link expired on [expiry date]. Please contact the Admin for further assistance."`.
  - Verified payment history, amounts paid, and outstanding balances remain preserved.
  - Frontend renders a "Contact Admin" UI action button without introducing chat or messaging functionality.
- **Advance Expiry vs Later Installment Expiry**:
  - *Advance link expiry*: Rejects payment; preserves partial verified payments; leaves event in `awaiting_payment` (no invented automatic cancellation).
  - *Later installment expiry*: Rejects payment; leaves event in `confirmed` status; leaves contract balance intact; permits authorized Admin renewal.
- **Authorized Admin Link Renewal**:
  - Restricted strictly to authorized Admin (`role: 'admin'`). Client and manager requests return HTTP 403.
  - Authoritative balance recalculation: Replacement link requests strictly the current `Outstanding Amount` (e.g. ₹72,000, not the full scheduled ₹272,000).
  - Preserves original installment due date.
  - Assigns a valid future expiry date.
  - Previous link history is preserved: existing link status transitions to `replaced`, maintaining link ID, URL, expiry, and creation timestamp.
  - Duplicate renewal protection: Renewal is rejected if a valid, unexpired active link already exists for the installment.
  - Fully paid installments cannot be renewed.
  - Generates replacement link and delivers renewal notification with new link and expiry date to the Client via `EmailService`.
- **Payment Milestone 2 Extension — Full Payment, Excess Allocation & Financial Validation**:
  - **Three Client Payment Choices**:
    - **Option A (Pay Current Installment / Advance)**: Pays strictly the current outstanding balance of the active eligible installment (`outstandingAmount` or `outstandingAdvance`). If the customer has already paid part of the advance (e.g. ₹1,00,000 of ₹2,00,000), Option A automatically deducts the already paid amount in the backend too, ensuring the payable amount is strictly the remaining balance (₹1,00,000). If the original undeducted scheduled amount is submitted under Option A, the backend automatically deducts the previously paid amount; any amount exceeding the remaining balance under Option A without Option B (custom) is rejected with clear validation identifying the outstanding balance, required amount, and amount already paid.
    - **Option B (Pay Custom Amount)**: Allows entering an arbitrary custom amount. The amount can exceed the current installment's outstanding balance, up to the total outstanding quotation balance. Excess amounts automatically cascade to settle subsequent installments in configured schedule order.
    - **Option C (Pay Full Remaining Balance)**: Settles all remaining installments across the entire quotation in a single transaction. Available only when total quotation outstanding balance > 0, the quotation is eligible, and the schedule is consistent. The payable amount is calculated authoritatively by the backend (`finalAmount - totalVerifiedPaidAmount`).
  - **Automatic Installment Allocation Order**:
    - Verified payment amounts are allocated strictly in the order of installments configured in the quotation's `paymentPlan`.
    - Earliest unpaid installment is settled first; remaining funds cascade to the next installment until the verified amount is fully allocated.
    - The client is never asked to manually allocate amounts between installments.
    - Historical allocations are immutable and durable; subsequent balance calculations aggregate verified allocations without rewriting historical records.
  - **Single Provider Transaction Identity**:
    - A payment covering multiple installments generates exactly ONE Razorpay Order and ONE `Payment` document.
    - Artificial duplicate transactions are strictly prohibited.
    - `Payment.allocations` stores the itemized distribution: `[{ installmentIndex, installmentId, installmentTitle, allocatedAmount }]`.
  - **Quotation Schedule Consistency Validation**:
    - Before permitting full-quotation settlement or cross-installment excess allocation, the backend validates that $\sum \text{installment.amount} == \text{finalAmount}$.
    - If the schedule total differs from `finalAmount`, cross-installment and full-balance settlement are blocked with HTTP 400 and an error identifying the exact schedule total and quotation final amount.
    - Neither the frontend nor the backend silently adjusts installment or quotation amounts.
  - **Overpayment Prevention**:
    - Total Outstanding = `finalAmount` − Cumulative verified payments across all installments.
    - Any payment request where `requestedAmount > Total Outstanding` is rejected with HTTP 400: `"Payment amount cannot exceed the total outstanding balance of ₹[amount]."`.
    - Razorpay orders are never created for overpayment amounts.
  - **Preservation of Event Confirmation Rule**:
    - The event transitions from `awaiting_payment` to `confirmed` strictly when cumulative verified payments allocated to the advance installment (index 0) equal the required advance (`outstandingAdvance === 0`).
    - An excess payment or full payment confirming the advance triggers event confirmation immediately in the same verification call, without requiring a second payment.
    - If a payment leaves the advance partially unpaid, the event remains `awaiting_payment`.

- **Payment Milestone 3 — Automated Payment Reminders, Expiry Warnings & Scheduling Rules**:
  - **Eligibility Verification**:
    - Reminders are sent only for installments belonging to confirmed events and accepted quotations matching the active revision.
    - Advance payments on unconfirmed events (`awaiting_payment`) are eligible for due-date reminders if an outstanding balance exists.
    - Reminders require an outstanding balance (`outstandingAmount > 0`), a valid due date or active payment link, and an eligible Client.
  - **Due-Date Reminder Timing & Catch-up Policy**:
    - Due-date reminder emails are sent **two days before** the scheduled installment due date (reminder window: $T_{\text{due}} - 2 \text{ days}$).
    - Catch-up policy: If a scheduler job initializes and finds overdue installments whose reminder window passed, it **skips** sending old reminders to prevent a barrage of stale emails.
  - **Payment-Link Expiry Warning Timing**:
    - Expiry warnings are sent **one day (within 24 hours) before** the current active Razorpay Payment Link's expiry date ($T_{\text{expiry}} - 24 \text{ hours}$).
    - The warning must reference strictly the current valid, active link. Expired, cancelled, or superseded links are never sent as active payment links.
  - **Authoritative Balance Recalculation**:
    - Reminder amounts are recalculated at runtime using authoritative backend payments data.
    - If an installment is partially paid (e.g. ₹2,00,000 paid towards a ₹2,72,000 installment), the reminder explicitly presents the **outstanding balance of ₹72,000**, never the original scheduled amount of ₹2,72,000.
    - Unverified, failed, or pending transactions are excluded from calculations.
  - **Just-In-Time Verification & Fully Paid Installments**:
    - Immediately prior to sending any reminder, the system rechecks the installment balance.
    - If the installment was settled just before dispatch, the reminder is skipped and recorded with status `skipped` and skip reason `"Settled before sending"`.
    - Fully paid installments (`outstandingAmount === 0`) never receive payment reminders or expiry warnings.
  - **Renewed Payment Link Behavior**:
    - When an Admin renews an expired payment link, the previous link is archived with status `replaced`.
    - Future expiry warnings evaluate only the **replacement link** using its new expiry date and the current outstanding balance.
    - Expired links are never warned as payable.
  - **Persistent Reminder Deduplication**:
    - Deduplication is guaranteed durably in MongoDB through the `PaymentReminderLog` collection with a unique index on `dedupKey`.
    - Due-date dedup key: `due_date:<quotationId>:r<rev>:inst<index>:<due_date_iso>`.
    - Link expiry dedup key: `link_expiry:<quotationId>:r<rev>:inst<index>:<paymentLinkId>:<expiry_date_iso>`.
    - Duplicate job executions, concurrent worker processes, and process restarts cannot generate duplicate reminders for the same window.
  - **Separation of Email Delivery State from Financial State**:
    - Email delivery failures (SMTP timeouts, authentication errors, provider downtime) are tracked in `PaymentReminderLog` with status `failed` and diagnostic failure reasons.
    - An email failure **never** alters installment amounts, paid balances, payment records, quotation statuses, or event statuses.

8. Event Manager Assignment Rules

Event Manager assignment happens after Event confirmation.

Flow:

Event
  ↓
confirmed
  ↓
Admin
  ↓
Assign Event Manager
  ↓
eventManagerId

Rules:

Only Admin can assign an Event Manager.
Only a user with role event_manager can be assigned.
Event Manager cannot assign themselves.
Event Manager cannot assign another Event Manager.
Event Manager can access only Events assigned to them.
Admin can change the assigned Event Manager when authorized.
9. Work Requirement Status

Recruitment lifecycle:

draft
  ↓
open
  ↓
selection_in_progress
  ↓
filled
  ↓
closed

A requirement may also become:

cancelled
Status Definitions
draft

Event Manager has created the requirement but has not announced it.

open

The work opportunity is available to eligible Workers.

Workers can respond:

Interested
Not Interested
selection_in_progress

The response collection stage is complete and the Selection Engine is selecting Workers.

filled

The required number of Workers has been selected.

Example:

Required = 20
Selected = 20
closed

Recruitment is complete and no further responses or selections should occur.

cancelled

The requirement is cancelled.

10. Work Requirement Rules
Work Requirement must belong to a valid Event.
Work Requirement can be created only for an Event Manager's assigned Event.
Event Manager creates and announces the requirement.
Event Manager does not manually select Workers.
Workers respond to open opportunities.
Only eligible Workers can respond.
Selection happens through the backend Selection Engine.
A requirement should become filled when the required number of Workers has been selected.
A filled or closed requirement should not accept new normal responses.
11. Worker Response Status

Possible statuses:

not_responded
interested
not_interested
selected
not_selected

Normal flow:

not_responded
      ↓
interested

or:

not_responded
      ↓
not_interested

After selection:

interested
    ↓
selected

or:

interested
    ↓
not_selected
Worker Response Rules
Worker can respond only while the recruitment is open.
Worker chooses Interested or Not Interested.
Only interested Workers enter the selection process.
Worker cannot select themselves.
Worker cannot select another Worker.
Event Manager cannot manually select a Worker.
Selection results are produced by the backend Selection Engine.
12. Worker Selection Rules

The Selection Engine considers eligible interested Workers.

Minimum eligibility:

role = worker
workerType matches requirement
isActive = true
isAvailable = true
responseStatus = interested

Selection factors:

Worker Type
Availability
Distance from Event
Performance Score
Required Worker Count

Distance and performance are the main ranking factors.

Selection flow:

Interested Workers
       ↓
Eligibility Check
       ↓
Distance Calculation
       ↓
Performance Evaluation
       ↓
Ranking
       ↓
Select Required Number
       ↓
Save Results
       ↓
Notify Workers

Rules:

Only interested Workers are considered.
Worker type must match the requirement.
Inactive Workers are excluded.
Unavailable Workers are excluded.
Distance is calculated using Worker and Event location.
Performance score is used for ranking.
The system selects only the required number of Workers.
Selected Workers receive selected.
Eligible interested Workers who are not selected receive not_selected.
Event Manager only views the selection result.
Event Manager does not manually select Workers.
13. Confirmed Work

After a Worker is selected:

selected
    ↓
confirmed_work

Confirmed Work means the Worker is officially expected to attend the Event.

The Worker can view:

Event
Date
Location
Worker Type
Reporting Time
Wage information
Work details

A Worker must not be considered as confirmed merely because they showed interest.

14. Attendance Status

Attendance statuses:

not_started
checked_in
checked_out
absent

Normal flow:

not_started
    ↓
checked_in
    ↓
checked_out

Alternative:

not_started
    ↓
absent

Rules:

Only Workers with confirmed work can record attendance.
Worker cannot check out before checking in.
Attendance timestamps should be generated by the backend/system.
Worker cannot directly modify attendance records.
Authorized Event Manager can review Event attendance.
Admin can review attendance where permitted.
15. Performance Rules

Worker performance uses a score:

1 - 5

Example:

5 = Excellent
4 = Very Good
3 = Average
2 = Poor
1 = Very Poor

Rules:

Performance is recorded after completed work.
Event Manager can record the Worker performance score for an assigned Event.
Worker cannot modify their own performance score.
Performance can influence future Worker selection.
Performance can influence the performance bonus.
16. Worker Payment Status

Worker Payment statuses:

pending
approved
paid

Normal flow:

pending
   ↓
approved
   ↓
paid

Worker wage formula:

Base Wage
+ Travel Allowance
+ Performance Bonus
= Final Wage

Rules:

Wage is calculated by the backend.
Worker cannot modify wage values.
Travel allowance is calculated by the backend.
Performance bonus is calculated by the backend.
Worker can view only their own payment records.
Event Manager can manage payment records for assigned Events.
Admin can view system-wide Worker Payments.
17. Event Manager Earnings

Event Manager earnings are separate from Worker Payments.

Formula:

Base Salary
+ Event Incentive
= Manager Earnings

Rules:

Admin controls salary and incentive configuration.
Event Manager can view their own earnings.
Event Manager cannot modify their own salary or incentive rules.
18. Expense Rules

Expenses belong to an Event.

Possible categories:

Food Materials
Transport
Decoration Materials
Equipment
Other

Rules:

Expense must belong to a valid Event.
Event Manager can create/manage expenses for assigned Events according to permissions.
Admin can view all Event expenses.
Expense amount must be validated on the backend.
Expense must not belong to an unrelated Event.
19. Notification Status

Notifications use:

unread
read

Flow:

unread
   ↓
read

Rules:

Notification belongs to a User.
Users can mark their own notifications as read.
Users cannot modify another User's notifications.
20. Message Rules

Messages belong to an Event.

Initial communication:

Client ↔ Admin

After Event Manager assignment:

Client ↔ Event Manager

Internal Event communication:

Event Manager ↔ Selected Workers

Rules:

Users must be authorized for the Event.
Workers cannot directly communicate with unrelated Clients.
Realtime messaging uses Socket.IO.
Message authorization must be checked on the backend.
21. Feedback Rules

Feedback is available only after:

Event status = completed

Flow:

No Feedback
     ↓
Feedback Submitted

Rules:

Only the Client who owns the Event can submit feedback.
Normally one Feedback record is allowed per Event.
Rating must be within the defined range.
Feedback cannot be submitted before Event completion.
22. Gallery Rules

Gallery items belong to an Event.

Rules:

Gallery image must reference a valid Event.
Only authorized users can upload Event images.
Uploaded images must be associated with the correct Event.
Users cannot attach images to unrelated Events.
Image files should use approved external storage.
23. Service Rules

Services are globally managed by Admin.

Service status:

active
inactive

Rules:

Admin creates Services.
Admin updates Service pricing.
Admin activates/deactivates Services.
Clients can select active Services.
Inactive Services should not be available for new Event requests.
Historical quotation amounts must remain unchanged.
24. Event Confirmation Rule

The Event must not become confirmed simply because the Client accepts the quotation.

Correct flow:

Quotation
   ↓
Client Accepts
   ↓
awaiting_payment
   ↓
Advance Payment
   ↓
Backend Payment Verification
   ↓
Payment = paid
   ↓
Event = confirmed

The backend performs the final status update.

25. Event Manager Recruitment Rule

Worker recruitment should begin only after:

Event = confirmed

and:

Event Manager assigned

Flow:

Confirmed Event
      ↓
Event Manager Assigned
      ↓
Create Work Requirement
      ↓
Open Recruitment
      ↓
Workers Respond
      ↓
Selection In Progress
      ↓
Selection Engine
      ↓
Selected / Not Selected
      ↓
Confirmed Work
26. Event Completion Rule

An Event can move to:

completed

only after the Event work has finished.

After completion:

Attendance can be finalized.
Worker performance can be recorded.
Worker wages can be calculated.
Worker payments can be processed.
Client feedback becomes available.
Gallery can be finalized.
Admin reports can include the Event.
27. Role Responsibilities
Admin

Admin can:

Manage users
Create Event Managers
Create Workers
Manage Services
Manage pricing
View all Events
Assign Event Managers
View quotations
View payments
View expenses
View reports
Client

Client can:

Create Event requests
View own Events
View quotations
Accept/reject/request quotation changes
Make payments
Communicate with Admin
Communicate with assigned Event Manager
Submit feedback after Event completion
Event Manager

Event Manager can:

View assigned Events
Create Worker requirements
Announce recruitment
View Worker responses
View Selection results
Manage Event operations
Manage Worker payment records for assigned Events
Record Worker performance
Communicate with Client
Communicate with selected Workers
Create Workers according to approved rules

Event Manager cannot:

Create Admin
Create Event Manager
Modify global Service pricing
Access unrelated Events
Manually select Workers
Worker

Worker can:

View available work opportunities
Respond Interested / Not Interested
View selection results
View Confirmed Work
Check In / Check Out
View own earnings
View own notifications
View own performance where permitted

Worker cannot:

Select themselves
Select another Worker
Modify wages
Modify performance
Access another Worker's earnings
28. Financial Source of Truth

The backend is the source of truth for:

Service pricing
Quotation amounts
Advance amount
Remaining amount
Payment status
Worker wage
Travel allowance
Performance bonus
Final Worker payment
Event expenses
Revenue
Profit

The frontend must never be trusted for these values.

29. Authorization Source of Truth

The backend is the source of truth for authorization.

Every protected operation must verify:

Authentication
     ↓
Role
     ↓
Resource Ownership
     ↓
Business Rules

Examples:

Client → Own Event ✅
Client → Other Client Event ❌

Manager → Assigned Event ✅
Manager → Unassigned Event ❌

Worker → Own Earnings ✅
Worker → Other Worker Earnings ❌
30. Critical Business Rules

The following rules are mandatory:

Only four roles exist:
Admin
Client
Event Manager
Worker
Client initially communicates with Admin.
Admin assigns the Event Manager after Event confirmation.
Admin can create Workers.
Event Manager can create Workers.
Event Manager announces Worker recruitment.
Workers respond Interested / Not Interested.
Event Manager does not manually select Workers.
The backend Selection Engine selects eligible Workers.
Selection considers:
Worker Type
Availability
Distance
Performance
Only interested Workers enter the selection process.
Event becomes confirmed only after the required advance payment is verified by the backend.
Financial calculations are performed on the backend.
Payment verification is performed on the backend.
Worker wages are calculated on the backend.
Worker cannot modify wage or performance data.
Client can access only their own Events and related resources.
Event Manager can access only assigned Events.
Worker can access only their own work and earnings.
Attendance is available only for confirmed Work.
Feedback is available only after Event completion.
AI assists the system but does not control critical financial operations.
WhatsApp, if implemented, is only a notification channel.
Actual recruitment responses happen inside the EventOps application.
Creating a Worker does not automatically assign or select that Worker for an Event.
Event Manager recruitment actions apply only to Events assigned to that Manager.

# 31. Status Transition Summary

## Event

```text
requested
    ↓
quoted
    ↓
awaiting_payment
    ↓
confirmed
    ↓
in_progress
    ↓
completed

Cancellation:

requested → cancelled
quoted → cancelled
awaiting_payment → cancelled
confirmed → cancelled
Quotation
draft
  ↓
sent
  ↓
awaiting_approval
  ├── accepted
  ├── changes_requested
  └── rejected

Expired quotation:

awaiting_approval → expired
Payment

Normal:

pending → paid

Failure:

pending → failed

Optional future refund:

paid → refunded
Work Requirement
draft
  ↓
open
  ↓
selection_in_progress
  ↓
filled
  ↓
closed

Cancellation:

draft → cancelled
open → cancelled
Worker Response
not_responded
      ↓
interested
      ↓
selected

or:

not_responded
      ↓
interested
      ↓
not_selected

Alternative response:

not_responded → not_interested
Confirmed Work
selected
    ↓
confirmed_work
Attendance

Normal:

not_started
    ↓
checked_in
    ↓
checked_out

Absent:

not_started → absent
Worker Payment
pending
   ↓
approved
   ↓
paid
Notification
unread
   ↓
read
Feedback
No Feedback
     ↓
Feedback Submitted
32. Final Rule

The backend must enforce all status transitions.

The frontend may display and request a status change, but it must never be trusted to decide whether a transition is valid.

Every status transition must be checked against:

Current status
User role
Resource ownership
Business rules
Required conditions

33. Database Safety, Test Isolation & Data Preservation Rules

Rule 1 — Absolute Preservation of Real Database:
The actual development or production database (`eventops`) must NEVER be cleared, wiped, dropped, or deleted by automated tests or test cleanup scripts.
User-created events, quotations, client accounts, admin users, and business records are sacred and must remain intact.

Rule 2 — No Dummy or Test Data in Real Database:
Test scripts, unit/integration suites, and mock data generators must NEVER insert temporary, test, or dummy records into the actual database.

Rule 3 — Strict Test Database Isolation:
All automated tests must run against a completely separate, dedicated test database (e.g. `eventops_test`).
Test configuration must verify that the connection string specifically targets a test database before any test suite executes.

Rule 4 — Complete Teardown of Test Data:
All mock and test data created during test runs must be dropped and wiped completely from the test database upon test completion (`cleanupTestDatabase()`).
No test data may remain lingering in any database after test execution.

---

# 34. Razorpay Payment Link Synchronization, Webhooks & Callback Reconciliation

## Overview

Clients can pay for EventOps quotations either directly via the in-app Razorpay modal (Orders API) or externally via Razorpay Payment Links (`https://rzp.io/...`). To prevent synchronization lag and ensure MongoDB authoritative state is kept strictly consistent, EventOps employs a dual-channel synchronization mechanism:

1. **Server-to-Server Webhooks (`POST /api/webhooks/razorpay`)**: Reliable, asynchronous gateway-to-backend notification channel that operates independently of the client's browser session.
2. **Client Return Callback & Reconciliation (`GET /client/payment-return` -> `POST /api/payments/reconcile-link`)**: User-facing return route that triggers authoritative backend verification upon redirection from Razorpay.

## Webhook Signature & Security Rules

- **Raw Request Body Verification**: The webhook payload signature (`X-Razorpay-Signature`) is verified cryptographically using HMAC-SHA256 with the raw, unmodified request bytes and the dedicated `RAZORPAY_WEBHOOK_SECRET`.
- **Constant-Time Comparison**: Signatures are compared using `crypto.timingSafeEqual` to prevent timing attacks.
- **Dedicated Webhook Secret**: The webhook secret is strictly separated from `RAZORPAY_KEY_SECRET`. Fallbacks are disallowed.
- **Rejection of Invalid Requests**: Missing, malformed, or invalid signatures are rejected immediately with HTTP 400 without modifying any database records.

## Supported Payment Link Events & Behavior

1. `payment_link.paid`:
   - Validates provider payment details directly with Razorpay (`payments.fetch`).
   - Reconciles incremental paid amounts idempotently without double-counting previously recorded partial payments.
   - Updates target payment record to `paid` and link status to `paid`.
   - Transitions event to `confirmed` if full advance payment is settled.
2. `payment_link.partially_paid`:
   - Validates the incremental provider transaction.
   - Allocates the incremental payment across the installment schedule.
   - Updates target installment status to `Partially Paid`.
   - **Crucial Rule**: Does NOT mark event confirmed. The event remains `awaiting_payment` until the full required advance is received.
3. `payment_link.expired`:
   - Updates the stored payment's `linkStatus` to `expired`.
   - Does NOT modify verified financial balances or falsely mark installments paid.
4. `payment_link.cancelled`:
   - Updates `linkStatus` to `cancelled`.
   - Does NOT alter financial balances.
5. Unsupported / Other Events:
   - Returns `{ received: true, status: 'ignored' }` without altering state.

## Webhook & Payment Idempotency Rules

- **Event-Level Deduplication**: Incoming events are tracked via the `WebhookReceipt` collection with unique index on `eventId`. Duplicate deliveries return `{ received: true, status: 'duplicate' }` without re-processing.
- **Transaction-Level Deduplication**: The unique provider transaction identifier (`razorpayPaymentId`) is checked before credit. If a payment with that ID has already been recorded as `paid`, processing halts with `{ received: true, status: 'already_paid' }`.
- **Cumulative vs. Incremental**: Webhooks and reconciliations use the individual payment entity's incremental amount (`payment.entity.amount`) rather than cumulative `amount_paid`, completely eliminating double-counting.

## Link Mapping & Fallback Rules

- The incoming `payment_link.id` is matched strictly against persisted payment records via `razorpayPaymentLinkId`.
- Unmapped links are logged safely and return `{ received: true, status: 'unmapped' }` without guessing or crediting arbitrary quotations, installments, or events.

## Event Confirmation & Subsequent Installments

- **Advance Requirement**: An event in `awaiting_payment` transitions to `confirmed` if and only if the cumulative verified payments for installment 0 equal or exceed the required advance amount (`quotation.advanceAmount`).
- **Subsequent Installments**: Payments made against subsequent installments update the specific installment status to `Paid` (or `Partially Paid`), reduce the remaining quotation balance, and strictly preserve the event's existing `confirmed` status. Under no circumstance does an installment webhook revert a confirmed event.

## Automated Payment Reminders & Background Worker Rules

### 1. Payment Due-Date Reminders
- **Eligibility Window**: Installments due within the next 2 days, including today (`0 <= daysUntilDue <= 2`).
- **Outstanding Balance Gate**: Installment must have `outstandingAmount > 0` (`status !== 'paid'`).
- **Advance Gating**: For subsequent installments (index > 0), the event must already be confirmed with verified advance payment.
- **Overdue Installments Policy**: Past-due installments (`daysUntilDue < 0`) are excluded from normal due-date reminders to prevent flooding clients with stale reminders.

### 2. Payment Link Expiry Warnings
- **Eligibility Window**: Active, unexpired payment links expiring within the next 24 hours (`0 < hoursUntilExpiry <= 24`).
- **Outstanding Balance Gate**: The installment associated with the payment link must have `outstandingAmount > 0`.
- **Status Gate**: Link must be in `active` status. Expired, cancelled, or superseded links are never warned.

### 3. BullMQ Job Scheduling & Processing
- **Queue Separation**:
  - `payment-reminder-scan`: Discovers candidate records and reserves atomic MongoDB records. Concurrency: 1.
  - `payment-reminder-email`: Sends individual emails and updates persistent delivery status. Concurrency: 5.
- **Configured Interval**: Recurring scan runs via BullMQ JobScheduler at interval defined by `REMINDER_CHECK_INTERVAL_MS` (default: 3600000ms / 1 hour).
- **In-Process Schedulers Prohibited**: No `setInterval` loop runs in the HTTP server process. All scheduling belongs to BullMQ and the background worker (`src/workers/paymentReminderWorker.ts`).

### 4. Authoritative Just-in-Time (JIT) Revalidation
- Before email dispatch, the background worker re-reads the latest payment state and quotation schedule directly from MongoDB.
- If the client paid the installment while the job was in the Redis queue, the worker skips email sending, records `status: 'skipped'` in `PaymentReminderLog`, and stops processing.

### 5. Persistent Deduplication & Idempotency
- **Source of Truth**: MongoDB `PaymentReminderLog.dedupKey` remains the durable authority for reminder history.
- **Atomic Reservation**: The scan worker attempts to create `PaymentReminderLog` with `status: 'pending'` before enqueuing. Duplicate key error (`E11000`) detects previous attempts and prevents queue flooding.
- **Deterministic Job IDs**: BullMQ email jobs derive their ID deterministically: `email_<sha256(dedupKey)[0..32]>`.
- **Retry Policy**: 3 attempts with exponential backoff (5s initial delay). Transient SMTP or Redis failures do not mark reminders as sent.
- **Admin Visibility**: `GET /api/payments/event/:eventId/reminders` and `GET /api/payments/schedule/:eventId` reflect the real-time status of pending, sent, skipped, or failed reminders.

## Event Manager Operations Module — Milestone 1: Account Creation, Login & Dashboard Access

### 1. Account Creation & Role Assignment
- **Authority**: Only authenticated users with `role: 'admin'` are authorized to create Event Manager accounts via `POST /api/users/event-managers`.
- **Backend Role Enforcement**: The `event_manager` role is strictly enforced by the backend handler. Untrusted client input or public registration forms are rejected and cannot inject the `event_manager` role.
- **Credential Storage**: Initial passwords must be at least 6 characters and are hashed using bcrypt (10 salt rounds) before persistence. Raw passwords are never stored, logged, or returned in API responses.
- **Account State**: Created accounts are provisioned with `isActive: true` and `emailVerified: true`, enabling immediate login without unverified state blocks.
- **Business ID**: Generated atomically using the counter collection with range `1000–1999` reserved for event managers.

### 2. Authentication & Role-Based Redirection
- **Shared Login Gateway**: Event Managers authenticate via the unified `/login` flow using `POST /api/auth/login`.
- **Role-Based Routing**:
  - `admin` -> `/admin`
  - `client` -> `/client`
  - `event_manager` -> `/manager`
  - `worker` -> `/worker`
- **Session Verification**: The JWT token issued contains `{ id, email, role }` and must be validated by the `authenticate` middleware on all protected API routes.

### 3. Route Protection & Authorization Boundaries
- **Manager Route Guard**: The `/manager` layout and nested routes are accessible strictly to authenticated users with `role: 'event_manager'`.
- **Admin Isolation**: Event Managers are strictly forbidden from accessing Admin-only routes (`/admin`, `/admin/managers`, `/admin/events`, etc.). Attempted direct URL navigation redirects to `/manager` or renders 403 Forbidden.
- **Unauthorized Roles Denied**: Unauthenticated visitors are redirected to `/login`. Clients and Workers are blocked from `/manager` routes.
- **Backend RBAC Verification**: Frontend route guards are supplemented by backend `authorize('event_manager')` or `authorize('admin')` middleware; client-side tokens are never trusted as sufficient authorization alone.

### 4. Manager Dashboard & Initial State
- **Welcome & Identification**: The Manager Dashboard at `/manager` displays the authenticated manager's name, email, business ID, and visible "Event Manager" badge.
- **Empty State Policy**: When an Event Manager has zero assigned events, the dashboard presents a clear, non-fabricated empty state:
  > *"No events have been assigned to you yet. Your assigned events will appear here when the Admin assigns them."*
- **No Premature Feature Fabrication**: Fake events, fabricated counts, or unassigned event data are strictly prohibited. Event assignment, worker selection, and attendance controls are deferred to subsequent milestones.
- **Recoverable Errors & Loading States**: The dashboard provides explicit loading indicators and a retry/refresh control for resilience against network glitches.

---

## Event Manager Operations Module — Milestone 2: Event Manager Assignment & Assigned Events Dashboard

### 1. Assignment Eligibility & Validation Rules
- **Authority**: Only authenticated users with `role: 'admin'` are authorized to retrieve eligible managers and assign an Event Manager (`GET /api/admin/events/:id/available-managers`, `PATCH /api/admin/events/:id/manager`).
- **Event Status Eligibility**: Assignment is permitted strictly when event `status` is in `['confirmed', 'in_progress']`. Requests for events in `requested`, `quoted`, `awaiting_payment`, `completed`, or `cancelled` statuses are rejected with 400 Bad Request.
- **Manager Account Eligibility**:
  - Account must exist and possess `role: 'event_manager'`.
  - Account must have `isActive: true`.
  - Pending-invitation accounts (where `invitationTokenHash` exists) are strictly ineligible and excluded from available manager lists and assignment validation.
  - Inactive or disabled accounts cannot receive assignments.
- **Availability & Overlapping-Event Rules**:
  - An Event Manager cannot be assigned to two overlapping events on the same date.
  - Overlap is defined as `(startA < endB) && (endA > startB)` for active assigned events on that date.
  - Completed and cancelled events do not create conflict blocks.
- **Reassignment Rules**:
  - Authorized Admins can reassign an event to another eligible manager.
  - Reassignment to the same already-assigned manager is idempotent.
  - The new manager must satisfy all eligibility and overlap checks.

### 2. Assignment Persistence & Concurrency Control
- **Atomic Persistence**:
  - Assignment uses atomic conditional database operations: `Event.findOneAndUpdate({ _id, status: { $in: ['confirmed', 'in_progress'] } }, { eventManagerId }, { new: true })`.
  - If event status changed concurrently out of confirmed/in-progress, update returns null and fails safely.
- **Post-Write Collision Verification**:
  - Immediately following atomic update, service checks for simultaneous concurrent assignments to the same manager during the overlapping window.
  - If a race condition collision is detected, atomic rollback restores prior manager assignment and rejects request with 409 Conflict.

### 3. Manager Portal Authorization & Data Isolation
- **Authentication Context Ownership**: Manager identity is extracted strictly from verified JWT credentials (`req.user.id`).
- **Strict Data Isolation**:
  - `/api/manager/dashboard` calculates counts (`totalAssigned`, `upcoming`, `ongoing`, `completed`) strictly for `eventManagerId: req.user.id`.
  - `/api/manager/events` queries and returns events where `eventManagerId: req.user.id`.
  - `/api/manager/events/:id` validates that the retrieved event's `eventManagerId` matches `req.user.id`. If a manager tries to view another manager's event by manipulating URL parameters, backend returns 403 Forbidden.
- **Safe Operational Data Projection**:
  - Client contact information (`name`, `email`, `phone`), schedule, guest count, location address/coordinates, selected services, and operational notes are returned for event execution.
  - Sensitive financial figures (profit margins, quotation totals, payment transactions, Stripe/Razorpay tokens) and worker payroll are not exposed to the manager.
- **Work Requirements Management Scope**:
  - Work Requirements creation, worker recruitment, attendance, and wages are strictly deferred to subsequent milestones and remain prohibited in Milestone 2.