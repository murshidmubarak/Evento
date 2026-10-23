# EventOps ERP - Development Plan

## 1. Development Goal

Build EventOps as a portfolio-grade MERN Event Management ERP.

The system manages:

- Clients
- Events
- Services
- Quotations
- Payments
- Event Managers
- Workers
- Worker Recruitment
- Attendance
- Performance
- Worker Wages
- Expenses
- Notifications
- Messages
- Feedback
- Gallery

The development process must follow the approved:

- Project Overview
- Database Design
- Database Relationships
- Status and Business Rules
- API Design
- System Architecture

Core business functionality must be completed before optional features such as AI, WhatsApp and advanced realtime functionality.


# 2. Development Approach

Use vertical feature development.

For every feature:

```text
Requirement
    ↓
Database / Model
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

Do not build the entire backend first and the entire frontend later.

Do not build the entire frontend first and the entire backend later.

3. Phase 1 - Project Foundation

Create:

EVENTOPS/
├── backend/
├── frontend/
├── docs/
├── tests/
├── AGENTS.md
├── README.md
└── .gitignore

Complete:

Git repository
GitHub repository
Backend project setup
Frontend project setup
Environment variables
MongoDB configuration
Express server
React application
Development scripts
Basic error handling
Basic project structure
4. Phase 2 - Backend Foundation

Implement:

Express application
MongoDB connection
Mongoose configuration
Environment configuration
API routing
Authentication middleware
Authorization middleware
Validation middleware
Error middleware
Common API response format
Basic logging

Create:

GET /api/health

Expected result:

{
  "success": true,
  "message": "API is running"
}
5. Phase 3 - Authentication

Implement:

Client registration
Login
Logout
Password hashing
Authentication
Current-user endpoint
Protected routes
Role-based redirects
Forgot password
Reset password

Roles:

admin
client
event_manager
worker

Rules:

Public signup creates Clients only.
Admin can create Event Managers and Workers.
Event Manager can create Workers.
One common login page is used by all roles.
6. Phase 4 - RBAC and User Management

Implement:

Authentication middleware
Role middleware
Resource ownership checks
User management
Worker creation
Event Manager creation
User activation/deactivation
Worker types
Worker location
Worker base wage
Worker availability
Worker performance score

Verify:

Client cannot access another Client's Event.
Event Manager cannot access another Manager's Event.
Worker cannot access another Worker's earnings.
Event Manager cannot create Admin accounts.
Event Manager cannot create Event Manager accounts.
Worker cannot modify protected Worker fields.
7. Phase 5 - Services and Pricing

Implement Admin Service management.

Features:

Create Service
Update Service
Activate/deactivate Service
Pricing type

Supported pricing types:

per_guest
per_event
package

Services:

Catering
Decoration
Photography
Videography
Juice
Hosting

8. Phase 6 - Client Event Management

Implement:

Client Dashboard
Create Event Wizard
My Events
Event Details

Create Event Wizard:

Step 1 → Event Type
Step 2 → Event Details
Step 3 → Location & Guests
Step 4 → Services
Step 5 → Budget & Recommendation
Step 6 → Review & Submit

After submission:

Event status = requested

Store:

Event type
Title
Date
Start time
End time
Address
Latitude
Longitude
Guest count
Budget
Selected Services
10. Phase 7 - Quotation System

Implement:

Quotation creation (new and revisions)
Quotation calculation
Quotation snapshotting (prices, requirements)
Quotation list (thread history)
Quotation details
Send quotation
Request changes
Accept quotation
Reject quotation
Quotation expiry

Quotation statuses:

draft
sent
awaiting_approval
changes_requested
accepted
rejected
expired

Backend calculates:

Subtotal = sum(line amounts)
- Discount
= Taxable Amount
+ Tax (configurable, CGST/SGST/IGST breakdown)
= Final Amount

And:

Advance Amount
Remaining Amount = Final Amount - Advance Amount
10. Phase 8 - Client Payment (Milestone 1 Implemented)

Implement Razorpay integration.

Flow:

Client
   ↓
Accept Quotation
   ↓
Awaiting Payment
   ↓
Client Opens Advance Payment Page
   ↓
Create Razorpay Order (Full or Partial Advance)
   ↓
Razorpay Checkout (Frontend SDK)
   ↓
Backend Verification (HMAC-SHA256 Signature Verification)
   ↓
Payment = paid
   ↓
Update Advance Paid & Outstanding Balances
   ↓
Is Entire Required Advance Paid?
   ├─ NO: Advance Installment = 'Partially Paid', Event remains 'awaiting_payment'
   └─ YES: Advance Installment = 'Paid', Event = 'confirmed'

Implement:

- [DONE] Create payment order with full or partial advance amount (`POST /api/payments/create-order`)
- [DONE] Razorpay checkout frontend integration (`ClientAdvancePayment.tsx`)
- [DONE] Payment verification with HMAC-SHA256 + quotation cross-check + gateway amount verification (`POST /api/payments/verify`)
- [DONE] Signature verification
- [DONE] Authoritative advance summary calculation and endpoint (`GET /api/payments/advance-summary/:eventId`)
- [DONE] Partial advance payments support and outstanding advance balance tracking
- [DONE] Event confirmation strictly enforced only when full required advance is verified
- [DONE] Admin payment visibility (`GET /api/payments/admin` and `AdminEventDetails.tsx`)
- [DONE - Milestone 2] Subsequent installments, installment-level payment tracking, partial installment payments, and outstanding balances
- [DONE - Milestone 2] Authoritative payment schedule summary endpoint (`GET /api/payments/schedule/:eventId`)
- [DONE - Milestone 2] Backend payment-link expiry validation and rejection with exact required notice
- [DONE - Milestone 2] Authorized Admin payment-link renewal for outstanding balances (`POST /api/payments/renew-link`)
- [DONE - Milestone 2] Payment-link history preservation and replacement tracking
- [DONE - Milestone 2] Renewal notification email delivery to Client via EmailService
- [DONE - Milestone 2] Client installment overview and interactive partial installment payment UI
- [DONE - Milestone 2] Admin payment and installment management interface with renewal action
- [DONE - Milestone 2 Extension] Three Client payment choices: Option A (Pay Current Installment/Advance), Option B (Pay Custom Amount with cascading excess), Option C (Pay Full Remaining Balance in one transaction)
- [DONE - Milestone 2 Extension] Authoritative quotation schedule consistency validation (sum of installments equals quotation finalAmount) blocking unsafe cross-installment payments
- [DONE - Milestone 2 Extension] Strict overpayment prevention: requests exceeding total outstanding balance rejected with clear error message
- [DONE - Milestone 2 Extension] Automatic installment allocation cascading verified funds across scheduled milestones in configured order
- [DONE - Milestone 2 Extension] Durable immutable payment allocation records (`Payment.allocations`) preserving single provider transaction identity
- [DONE - Milestone 2 Extension] Live interactive frontend payment allocation preview table and API (`POST /api/payments/preview-allocation`)
- [DONE - Milestone 2 Extension] Comprehensive post-verification receipt card displaying quotation, event status, transaction, and multi-installment attribution
- [DONE - Milestone 2 Extension] Automated test suite (Tests A–J) covering all extension scenarios with 100% pass rate (61/61 payments tests passing)
- [DONE - Payment Link Sync Fix] Razorpay Payment Link synchronization via webhooks (`POST /api/webhooks/razorpay`) supporting `payment_link.paid`, `payment_link.partially_paid`, `payment_link.expired`, and `payment_link.cancelled`
- [DONE - Payment Link Sync Fix] Raw request body HMAC-SHA256 signature verification in constant time (`crypto.timingSafeEqual`)
- [DONE - Payment Link Sync Fix] Webhook idempotency via `WebhookReceipt` collection and unique provider payment ID deduplication preventing double counting
- [DONE - Payment Link Sync Fix] Razorpay Payment Link creation/renewal configured with frontend return callback URL (`/client/payment-return`) and GET method
- [DONE - Payment Link Sync Fix] Client payment return page (`ClientPaymentReturn.tsx`) with processing, error, and backend-verified authoritative result presentation
- [DONE - Payment Link Sync Fix] Authenticated backend payment link reconciliation endpoint (`POST /api/payments/reconcile-link`)
- [DONE - Payment Link Sync Fix] Shared authoritative financial processing (`applyAuthoritativePaymentSuccess`) ensuring identical balance updates, installment allocations, and event confirmation
- [DONE - Payment Link Sync Fix] Automated test suite covering signature verification, event handling, idempotency, mapping, financial behavior, callback reconciliation, and regression (80/80 payments tests passing, 301/301 full backend tests passing)
- [DONE - Milestone 3] Automated installment due-date reminder emails (2 days before scheduled due date)
- [DONE - Milestone 3] Automated Razorpay Payment Link expiry warning emails (1 day / 24h before active link expiry)
- [DONE - Milestone 3] Authoritative balance calculation for partial payments (e.g. reminders state ₹72,000 outstanding, not ₹2,72,000 scheduled)
- [DONE - Milestone 3] Fully paid installment prevention and just-in-time settlement recheck before dispatch
- [DONE - Milestone 3] Handling of Admin renewed payment links (superseded link skipped, replacement link used with new expiry date)
- [DONE - Milestone 3] Overdue installment catch-up policy (skipping stale backlog of expired reminder windows)
- [DONE - Milestone 3] Persistent atomic deduplication via `PaymentReminderLog` unique `dedupKey` in MongoDB
- [DONE - Milestone 3] Backend background scheduler (`ReminderSchedulerService`) with configurable interval, concurrency lock, and manual Admin trigger API
- [DONE - Milestone 3] Email failure resilience: diagnostic failure logging without altering payment, installment, quotation, or event states
- [DONE - Milestone 3] Admin reminder status visibility on installment cards and schedule summary audit
- [DONE - Milestone 3] Comprehensive automated test suite (Tests 81–93) with 100% pass rate (93/93 payments tests, 314/314 full backend tests, 20/20 frontend tests passing)

Never trust frontend payment success alone.

11. Phase 9 - Admin Event Management

Implement:

Admin Event list
Event details
Event status
Client information
Quotation information
Payment information
[DONE] Event Manager assignment (Part 1 - Eligibility & Assignment API)

Assignment flow:

Confirmed Event
      ↓
Admin
      ↓
Assign Event Manager
      ↓
eventManagerId

Only Admin can assign or change the Event Manager.

12. Phase 10 - Event Manager Module

### Milestone 1: Event Manager Secure Onboarding (Admin Creation → Invitation Email → Password Setup → Account Activation → Manager Login → Protected Dashboard) [COMPLETED]
- [DONE] Admin creates Event Manager account without setting password (`POST /api/users/event-managers`), assigning `role = 'event_manager'`, business IDs in range 1000–1999, and initial pending status (`isActive = false`, `emailVerified = false`)
- [DONE] Secure token generation: 32-byte cryptographic token, SHA-256 hashed at rest, 24-hour expiration policy (`invitationTokenExpiresAt`), single-use invalidation upon acceptance
- [DONE] Email delivery: Dispatches branded invitation email via `emailService.sendInvitationEmail` linking to `/accept-invitation?token=<token>`
- [DONE] Admin invitation resend: `POST /api/users/event-managers/:id/resend-invitation` invalidates previous token, generates fresh token, refreshes expiration, and resends email
- [DONE] Public token validation: `GET /api/auth/invitation/:token` validates unexpired, unused token and returns recipient metadata
- [DONE] Invitation acceptance & password setup: `POST /api/auth/accept-invitation` validates token, hashes password with bcrypt (10 rounds), activates account (`isActive = true`), verifies email (`emailVerified = true`), unsets token hash at rest
- [DONE] Login blocking: Pending, unverified, or deactivated managers blocked from login with explicit 401 messaging
- [DONE] Frontend onboarding page: `AcceptInvitation.tsx` with token verification on mount, password validation, match check, error states, and login redirect
- [DONE] Frontend Admin management: `AdminEventManagers.tsx` with modal without password, "Pending Invitation" status badges, and inline "Resend Invitation" action
- [DONE] Manager login & dashboard: unified `/login` redirects Event Manager to `/manager`; route guard restricts `/manager` exclusively to `event_manager`; genuine empty state rendered when 0 events assigned
- [DONE] Comprehensive automated test coverage: backend (343/343 passing across 38 suites), frontend (38/38 passing across 5 suites), 0 build/type errors

### Milestone 2: Event Manager Assignment and Assigned Events Dashboard [COMPLETED]
- [DONE] Admin eligibility check: `GET /api/admin/events/:id/available-managers` checks confirmed/in-progress event status, excludes pending-invitation accounts and inactive accounts, and checks time overlaps (`startTime` < `endTime`).
- [DONE] Admin assignment persistence: `PATCH /api/admin/events/:id/manager` validates event exists & confirmed/in-progress, candidate exists & active & role `event_manager` & no pending invitation token, executes atomic conditional update, and conducts post-write collision rollback for concurrency protection.
- [DONE] Admin UI integration: `AdminEventDetails.tsx` displays assignment card, "Assign Event Manager" / "Reassign Event Manager" modal with real-time eligible manager retrieval, radio selection, and instant state update.
- [DONE] Authenticated Manager Dashboard: `ManagerDashboard.tsx` retrieves metrics from `GET /api/manager/dashboard` and events from `GET /api/manager/events`, displays metric cards (`Total Assigned`, `Upcoming`, `In Progress`, `Completed`), preserves exact empty state when 0 events assigned, and renders event cards with links to details.
- [DONE] Dedicated Manager Event List: `ManagerEventList.tsx` at `/manager/events` with status filtering tabs (`All`, `Confirmed`, `In Progress`, `Completed`), search filter, and cards leading to event details.
- [DONE] Manager Event Details: `ManagerEventDetails.tsx` at `/manager/events/:id` displays operational event information (schedule, host contact info, venue map via ReadOnlyMap, service preferences, notes) with strict 403 Forbidden protection against unauthorized access.
- [DONE] Manager Layout & Route Integration: Updated `ManagerLayout.tsx` nav links (`Dashboard`, `Assigned Events`) and `AppRoutes.tsx` with role guards.
- [DONE] Work Requirements Management strictly out of scope for Milestone 2.
- [DONE] Full Automated Test Coverage: Backend 343/343 passing across 37 suites, Frontend 46/46 passing across 8 suites, 0 lint errors, 0 type errors.

### Milestone 3: Worker Onboarding (Event Manager Creates Workers → Invitation Email → Password Setup → Account Activation → Worker Login → Worker Dashboard) [COMPLETED]
- [DONE] Event Manager Worker creation: `POST /api/users/workers` and `POST /api/manager/workers` permit authenticated, active Event Managers (and Admins) to create Worker accounts without setting passwords. Backend strictly forces `role = 'worker'`, records `createdBy = req.user.id`, validates the 8 canonical worker types, and generates sequential business IDs in worker type category ranges (2000–9999, prefixed as `W-xxxx`).
- [DONE] Invitation token generation & email dispatch: 32-byte cryptographic token (SHA-256 hashed at rest, 24-hour expiration) sent via centralized `emailService.sendInvitationEmail` with deep link `/accept-invitation?token=<token>`.
- [DONE] Login blocking for pending accounts: Workers with `isActive: false` and `emailVerified: false` blocked from authentication with explicit activation notice before password check.
- [DONE] Token validation & password setup: Public `GET /api/auth/invitation/:token` returns recipient metadata including `workerType`. `POST /api/auth/accept-invitation` securely hashes password with bcrypt, activates account (`isActive: true`), marks email verified (`emailVerified: true`), unsets token hash at rest, and records timestamp.
- [DONE] Resend invitation & creator isolation: `POST /api/users/workers/:id/resend-invitation` and `POST /api/manager/workers/:id/resend-invitation` allow creating Event Manager to resend invitations for pending workers they created; attempts by non-creator managers return 403 Forbidden. Admins retain unrestricted resend privileges. Already-active accounts cannot be resent (400).
- [DONE] Frontend Manage Workers interface: `ManagerWorkers.tsx` at `/manager/workers` with search, worker type filter dropdown, status tabs, "Create Worker" modal with validation, and post-creation success modal displaying allocated business ID.
- [DONE] Dynamic invitation acceptance page: `AcceptInvitation.tsx` dynamically displays "Worker Onboarding", "Authorized Role: Worker (<workerType>)", and directs newly activated workers to login.
- [DONE] Protected Worker Dashboard: `WorkerDashboard.tsx` at `/worker` (served by `WorkerLayout.tsx`) displays worker profile summary (name, worker type, business ID, email, phone, location), active status, and authentic empty state: "No work has been assigned to you yet. Your assignments will appear here when work becomes available."
- [DONE] Navigation & Routing: Mounted in `ManagerLayout.tsx` (`Manage Workers`), `AppRoutes.tsx`, and role-based redirect in `RootRedirect.tsx` (`/worker`).
- [DONE] Shared workforce pool preservation: Creator attribution (`createdBy`) is strictly for audit/management and does not restrict workers from future selection or event assignment.
- [DONE] Comprehensive automated test coverage: 14/14 new backend tests in `workerOnboarding.test.ts` (357/357 total passing across 38 suites), 15/15 new frontend tests across `managerWorkers.test.tsx`, `workerDashboard.test.tsx`, and `acceptInvitation.test.tsx` (56/56 total passing across 10 suites), 0 type errors, 0 build errors.

### Milestone 4: Work Requirements Management (Event Manager Creates and Manages Staffing Requirements) [COMPLETED]
- [DONE] Event Manager Work Requirements access: Integrated directly into `ManagerEventDetails.tsx` with a dual-tab switcher (`Event Overview` vs `Work Requirements`) and URL query parameter persistence (`?tab=requirements`). Also exposed direct quick link in `ManagerEventList.tsx` for confirmed events.
- [DONE] Authoritative backend validation: `validateCreateWorkRequirement` and `validateUpdateWorkRequirement` enforce valid `workerType` (8 enum values), integer `requiredCount` >= 1, non-empty `reportingTime`, length bounds on `description`, and `status` transitions.
- [DONE] Event Ownership & Assignment Authorization: Event Manager can only view, create, edit, and cancel requirements for events assigned to them (`event.eventManagerId === req.user.id`). Unassigned managers receive 403 Forbidden. Admins retain full oversight.
- [DONE] Event Status Guard: Work requirements can only be created or modified for events in `confirmed` status. Non-confirmed events return 400 Bad Request.
- [DONE] Status Lifecycle Authority: Initial creation strictly sets `status = 'draft'`. Permitted manager updates include field editing in `draft` only, `draft -> open`, and cancellation (`draft -> cancelled`, `open -> cancelled`). Transitions to `selection_in_progress`, `filled`, and `closed` via client input are strictly prohibited and reserved for the Selection Engine.
- [DONE] Multiple Requirements: Allows multiple requirements for the same worker type within an event (e.g. different shifts/reporting times).
- [DONE] Frontend Staffing Demand & Summary: `WorkRequirementsSummary.tsx` accurately displays total active worker count (strictly excluding cancelled requirements), total requirement records, draft/open count, and worker-type breakdown pills.
- [DONE] Full UI Workflows: `WorkRequirementsSection.tsx` with search, status filters, data table with action menus, `CreateRequirementModal.tsx` with duplicate submission prevention (`noValidate` attribute and disabled states), `EditRequirementModal.tsx` for draft editing, and `CancelRequirementModal.tsx` with confirmation dialog.
- [DONE] Error & Empty States: Dedicated empty state with "+ Create First Requirement" action for eligible events, locked explanation banner for non-confirmed events, and distinct error state with retry button on API failure.
- [DONE] Out of Scope Boundaries Respected: Worker Selection Engine, manual worker assignment, automated worker allocation, attendance, and wages deferred to future milestones.
- [DONE] Full Automated Test Coverage: 23/23 tests in `workRequirements.test.ts` (365/365 total backend tests passing across 38 suites), 7/7 tests in `workRequirements.test.tsx` (63/63 total frontend tests passing across 11 suites), 0 lint errors, 0 type errors, clean builds.

Implement (Future Milestones):

Recruitment
Workers
Wages & Payments
My Earnings

Manager can:

View assigned Events
View Event details
Create Worker requirements
Announce recruitment
View Worker responses
View Selection results
Manage Event operations
Manage Worker payment records
Record Worker performance
Communicate with Client
Communicate with selected Workers
Create Workers according to approved rules

Manager cannot:

Create Admin
Create Event Manager
Modify global Service pricing
Access unrelated Events
Manually select Workers
13. Phase 11 - Worker Recruitment

Implement Work Requirements.

Example:

20 Catering Boys
3 Catering Supervisors
2 Chefs
3 Cameramen
2 Videographers
8 Decoration Workers

Event Manager can:

Create requirement
Set worker type
Set required count
Set reporting time
Set wage
Announce recruitment

The Event Manager does NOT manually assign or select individual Workers.

14. Phase 12 - Worker Opportunity System

Implement Worker features:

Available Work
Work Details
Interested
Not Interested
My Responses
Confirmed Work
Work History

Response flow:

not_responded
      ↓
interested

or:

not_responded
      ↓
not_interested

Only interested Workers enter the selection process.

15. Phase 13 - Worker Selection Engine (Implemented & Verified)

Implemented the backend Worker Selection Engine and Worker Opportunity Portal:
- Worker interest submission (`POST /api/worker/opportunities/:requirementId/interest`) with atomic duplicate prevention.
- Manager configured maximum distance (`maxDistanceKm`) and interest deadline (`interestDeadlineAt`).
- Haversine straight-line distance calculation and coordinate validation without fabricating coordinates.
- Strict same-calendar-day conflict exclusion across events and requirements.
- Deterministic ranking: currently live distance-only ranking with server timestamp and stable identifier tie-breakers.
- Prepared and pure-unit-tested future combined ranking: `(Performance * 0.55) + (Distance * 0.45)`.
- Dedicated BullMQ queue `'worker-selection'` and standalone worker `workerSelectionWorker.ts`.
- Incomplete staffing deadline extension preserving all previously assigned workers and selecting only for remaining positions.
- Full UI integration in Manager Portal (modals for extension and results) and Worker Portal (opportunities, express interest, confirmed shifts).
- Automated tests: 17 backend tests + 4 frontend UI tests all passing (100%).

The Event Manager does not manually select Workers.
The backend Selection Engine is the source of truth.

16. Phase 14 - Location, Distance, Immutable History & Anti-Manipulation (Implemented & Verified)

Implemented:
- Mandatory Worker location setup before opportunity discovery or interest submission.
- Backend location gate (`400 Bad Request` with `LOCATION_REQUIRED` if unconfigured).
- Worker latitude/longitude validation (-90..90, -180..180, finite numeric values).
- Worker location selection via explicit browser geolocation ("Use Current Location") or manual Mapbox map pin/search.
- Dedicated immutable collection `WorkerLocationHistory` storing `workerId`, `address`, `lat`, `lng`, `effectiveFrom`, and `versionId`.
- Immutable publication cutoff (`interestPublishedAt`): Authoritatively stamps timestamp when requirement transitions from `draft` to `open`.
- Anti-manipulation enforcement: Historical Worker location valid at requirement publication cutoff is frozen for that opportunity. Location updates after publication affect ONLY future opportunities.
- Deadline extension invariance: Extending an interest deadline preserves the original `interestPublishedAt` and location cutoff.
- Backend geographic distance calculation (Haversine straight-line formula) using historical coordinates valid at cutoff.
- Hard maximum permitted distance enforcement (`actualDistanceKm <= maxDistanceKm`).
- Strict same-calendar-day assignment exclusion across events and requirements.
- Deterministic distance-only ranking with tie-breaking hierarchy (shorter distance -> earlier submission timestamp -> workerId).
- Clean extension point for future 55% performance / 45% distance ranking strategy.
- Automated tests: 18 location gate tests, 17 selection engine tests, 7 anti-manipulation tests, and 32 work requirements tests (100% passing).

Rules:
- Do not implement continuous GPS tracking.
- Location is declared on-demand by the worker.
- Distance calculation must happen on the backend using immutable historical cutoff.

17. Phase 15 - Confirmed Work and Attendance

Implement:

Confirmed Work
Check In
Check Out
Attendance history
Manager attendance summary

Attendance flow:

Confirmed Work
      ↓
Check In
      ↓
Work
      ↓
Check Out

Attendance states:

not_started
checked_in
checked_out
absent

Only confirmed Workers can record attendance.

18. Phase 16 - Worker Performance

Implement:

Worker performance rating
Performance score
Performance history where required

Rating range:

1 - 5

Performance may influence:

Future Worker ranking
Performance bonus

Worker cannot modify their own performance score.

19. Phase 17 - Wage Calculation

Implement the backend Wage Service.

Formula:

Base Wage
+ Travel Allowance
+ Performance Bonus
= Final Wage

Flow:

Attendance
   ↓
Performance
   ↓
Distance
   ↓
Wage Calculation
   ↓
Final Wage
   ↓
Worker Payment

The Worker cannot modify the final wage.

20. Phase 18 - Worker Payments

Implement:

Worker payment records
Payment status
Payment reference
Worker earnings
Event wage summary

Worker payment statuses:

pending
approved
paid

Worker can view only their own earnings.

Event Manager can view Worker Payments for assigned Events.

Admin can view system-wide Worker Payments.

21. Phase 19 - Event Manager Earnings

Implement:

Base salary
Event incentive
Total earnings

Formula:

Base Salary
+ Event Incentive
= Manager Earnings

Admin controls salary and incentive configuration.

Event Manager can view their own earnings.

22. Phase 20 - Event Expenses

Implement:

Create expense
Update expense
Delete expense
Event expense list
Expense summary

Categories:

Food Materials
Transport
Decoration Materials
Equipment
Other

Admin can view all expenses.

Event Manager can manage expenses for assigned Events according to permissions.

23. Phase 21 - Admin Reports

Implement:

Revenue report
Expense report
Profit report
Event statistics
Worker statistics
Service statistics

Basic formula:

Revenue - Expenses = Profit

Keep reporting simple and useful.

Avoid unnecessary charts and dashboards.

24. Phase 22 - Notifications

Implement notifications for:

New Work Opportunity
Worker Selected
Worker Not Selected
Payment Received
Event Update
Event Reminder

Basic flow:

Business Event
      ↓
Notification Service
      ↓
Notification Record
      ↓
User

Add realtime notification delivery after the basic notification system works.

25. Phase 23 - Realtime Communication

Implement Socket.IO for:

Client ↔ Event Manager chat
Event Manager ↔ Selected Workers chat
Realtime notifications
Worker selection notifications
Payment notifications

Do not add:

Voice calling
Video calling
Stories
Unnecessary realtime features
26. Phase 24 - Feedback

Implement:

Client feedback
Event rating
Comments
Feedback viewing

Rules:

Event must be completed.
Only the Event owner can submit feedback.
Normally one Feedback record per Event.
27. Phase 25 - Gallery

Implement:

Event gallery
Upload images
View images
Delete permitted images

Use ImageKit or Cloudinary.

Store URLs and metadata in MongoDB.

28. Phase 26 - AI Features

AI should be implemented after the core business workflow is stable.

Main AI feature:

Event Planning Assistant

Possible use cases:

Budget recommendations
Service recommendations
Event planning suggestions
Recruitment suggestions
Worker selection explanation

AI must NOT directly:

Process payments
Verify payments
Modify quotation amounts
Modify Worker wages
Change permissions
Change user roles

The backend remains the source of truth.

29. Phase 27 - WhatsApp Integration

WhatsApp is optional and should be implemented late.

Purpose:

Send notifications such as:

New Work Opportunity
Worker Selection Result
Important Event Update

Important:

Worker responses must still happen inside the EventOps application.

WhatsApp is only a notification channel.

30. Phase 28 - Testing

Add tests throughout development.

Authentication
Registration
Login
Logout
Password reset
Authorization
RBAC
Resource ownership
Events
Event creation
Event update
Event status transitions
Quotations
Price calculation
Discount
Advance calculation
Remaining balance
Payments
Razorpay order creation
Payment verification
Signature verification
Duplicate payment protection
Recruitment
Worker eligibility
Interested response
Not Interested response
Worker selection
Required count
Location
Distance calculation
Worker ranking
Wages
Wage calculation
Travel allowance
Performance bonus
Attendance
Check In
Check Out
Invalid attendance actions
Security
Unauthorized access
Cross-user data access
Protected fields
31. Phase 29 - API Documentation

Add Swagger / OpenAPI documentation.

Document:

Authentication
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
32. Phase 30 - CI/CD

Use GitHub Actions.

Pipeline:

Push / Pull Request
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

Do not merge broken code into the main branch.

33. Phase 31 - Docker

After the core application is stable:

Docker
├── Frontend
└── Backend

Use MongoDB Atlas for production.

Do not use Kubernetes.

34. Phase 32 - Deployment

Production architecture:

Internet
   ↓
HTTPS
   ↓
Nginx
   ├── React Frontend
   └── Node.js Backend
            ↓
       MongoDB Atlas

External services may include:

Razorpay
ImageKit / Cloudinary
Maps API
AI API
WhatsApp API
35. 8-Week Development Schedule
Week 1 - Foundation
Project setup
GitHub
Backend foundation
Frontend foundation
MongoDB
Authentication
CI setup
Week 2 - Users and Services
RBAC
User management
Worker creation
Event Manager creation
Worker types
Worker location
Worker availability
Services
Pricing
Week 3 - Client Events
Client Dashboard
Create Event Wizard
My Events
Event Details
Budget recommendation
Week 4 - Quotations and Payments
Quotation backend
Quotation UI
Client approval
Request changes
Razorpay
Payment verification
Event confirmation
Week 5 - Admin and Event Manager
Admin Events
Event Manager assignment
Manager Dashboard
Manager Events
[DONE] Event Control Center
Week 6 - Recruitment and Workers
[DONE] Work Requirements
Recruitment
Worker opportunities
Interested / Not Interested
Selection Engine
Selection results
Confirmed Work
Week 7 - Operations and Wages
Location
Distance calculation
Attendance
Performance
Wage calculation
Worker Payments
Manager earnings
Expenses
Week 8 - Completion and Deployment
Notifications
Realtime chat
Feedback
Gallery
AI
Optional WhatsApp
Testing
Swagger
Docker
CI/CD
Deployment
Bug fixing
Security review
36. Daily Development Workflow

For each development day:

1. Select one small feature
       ↓
2. Read existing code
       ↓
3. Create implementation plan
       ↓
4. Implement backend
       ↓
5. Implement frontend
       ↓
6. Add validation
       ↓
7. Add authorization
       ↓
8. Add tests
       ↓
9. Run application
       ↓
10. Verify in browser
       ↓
11. Review changes
       ↓
12. Commit
37. Antigravity Development Workflow

Use Antigravity as a development assistant.

For each feature:

Analyze existing code
        ↓
Create implementation plan
        ↓
Review plan
        ↓
Implement only approved feature
        ↓
Run tests
        ↓
Review diff
        ↓
Browser verification
        ↓
Commit

Example:

Implement the recruitment backend module only.

Follow the existing Modular Monolith architecture.

Use:

Route
→ Middleware
→ Controller
→ Service
→ Repository
→ Model

Do not modify unrelated modules.

Follow the project's AGENTS.md rules.

Add validation, authorization and tests.
38. Scope Control

Do not add the following unless explicitly approved:

Microservices
Kubernetes
Complex payroll
Full accounting system
Continuous GPS tracking
Voice calls
Video calls
Social media features
Unnecessary roles
Unnecessary dashboards
Unnecessary third-party services
39. Definition of Done

A feature is complete only when:

Backend implementation works.
Frontend implementation works.
Validation is added.
Authorization is added.
Database behavior is correct.
Critical tests pass.
Browser behavior is verified.
No unrelated code was changed.
Code is reviewed.
Git commit is created.
40. Final Development Order
Project Foundation
        ↓
Authentication
        ↓
RBAC / Users
        ↓
Services / Pricing
        ↓
Client Events
        ↓
Quotations
        ↓
Payments
        ↓
Admin Event Management
        ↓
Event Manager
        ↓
Recruitment
        ↓
Worker Opportunities
        ↓
Worker Selection Engine
        ↓
Confirmed Work
        ↓
Location / Distance
        ↓
Attendance
        ↓
Performance
        ↓
Wage Calculation
        ↓
Worker Payments
        ↓
Manager Earnings
        ↓
Expenses
        ↓
Reports
        ↓
Notifications
        ↓
Realtime Chat
        ↓
Feedback
        ↓
Gallery
        ↓
AI
        ↓
Optional WhatsApp
        ↓
Testing
        ↓
Swagger
        ↓
Docker
        ↓
CI/CD
        ↓
Deployment
41. Final Development Rules
Build incrementally.
Complete and verify each feature before moving to the next.
Follow the approved database design.
Follow the approved database relationships.
Follow the approved status and business rules.
Follow the approved API design.
Follow the approved architecture.
Keep business logic in Services.
Keep database access in Repositories.
Keep Controllers thin.
Enforce authorization on the backend.
Keep financial calculations on the backend.
Keep payment verification on the backend.
Keep Worker Selection on the backend.
Event Manager announces recruitment but does not manually select Workers.
Workers respond Interested / Not Interested.
Selection Engine selects eligible Workers using Worker Type, Availability, Distance and Performance.
Event Manager can create Workers, but creating a Worker does not automatically select or assign that Worker to an Event.
AI assists the system but does not control critical financial operations.
Do not introduce unapproved features.
Keep the project within the planned two-month scope.