# Endpoint Contracts

## 0. Root / health
- GET / — краткий JSON (сервис жив); для SLA используйте GET /health
- GET /health

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
- POST /jobs/run-review-reminders (admin) — очередь напоминаний / отправка review-request по e-mail
- POST /reviews/requests/process (admin) — обработка очереди `review_requests` (в т.ч. первая отправка)
- POST /internal/jobs/run-stale-lead-check

## Contract rules
- all mutating endpoints write audit logs
- status changes validate canonical enums
- financial endpoints require owner / role checks
