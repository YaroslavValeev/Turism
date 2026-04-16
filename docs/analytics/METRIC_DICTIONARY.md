# Metric Dictionary (MyWave Analytics) — v1

Документ фиксирует **канонические определения KPI** для Этапа 1 (Founder + Billing + server-side critical events).

Принципы:

- **Server truth first**: финансовые и статусные KPI считаются из бизнес-таблиц Postgres, а не из клиентских событий.
- **Event stream** (`analytics_events`) — для трассировки, алертов и будущих воронок; KPI в MVP допускается считать напрямую из доменных таблиц + materialized views.
- **No PII в аналитических событиях**: см. `docs/analytics/PRIVACY_AND_CONSENT.md`.

## Словарь сущностей (IDs)

- `organizer_id`: `Organizer.id`
- `program_id`: `Program.id`
- `lead_id`: `Lead.id` (если есть)
- `booking_id`: `Booking.id`
- `payment_id`: `Payment.id`
- `refund_id`: `Refund.id`
- `commission_id`: `Commission.id`
- `statement_id`: `BillingStatement.id`

## North Star Metrics (NSM)

### NSM_core — «состоявшиеся бронирования у verified organizers»

Определение (MVP, daily grain):

- **Числитель**: количество `Booking`, у которых:
  - `bookingStatus IN ('completed', 'paid_full')`
  - `Organizer.verificationStatus IN ('verified', 'trusted_by_platform')`
- **Временная ось (MVP)**: `date_trunc('day', Booking.updatedAt)` (в v2 лучше `fact_booking_state_at` / event-sourced transitions)
- **Знаменатель (опционально)**: не используется в v1 (это count metric)

### NSM_extended — «ранние подтверждения спроса у verified organizers»

Определение (MVP, daily grain):

- **Числитель**: количество `Booking`, у которых:
  - `bookingStatus IN ('booked', 'paid_partial')`
  - `Organizer.verificationStatus IN ('verified', 'trusted_by_platform')`
- **Временная ось (MVP)**: `date_trunc('day', Booking.updatedAt)`

## Supply (организаторы и каталог)

### new_organizers

- **Определение**: количество созданных организаторов за период.
- **Источник**: `Organizer.createdAt`.

### active_organizers

- **Определение (MVP)**: организаторы с `verificationStatus NOT IN ('rejected','paused')` и наличием хотя бы одной `Program` со `publishStatus='published'` за последние N дней (N=30 по умолчанию) — уточняется в mart SQL.
- **Источник**: `Organizer`, `Program`.

### active_programs

- **Определение**: количество программ со `publishStatus='published'`.
- **Источник**: `Program.publishStatus`.

### verified_organizers / trusted_organizers

- **Определение**: count по `Organizer.verificationStatus`.
- **Источник**: `Organizer.verificationStatus`.

### programs_with_full_content_ratio

- **Определение**: доля опубликованных программ, где заполнены обязательные поля карточки (список полей фиксируется в publish gate).
- **Источник**: `Program` + правила publish gate (см. `services/api/src/modules/programs/publishGate.ts` в будущем расширении).

### programs_with_safety_ratio

- **Определение**: доля опубликованных программ с заполненными safety-полями (risk/medical/cancellation).
- **Источник**: `Program`.

### programs_with_reviews_ratio

- **Определение**: доля программ с ≥1 approved review за период.
- **Источник**: `Review` + `Program`.

### moderation_time_median

- **Определение**: медиана времени от создания сущности до смены статуса модерации.
- **Источник (MVP)**: `AuditLog` + `Review` (в v2 — отдельные `moderation_events`).

### organizer_verification_completion_rate

- **Определение**: доля организаторов, достигших `verificationStatus IN ('verified','trusted_by_platform')` среди не `rejected`.
- **Источник**: `Organizer`.

## Demand (трафик и воронка)

> Для web-трафика в MVP используем GA4/YM + server ingest `page_view` (см. EVENT_TAXONOMY). Ниже — бизнес-воронка.

### sessions / unique_users

- **Источник**: GA4/YM (не храним в Postgres в MVP, кроме агрегатов BI).

### catalog_views / program_views

- **Источник**: frontend events (`view_item_list`, `view_item`) + GA4.

### search_usage_rate / filter_usage_rate

- **Определение**: доля сессий с `search` / `apply_filter`.
- **Источник**: frontend events.

### view_to_lead_rate

- **Определение**: `leads / program_views` (нужна согласованная атрибуция program_id).
- **Источник**: `Lead` + frontend views.

### lead_to_contacted_rate

- **Определение**: доля лидов, дошедших до `leadStatus` после `contacted` (или booking pipeline proxy).
- **Источник**: `Lead.leadStatus` + `AuditLog` (v2).

### contacted_to_booked_rate

- **Определение**: `count(bookings where status>=booked) / contacted_leads` (нужна модель связи lead↔booking; в MVP используем `Booking.leadId`).

### booked_to_paid_rate

- **Определение**: доля `Booking` со статусами оплаты среди `booked`.
- **Источник**: `Booking.bookingStatus`, `Booking.paidAmountRub`.

### paid_to_completed_rate

- **Определение**: доля `completed` среди оплаченных (`paid_partial|paid_full|paid_off_platform`).
- **Источник**: `Booking`.

### visit_to_completed_booking_rate

- **Определение**: `completed_bookings / sessions` (через BI join по campaign/session surrogate).

## Trust / Safety

### review_coverage_ratio

- **Определение**: доля `completed` bookings с approved review.
- **Источник**: `Booking`, `Review`.

### avg_rating

- **Определение**: среднее по `Review.rating` для `moderationStatus='approved'`.
- **Источник**: `Review`.

### NPS / CSAT

- **Источник**: отдельные события `nps_submitted` + хранение ответов вне PII полей (v2 таблица).

### complaint_rate_per_100_bookings

- **Определение**: `100 * complaints / bookings_in_window`.
- **Источник**: `Incident`, `Booking`.

### refund_rate

- **Определение**: `refundedAmountRub_sum / paidAmountRub_sum` по bookings за период.
- **Источник**: `Booking`, `Refund`.

### repeat_customer_rate

- **Определение (MVP proxy)**: доля гостей с повторным `guestContact` hash (не храним raw) — v2.

### organizer_response_time / confirmation_rate / completion_rate

- **Источник (MVP)**: `Booking.firstResponseAt`, статусы, `completedAt`.

## Revenue / Billing

### GMV / paid_GMV / completed_GMV

- **Определение (MVP)**:
  - `paid_GMV`: сумма `Payment.amountRub` за период
  - `refunded_amount`: сумма `Refund.amountRub`
  - `net_GMV`: сумма `Booking.netAmountRub` (или `paid-refund` на booking grain)
  - `GMV`: в продуктовой терминологии = `net_GMV` (зафиксировать в отчётах; legacy `gmvRub` не смешивать)

### commission_accrued / approved / invoiced / paid / reversed

- **Источник**: `Commission.reconciliationStatus` + суммы `commissionAmountRub`.

### take_rate / effective_take_rate

- **Определение**:
  - `take_rate = commission_amount / gross_amount` (если gross определён)
  - `effective_take_rate = commission_amount / net_amount`

### commission_collection_rate

- **Определение**: `paid_commission / invoiced_commission` за период.

### disputed_commission_amount

- **Источник**: `Commission` где `reconciliationStatus='disputed'`.

## Organizer Success

> В MVP — агрегаты по `organizer_id` из bookings/leads/views.

### views_per_program / leads_per_program / booked_per_program / paid_per_program / completed_per_program

- **Источник**: joins `Program` + `Lead` + `Booking` + frontend events (views).

### revenue_per_active_organizer

- **Источник**: `net_GMV` по organizer за период / active organizers.

### organizer_content_score

- **Источник**: правила completeness (v2 scorecard).

## Product / Ops

### Core Web Vitals (LCP/INP/CLS)

- **Источник**: GA4/Chrome UX (не в Postgres MVP).

### zero_search_results_rate

- **Источник**: frontend `search` events с флагом `results_count=0`.

### booking_form_error_rate

- **Источник**: frontend + server validation counters.

### onboarding_dropoff_by_step

- **Источник**: frontend step events + server milestones.

### contract_download_rate / statement_download_rate

- **Источник**: `contract_download_*` + `statement_downloaded` (v2).

### event_ingestion_lag

- **Определение**: `ingested_at - event_time` p95 по `analytics_events`.

### failed_payment_sync_count

- **Источник**: `analytics_event_errors` + billing job errors (v2).

### dispute_resolution_time

- **Источник**: `Incident` timestamps + audit.

### moderation_queue_time

- **Источник**: `Review` + audit.

## Частота пересчёта (ритм)

- **Daily ops**: bookings/payments/refunds/complaints/ingestion health — из marts `*_daily`.
- **Weekly**: NSM + conversion deltas — BI.
- **Monthly**: GMV/net/commission realized — BI + billing mart.

## Владельцы метрик (рекомендация)

- **Product**: NSM, demand funnel, organizer success.
- **Ops/Trust**: complaints/refunds/SLA.
- **Finance**: billing commissions + aging.
- **Engineering**: ingestion health + data quality SLO.
