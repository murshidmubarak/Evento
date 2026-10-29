# EventOps ERP - System Architecture

## 1. Architecture Overview

EventOps uses a **Modular Monolith** architecture.

The entire backend runs as one Node.js + Express application.

The application is divided internally into separate business modules.

Main request flow:

```text
Frontend
   ↓
REST API
   ↓
Express Backend
   ↓
Middleware
   ↓
Controller
   ↓
Service
   ↓
Repository
   ↓
Mongoose Model
   ↓
MongoDB
2. Architecture Style

The project combines:

Modular Monolith
Service Layer
Repository Pattern
Mongoose
Role-Based Authorization
Resource-Based Authorization

There is one backend application, but the backend is divided into independent business modules.

3. Why Modular Monolith

EventOps has many related modules:

Auth
Users
Events
Services
Quotations
Payments
Recruitment
Workers
Attendance
Performance
Wages
Expenses
Notifications
Messages
Feedback
Gallery

These modules belong to the same business system.

Therefore:

One Backend
    +
Multiple Business Modules
    +
Shared MongoDB

Do not use microservices for this project.

Do not use Kubernetes.

4. Backend Structure
backend/
└── src/
    ├── config/
    │
    ├── middlewares/
    │   ├── auth.middleware.js
    │   ├── role.middleware.js
    │   ├── validate.middleware.js
    │   ├── upload.middleware.js
    │   └── error.middleware.js
    │
    ├── modules/
    │   ├── auth/
    │   ├── users/
    │   ├── events/
    │   ├── services/
    │   ├── quotations/
    │   ├── payments/
    │   ├── recruitment/
    │   ├── workers/
    │   ├── attendance/
    │   ├── performance/
    │   ├── wages/
    │   ├── expenses/
    │   ├── notifications/
    │   ├── messages/
    │   ├── feedback/
    │   └── gallery/
    │
    ├── sockets/
    ├── jobs/
    ├── utils/
    ├── app.js
    └── server.js
5. Module Structure

Each major module follows:

module/
├── model
├── repository
├── service
├── controller
├── routes
└── validation

Example:

events/
├── event.model.js
├── event.repository.js
├── event.service.js
├── event.controller.js
├── event.routes.js
└── event.validation.js

Recruitment example:

recruitment/
├── workRequirement.model.js
├── workResponse.model.js
├── recruitment.repository.js
├── recruitment.service.js
├── recruitment.controller.js
├── recruitment.routes.js
└── recruitment.validation.js
6. Backend Request Flow

Every protected request should follow:

HTTP Request
     ↓
Route
     ↓
Authentication Middleware
     ↓
Authorization Middleware
     ↓
Validation Middleware
     ↓
Controller
     ↓
Service
     ↓
Repository
     ↓
Mongoose Model
     ↓
MongoDB

Response:

MongoDB
   ↓
Repository
   ↓
Service
   ↓
Controller
   ↓
HTTP Response
7. Route Layer

Routes define API endpoints.

Example:

POST /api/events

Route flow:

event.routes.js
      ↓
Authentication
      ↓
Authorization
      ↓
Validation
      ↓
event.controller.js

Routes must not contain business logic.

Routes must not directly access MongoDB.

8. Middleware Layer
Authentication

Verifies the user is authenticated.

Authorization

Verifies:

User role
User permission
Resource ownership where required
Validation

Validates:

Request body
Params
Query parameters
Upload

Handles permitted file uploads.

Error Handling

Handles application errors centrally.

9. Controller Layer

Controllers handle HTTP requests and responses.

Controllers should:

Read request data
Call Services
Return responses
Handle HTTP-specific logic

Controllers must remain thin.

Do not place these directly inside Controllers:

Complex business logic
Large database queries
Wage calculations
Worker ranking
Financial calculations
Complex status transitions
10. Service Layer

Services contain business logic.

Examples:

Event creation
Event status transitions
Quotation calculations
Payment verification
Worker eligibility
Worker selection
Wage calculation
Ownership checks
Business rules

Example:

event.controller
       ↓
event.service
       ↓
event.repository
11. Repository Layer

Repositories handle database access.

Examples:

findById()
findByEvent()
findByUser()
create()
update()
delete()

Repositories should contain database-specific operations.

Business decisions belong in Services.

Example:

Service
   ↓
Repository
   ↓
Mongoose
   ↓
MongoDB
12. Model Layer

Models contain Mongoose schemas.

Models define:

Field types
Required fields
Defaults
Enum values
Indexes
References
Schema constraints

Models should focus mainly on data structure and persistence.

13. Authentication Architecture

There is one common login page for all roles.

Roles:

Admin
Client
Event Manager
Worker

Authentication flow:

User
  ↓
Login
  ↓
Auth Controller
  ↓
Auth Service
  ↓
User Repository
  ↓
MongoDB
  ↓
Authentication Token / Session
  ↓
Frontend

Role-based redirect:

Admin          → /admin
Client         → /client
Event Manager  → /manager
Worker         → /worker

Public signup is only for Clients.

Admin can create Event Managers and Workers.

Event Manager can create Workers.

14. Authorization Architecture

Authorization has two levels.

Role-Based Authorization
Admin
Client
Event Manager
Worker
Resource-Based Authorization

Example:

Client A
   ↓
Client A Event ✅

Client A
   ↓
Client B Event ❌
Manager A
   ↓
Assigned Event ✅

Manager A
   ↓
Manager B Event ❌
Worker A
   ↓
Worker A Earnings ✅

Worker A
   ↓
Worker B Earnings ❌

All authorization must be enforced on the backend.

15. Event Architecture

Main Event workflow:

Client
  ↓
Create Event Request
  ↓
Quotation
  ↓
Client Accepts
  ↓
Advance Payment
  ↓
Backend Payment Verification
  ↓
Event Confirmed
  ↓
Admin Assigns Event Manager
  ↓
Event Preparation
  ↓
Worker Recruitment
  ↓
Event In Progress
  ↓
Event Completed

The Event module handles:

Event creation
Event retrieval
Event update
Event ownership
Event status
Event cancellation
16. Recruitment Architecture

The Event Manager does not manually select Workers.

Recruitment flow:

Event Manager
      ↓
Create Work Requirement
      ↓
Open Recruitment
      ↓
Eligible Workers Receive Opportunity
      ↓
Workers Respond
      ↓
Interested Workers
      ↓
Selection Engine
      ↓
Worker Ranking
      ↓
Selected / Not Selected
      ↓
Confirmed Work

The Event Manager only:

Creates the requirement
Announces recruitment
Views worker responses
Views selection results
Manages event operations

The Event Manager cannot manually select an individual Worker.

17. Worker Selection Engine

The Worker Selection Engine runs on the backend.

Only Workers who satisfy the eligibility rules and respond:

responseStatus = interested

are considered.

Selection considers:

Worker Type
Availability
Distance from Event
Performance Score
Required Worker Count

Distance and performance are the main ranking factors.

Process:

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

The Selection Engine must be:

Predictable
Deterministic
Testable
Backend controlled

The Event Manager cannot manually select Workers.

18. AI Architecture

AI is an assisting feature.

Possible AI features:

Event Planning Assistant
Budget Recommendations
Service Recommendations
Recruitment Suggestions
Worker Selection Explanation

AI may help explain or assist Worker Selection.

AI must NOT directly control:

Payments
Payment verification
Quotation amounts
Worker wages
User roles
Authorization

The backend remains the source of truth for critical business operations.

19. Payment Architecture

EventOps supports two verified payment pathways:

### Pathway A: In-App Razorpay Checkout (Orders API)

```text
Client
   ↓
React Frontend
   ↓
POST /api/payments/create-order
   ↓
Razorpay Modal Checkout
   ↓
Payment Response (razorpay_order_id, razorpay_payment_id, razorpay_signature)
   ↓
POST /api/payments/verify
   ↓
Verify HMAC-SHA256 Signature
   ↓
Authoritative Balance Update (applyAuthoritativePaymentSuccess)
   ↓
Payment = paid
   ↓
If full required advance verified -> Event = confirmed
```

### Pathway B: External Razorpay Payment Link (Webhooks + Callback URL)

```text
Client opens external Razorpay link (https://rzp.io/...)
   ↓
Client completes payment on Razorpay Gateway
   ├── Dual Asynchronous Synchronization Paths ──┐
   ↓                                              ↓
[Server-to-Server Webhook]             [Client Return Callback URL]
Razorpay sends webhook to backend       Client redirected to /client/payment-return
POST /api/webhooks/razorpay             Frontend calls POST /api/payments/reconcile-link
   ↓                                              ↓
Verify HMAC-SHA256 Raw-Body Signature   Authenticated Client Authorization & Match Link
   ↓                                              ↓
Deduplicate via WebhookReceipt (eventId) Provider State Verification (Gateway fetch)
   ↓                                              ↓
Resolve link to MongoDB payment context Shared Idempotent Payment Processing
   ↓                                              ↓
Apply Authoritative Allocation & Event Confirmation (applyAuthoritativePaymentSuccess)
   ↓                                              ↓
MongoDB updated authoritatively        Authoritative state refreshed in Frontend
```

Creating a Razorpay order or payment link does not mean payment is successful. The backend performs the final authoritative payment verification.
Neither browser parameters nor frontend state are ever trusted as proof of payment.

### Pathway C: BullMQ + Redis + Background Worker Payment Reminder Architecture

```text
                  EventOps ERP
                       |
                       v
            Existing Payment Data
                    MongoDB
                       |
                       v
             Reminder Scan Service
                       |
             Find Eligible Reminders
                       |
                       v
            BullMQ Queue: payment-reminder-scan
                       |
                       v
                 Redis
                       |
                       v
             Background Worker (src/workers/paymentReminderWorker.ts)
                       |
       Revalidate Payment & Reserve Log in MongoDB (status: pending)
                       |
                       v
            BullMQ Queue: payment-reminder-email (deterministic jobId)
                       |
                       v
             Background Worker (Concurrency: 5, Max Retries: 3)
                       |
             Just-in-Time Revalidation (check if paid / cancelled)
                       |
                       v
                Existing emailService (SMTP)
                       |
                       v
                Client's Inbox
                       |
                       v
             PaymentReminderLog in MongoDB (status: sent / skipped / failed)
                       |
                       v
              Admin Reminder UI / Schedule Summary
```

#### Layered Architecture:
**Route → Middleware → Controller → Service → BullMQ Queue / Worker → Repository/Model → MongoDB**

#### Key Components:
1. **Queues:**
   - `payment-reminder-scan`: Handles periodic recurring scans and manual admin scan triggers. Concurrency: 1.
   - `payment-reminder-email`: Handles individual email candidate dispatch. Concurrency: 5.
2. **Scheduling Mechanism:**
   - Recurring BullMQ JobScheduler (`periodic-payment-reminder-scan`) registered via `Queue.upsertJobScheduler()` with configurable interval (`REMINDER_CHECK_INTERVAL_MS`, default: 3600000ms / 1 hour).
   - In-process `setInterval` timer has been deprecated and completely disabled.
3. **Persistent Deduplication & Idempotency:**
   - MongoDB `PaymentReminderLog.dedupKey` remains the single source of truth.
   - Deterministic BullMQ job IDs: `email_<sha256(dedupKey)[0..32]>`.
   - Atomic reservation before enqueuing prevents duplicate job generation across concurrent workers.
4. **Authoritative JIT Revalidation:**
   - Immediately prior to SMTP delivery, the worker re-queries MongoDB payments and quotation state. If the installment has been settled or the reminder is no longer applicable, sending is skipped and recorded as `status: 'skipped'`.
5. **Retry & Failure Policy:**
   - 3 attempts with exponential backoff (`delay: 5000ms`).
   - Failed attempts update `PaymentReminderLog` with diagnostic error message (`status: 'failed'`).
   - Temporary Redis/SMTP outages do not falsely report emails as sent.
6. **Graceful Shutdown:**
   - Standalone worker listens to `SIGINT` / `SIGTERM`, closes BullMQ workers and queues cleanly, and disconnects MongoDB.

20. Financial Architecture

All financial calculations happen on the backend.

Backend controls:

Service pricing
Quotation subtotal
Discount
Final quotation amount
Advance amount
Remaining amount
Payment status
Worker base wage
Travel allowance
Performance bonus
Final worker wage
Event expenses
Revenue
Profit

The frontend only sends input and displays results.

Frontend financial values must never be treated as the source of truth.

21. Worker Wage Architecture

Worker wage:

Base Wage
    +
Travel Allowance
    +
Performance Bonus
    ↓
Final Wage

Flow:

Completed Work
      ↓
Attendance
      ↓
Performance
      ↓
Distance Calculation
      ↓
Wage Service
      ↓
Final Wage
      ↓
Worker Payment

Workers cannot modify their wage values.

22. Location Architecture

Worker location:

location:
    address
    lat
    lng

Event location:

location:
    address
    lat
    lng

Location is used for:

Distance calculation
Worker ranking
Recruitment support
Travel allowance

Do not implement continuous Worker GPS tracking.

23. Realtime Architecture

Use Socket.IO for realtime features.

React
  ↕
Socket.IO Client
  ↕
Socket.IO Server
  ↕
Application Services
  ↕
MongoDB

Realtime features:

Chat
Notifications
New Work Opportunities
Worker Selection Notifications
Payment Notifications
24. Communication Architecture

Initial communication:

Client ↔ Admin

After Event Manager assignment:

Client ↔ Event Manager

Internal Event communication:

Event Manager ↔ Selected Workers

Workers cannot directly communicate with unrelated Clients.

WhatsApp, if implemented, is only used for notifications.

Actual work responses happen inside the application.

25. Notification Architecture

Notifications may be generated for:

New Work Opportunity
Worker Selected
Worker Not Selected
Payment Received
Event Updated
Event Reminder

Flow:

Business Event
     ↓
Notification Service
     ↓
Notification Database
     ↓
Socket.IO / Notification Channel
     ↓
User
26. File Storage Architecture

Large images should not be stored directly in MongoDB.

Use external storage such as:

ImageKit
Cloudinary

Flow:

Frontend
   ↓
Backend
   ↓
Image Storage Service
   ↓
ImageKit / Cloudinary
   ↓
Image URL
   ↓
MongoDB

MongoDB stores image URLs and related metadata.

27. Background Jobs

Use scheduled jobs only where needed.

Possible jobs:

Event reminders
Quotation expiry
Payment reminders
Recruitment reminders

Do not create unnecessary background jobs.

### 27.1 Payment Reminder Scheduler Architecture

The Payment Milestone 3 reminder system runs exclusively on the backend:

```text
Server Startup (server.ts)
   │
   ▼
ReminderSchedulerService.start() [every REMINDER_CHECK_INTERVAL_MS, default 1 hour]
   │ (Single execution concurrency lock: isRunning flag)
   ▼
PaymentReminderService.runAllReminders()
   ├── findEligibleDueDateReminders() (2 days before installment due date)
   │     ├── Authoritative balance check: outstandingAmount > 0
   │     ├── Atomic dedupKey reservation in MongoDB (PaymentReminderLog)
   │     ├── Just-in-time settlement check
   │     └── EmailService.sendPaymentDueDateReminder()
   │
   └── findEligibleExpiryWarnings() (within 24h before active link expiry)
         ├── Authoritative link validity check (active, unexpired, un-superseded)
         ├── Atomic dedupKey reservation in MongoDB (PaymentReminderLog)
         ├── Just-in-time settlement check
         └── EmailService.sendPaymentLinkExpiryWarning()
```

Architectural Guarantees:
- **No browser reliance**: Operates independently of client open tabs or timers.
- **Persistent Deduplication**: Unique MongoDB indexes prevent duplicate sends across restarts or distributed workers.
- **Failure Isolation**: SMTP or network delivery errors are logged diagnostically in `PaymentReminderLog` without affecting financial transactions, paid balances, or event states.


28. External Services

Possible external integrations:

EventOps Backend
      |
      ├── Razorpay
      ├── ImageKit / Cloudinary
      ├── Maps API
      ├── AI API
      └── WhatsApp API

Keep third-party integrations isolated.

Do not spread third-party API logic across Controllers.

29. Database Architecture

Use:

MongoDB
   +
Mongoose

Main collections:

users
events
services
quotations
payments
workRequirements
workResponses
attendance
workerPayments
expenses
notifications
messages
feedback
gallery

Database access flow:

Service
   ↓
Repository
   ↓
Mongoose Model
   ↓
MongoDB
30. Frontend Architecture

Frontend uses:

React
Vite
React Router
Redux Toolkit
Axios
Tailwind CSS
Socket.IO Client

Suggested structure:

frontend/
└── src/
    ├── app/
    ├── components/
    ├── layouts/
    ├── pages/
    ├── features/
    ├── routes/
    ├── services/
    ├── hooks/
    ├── store/
    └── utils/
31. Frontend Role Layouts

Use:

AdminLayout
ClientLayout
ManagerLayout
WorkerLayout

There is one common authentication entry point.

After login:

Admin          → /admin
Client         → /client
Event Manager  → /manager
Worker         → /worker
32. Frontend Feature Organization

Major features:

features/
├── auth/
├── events/
├── quotations/
├── payments/
├── recruitment/
├── workers/
├── wages/
├── chat/
└── notifications/

Keep feature-specific components and logic close to their feature where practical.

33. State Management

Use Redux Toolkit for genuinely shared application state.

Suitable examples:

Authentication state
Current User
Notifications
Other shared application state

Use React local state for:

Form state
Modal state
UI-only state
Temporary interactions

Do not put every state value into Redux.

34. API Communication

Use Axios for frontend HTTP communication.

Centralize:

Base API URL
Authentication handling
Request configuration
Common error handling

Frontend communicates with the backend through REST APIs.

35. Error Handling Architecture

Use centralized backend error handling.

Controller / Service Error
          ↓
Error Middleware
          ↓
Standard API Response

Success response:

{
  "success": true,
  "message": "Event created successfully",
  "data": {}
}

Error response:

{
  "success": false,
  "message": "Event not found",
  "error": {}
}
36. Testing Architecture

Test important business logic and API endpoints.

Critical tests:

Authentication
Role-based authorization
Resource ownership
Event status transitions
Quotation calculations
Payment verification
Worker eligibility
Worker responses
Worker selection
Distance calculation
Wage calculation
Attendance
Performance
37. Deployment Architecture

Production architecture:

                     Internet
                        ↓
                      HTTPS
                        ↓
                      Nginx
                    /       \
                   /         \
                  ↓           ↓
           React Frontend   Node.js API
                                ↓
                           MongoDB Atlas

External services:

Node.js API
   ├── Razorpay
   ├── ImageKit / Cloudinary
   ├── Maps API
   ├── AI API
   └── WhatsApp API
38. Docker Architecture

Docker can be introduced after the core application is stable.

Docker
├── Frontend Container
└── Backend Container

MongoDB can use MongoDB Atlas in production.

Do not use Kubernetes.

39. CI/CD Architecture

Use GitHub Actions.

Pipeline:

Git Push
   ↓
GitHub Actions
   ↓
Install Dependencies
   ↓
Lint
   ↓
Run Tests
   ↓
Build
   ↓
Deploy

Recommended branches:

main
develop
feature/*

Feature workflow:

feature/*
    ↓
Pull Request
    ↓
CI
    ↓
Code Review
    ↓
develop
    ↓
main
    ↓
Production
40. Development Architecture

Build the project feature by feature.

For each feature:

Requirement
    ↓
Database Design
    ↓
Model
    ↓
Repository
    ↓
Service
    ↓
Controller
    ↓
Route
    ↓
Validation
    ↓
Authorization
    ↓
Frontend
    ↓
Tests
    ↓
Browser Verification
    ↓
Git Commit

Do not build the entire frontend first and the entire backend later.

41. Architecture Principles

Follow these principles:

Use Modular Monolith architecture.
Use one backend application.
Organize backend code by business modules.
Keep Controllers thin.
Put business logic in Services.
Put database operations in Repositories.
Keep Mongoose schemas in Models.
Enforce authentication on the backend.
Enforce role authorization on the backend.
Enforce resource ownership on the backend.
Keep financial calculations on the backend.
Keep payment verification on the backend.
Keep Worker Selection on the backend.
Event Manager announces recruitment but does not manually select Workers.
Workers respond Interested / Not Interested.
Selection Engine selects eligible Workers.
AI assists but does not control critical financial operations.
Keep external integrations isolated.
Use Socket.IO only where realtime functionality is needed.
Avoid unnecessary abstractions.
Avoid unnecessary dependencies.
Avoid microservices.
Avoid Kubernetes.
Keep the project maintainable and within the approved scope.
42. Final Architecture Summary
                         EVENTOPS ERP
                              |
        ┌─────────────────────┼─────────────────────┐
        |                     |                     |
        ▼                     ▼                     ▼
 React Frontend            REST API              Socket.IO
        |                     |                     |
        └─────────────────────┼─────────────────────┘
                              ▼
                       Node.js + Express
                              |
                    ┌─────────┴─────────┐
                    |                   |
              Authentication       Authorization
                    |                   |
                    └─────────┬─────────┘
                              ▼
                       Business Modules
                              |
       ┌──────────────────────┼──────────────────────┐
       |          |           |           |           |
       ▼          ▼           ▼           ▼           ▼
    Events    Quotations   Payments   Recruitment   Workers
       |          |           |           |           |
       └──────────┴───────────┴───────────┴───────────┘
                              |
                  ┌───────────┼───────────┐
                  |           |           |
                  ▼           ▼           ▼
              Services   Repositories  Selection Engine
                              |
                              ▼
                       Mongoose Models
                              |
                              ▼
                           MongoDB
43. Non-Negotiable Rules

The following rules must remain unchanged unless explicitly approved:

Only four roles exist:
Admin
Client
Event Manager
Worker
One common login page.
Public signup is only for Clients.
Admin can create Event Managers and Workers.
Event Manager can create Workers.
Client initially communicates with Admin.
Admin assigns Event Manager.
Event Manager announces Worker recruitment.
Workers respond Interested / Not Interested.
Event Manager does not manually select Workers.
Selection Engine selects Workers based on worker type, availability, distance and performance.
Backend is the source of truth for financial calculations.
Backend verifies payments.
Backend enforces authorization.
Modular Monolith architecture is mandatory.
Use Service and Repository layers.
Do not use microservices.
Do not use Kubernetes.
AI does not directly control critical financial operations.
Worker creation does not automatically mean Worker selection.


44. Event Manager Operations Module Architecture (Milestone 1)

### Component & Data Flow

```text
Admin Browser (AdminEventManagers.tsx)
    │
    ├── (1) POST /api/users/event-managers (Payload: { name, email, password, phone })
    │       ▼
    │   User Routes (authenticate + authorize('admin'))
    │       ▼
    │   UserManagementController.createEventManager()
    │       ▼
    │   UserService.createEventManager()
    │       ├── Forces role = 'event_manager'
    │       ├── Generates Business ID (counter range 1000–1999)
    │       ├── Generates temporary unusable password hash
    │       ├── Sets isActive = false, emailVerified = false
    │       ├── Generates cryptographically secure 32-byte token
    │       ├── Hashes token with SHA-256 for persistence at rest
    │       ├── Sets 24-hour expiration (invitationTokenExpiresAt)
    │       └── EmailService.sendInvitationEmail() (Dispatches /accept-invitation?token=...)
    │       ▼
    │   UserRepository.create() ──► MongoDB (User Model)
    │       ▼
    │   Returns safe User object (passwords/hashes/tokens stripped)
    │
    ├── (2) POST /api/users/event-managers/:id/resend-invitation
    │       ▼
    │   Generates fresh token, supersedes old token hash, refreshes expiration, dispatches email
    │
    └── (3) GET /api/users?role=event_manager
            ▼
        UserRepository.findUsers({ role: 'event_manager' }) ──► Displays managers & pending states

Manager Browser (/accept-invitation?token=... -> /login -> /manager)
    │
    ├── (1) GET /api/auth/invitation/:token
    │       ▼
    │   Validates token hash, checks 24h expiration, verifies role & non-active status
    │   Returns recipient details (name, email, role)
    │
    ├── (2) POST /api/auth/accept-invitation (Payload: token, password, confirmPassword)
    │       ▼
    │   Validates token and password (min 6 characters)
    │   Hashes password with bcrypt (10 salt rounds)
    │   Activates account (isActive = true, emailVerified = true)
    │   Invalidates token at rest ($unset invitationTokenHash, records invitationAcceptedAt)
    │
    ├── (3) POST /api/auth/login ──► Returns JWT with role = 'event_manager'
    │       ▼
    │   Frontend Redux authSlice & Login.tsx redirects to '/manager'
    │   (Unactivated accounts attempting login receive 401: "Your account is pending activation")
    │
    └── (4) GET /manager
            ▼
        ProtectedRoute (allowedRole="event_manager")
            ├── Unauthenticated visitors ──► Redirected to /login
            ├── Admin / Client / Worker ──► Access Denied / 403 / Redirected
            └── Event Manager ──► Renders ManagerLayout + ManagerDashboard
45. Event Manager Operations Module Architecture (Milestone 2: Assignment & Assigned Events Dashboard)

### Component & Data Flow

```text
Admin Browser (AdminEventDetails.tsx)
    │
    ├── (1) GET /api/admin/events/:id/available-managers
    │       ▼
    │   Admin Event Routes (authenticate + authorize('admin') + validateGetAvailableManagers)
    │       ▼
    │   AdminEventController.getAvailableManagers()
    │       ▼
    │   AdminEventService.getAvailableManagers()
    │       ├── Validates event exists and status in ['confirmed', 'in_progress']
    │       ├── UserRepository.findActiveEventManagers() (excludes invitationTokenHash)
    │       ├── EventRepository.findActiveAssignedEventsForDateRange(startDate, endDate)
    │       └── Filters out managers with overlapping event time windows:
    │           (event.startTime < assigned.endTime) && (event.endTime > assigned.startTime)
    │       ▼
    │   Returns array of available, active managers: [{ _id, name, email, phone, businessId }]
    │
    └── (2) PATCH /api/admin/events/:id/manager (Payload: { eventManagerId })
            ▼
        Admin Event Routes (authenticate + authorize('admin') + validateAssignManager)
            ▼
        AdminEventController.assignManager()
            ▼
        AdminEventService.assignManager()
            ├── Validates event status in ['confirmed', 'in_progress']
            ├── UserRepository.findByIdWithInvitation(managerId)
            │   └── Verifies role === 'event_manager', isActive === true, !invitationTokenHash
            ├── Checks overlap conflict on candidate manager
            ├── Atomic conditional update:
            │   Event.findOneAndUpdate(
            │     { _id: eventId, status: { $in: ['confirmed', 'in_progress'] } },
            │     { eventManagerId },
            │     { new: true }
            │   )
            ├── Post-write collision check (detects simultaneous concurrent race condition)
            │   └── If race collision detected: rolls back assignment and throws 409 Conflict
            └── Returns updated event with populated eventManagerId

Manager Browser (/manager, /manager/events, /manager/events/:id)
    │
    ├── (1) GET /api/manager/dashboard
    │       ▼
    │   Manager Event Routes (authenticate + authorize('event_manager'))
    │       ▼
    │   ManagerEventService.getManagerDashboardStats(req.user.id)
    │       ▼
    │   EventRepository.getManagerDashboardStats()
    │       └── Counts totalAssigned, upcoming (confirmed), ongoing (in_progress), completed
    │       ▼
    │   Returns { stats: { totalAssigned, upcoming, ongoing, completed } }
    │
    ├── (2) GET /api/manager/events
    │       ▼
    │   ManagerEventService.getManagerEvents(req.user.id, filters)
    │       ▼
    │   EventRepository.findByManagerId()
    │       └── Returns assigned events populated with safe client contact info (name, email, phone)
    │
    └── (3) GET /api/manager/events/:id
            ▼
        ManagerEventService.getManagerEventById(req.user.id, eventId)
            ├── EventRepository.findByIdWithDetails(eventId)
            ├── Strict Authorization Check:
            │   event.eventManagerId.toString() === req.user.id
            │   (Mismatched manager ID produces 403 Forbidden: "You do not have permission...")
            └── Safe Data Projection:
                ├── Schedule (date, startTime, endTime, guestCount)
                ├── Host Contact Information (name, email, phone)
                ├── Venue Location & ReadOnlyMap coordinates
                ├── Selected Services & Client Preferences (catering, notes)
                └── Excludes sensitive quotation pricing, profit margins, and payment gateway tokens
```

## 18. Persistent Notifications & Socket.IO Architecture (Milestone 1)

### Architectural Flow:
```text
Business Event Trigger (Requirement Published / Selection Persisted)
    │
    ▼
NotificationService (Validates payload & recipient IDs)
    │
    ├── 1. Persist to MongoDB (NotificationRepository.create / createMany)
    │      └── Deduplication key prevents duplicate logical records
    │      └── MongoDB is the single source of truth (failures never roll back business state)
    │
    └── 2. Real-Time Delivery Attempt (NotificationTransport.sendRealtime)
           │
           ├── If in API Process (Socket.IO instance available):
           │     Emits directly to room `user:<recipientId>`
           │     AND publishes to Redis Pub/Sub channel `eventops:notifications:realtime`
           │
           └── If in Worker Process (workerSelectionWorker.ts):
                 Publishes event to Redis Pub/Sub channel `eventops:notifications:realtime`
                 (Subscribed API server instances receive the message and deliver to local client sockets)
```

### Key Components:
1. **Mongoose Notification Model**:
   - `recipientId`: ObjectId reference to `User`, indexed.
   - `type`: Enum (`work_opportunity`, `assignment_confirmed`, `selection_summary`, `payment_received`, `system`).
   - `title`, `message`: Descriptive text without sensitive financials/tokens.
   - `isRead`, `readAt`: Read status tracking.
   - `resourceType`, `resourceId`: Optional linkage to underlying domain entities (e.g., `work_requirement`).
   - `destinationRoute`: Validated internal application route (e.g. `/worker`, `/manager/events/:id`).
   - `deduplicationKey`: Unique sparse index for idempotent creation (`req_opp_${reqId}_${workerId}`, `sel_confirm_${reqId}_round${round}_${workerId}`, `sel_summary_${reqId}_round${round}_${managerId}`).
   - Compound indexes: `{ recipientId: 1, createdAt: -1 }`, `{ recipientId: 1, isRead: 1 }`.

2. **Socket.IO Server Lifecycle**:
   - Created in `server.ts` via `http.createServer(app)`.
   - Single HTTP server for Express and Socket.IO.
   - Handshake authentication via JWT token; rejects unauthenticated handshakes.
   - Private room isolation: each user joins only `user:<userId>`.

3. **Cross-Process Notification Transport**:
   - `NotificationTransport` utilizes dedicated Redis Pub/Sub clients (`redis` v4 duplicate client) on channel `eventops:notifications:realtime`.
   - Standalone background workers (`workerSelectionWorker.ts`) publish selection events to Redis; API server subscriber forwards them to connected Socket.IO sockets.
   - In-memory mock fallback in test environments when Redis is not available.
   - Transport errors are caught and logged; MongoDB persistence always succeeds independently.







## 19. Unified Background Worker & BullMQ Notification Processing Architecture

### Architectural Overview

EventOps ERP utilizes a single-command background worker process runtime:
- `npm run dev`: Starts the Express REST API and Socket.IO real-time server (`src/server.ts`).
- `npm run worker`: Starts all background workloads in a single Node.js process managed by a lightweight orchestrator (`src/workers/worker.ts`).

The Unified Worker orchestrates three independent BullMQ worker subsystems:
1. **Payment Reminder Worker** (`paymentReminderWorker.ts`):
   - Recurring hourly scan scheduler (`payment-reminder-scan`)
   - Parallel notification email queue (`payment-reminder-email`, concurrency: 5, retries: 3)
2. **Worker Selection Worker** (`workerSelectionWorker.ts`):
   - Automated AI selection deadline consumer (`worker-selection`, concurrency: 2)
   - Startup recovery scan for overdue requirements (`scanAndProcessExpiredDeadlines`)
3. **Notification Worker** (`notificationWorker.ts`):
   - Asynchronous notification processing queue (`notification-processing`, concurrency: 3, retries: 3)
   - Bounded opportunity announcement broadcasts (`requirement-announcement`)
   - Selection completion & manager summary dispatches (`selection-completion`)
   - Startup recovery scan for missed notifications (`scanAndRecoverPendingNotifications`)

### Process Execution Diagram:
```text
                         npm run worker
                               │
                               ▼
               Unified Worker (src/workers/worker.ts)
                               │
               ├── 1. Connect MongoDB (shared Mongoose instance)
               │
               ├── 2. Start Payment Reminder Worker
               │      ├── Queue: payment-reminder-scan (Concurrency: 1)
               │      ├── Queue: payment-reminder-email (Concurrency: 5, Retries: 3)
               │      └── Scheduler: 3600s recurring scan
               │
               ├── 3. Start Worker Selection Worker
               │      ├── Queue: worker-selection (Concurrency: 2)
               │      └── Startup scan: scanAndProcessExpiredDeadlines()
               │
               └── 4. Start Notification Worker
                      ├── Queue: notification-processing (Concurrency: 3, Retries: 3)
                      └── Startup scan: scanAndRecoverPendingNotifications()

  [SIGINT / SIGTERM Handlers]
         │
         ▼
  Reverse-Order Graceful Shutdown:
    1. Close Notification Worker & Transport
    2. Close Worker Selection Worker & Transport
    3. Close Payment Reminder Queues & Schedulers
    4. Disconnect Shared MongoDB Connection
```

### Notification Queue Workflow:
```text
Work Requirement Publication (draft -> open)
       │
       ▼
notificationQueueService.enqueueRequirementAnnouncements()
       │
       ▼
BullMQ Queue: `notification-processing` (Job: `requirement-announcement`)
       │
       ▼
NotificationProcessor:
   1. Validates persisted requirement status === 'open' (MongoDB source of truth)
   2. Evaluates workerOpportunityService.findEligibleWorkersForOpportunity()
   3. Persists batch notifications in MongoDB (deduplicationKey: `req_opp_${reqId}_${workerId}`)
   4. Emits real-time events via Redis Pub/Sub (`eventops:notifications:realtime`)
   5. Connected Socket.IO API server routes to `user:<workerId>` rooms

Worker Selection Completion (Status update -> filled / open)
       │
       ▼
notificationQueueService.enqueueSelectionNotifications()
       │
       ▼
BullMQ Queue: `notification-processing` (Job: `selection-completion`)
       │
       ▼
NotificationProcessor:
   1. Validates current selectionRound === job.selectionRound (stale round safety)
   2. Persists assignment_confirmed notifications for selected workers (`sel_confirm_${reqId}_round${round}_${workerId}`)
   3. Persists selection_summary notification for Event Manager (`sel_summary_${reqId}_round${round}_${managerId}`)
   4. Emits real-time events via Redis Pub/Sub (`eventops:notifications:realtime`)
   5. Connected Socket.IO API server routes to user rooms
```
