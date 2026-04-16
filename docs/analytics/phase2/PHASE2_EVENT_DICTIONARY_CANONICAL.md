# Реестр событий (Event Dictionary) — Phase 2

**Цель:** до разрастания схемы зафиксировать контракт каждого `event_name`: кто эмитит, зачем, как дедуплицировать, что нельзя слать, какие витрины затрагивает.

**Общий envelope:** см. `docs/analytics/EVENT_TAXONOMY.md` (обязательные поля, allowlist).

**Статусы реализации:** `implemented` (в коде), `planned` (в таксономии, без прод-эмита).

Легенда `emitted_by`: `web_client` | `api_backend` | `api_internal` | `system_job`.

---

## Реализованные backend-события (MVP spine)

| event_name | trigger | emitted_by | frontend/backend/internal | required_params | optional_params | dedupe_key (канон) | idempotency rule | PII policy | downstream marts | dashboards impacted |
|------------|---------|------------|---------------------------|-----------------|-----------------|--------------------|-------------------|------------|------------------|----------------------|
| `payment_recorded` | Успешная запись `Payment` после `recordPayment` | api_backend | backend | `event_time`, `idempotency_key`, `event_source=backend`, `booking_id`, `payment_id`, `organizer_id`, `program_id` | `payment_status`, `gross_amount`, `properties_json.payment_kind` | `payment_recorded:<paymentId>` | Повтор с тем же ключом и **тем же fingerprint** → duplicate; другой payload → error row | Не включать notes/external ref с PII | `mv_billing_daily` (косвенно через payments), cash facts | Billing |
| `refund_recorded` | Успешная запись `Refund` | api_backend | backend | `refund_id`, `booking_id`, `organizer_id`, `program_id`, `refund_amount` | `payment_id`, `properties_json.status` | `refund_recorded:<refundId>` | как выше | как выше | mv_billing_daily | Billing |
| `commission_accrued` | `reconciliationStatus` стал `accrued` после пересчёта | api_backend | backend | `commission_id`, `organizer_id`, `program_id`, `booking_id`, `commission_amount`, `commission_rate` | `lead_id`, `properties_json.reconciliation_status` | `commission_accrued:<commissionId>:<amount>:<rateBps>` | как выше | как выше | mv_billing_daily, founder commission | Billing, Founder |
| `commission_reversed` | Статус `reversed` | api_backend | backend | как выше | как выше | `commission_reversed:<commissionId>:<amount>:<rateBps>` | как выше | как выше | mv_billing_daily | Billing |
| `statement_generated` | Создан `BillingStatement` в `generateMonthlyStatement` | api_backend | backend | `statement_id`, `organizer_id`, суммы statement | `properties_json.period_*`, `commission_count` | `statement_generated:<statementId>` | как выше | не включать free-text notes | mv_billing_daily (косвенно) | Billing |
| `booking_created` | `POST /bookings` публичное создание | api_backend | backend | `booking_id`, `program_id`, `organizer_id` | `properties_json.booking_status`, `source_channel` | `booking_created:<bookingId>` | как выше | **не** слать `guestContact` | позже funnel mart | Founder (v2) |
| `booking_confirmed` | PATCH статуса → `booked` или paid-* | api_backend | backend | `booking_id`, `program_id`, `organizer_id` | `properties_json.from/to` | `booking_confirmed:<id>` / `booking_paid_state:<id>:<status>` | как выше | как выше | funnel | Founder |
| `booking_canceled` | PATCH → `cancelled_user` / `cancelled_organizer` | api_backend | backend | как выше | from/to | `booking_canceled:<id>:<status>` | как выше | как выше | funnel | Founder |
| `organizer_verified` | PATCH `/organizers/:id/verification-status` → `verified` | api_backend | backend | `organizer_id`, `verified_status` | from/to | `organizer_verified:<organizerId>` | как выше | как выше | trust mart (v2) | Trust |
| `organizer_trusted` | → `trusted_by_platform` | api_backend | backend | как выше | как выше | `organizer_trusted:<organizerId>` | как выше | как выше | trust mart | Trust |
| `billing_connected` | Billing profile перевёлся в `billing_connected` с другого состояния | api_backend | backend | `organizer_id` | `properties_json.prev` | `billing_connected:<organizerId>` | как выше | не включать ИНН/счета | trust / billing | Billing, Trust |
| `contract_signed` | PATCH контракта: статус стал `signed` | api_backend | backend | `organizer_id`, `contract_version` | `properties_json.contract_id`, from/to | `contract_signed:<contractId>` | как выше | не включать URL документов с токенами | trust | Trust |

---

## Реализованные frontend-события (ingest через web proxy)

| event_name | trigger | emitted_by | required_params | dedupe_key | PII policy | downstream marts | dashboards |
|------------|---------|------------|------------------|------------|------------|------------------|-------------|
| `page_view` | Загрузка карточки программы | web_client | envelope + `page_type`, `program_id` | `fe:page_view:<session>:<path>:<hour_bucket>` | Не отправлять контакты | нет (GA4 primary) | Program perf (v2) |
| `view_item` | После успешной загрузки программы | web_client | `program_id` | аналогично | как выше | нет | v2 |
| `program_submitted` | Успешная заявка с программы / успешный POST booking | web_client | `program_id` (где применимо) | `fe:...` time bucket | не включать free text | нет | v2 |
| `organizer_apply_submitted` | Успешная verification inquiry | web_client | `page_type` | `fe:...` | как выше | нет | v2 |

---

## События из таксономии (planned / частично)

Все имена из `docs/analytics/EVENT_TAXONOMY.md`, не перечисленные выше, считаются **planned** до появления строки `implemented` в этом файле и кода эмита.

Правило расширения:

1. Добавить строку в эту таблицу **до merge** кода.
2. Добавить/обновить allowlist в `validators.ts`.
3. Добавить тест: schema + idempotency + PII negative case.

---

## `idempotency` vs `dedupe_key`

- **`idempotency_key`**: уникальный ключ записи в `analytics_events` (upsert/duplicate detection).
- **`dedupe_key`**: логический шаблон (см. колонку); генератор обязан стабильно воспроизводить ключ из бизнес-fact id.
- **Правило:** одинаковый `idempotency_key` + отличающийся канонический fingerprint → запись в `analytics_event_errors` + не ломать бизнес-транзакцию.

---

## PII policy (кратко)

- Запрещено в `properties_json` и строковых полях: email, телефон, ФИО, raw мессенджеры, необработанные URL с персональными токенами.
- `guestContact` **никогда** не эмитить в analytics.
- Для cross-session аналитики пользователя использовать **отдельный salted hash pipeline** (см. `PRIVACY_AND_CONSENT.md` + `ATTRIBUTION_POLICY`).

---

## Связь с marts / dashboards

| mart / surface | Опирается на | События |
|----------------|--------------|---------|
| `mv_founder_daily` | доменные таблицы | косвенно; события не обязаны |
| `mv_billing_daily` | payments/refunds/commissions | косвенно |
| `analytics_event_errors` | ingestion | все `rejected` |
| GA4/YM | клиент | `page_view`, goals |
