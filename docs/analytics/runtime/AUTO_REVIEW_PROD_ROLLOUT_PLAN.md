# Controlled prod rollout plan: auto review request MVP

## Preconditions (must-pass on staging)

- `completed -> review request` stable for repeated runs
- idempotency confirmed (`bookingId` unique request, no duplicate review submits)
- reminder policy bounded and non-duplicating
- delivery status visible (`queued/sent/delivery_failed/skipped_*`, в т.ч. `skipped_no_email`, `skipped_staging_allowlist`)
- **E-mail:** настроены `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, **`PUBLIC_WEB_BASE_URL`**; в заявке в `guestContact` есть адрес получателя
- no critical UX/ops defects in review and moderation flow

## Rollout phases

1. **Phase A — dry run / без писем**
   - Запись `review_requests` при `completed` включена.
   - Варианты «без внешней доставки»: не вызывать `POST /jobs/run-review-reminders` / `POST /reviews/requests/process`, либо выставить **`REVIEW_REQUEST_EMAIL_DISABLED=1`** (статусы очереди обновляются, SMTP не используется).
   - Мониторинг объёма и статусов.

2. **Phase B — ограниченная отправка**
   - Реальная отправка: **`EMAIL_STAGING_ALLOWLIST`** (только тестовые ящики) или ручной контроль объёма.
   - См. `services/api/.env.example` (блок про review-request письма).

3. **Phase C — полная отправка**
   - Убрать staging allowlist (если был), держать SMTP и **`PUBLIC_WEB_BASE_URL`** боевыми.
   - Напоминания ограничены **`maxReminders`**; после отзыва — `skipped_review_exists`.

## Monitoring checklist

- Request creation count vs completed bookings
- Sent/failed/skipped distribution
- Reminder sends per booking (no > max policy)
- Review submit conversion
- Duplicate submit conflict rate
- Moderation backlog and publish latency

## Rollback switches

- Выключить cron/автоматизацию **`POST /jobs/run-review-reminders`** (и/или **`POST /reviews/requests/process`**)
- **`REVIEW_REQUEST_EMAIL_DISABLED=1`** — не слать письма, очередь можно крутить для отладки статусов
- Полный откат: убрать вызов `ensureReviewRequestForCompletedBooking` в пути `completed` (код — только при крайней необходимости)

## Ownership

- Product: review UX and reminders cadence
- Ops: scheduler/job execution and incident response
- Engineering: delivery adapter, idempotency guarantees, observability
