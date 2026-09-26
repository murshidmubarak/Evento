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
10. Phase 8 - Client Payment

Implement Razorpay integration.

Flow:

Client
   ↓
Accept Quotation
   ↓
Awaiting Payment
   ↓
Create Razorpay Order
   ↓
Razorpay Checkout
   ↓
Backend Verification
   ↓
Payment = paid
   ↓
Required Advance Verified
   ↓
Event = confirmed

Implement:

[DONE] Create payment order (Payments Part 1)
Razorpay checkout (frontend - pending)
[DONE] Payment verification - HMAC-SHA256 + quotation cross-check + production amount/currency fetch (Payments Part 2)
[DONE] Signature verification (Payments Part 2)
[DONE] Payment record - model, repository, status lifecycle (Payments Part 1)
Payment history (future)
Payment details (future)
Remaining balance (future)

Never trust frontend payment success alone.

11. Phase 9 - Admin Event Management

Implement:

Admin Event list
Event details
Event status
Client information
Quotation information
Payment information
Event Manager assignment

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

Implement:

Manager Dashboard
My Events
Event Details
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

15. Phase 13 - Worker Selection Engine

Implement the backend Selection Engine.

Worker eligibility:

role = worker
workerType matches requirement
isActive = true
isAvailable = true
responseStatus = interested

Selection factors:

Worker Type
Availability
Distance
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
Selected / Not Selected
       ↓
Notify Workers

The Event Manager does not manually select Workers.

The backend Selection Engine is the source of truth.

16. Phase 14 - Location and Distance

Implement:

Worker latitude/longitude
Event latitude/longitude
Distance calculation
Worker ranking by distance
Travel allowance calculation

Do not implement continuous GPS tracking.

Distance calculation must happen on the backend.

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
Event Control Center
Week 6 - Recruitment and Workers
Work Requirements
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