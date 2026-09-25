# EventOps ERP - Database Design

## 1. Users

Collection: users

Fields:

- name
- email
- password
- role
- workerType
- phone
- profileImage

Location:
- address
- lat
- lng

Worker Details:
- baseWage
- performanceScore
- isAvailable

Account:
- isActive
- googleId
- createdAt
- updatedAt


## 2. Events

Collection: events

Fields:

- clientId
- eventManagerId
- title
- eventType
- date
- startTime
- endTime

Location:
- address
- lat
- lng

- guestCount
- budget
- selectedServices
- status
- createdAt
- updatedAt


## 3. Services

Collection: services

Fields:

- name
- description
- pricingType
- isActive
- createdAt
- updatedAt


## 4. Quotations

Collection: quotations

Fields:

- quotationNumber
- eventId
- clientId

Items:
- serviceId
- name
- description
- quantity
- unitPrice
- amount

Financial:
- subtotal
- discount
- finalAmount
- advancePercentage
- advanceAmount
- remainingAmount

- validUntil
- notes
- terms
- status
- createdBy
- createdAt
- updatedAt


## 5. Payments

Collection: payments

Fields:

- eventId
- clientId
- quotationId
- amount
- razorpayOrderId
- razorpayPaymentId
- razorpaySignature
- status
- paymentDate
- createdAt


## 6. Work Requirements

Collection: workRequirements

Fields:

- eventId
- createdBy
- workerType
- requiredCount
- reportingTime
- baseWage
- status
- createdAt
- updatedAt


## 7. Work Responses

Collection: workResponses

Fields:

- requirementId
- workerId
- responseStatus
- respondedAt
- selectedAt
- createdAt


Possible responseStatus values:

- not_responded
- interested
- not_interested
- selected
- not_selected


## 8. Attendance

Collection: attendance

Fields:

- eventId
- workerId
- checkIn
- checkOut
- status
- createdAt
- updatedAt


## 9. Worker Payments

Collection: workerPayments

Fields:

- eventId
- workerId
- baseWage
- distance
- travelAllowance
- performanceBonus
- finalWage
- paymentDate
- paymentReference
- status
- createdAt
- updatedAt


## 10. Expenses

Collection: expenses

Fields:

- eventId
- category
- description
- amount
- date
- createdBy
- createdAt
- updatedAt


## 11. Notifications

Collection: notifications

Fields:

- userId
- type
- title
- message
- relatedEventId
- isRead
- createdAt


## 12. Messages

Collection: messages

Fields:

- eventId
- senderId
- receiverId
- message
- messageType
- fileUrl
- createdAt


## 13. Feedback

Collection: feedback

Fields:

- eventId
- clientId
- rating
- comment
- createdAt
- updatedAt


## 14. Gallery

Collection: gallery

Fields:

- eventId
- uploadedBy
- imageUrl
- createdAt