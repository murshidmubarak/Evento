# EventOps ERP - Development Rules

## 1. Project Architecture

This project uses a Modular Monolith architecture.

Backend structure:

Route
→ Middleware
→ Controller
→ Service
→ Repository
→ Model
→ MongoDB

Each business feature must be separated into its own module.

Example:

modules/
└── events/
    ├── event.model.js
    ├── event.repository.js
    ├── event.service.js
    ├── event.controller.js
    ├── event.routes.js
    └── event.validation.js


## 2. User Roles

Only these four roles exist:

- admin
- client
- event_manager
- worker

Do not create additional roles unless explicitly approved.


## 3. Worker System

Worker is a single role.

Worker specialization is stored using workerType.

Possible worker types:

- catering_boy
- catering_supervisor
- chef
- cameraman
- photographer
- videographer
- decoration_worker
- juice_worker
- host


## 4. Worker Recruitment

There is NO direct assignment or manual selection of workers by the Event Manager.

The workflow is:

Event Manager creates and announces work requirement
→ Eligible workers receive work opportunity
→ Worker chooses Interested / Not Interested
→ System collects interested workers
→ AI selection engine selects required workers
→ Worker sees Selected / Not Selected
→ Selected worker sees Confirmed Work

## 5. AI Worker Selection

The AI / Selection Engine selects workers from those who marked
the work opportunity as Interested.

Selection should consider:

1. Worker Type
2. Availability
3. Distance from worker to event
4. Worker performance score
5. Required worker count

Distance and performance are the main ranking factors.

The selection process should be deterministic, predictable,
testable and executed on the backend.

Example:

Required workers: 3 Cameramen

Interested workers:

Ahmed   → 3 km → 4.8 performance
Rashid  → 5 km → 4.6 performance
Sameer  → 8 km → 4.2 performance
Nihal   → 2 km → 3.8 performance

The system ranks eligible workers using the defined selection
criteria and selects the required number.

The Event Manager only:

- creates the requirement
- announces the recruitment
- views recruitment status
- views the selected workers

The Event Manager does NOT manually select workers.


## 6. Communication

Client initially communicates with Admin.

After an Event Manager is assigned:

Client ↔ Event Manager

Internal event communication:

Event Manager ↔ Selected Workers

Clients should not directly communicate with individual workers.


## 7. Authentication

There is one common login page.

After authentication, redirect based on role:

admin → /admin
client → /client
event_manager → /manager
worker → /worker

Public signup is only for clients.

Admin creates Event Managers and Workers.


## 8. Authorization

Authentication is not enough.

Every protected resource must also verify ownership/permission.

Examples:

- Client can access only their own events.
- Manager can access only events assigned to them.
- Worker can access only their own earnings.
- Worker cannot change their wage.
- Client cannot change quotation amounts.
- Manager cannot access unrelated events.


## 9. Financial Rules

Financial calculations must happen on the backend.

The frontend must never be the source of truth for:

- quotation amount
- payment amount
- remaining amount
- worker wage
- distance allowance
- performance bonus

Example worker wage:

Base Wage
+ Distance Allowance
+ Performance Bonus
= Final Wage


## 10. Payment Rules

Never trust payment success received only from the frontend.

Payment flow:

Create Razorpay Order
→ Razorpay Checkout
→ Backend Payment Verification
→ Save Payment
→ Update Event/Quotation Status


## 11. AI Rules

AI is an assistant only.

AI can:

- recommend services
- suggest budget allocation
- explain options
- help with event planning

AI must NOT directly:

- process payments
- verify payments
- modify payment status
- modify quotation amounts
- modify worker wages


## 12. Location Rules

Store worker and event location using:

- address
- latitude
- longitude

Use location mainly for:

- distance calculation
- worker eligibility/ranking
- travel allowance

Do not implement continuous worker GPS tracking.


## 13. Wage Rules

Wage calculation must happen on the backend.

Possible calculation:

baseWage
+ travelAllowance
+ performanceBonus
= finalWage

Worker cannot modify any of these values.


## 14. Backend Coding Rules

Do not place business logic directly inside controllers.

Controllers should handle:

- request
- response
- calling services

Services should contain business logic.

Repositories should handle database access.

Models should contain Mongoose schemas.


## 15. Validation

Validate incoming request data before business logic.

Use validation middleware/schema for:

- request body
- params
- query parameters

Never trust client-side validation alone.


## 16. Error Handling

Use centralized error handling.

Do not write duplicated try/catch response logic throughout the project.

Use consistent API responses.


## 17. Database Rules

Use MongoDB with Mongoose.

Keep database queries inside repositories where practical.

Do not put raw database queries inside controllers.


## 18. API Rules

Use REST APIs.

Example:

GET    /api/events
GET    /api/events/:id
POST   /api/events
PATCH  /api/events/:id
DELETE /api/events/:id


## 19. Realtime

Use Socket.IO only where realtime communication is actually required.

Main realtime features:

- chat
- notifications
- worker opportunity notifications
- worker selection notifications
- payment notifications


## 20. Scope Control

Do not add features that are not part of the approved project scope.

Avoid:

- microservices
- Kubernetes
- unnecessary abstractions
- unnecessary pages
- unnecessary roles
- unnecessary third-party services

The project should remain manageable within approximately two months.


## 21. Code Quality

Prefer:

- small functions
- clear names
- reusable logic
- modular code
- proper error handling
- meaningful comments only when necessary

Do not create duplicate logic.


## 22. Frontend Rules

Frontend uses:

- React
- Vite
- React Router
- Redux Toolkit
- Axios
- Tailwind CSS

Use role-based layouts:

AdminLayout
ClientLayout
ManagerLayout
WorkerLayout

- Configuration: Do not hardcode API base URLs or provide local fallbacks (e.g., `|| 'http://localhost:5000/api'`). Always strictly rely on environment variables (`import.meta.env.VITE_API_URL`) to prevent accidental localhost references in production deployments.


## 23. Development Workflow

For every feature:

1. Analyze existing code.
2. Create implementation plan.
3. Implement only the requested feature.
4. Run tests.
5. Check for errors.
6. Verify in browser when applicable.
7. Review changes.
8. Commit the feature.

Do not modify unrelated modules.


## 24. Important Business Rule

The backend is the source of truth.

Frontend should never be trusted for:

- permissions
- financial calculations
- worker selection
- payment verification
- event ownership
- wage calculation


## 25. Do Not Change These Rules

The following are fixed unless explicitly approved:

- Four roles only.
- Worker is one role with workerType.
- Event Manager announces work opportunities.
- Worker responds Interested / Not Interested.
- Event Manager does NOT manually select workers.
- AI / Selection Engine selects workers.
- Worker selection considers worker type, availability, distance and performance.
- Backend handles financial calculations.
- Backend handles worker selection rules.
- Client initially communicates with Admin.
- One common login page.
- Modular Monolith architecture.


### TypeScript Rules

- The entire EventOps application must use TypeScript.
- Backend files must use `.ts`.
- Frontend React files must use `.tsx` where JSX is used.
- Frontend non-JSX files should use `.ts`.
- Do NOT create new JavaScript `.js` or `.jsx` source files.

### Backend Module System

- Backend must use ES Modules (ESM).
- Use `import` and `export`.
- Do NOT use `require()` or `module.exports`.
- Backend package.json must use:
  `"type": "module"`
- Configure TypeScript for Node.js ESM.
- Use proper ESM import syntax consistently.



### Technology Stack Rules

- Backend: Node.js + Express + TypeScript + Mongoose.
- Database: MongoDB.
- Frontend: React + Vite + TypeScript.
- Backend source files must use `.ts`.
- Frontend React files must use `.tsx`.
- Frontend non-JSX files must use `.ts`.
- Do not create `.js` or `.jsx` source files.
- Backend must use ES Modules (ESM).
- Use `import` and `export`.
- Do not use `require()` or `module.exports`.
- Backend package.json must contain `"type": "module"`.




```md
### Bug and Change Impact Management

Before investigating any bug or error:

1. Read `docs/08-bug-log.md`.
2. Search for the exact error message, keyword, affected module, or similar symptom.
3. If the bug already exists, review the documented solution before starting a new investigation.
4. If the bug occurs again, append a recurrence record to the existing Bug ID instead of creating a duplicate entry.
5. Record every verified important bug and its solution in `docs/08-bug-log.md`.

Before making a significant change to an existing file, shared utility, shared type, API contract, database model, business rule, authentication system, authorization system, financial logic, or architectural component:

1. Read `docs/09-change-impact-log.md`.
2. Identify directly and indirectly affected files/modules.
3. Determine the impact level.
4. For High or Critical/Serious changes, STOP before implementation.
5. Show the developer:
   - requested change
   - impact level
   - affected files
   - affected modules
   - affected APIs
   - affected database structures
   - affected frontend areas
   - affected tests
   - business rules affected
   - architecture impact
6. Proceed only after explicit approval for High/Critical changes.
7. Record significant cross-file changes in `docs/09-change-impact-log.md`.

Do not silently modify dependent files when a change has High or Critical impact.