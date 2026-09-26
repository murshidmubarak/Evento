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

Purpose:
Create Razorpay order.

Important:

Creating an order does NOT mean payment is successful.


## Verify Payment

POST /api/payments/verify

Access:
Authenticated payment request

Purpose:
Verify Razorpay payment on backend.

Request Body:
{
  razorpay_order_id,
  razorpay_payment_id,
  razorpay_signature
}

Backend verifies:

- Payment Order existence and ownership
- Razorpay signature via HMAC-SHA256
- Idempotency (if already paid, return success)

After successful verification:

Payment → paid

If the required advance is paid:

Event → confirmed


## Get My Payments

GET /api/payments

Access:
Client

Returns only the Client's own payments.


## Get Payment

GET /api/payments/:id

Access:
Authorized users


## Admin Payment List

GET /api/admin/payments

Access:
Admin


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