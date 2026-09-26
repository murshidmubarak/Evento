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
- revision
- eventId
- clientId

Items (price snapshot):
- serviceId
- name
- description
- pricingType
- requirements
- quantity
- unitPrice
- amount

Financial & Tax Snapshot:
- subtotal
- discount
- taxableAmount
- tax (tax snapshot object):
  - taxType (none | gst | vat | custom)
  - taxRate (percentage, configurable)
  - gstTreatment (intra_state | inter_state | exempt | none)
  - taxableAmount (subtotal - discount)
  - taxAmount (backend-calculated tax total)
  - cgst (for intra-state GST)
  - sgst (for intra-state GST)
  - igst (for inter-state GST)
  - placeOfSupply (place of supply / state reference)
  - customerGstin (optional customer tax identity)
- finalAmount (taxableAmount + taxAmount)
- advanceAmount (authoritative for payment order)
- remainingAmount (finalAmount - advanceAmount)

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
- quotationId
- clientId
- paymentType
- amount
- currency
- status
- razorpayOrderId
- razorpayPaymentId
- receiptReference
- createdAt
- updatedAt


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