# Endpoint Contracts

## 1. Auth
- POST /auth/register
- POST /auth/login
- POST /auth/logout
- GET /auth/me

## 2. Organizers
- GET /organizers
- GET /organizers/:id
- POST /organizers
- PATCH /organizers/:id
- PATCH /organizers/:id/verification-status
- GET /organizers/:id/programs

## 3. Programs
- GET /programs
- GET /programs/:id
- POST /programs
- PATCH /programs/:id
- PATCH /programs/:id/publish-status
- GET /programs/:id/reviews

## 4. Bookings
- POST /bookings
- GET /bookings/:id
- GET /bookings
- PATCH /bookings/:id/status
- PATCH /bookings/:id/financials
- POST /bookings/:id/confirm-completion

## 5. Reviews
- POST /reviews
- GET /reviews
- PATCH /reviews/:id/moderation-status

## 6. Incidents
- POST /incidents
- GET /incidents
- GET /incidents/:id
- PATCH /incidents/:id/status
- PATCH /incidents/:id/severity

## 7. Commissions
- GET /commissions
- POST /commissions/accrue
- PATCH /commissions/:id/reconciliation-status
- PATCH /commissions/:id/payment-status

## 8. Notifications / Jobs
- POST /internal/notifications/send
- POST /internal/jobs/run-review-request
- POST /internal/jobs/run-stale-lead-check

## Contract rules
- all mutating endpoints write audit logs
- status changes validate canonical enums
- financial endpoints require owner / role checks
