# EventOps ERP - Database Relationships

## 1. User → Events

One Client can create many Events.

Relationship:

Client (1) → Events (N)

Reference:

events.clientId → users._id

Only users with role = `client` can be referenced by `events.clientId`.


One Event Manager can manage many Events.

Relationship:

Event Manager (1) → Events (N)

Reference:

events.eventManagerId → users._id

Only users with role = `event_manager` can be referenced by `events.eventManagerId`.


## 2. Event → Services

One Event can use multiple Services.

One Service can be used by multiple Events.

Relationship:

Events (N) ↔ Services (N)

This is a many-to-many relationship.

Selected services are stored inside the Event.

Example:

selectedServices: [
  {
    serviceId: "...",
    quantity: 500
  },
  {
    serviceId: "...",
    quantity: 1
  }
]

Reference:

events.selectedServices.serviceId → services._id

Services are global records managed by Admin.


## 3. Event → Quotations

One Event can have multiple Quotations, representing quotation revisions.

This allows maintaining a full quotation history. A new quotation revision is created when commercial changes are needed, without modifying historical quotations.
The `quotationNumber` identifies the quotation thread, while the `revision` number distinguishes the specific version.

Every revision captures a self-contained tax snapshot (tax type, rate, GST treatment, taxable amount, calculated tax amounts including CGST/SGST/IGST, place of supply, and customer GSTIN).
A quotation represents a commercial offer and is not a tax invoice.

Relationship:

Event (1) → Quotations (N)

Reference:

quotations.eventId → events._id

A quotation also belongs to a Client.

Reference:

quotations.clientId → users._id

The Client must be the owner of the related Event.


## 4. Quotation → Payments

One Quotation can have multiple Payments.

Commercial Workflow:
Service Catalog → Event Request + Preferences → Quotation (Tax Snapshot) → Client Accepts → Event (awaiting_payment) → Advance Order Creation → Razorpay Payment

The Payment creation resolves the authoritative `advanceAmount` and `finalAmount` directly from the accepted Quotation stored in the database.

Examples:

- Advance Payment
- Second Payment
- Final Payment

Relationship:

Quotation (1) → Payments (N)

Reference:

payments.quotationId → quotations._id

Payments also reference the related Event.

Reference:

payments.eventId → events._id


### 4.1 Payment → Installments (Multi-Allocation)

A single verified Payment transaction can be allocated across multiple scheduled installments within the accepted Quotation:

- Provider transaction identity is preserved (single provider payment and order, never artificially duplicated).
- The `Payment.allocations` array durably records the allocation breakdown across the quotation's configured `paymentPlan`:
  `allocations: [{ installmentIndex, installmentId, installmentTitle, allocatedAmount }]`
- Relationship:
  Payment (1) → Installment Allocations (N) [Embedded]
- Installment verified amounts and outstanding balances are derived by aggregating verified payment allocations attributable to each installment.
- For full-quotation settlement, `isFullPayment: true` records that the payment settled the remaining quotation balance in a single transaction.


## 5. Client → Payments

One Client can make many Payments.

Relationship:

Client (1) → Payments (N)

Reference:

payments.clientId → users._id

A Client can make payments only for their own Events.


## 6. Event → Work Requirements

One Event can have many Work Requirements.

Example:

Wedding Reception
- 20 Catering Boys
- 3 Catering Supervisors
- 2 Chefs
- 3 Cameramen
- 2 Videographers
- 8 Decoration Workers

Relationship:

Event (1) → Work Requirements (N)

Reference:

workRequirements.eventId → events._id


## 7. Event Manager → Work Requirements

One Event Manager can create many Work Requirements.

Relationship:

Event Manager (1) → Work Requirements (N)

Reference:

workRequirements.createdBy → users._id

Only the Event Manager assigned to the Event can create recruitment
requirements for that Event.


## 8. Work Requirement → Work Responses

One Work Requirement can receive responses from many Workers.

Relationship:

Work Requirement (1) → Work Responses (N)

Reference:

workResponses.requirementId → workRequirements._id


## 9. Worker → Work Responses

One Worker can respond to many Work Requirements.

Relationship:

Worker (1) → Work Responses (N)

Reference:

workResponses.workerId → users._id

Only users with role = `worker` can be referenced by `workerId`.


## 10. Worker Selection

The Event Manager does NOT manually select workers.

Recruitment flow:

Event Manager
→ Creates Work Requirement
→ Announces Work Opportunity
→ Eligible Workers receive notification
→ Workers choose Interested / Not Interested
→ System collects responses
→ AI / Selection Engine evaluates interested workers
→ Workers are ranked
→ Required number of workers are selected
→ Workers see Selected / Not Selected
→ Selected Workers see Confirmed Work

Only workers with:

responseStatus = `interested`

enter the selection process.

Selection considers:

1. Worker Type
2. Availability
3. Distance from Event
4. Performance Score
5. Required Worker Count

Distance and performance are the main ranking factors.

The Event Manager can view the result but cannot manually select workers.


## 11. Event → Attendance

One Event can have many Attendance records.

Relationship:

Event (1) → Attendance (N)

Reference:

attendance.eventId → events._id


## 12. Worker → Attendance

One Worker can have many Attendance records.

Relationship:

Worker (1) → Attendance (N)

Reference:

attendance.workerId → users._id

Attendance should only be recorded for confirmed work.


## 13. Event → Worker Payments

One Event can generate many Worker Payments.

Relationship:

Event (1) → Worker Payments (N)

Reference:

workerPayments.eventId → events._id


## 14. Worker → Worker Payments

One Worker can receive many Worker Payments.

Relationship:

Worker (1) → Worker Payments (N)

Reference:

workerPayments.workerId → users._id

Worker Payments belong to the relevant Event and confirmed work.


## 15. Event → Expenses

One Event can have many Expenses.

Example categories:

- Food Materials
- Transport
- Decoration Materials
- Equipment
- Other

Relationship:

Event (1) → Expenses (N)

Reference:

expenses.eventId → events._id

The User who created the expense is stored as:

expenses.createdBy → users._id


## 16. User → Notifications

One User can receive many Notifications.

Relationship:

User (1) → Notifications (N)

Reference:

notifications.userId → users._id

A Notification can optionally reference an Event.

Reference:

notifications.relatedEventId → events._id


## 17. Event → Messages

One Event can contain many Messages.

Relationship:

Event (1) → Messages (N)

Reference:

messages.eventId → events._id


## 18. User → Messages

One User can send many Messages.

Relationship:

User (1) → Messages (N)

References:

messages.senderId → users._id

messages.receiverId → users._id

Allowed communication:

Client ↔ Event Manager

Event Manager ↔ Selected Workers

Workers cannot directly communicate with unrelated Clients.


## 19. Event → Feedback

One Event normally has one Client Feedback after completion.

Relationship:

Event (1) → Feedback (1)

References:

feedback.eventId → events._id

feedback.clientId → users._id

Only the Client who owns the Event can submit Feedback.

Feedback should only be allowed after the Event is completed.


## 20. Event → Gallery

One Event can contain many Gallery Images.

Relationship:

Event (1) → Gallery (N)

Reference:

gallery.eventId → events._id

The User who uploads the image is stored as:

gallery.uploadedBy → users._id


# 21. Main ER Relationship

```text
                                  USERS
                                    |
            ┌───────────────────────┼───────────────────────┐
            |                       |                       |
          CLIENT              EVENT MANAGER              WORKER
            |                       |                       |
            | creates               | manages               |
            ▼                       ▼                       |
          EVENTS                                          |
            |                                             |
   ┌────────┼───────────────┐                             |
   |        |               |                             |
   ▼        ▼               ▼                             |
SERVICES  QUOTATIONS     EXPENSES                         |
   |        |                                             |
   |        ▼                                             |
   |     PAYMENTS                                         |
   |                                                     |
   └─────────────────────────────────────────────────────┘

                         EVENTS
                           |
                           ▼
                   WORK REQUIREMENTS
                           |
                           ▼
                    WORK RESPONSES
                           |
                           ▼
                         WORKER
                           |
                ┌──────────┼──────────┐
                |          |          |
                ▼          ▼          ▼
            ATTENDANCE   PAYMENTS   PERFORMANCE

                         EVENTS
                           |
              ┌────────────┼─────────────┐
              |            |             |
              ▼            ▼             ▼
          MESSAGES      FEEDBACK       GALLERY

### Installment Payment & Link Renewal Relationships

```text
Quotation.paymentPlan[i] (1)
     │
     ├── (Many) Payment (paymentType: 'installment', installmentIndex: i)
     │              ├── Verified payments (status: 'paid') -> aggregate to verifiedPaidAmount
     │              └── Outstanding amount = scheduledAmount - sum(verifiedPaidAmount)
     │
     └── (Many) Payment Links & History
                    ├── Active link (linkStatus: 'active')
                    ├── Previous expired/replaced links (linkStatus: 'replaced', previousPaymentId chain)
                    └── Renewal audit (renewedAt, renewedBy -> ref: users)
```
