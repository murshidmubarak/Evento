# EventOps ERP - API Design

## 1. API Base URL

All backend APIs use:

/api


# 2. Authentication APIs

## Register Client

POST /api/auth/register

Access:
Public

Purpose:
Create a new Client account.

Request:

{
  name,
  email,
  password,
  phone
}

Role created:

client


## Login

POST /api/auth/login

Access:
Public

Purpose:
Authenticate any existing user.

Request:

{
  email,
  password
}

Response includes:

- authenticated user
- role
- authentication information


## Logout

POST /api/auth/logout

Access:
Authenticated users


## Get Current User

GET /api/auth/me

Access:
Authenticated users

Purpose:
Return the currently authenticated user.


## Forgot Password

POST /api/auth/forgot-password

Access:
Public


## Reset Password

POST /api/auth/reset-password

Access:
Public with valid reset token


# 3. User APIs

Base:

/api/users


## Get Users

GET /api/users

Access:
Admin

Supports filters:

- role
- workerType
- isActive
- availability


## Get User

GET /api/users/:id

Access:
Admin

Users can access their own profile through profile-specific APIs.


## Create Worker

POST /api/users/workers

Access:

- Admin
- Event Manager

Purpose:
Create a Worker account.

Worker fields may include:

- name
- email
- phone
- workerType
- location
- baseWage
- isAvailable

Rules:

- Admin can create Workers.
- Event Manager can create Workers according to their permitted staffing scope.
- Created user must have role = worker.
- Event Manager cannot create Admin accounts.
- Event Manager cannot create Event Manager accounts.
- Worker creation must be validated on the backend.
- Event Manager cannot use this endpoint to manually assign the Worker to an Event.


## Create Event Manager

POST /api/users/event-managers

Access:
Admin

Purpose:
Create an Event Manager account.

Only Admin can create Event Manager accounts.


## Update Worker

PATCH /api/users/:id

Access:

- Admin
- Event Manager for permitted Workers

Protected fields:

- role
- performanceScore

Rules:

- Worker cannot modify protected fields.
- Event Manager cannot change a Worker's role.
- Event Manager cannot modify performanceScore.
- Base wage changes must follow approved wage rules.


## Activate / Deactivate User

PATCH /api/users/:id/status

Access:
Admin


# 4. Profile APIs

## Get My Profile

GET /api/profile

Access:
Authenticated users


## Update My Profile

PATCH /api/profile

Access:
Authenticated users

Users can update only allowed profile fields.

Protected fields cannot be modified by unauthorized users.


# 5. Event APIs

Base:

/api/events


## Create Event Request

POST /api/events

Access:
Client

Purpose:
Create a new Event request.

Request:

```json
{
  "title": "My Wedding",
  "eventType": "Wedding",
  "date": "2026-12-01",
  "startTime": "10:00",
  "endTime": "18:00",
  "location": { "address": "123 Main St" },
  "guestCount": 200,
  "selectedServices": [
    {
      "serviceId": "651a...cde",
      "preferences": {
        "style": "traditional",
        "items": ["A", "B"]
      }
    }
  ]
}
```

Initial status:

requested


## Get My Events

GET /api/events

Access:

Client:
Only own Events

Event Manager:
Only assigned Events

Admin:
All Events


## Get Event

GET /api/events/:id

Access:

- Client who owns Event
- Event Manager assigned to Event
- Admin


## Update Event

PATCH /api/events/:id

Access:
Authorized users only

Rules:

Users cannot update fields they do not own or control.


## Cancel Event

PATCH /api/events/:id/cancel

Access:
Authorized users according to business rules


## Upload Service Reference Images

POST /api/events/:id/service-reference-images

Access:
Client who owns the Event

Purpose:
Upload reference images for a specific selected service (e.g., Decoration).

Request:
multipart/form-data
- serviceId: (string) The ID of the selected service.
- images: (file[]) Up to 5 image files (JPEG, PNG, WebP). Max 5MB per file.

Response:
```json
{
  "success": true,
  "data": {
    "eventId": "...",
    "serviceId": "...",
    "referenceImages": [
      {
        "url": "https://...",
        "publicId": "...",
        "fileName": "stage.jpg",
        "mimeType": "image/jpeg"
      }
    ]
  }
}
```

## Update Event Status

PATCH /api/events/:id/status

Access:

- Admin
- Authorized Event Manager according to allowed status transitions

Backend must validate the status transition.


# 6. Service APIs

Base:

/api/services


## Create Service

POST /api/services

Access:
Admin


## Get Services

GET /api/services

Access:
Authenticated users where appropriate


## Get Service

GET /api/services/:id

Access:
Authenticated users where appropriate


## Update Service

PATCH /api/services/:id

Access:
Admin


## Activate / Deactivate Service

PATCH /api/services/:id/status

Access:
Admin


# 7. Quotation APIs

Base:

/api/quotations


## Create Quotation

POST /api/quotations

Access:
Admin / authorized staff (Event Manager)

Purpose:
Create a quotation (new or revision) for an Event. If a quotation thread already exists for the event, a new revision is safely generated.

Request Body:
{
  eventId,
  items: [
    { serviceId, quantity, unitPrice, requirements }
  ],
  discount,
  tax: {
    taxType,         // 'none' | 'gst' | 'vat' | 'custom'
    taxRate,         // e.g. 18, 5, 12, 0
    gstTreatment,    // 'intra_state' | 'inter_state' | 'exempt' | 'none'
    placeOfSupply,   // optional string
    customerGstin    // optional string
  },
  advanceAmount,
  validUntil,
  notes,
  terms
}

Backend calculates:

- subtotal (sum of item amounts)
- discount (validated)
- taxableAmount (subtotal - discount)
- tax details:
  - taxType
  - taxRate
  - gstTreatment
  - taxableAmount
  - taxAmount
  - cgst
  - sgst
  - igst
  - placeOfSupply
  - customerGstin
- finalAmount (taxableAmount + taxAmount)
- advanceAmount (validated <= finalAmount)
- remainingAmount (finalAmount - advanceAmount)
- revision number


## Get Quotations

GET /api/quotations

Access:

Admin:
All quotations

Client:
Only quotations belonging to their Events

Event Manager:
Only quotations for assigned Events where business rules permit


## Get Quotation

GET /api/quotations/:id

Access:
Authorized users


## Update Quotation

PATCH /api/quotations/:id

Access:
Authorized quotation creator/staff


## Send Quotation

PATCH /api/quotations/:id/send

Access:
Authorized staff

Status transition:

draft → sent / awaiting_approval


## Accept Quotation

PATCH /api/quotations/:id/accept

Access:
Client who owns the related Event

Result:

Quotation → accepted

Event → awaiting_payment


## Reject Quotation

PATCH /api/quotations/:id/reject

Access:
Client who owns the related Event


## Request Quotation Changes

PATCH /api/quotations/:id/request-changes

Access:
Client who owns the related Event

Result:

Quotation → changes_requested


# 8. Payment APIs

Base:

/api/payments


## Create Payment Order

POST /api/payments/create-order

Access:
Client who owns the related Event

Request Body:
```json
{
  "eventId": "string (required)",
  "installmentIndex": 0,
  "paymentOption": "current_installment | custom | full_balance",
  "partialAmount": 50000,
  "customAmount": 150000,
  "isFullPayment": false,
  "allowExcess": true
}
```

Supported Payment Options:
- `current_installment`: Pays strictly the current eligible installment's remaining balance (e.g. if ₹100,000 of ₹200,000 advance has already been paid, the backend automatically deducts the paid amount and issues the order for the remaining ₹100,000). Rejects attempts exceeding the remaining installment balance under Option A.
- `custom`: Client enters arbitrary amount. If amount exceeds current installment, excess automatically cascades to subsequent installments in configured order up to total quotation outstanding.
- `full_balance`: Settles all outstanding installments in one provider payment using backend-calculated authoritative remaining balance.

Backend Validation:
- Client owns Event and accepts active quotation revision.
- Schedule consistency validation: sum of scheduled installments must equal quotation `finalAmount`. If mismatched, blocks cross-installment / full payment with HTTP 400 identifying both amounts.
- Overpayment validation: requested amount must not exceed `Total Outstanding` (`finalAmount` - cumulative verified payments). Returns HTTP 400: `"Payment amount cannot exceed the total outstanding balance of ₹[balance]."`.
- Advance prerequisite: for standalone subsequent installment payments without excess/full flags, full advance must be verified.
- Checks payment-link expiry for the target installment.
- Calculates and stores planned `allocations: [{ installmentIndex, installmentId, installmentTitle, allocatedAmount }]` on the Payment record.
- Reuses existing pending order for exact same amount or cancels obsolete pending orders idempotently.

Important:
Creating an order does NOT mean payment is successful.


## Preview Payment Allocation

POST /api/payments/preview-allocation

Access:
Client who owns the related Event, or Admin

Purpose:
Provides an authoritative live calculation of how a proposed payment amount will be distributed across scheduled installments before proceeding to Razorpay checkout.

Request Body:
```json
{
  "eventId": "string (required)",
  "targetAmount": 150000,
  "paymentOption": "custom",
  "isFullPayment": false,
  "installmentIndex": 0
}
```

Response Body:
```json
{
  "targetAmount": 150000,
  "totalQuotationOutstanding": 372000,
  "allocations": [
    {
      "installmentIndex": 0,
      "installmentId": "6640...01",
      "installmentTitle": "Booking Advance",
      "allocatedAmount": 100000
    },
    {
      "installmentIndex": 1,
      "installmentId": "6640...02",
      "installmentTitle": "Final Settlement",
      "allocatedAmount": 50000
    }
  ],
  "resultingBalances": [
    {
      "installmentIndex": 0,
      "title": "Booking Advance",
      "scheduledAmount": 100000,
      "previouslyPaid": 0,
      "allocatedAmount": 100000,
      "resultingOutstanding": 0,
      "resultingStatus": "Paid"
    },
    {
      "installmentIndex": 1,
      "title": "Final Settlement",
      "scheduledAmount": 272000,
      "previouslyPaid": 0,
      "allocatedAmount": 50000,
      "resultingOutstanding": 222000,
      "resultingStatus": "Partially Paid"
    }
  ],
  "remainingUnallocated": 0,
  "willConfirmEvent": true,
  "isQuotationFullySettled": false
}
```


## Verify Payment

POST /api/payments/verify

Access:
Authenticated client owning payment record

Request Body:
```json
{
  "razorpay_order_id": "string",
  "razorpay_payment_id": "string",
  "razorpay_signature": "string"
}
```

Backend verifies:
- Payment Order existence and ownership
- Razorpay signature via HMAC-SHA256
- Provider capture amount against authoritative order amount
- Idempotency (if already paid, return existing verified state without double-crediting)
- Rejection of superseded quotation revisions

After successful verification:
- Payment -> `paid`
- Durable allocations persisted: `allocations: [{ installmentIndex, installmentId, installmentTitle, allocatedAmount }]`
- Advance installment: If verified payments allocated to advance reach required advance, Event transitions to `confirmed`.
- Subsequent installments: Status updated to `Paid` or `Partially Paid`.
- Active payment links for fully settled installments marked `paid`.
- Returns verified payment receipt details:
  - `quotationNumber`, `quotationRevision`
  - `eventId`, `eventStatus`
  - `finalAmount`, `totalVerifiedPaid`, `totalOutstanding`
  - `razorpayPaymentId`, `receiptReference`
  - `isFullPayment`, `isQuotationFullyPaid`
  - `allocations`, `resultingBalances`


## Get Payment Schedule Summary

GET /api/payments/schedule/:eventId

Access:
Client who owns the Event, or Admin

Purpose:
Get authoritative payment schedule summary with per-installment calculations, schedule consistency status, multi-installment allocation details on verified transactions, and full-settlement eligibility.

Key Response Fields:
- `scheduleConsistency`: `{ isConsistent: boolean, scheduleTotal: number, quotationFinalAmount: number, mismatch: number }`
- `totalQuotationAmount`: Total final amount from accepted quotation.
- `totalVerifiedPaid`: Total verified amount received across all installments.
- `totalQuotationOutstanding`: Authoritative remaining balance (`round2(finalAmount - totalVerifiedPaid)`).
- `isQuotationFullyPaid`: `true` when `totalQuotationOutstanding === 0`.
- `canPayFullBalance`: `true` when consistent, not fully paid, and payment workflow permits.
- `installments`: Array of installments with `scheduledAmount`, `verifiedPaidAmount`, `outstandingAmount`, `status`, `isOverdue`, `isExpired`, `links`.
- `verifiedPayments`: Array of verified transactions, each containing itemized `allocations` and `isFullPayment`.


## Renew Payment Link

POST /api/payments/renew-link

Access:
Admin (role: 'admin') only

Request Body:
```json
{
  "eventId": "string",
  "installmentIndex": 1,
  "newExpiryDate": "2026-10-31T00:00:00.000Z",
  "newExpiryDays": 7
}
```

Backend Validation:
- Admin authorized.
- Installment has expired and has outstanding balance.
- Replacement link requests strictly the current outstanding balance.
- Original due date is preserved.
- Previous expired link is archived to history with status replaced.
- Duplicate renewal protection: rejects if active unexpired link already exists.
- Renewal email sent to Client with new link and expiry date.


## Get Advance Summary

GET /api/payments/advance-summary/:eventId

Access:
Client who owns the Event, or Admin


## Get My Payments

GET /api/payments

Access:
Client


## Get Payment

GET /api/payments/:id

Access:
Authorized users


## Admin Payment List

GET /api/payments/admin

Access:
Admin


## Trigger Payment Reminder Scan (Asynchronous BullMQ)

POST /api/payments/reminders/trigger

Access:
Admin (role: 'admin') only

Purpose:
Enqueues a payment reminder scan job to the BullMQ Redis queue (`payment-reminder-scan`). The background worker asynchronously executes the scan, discovers eligible candidates (due-date reminders `0 <= daysUntilDue <= 2` and link expiry warnings `0 < hoursUntilExpiry <= 24`), applies atomic MongoDB deduplication (`dedupKey`), and enqueues individual email dispatch jobs to `payment-reminder-email` with exponential backoff retry.

Request Body (optional):
```json
{
  "eventId": "string (optional: limits scan to specific event)",
  "referenceDate": "ISO date string (optional: defaults to now)"
}
```

Response (HTTP 200):
```json
{
  "statusCode": 200,
  "success": true,
  "message": "Payment reminder scan job enqueued successfully",
  "data": {
    "jobId": "manual_scan_1791967252930_n5unwk",
    "status": "queued",
    "enqueuedAt": "2026-10-14T08:40:52.930Z"
  }
}
```


## Get Event Reminder History

GET /api/payments/event/:eventId/reminders

Access:
Admin or Client who owns the Event

Query Parameters (optional):
- `installmentIndex`: number (optional filter)

Response:
```json
{
  "statusCode": 200,
  "success": true,
  "message": "Reminder logs retrieved successfully",
  "data": [
    {
      "_id": "6acf41fbf71c28ace6b6c596",
      "dedupKey": "due_date:event_id:inst_1:rev_1:2_days_before",
      "reminderType": "due_date",
      "status": "sent",
      "sentAt": "2026-10-14T08:40:53.120Z",
      "recipientEmail": "client@example.com",
      "outstandingAmount": 200000,
      "scheduledAmount": 200000,
      "dueDate": "2026-10-16T12:00:00.000Z"
    }
  ]
}
```

# 9. Event Manager Assignment APIs

Base:

/api/admin/events

## Get Available Managers

GET /api/admin/events/:id/available-managers

Access:
Admin

Purpose:
Get a list of active Event Managers who are available (no overlapping event assignments) for the requested event time.

## Assign Event Manager

PATCH /api/admin/events/:id/manager

Access:
Admin

Request:

{
  eventManagerId
}

Rules:

- Event must be confirmed.
- Selected user must have role = event_manager.
- Admin controls Event Manager assignment.


## Change Event Manager

PATCH /api/admin/events/:id/manager

Access:
Admin

Purpose:
Change the assigned Event Manager.


# 10. Recruitment APIs

Base:

/api/recruitment


## Create Work Requirement

POST /api/recruitment/requirements

Access:
Event Manager assigned to the Event

Request:

{
  eventId,
  workerType,
  requiredCount,
  reportingTime,
  baseWage
}

Initial status:

draft


## Announce Recruitment

PATCH /api/recruitment/requirements/:id/open

Access:
Event Manager assigned to Event

Result:

Work Requirement → open

Eligible Workers receive notifications.


## Get Recruitment Requirements

GET /api/recruitment/requirements

Access:

Event Manager:
Assigned Events

Admin:
All Events where authorized

Worker:
Eligible opportunities


## Get Work Requirement

GET /api/recruitment/requirements/:id

Access:
Authorized users


# 11. Worker Opportunity APIs

Base:

/api/work


## Get Available Work

GET /api/work/available

Access:
Worker

Returns only eligible opportunities.

Eligibility may consider:

- workerType
- active account
- availability
- Event status
- recruitment status


## Get Work Details

GET /api/work/:id

Access:
Eligible Worker


## Respond Interested

POST /api/work/:id/interested

Access:
Worker

Result:

Work Response → interested


## Respond Not Interested

POST /api/work/:id/not-interested

Access:
Worker

Result:

Work Response → not_interested


## Get My Responses

GET /api/work/my-responses

Access:
Worker


# 12. Worker Selection APIs

Base:

/api/recruitment


## Start Worker Selection

POST /api/recruitment/requirements/:id/select

Access:
System / authorized backend process

Purpose:
Run the Worker Selection Engine.

The Event Manager does NOT manually select Workers.

Selection considers:

1. Worker Type
2. Availability
3. Distance
4. Performance Score
5. Required Worker Count

Only interested Workers are considered.

The backend ranks eligible Workers and selects the required number.


## Get Selection Results

GET /api/recruitment/requirements/:id/results

Access:

- Event Manager assigned to Event
- Admin
- Worker can view only their own result

Result statuses:

- selected
- not_selected


# 13. Confirmed Work APIs

Base:

/api/work


## Get My Confirmed Work

GET /api/work/confirmed

Access:
Worker


## Get Confirmed Work Details

GET /api/work/confirmed/:id

Access:
Selected Worker


# 14. Attendance APIs

Base:

/api/attendance


## Check In

POST /api/attendance/check-in

Access:
Confirmed Worker

Backend records:

- worker
- event
- checkIn


## Check Out

POST /api/attendance/check-out

Access:
Worker with an active attendance record

Backend records:

- checkOut


## Get Event Attendance

GET /api/attendance/event/:eventId

Access:

- Event Manager assigned to Event
- Admin


## Get My Attendance

GET /api/attendance/my

Access:
Worker


# 15. Performance APIs

Base:

/api/performance


## Rate Worker Performance

POST /api/performance

Access:
Event Manager assigned to Event

Request:

{
  eventId,
  workerId,
  score
}

Score range:

1 - 5

Rules:

- Worker must have completed or worked the Event.
- Event Manager must be assigned to the Event.
- Worker cannot modify their own performance score.


## Get Worker Performance

GET /api/performance/worker/:workerId

Access:

- Admin
- Authorized Event Manager
- Worker can view their own performance where appropriate


# 16. Wage APIs

Base:

/api/wages


## Calculate Worker Wage

POST /api/wages/calculate

Access:
Backend / authorized Event Manager process

Backend calculates:

Base Wage
+ Travel Allowance
+ Performance Bonus
= Final Wage


## Create Worker Payment

POST /api/wages/payments

Access:

- Event Manager for assigned Event
- Admin

Purpose:
Create Worker Payment record.


## Get Event Worker Payments

GET /api/wages/events/:eventId

Access:

- Event Manager assigned to Event
- Admin


## Get My Earnings

GET /api/wages/my

Access:
Worker

Returns only the Worker's own earnings.


## Get Worker Payment Details

GET /api/wages/payments/:id

Access:

- Worker who owns the payment
- Authorized Event Manager
- Admin


# 17. Manager Earnings APIs

Base:

/api/manager/earnings


## Get My Earnings

GET /api/manager/earnings

Access:
Event Manager

Returns:

- Base Salary
- Event Incentive
- Total Earnings


# 18. Expense APIs

Base:

/api/expenses


## Create Expense

POST /api/expenses

Access:

- Event Manager for assigned Event
- Admin


## Get Event Expenses

GET /api/expenses/event/:eventId

Access:

- Event Manager assigned to Event
- Admin


## Update Expense

PATCH /api/expenses/:id

Access:
Authorized users


## Delete Expense

DELETE /api/expenses/:id

Access:
Authorized users according to business rules


# 19. Notification APIs

Base:

/api/notifications


## Get My Notifications

GET /api/notifications

Access:
Authenticated users


## Mark Notification as Read

PATCH /api/notifications/:id/read

Access:
Owner of Notification


## Mark All Notifications as Read

PATCH /api/notifications/read-all

Access:
Authenticated users


# 20. Message APIs

Base:

/api/messages


## Get Event Messages

GET /api/messages/event/:eventId

Access:
Users authorized for that Event


## Send Message

POST /api/messages

Access:
Users authorized to communicate within the Event

Allowed communication:

Client ↔ Event Manager

Event Manager ↔ Selected Workers

Realtime communication is handled using Socket.IO.


# 21. Feedback APIs

Base:

/api/feedback


## Create Feedback

POST /api/feedback

Access:
Client who owns the completed Event

Requirement:

Event status = completed


## Get Event Feedback

GET /api/feedback/event/:eventId

Access:
Authorized users


# 22. Gallery APIs

Base:

/api/gallery


## Upload Event Image

POST /api/gallery

Access:
Authorized users


## Get Event Gallery

GET /api/gallery/event/:eventId

Access:
Authorized users


## Delete Gallery Image

DELETE /api/gallery/:id

Access:
Uploader or Admin according to business rules


# 23. Admin Dashboard APIs

Base:

/api/admin


## Dashboard Summary

GET /api/admin/dashboard

Access:
Admin

Returns summary information such as:

- Total Events
- Upcoming Events
- Completed Events
- Revenue
- Expenses
- Profit
- Workers


## Revenue Report

GET /api/admin/reports/revenue

Access:
Admin


## Expense Report

GET /api/admin/reports/expenses

Access:
Admin


## Profit Report

GET /api/admin/reports/profit

Access:
Admin


# 24. Manager Dashboard APIs

Base:

/api/manager


## Dashboard Summary

GET /api/manager/dashboard

Access:
Event Manager

Returns:

- My Events
- Upcoming Events
- Ongoing Events
- Required Workers
- Filled Workers
- Pending Recruitment
- Pending Worker Payments


# 25. Client Dashboard APIs

Base:

/api/client


## Dashboard Summary

GET /api/client/dashboard

Access:
Client

Returns:

- My Events
- Upcoming Events
- Active Events
- Total Paid
- Remaining Payment
- Recent Notifications
- Recent Messages


# 26. Worker Dashboard APIs

Base:

/api/worker


## Dashboard Summary

GET /api/worker/dashboard

Access:
Worker

Returns:

- Worker Type
- Upcoming Work
- Pending Responses
- Completed Work
- Monthly Earnings
- Performance Score


# 27. Common API Rules

Every protected endpoint must perform:

Authentication
→ Role Authorization
→ Resource Ownership Check
→ Input Validation
→ Business Logic
→ Database Operation


# 27.5 Event Manager APIs

## Manager Dashboard
GET /api/manager/dashboard
Access: Event Manager

## Manager Events List
GET /api/manager/events
Access: Event Manager

## Manager Event Control Center (Details)
GET /api/manager/events/:id
Access: Event Manager
Purpose: Get detailed event information for the Event Control Center (must be assigned to the event).

## Create Work Requirement
POST /api/manager/events/:eventId/work-requirements
Access: Event Manager
Purpose: Create a work requirement for a specific event.

## List Work Requirements
GET /api/manager/events/:eventId/work-requirements
Access: Event Manager
Purpose: Get all work requirements for an event.

## Get Single Work Requirement
GET /api/manager/work-requirements/:id
Access: Event Manager
Purpose: Get a specific work requirement by ID.

## Update Work Requirement
PATCH /api/manager/work-requirements/:id
Access: Event Manager
Purpose: Update a work requirement's count, description, etc.

# 28. Resource Ownership Rules

## Client

Can access only:

- Their own Events
- Their own Quotations
- Their own Payments
- Their own Messages within permitted Events

## Event Manager

Can access only:

- Assigned Events
- Recruitment for assigned Events
- Attendance for assigned Events
- Worker Payments for assigned Events
- Expenses for assigned Events
- Messages for permitted Events

## Worker

Can access only:

- Their own Work Responses
- Their own Confirmed Work
- Their own Attendance
- Their own Earnings
- Their own Notifications
- Their own Performance information where permitted

## Admin

Can access system-wide resources according to Admin permissions.


# 29. Financial API Rules

Financial calculations must happen on the backend.

The frontend must never determine:

- Final quotation amount
- Payment status
- Remaining amount
- Worker wage
- Travel allowance
- Performance bonus
- Profit


# 30. Worker Selection API Rules

The Event Manager cannot call an API that directly selects a specific Worker.

Correct flow:

Event Manager
→ Create Requirement
→ Open Recruitment
→ Workers Respond
→ Selection Engine
→ Selected / Not Selected

The Event Manager only views the selection result.

The backend Selection Engine is responsible for the selection.


# 31. Worker Creation Rules

Worker creation is allowed for:

Admin
Event Manager

Worker creation must always create:

role = worker

Admin can create any Worker.

Event Manager can create Workers according to permitted staffing scope.

Event Manager cannot create:

- Admin
- Event Manager

Creating a Worker account does not automatically mean that the Worker is selected for any Event.

Recruitment selection remains a separate process.


# 32. API Response Format

Use a consistent response structure.

Success example:

{
  "success": true,
  "message": "Event created successfully",
  "data": {}
}

Error example:

{
  "success": false,
  "message": "You are not authorized to access this event",
  "error": {}
}


# 33. HTTP Status Codes

Use standard HTTP status codes.

200
Successful request

201
Resource created

400
Invalid request

401
Unauthenticated

403
Unauthorized

404
Resource not found

409
Conflict

422
Validation error

500
Internal server error


# 34. API Versioning

For the first version, use:

/api

A future version can use:

/api/v1

Do not introduce versioning complexity unless required.


# 35. API Security Rules

- Validate all input.
- Authenticate protected endpoints.
- Authorize by role.
- Verify resource ownership.
- Never trust IDs from the frontend.
- Never trust frontend payment success.
- Never trust frontend financial calculations.
- Never allow Workers to modify their own wage.
- Never allow Workers to modify their performance score.
- Never allow Event Managers to manually select Workers.
- Never allow Event Managers to create Admin or Event Manager accounts.
- Never allow Clients to create Workers.
- Never allow Workers to create other users.


# 36. Payment & Advance Flow APIs

## Create Advance Payment Order

POST /api/payments/create-order

Access:
Private (Client)

Purpose:
Create a secure Razorpay order for an event's required advance (full or partial).

Request:
```json
{
  "eventId": "string",
  "partialAmount": 40000 // optional, must be > 0 and <= outstandingAdvance
}
```

Response (201 Created):
```json
{
  "success": true,
  "message": "Payment order created successfully",
  "data": {
    "paymentId": "string",
    "razorpayOrderId": "order_xxx",
    "amount": 40000,
    "currency": "INR",
    "keyId": "rzp_test_xxx",
    "requiredAdvance": 100000,
    "advancePaidAmount": 0,
    "outstandingAdvance": 100000
  }
}
```

Errors:
- 400: Event not in `awaiting_payment`, no accepted quotation, invalid amount, amount exceeds outstanding advance, or advance already paid.
- 401: Unauthenticated.
- 403: Forbidden (only the client owning the event can pay).
- 404: Event not found.


## Verify Payment

POST /api/payments/verify

Access:
Private (Client)

Purpose:
Verifies Razorpay HMAC-SHA256 signature, validates payment record against accepted quotation, persists verified payment, updates installment status (`Paid` / `Partially Paid`), and confirms event once the full required advance has been received.

Request:
```json
{
  "razorpay_order_id": "order_xxx",
  "razorpay_payment_id": "pay_xxx",
  "razorpay_signature": "hex_signature"
}
```

Response (200 OK):
```json
{
  "success": true,
  "message": "Payment verified successfully",
  "data": {
    "paymentId": "string",
    "status": "paid",
    "amountPaid": 40000,
    "totalAdvancePaid": 40000,
    "requiredAdvance": 100000,
    "outstandingAdvance": 60000,
    "isFullyPaid": false,
    "eventStatus": "awaiting_payment",
    "quotationStatus": "accepted"
  }
}
```

Errors:
- 400: Invalid payload, tampered signature, gateway amount mismatch, or superseded quotation revision.
- 401: Unauthenticated.
- 403: Forbidden (non-owner).
- 404: Payment order not found.


## Get Authoritative Advance Payment Summary

GET /api/payments/advance-summary/:eventId

Access:
Private (Client owning event, Admin, Event Manager)

Purpose:
Retrieve backend-authoritative financial calculation of required advance, total verified paid amount, outstanding advance, eligibility, and verified payment history.

Response (200 OK):
```json
{
  "success": true,
  "message": "Advance payment summary retrieved successfully",
  "data": {
    "eventId": "string",
    "eventTitle": "Grand Gala",
    "eventStatus": "awaiting_payment",
    "hasAcceptedQuotation": true,
    "quotationId": "string",
    "quotationNumber": "QTN-2026-003",
    "quotationRevision": 1,
    "quotationStatus": "accepted",
    "totalQuotationAmount": 372000,
    "requiredAdvance": 100000,
    "advancePaidAmount": 40000,
    "outstandingAdvance": 60000,
    "isFullyPaid": false,
    "isEligibleForPayment": true,
    "advanceInstallment": {
      "title": "Booking Advance",
      "amount": 100000,
      "dueDateDescription": "Immediate upon acceptance",
      "status": "Partially Paid"
    },
    "payments": [
      {
        "id": "string",
        "amount": 40000,
        "currency": "INR",
        "status": "paid",
        "razorpayPaymentId": "pay_xxx",
        "receiptReference": "rcpt_xxx",
        "createdAt": "2026-10-12T16:00:00.000Z"
      }
    ]
  }
}
```


## Admin Payment Listing

GET /api/payments/admin?eventId=:eventId

Access:
Private (Admin, Event Manager)

Purpose:
List all payment transactions or filter by event ID with populated client and event details.

Response (200 OK):
```json
{
  "success": true,
  "message": "Payments retrieved successfully",
  "data": [ ...payments ]
}
```


## Razorpay Webhook Synchronization Endpoint

POST /api/webhooks/razorpay

Access:
Public (Server-to-Server from Razorpay Gateway)

Authentication & Signature:
- Authenticated via HTTP request header `X-Razorpay-Signature`.
- Cryptographically verified against the raw request body using HMAC-SHA256 and `RAZORPAY_WEBHOOK_SECRET` in constant time (`crypto.timingSafeEqual`).
- Regular Client/Admin Bearer JWT authentication is NOT required.

Supported Event Types:
- `payment_link.paid`
- `payment_link.partially_paid`
- `payment_link.expired`
- `payment_link.cancelled`

Idempotency:
- Uses `x-razorpay-event-id` (persisted in `WebhookReceipt` collection with unique index).
- Provider transaction deduplication via `razorpayPaymentId`.
- Out-of-order and duplicate events return HTTP 200 with `{ "received": true, "status": "duplicate" | "already_paid" }`.

Request Headers:
```http
X-Razorpay-Signature: <hmac_sha256_hex>
X-Razorpay-Event-Id: <event_id>
Content-Type: application/json
```

Request Payload Example (`payment_link.paid`):
```json
{
  "entity": "event",
  "account_id": "acc_xxx",
  "event": "payment_link.paid",
  "contains": ["payment_link", "payment"],
  "payload": {
    "payment_link": {
      "entity": {
        "id": "plink_xxx",
        "amount_paid": 5000000,
        "status": "paid"
      }
    },
    "payment": {
      "entity": {
        "id": "pay_xxx",
        "amount": 5000000,
        "currency": "INR",
        "status": "captured"
      }
    }
  }
}
```

Response (200 OK):
```json
{
  "received": true,
  "status": "processed",
  "message": "Webhook processed successfully",
  "data": {
    "paymentId": "string",
    "status": "paid",
    "eventStatus": "confirmed",
    "totalAdvancePaid": 50000,
    "outstandingAdvance": 0
  }
}
```

Errors:
- 400: Missing or invalid `x-razorpay-signature`, missing event type, or uncaptured provider payment status.
- 500: Database failure or missing webhook configuration.


## Reconcile Payment Link (Client Return Callback)

POST /api/payments/reconcile-link

Access:
Private (Authenticated Client owning the payment link)

Purpose:
Authoritative backend reconciliation endpoint invoked when the Client returns from Razorpay Payment Link to the application callback URL (`/client/payment-return`). Reconciles the local payment record with the Razorpay Payment Link state directly on the backend.

Request Body:
```json
{
  "paymentLinkId": "plink_xxx",
  "paymentId": "pay_xxx" // optional
}
```

Validation:
- `paymentLinkId`: string, required.
- `paymentId`: string, optional.

Response (200 OK):
```json
{
  "success": true,
  "message": "Payment link reconciled successfully",
  "data": {
    "paymentId": "string",
    "status": "paid",
    "amountPaid": 50000,
    "eventStatus": "confirmed",
    "totalAdvancePaid": 50000,
    "outstandingAdvance": 0,
    "eventId": "string"
  }
}
```

Errors:
- 400: Missing `paymentLinkId`.
- 401: Unauthenticated request.
- 403: Forbidden (authenticated client does not own the target payment link).
- 404: Target payment link not found in MongoDB.


## Trigger Payment Reminders & Expiry Warnings (Admin Manual Trigger)

POST /api/payments/reminders/trigger

Access:
Private (Admin only)

Purpose:
Allows authorized Admin users to trigger an immediate scheduled check for eligible installment due-date reminders and payment-link expiry warnings. Supports an optional `referenceDate` to simulate or test future reminder windows, and an optional `eventId` to scope the run.

Request Body:
```json
{
  "referenceDate": "2026-10-15T00:00:00.000Z", // optional ISO date string
  "eventId": "6ace4b969d61b6394332da6c"        // optional event ID filter
}
```

Response (200 OK):
```json
{
  "success": true,
  "message": "Reminder processing executed successfully",
  "data": {
    "dueRemindersProcessed": 1,
    "expiryWarningsProcessed": 0,
    "dueReminderResults": [
      {
        "status": "sent",
        "installmentIndex": 1,
        "recipientEmail": "client@example.com",
        "outstandingAmount": 72000
      }
    ],
    "expiryWarningResults": []
  }
}
```

Errors:
- 401: Unauthenticated request.
- 403: Forbidden (caller does not have Admin role).
- 500: Server or database error.


## Get Event Payment Reminders Audit

GET /api/payments/event/:eventId/reminders

Access:
Private (Client owning the event, Admin, or assigned Event Manager)

Purpose:
Returns the complete persistent reminder log history for an event, including due-date reminders and link-expiry warnings.

Response (200 OK):
```json
{
  "success": true,
  "data": [
    {
      "_id": "6ace4b969d61b6394332da6f",
      "installmentIndex": 1,
      "installmentTitle": "Final Settlement",
      "reminderType": "due_date",
      "reminderWindow": "2_days_before",
      "scheduledAmount": 272000,
      "amountPaid": 200000,
      "outstandingAmount": 72000,
      "dueDate": "2026-10-15T00:00:00.000Z",
      "recipientEmail": "client@example.com",
      "recipientName": "Client Name",
      "status": "sent",
      "sentAt": "2026-10-13T10:00:00.000Z",
      "createdAt": "2026-10-13T10:00:00.000Z"
    }
  ]
}
```

```

Errors:
- 401: Unauthenticated request.
- 403: Forbidden (Client does not own the event / Manager not assigned).
- 404: Event not found.


## Payment Schedule Summary — Reminder Audit Extensions

GET /api/payments/schedule/:eventId

The existing schedule summary response has been extended to expose diagnostic reminder status on each installment:

```json
{
  "success": true,
  "data": {
    "installments": [
      {
        "installmentIndex": 1,
        "title": "Final Settlement",
        "scheduledAmount": 272000,
        "verifiedPaidAmount": 200000,
        "outstandingAmount": 72000,
        "status": "Partially Paid",
        "latestDueDateReminder": {
          "status": "sent",
          "sentAt": "2026-10-13T10:00:00.000Z",
          "recipientEmail": "client@example.com",
          "outstandingAmount": 72000
        },
        "latestExpiryWarning": {
          "status": "pending"
        },
        "reminderLogs": []
      }
    ]
  }
}
```


# User Management & Event Manager Operations APIs

## 1. Create Event Manager

POST /api/users/event-managers

Access:
Protected (Admin Only — `authenticate`, `authorize('admin')`)

Purpose:
Authorized Admin provisions a new Event Manager account. The role `event_manager` is strictly enforced by the backend handler, initial password is verified (min 6 characters) and hashed using bcrypt (10 salt rounds), and business ID is atomically assigned from the counter collection in the range 1000–1999.

Request Body:
```json
{
  "name": "Arun Kumar",
  "email": "arun@eventops.com",
  "password": "SecurePassword123",
  "phone": "+91 99999 88888"
}
```

Response (201 Created):
```json
{
  "success": true,
  "data": {
    "id": "670f5e128123456789abcdef",
    "name": "Arun Kumar",
    "email": "arun@eventops.com",
    "role": "event_manager",
    "businessId": "1002",
    "phone": "+91 99999 88888",
    "isActive": true,
    "emailVerified": true,
    "createdAt": "2026-10-16T00:00:00.000Z",
    "updatedAt": "2026-10-16T00:00:00.000Z"
  }
}
```

Errors:
- 400 Bad Request: Missing or invalid required fields (name, email format, password < 6 chars).
- 401 Unauthorized: Missing or invalid JWT Bearer token.
- 403 Forbidden: Authenticated user is not an Admin.
- 409 Conflict: A user with this email address already exists.


## 2. List Users (with Role Filter)

GET /api/users?role=event_manager

Access:
Protected (Admin Only — `authenticate`, `authorize('admin')`)

Query Parameters:
- `role` (optional): Filter by role (`admin`, `client`, `event_manager`, `worker`).
- `workerType` (optional): Filter workers by specialization.
- `isActive` (optional): Filter by active status (`true` / `false`).

Response (200 OK):
```json
{
  "success": true,
  "data": [
    {
      "id": "670f5e128123456789abcdef",
      "name": "Arun Kumar",
      "email": "arun@eventops.com",
      "role": "event_manager",
      "businessId": "1002",
      "phone": "+91 99999 88888",
      "isActive": true,
      "createdAt": "2026-10-16T00:00:00.000Z",
      "updatedAt": "2026-10-16T00:00:00.000Z"
    }
  ]
}
```

Errors:
- 401 Unauthorized: Missing or invalid token.
- 403 Forbidden: User role is not Admin.


## 3. Event Manager Assigned Events

GET /api/manager/events

Access:
Protected (Event Manager Only — `authenticate`, `authorize('event_manager')`)

Purpose:
Returns events specifically assigned to the authenticated Event Manager (`assignedManagerId == req.user.id`).

Response (200 OK — Empty State when no events assigned):
```json
{
  "success": true,
  "data": []
}
```


## 4. Event Manager Dashboard Statistics

GET /api/manager/dashboard

Access:
Protected (Event Manager Only — `authenticate`, `authorize('event_manager')`)

Response (200 OK):
```json
{
  "success": true,
  "data": {
    "totalAssigned": 0,
    "inProgress": 0,
    "completed": 0,
    "upcoming": 0
  }
}
```


