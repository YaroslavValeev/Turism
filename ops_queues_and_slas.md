# Ops Queues and SLAs

## Queue 1 — New Leads
Target:
- triage within same business day
- sent_to_organizer within 24h

## Queue 2 — Stalled Contact
Condition:
- no organizer response within SLA
Action:
- nudge organizer
- founder escalation if repeated

## Queue 3 — Booking Confirmation
Condition:
- contacted but no clear outcome
Action:
- request outcome
- move to booked / cancelled / paused

## Queue 4 — Completion Proof
Condition:
- event date passed, no completed evidence
Action:
- request organizer confirmation
- hold commission accrual

## Queue 5 — Reviews
Condition:
- completed booking; запись `review_requests` создана; письмо не ушло или гость не оставил отзыв
Action:
- в течение **24–48h** после `completed` обеспечить проход очереди: **`POST /jobs/run-review-reminders`** или **`POST /reviews/requests/process`** (admin), при настроенном SMTP и **`PUBLIC_WEB_BASE_URL`**; в заявке должен быть e-mail в `guestContact` (иначе статус `skipped_no_email`). См. [docs/analytics/runtime/AUTO_REVIEW_PROD_ROLLOUT_PLAN.md](docs/analytics/runtime/AUTO_REVIEW_PROD_ROLLOUT_PLAN.md).

## Queue 6 — Refunds / Complaints
Condition:
- cancellation / incident / dispute opened
Action:
- assign owner
- apply SLA by severity

## SLA bands
- safety / fraud / legal threat: immediate founder escalation
- refund / complaint: same day triage
- normal lead ops: within 24h
