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
    │       ├── Hashes password (bcrypt, 10 salt rounds)
    │       └── Sets isActive = true, emailVerified = true
    │       ▼
    │   UserRepository.create() ──► MongoDB (User Model)
    │       ▼
    │   Returns safe User object (passwords/hashes stripped)
    │
    └── (2) GET /api/users?role=event_manager
            ▼
        UserRepository.findUsers({ role: 'event_manager' }) ──► Displays active managers

Manager Browser (/login -> /manager)
    │
    ├── (1) POST /api/auth/login ──► Returns JWT with role = 'event_manager'
    │       ▼
    │   Frontend Redux authSlice & Login.tsx redirects to '/manager'
    │
    └── (2) GET /manager
            ▼
        ProtectedRoute (allowedRole="event_manager")
            ├── Unauthenticated visitors ──► Redirected to /login
            ├── Admin / Client / Worker ──► Access Denied / 403 / Redirected
            └── Event Manager ──► Renders ManagerLayout + ManagerDashboard
                    ├── Manager profile, Business ID (EM-xxxx), Role Badge
                    ├── Genuine empty state: "No events have been assigned to you yet..."
                    └── Reusable refresh/retry mechanism (No fabricated data)
```




