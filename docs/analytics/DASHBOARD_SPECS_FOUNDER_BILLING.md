# Dashboard Specs — Founder + Billing (MVP)

## Общие требования

- Доступ: **admin only** (как текущий `/metrics/admin/funnel`).
- Источник данных: **materialized views** `mv_founder_daily`, `mv_billing_daily` + fallback readmodels.
- Период: `from`, `to` (UTC ISO), default последние 30 дней.
- Валюта: RUB, целые рубли.

## Founder Dashboard

### Цель экрана

Ответить на вопрос: **растёт ли платформа в смысле доверенных организаторов и состоявшихся бронирований**, и как идёт денежный контур.

### Блоки UI

1) **North Star**

- `NSM_core` (count/day)
- `NSM_extended` (count/day)
- sparkline (опционально v2)

2) **Supply**

- `verified_organizers`, `trusted_organizers`
- `active_programs` (published)
- `new_organizers` (created/day)

3) **Demand / progression**

- counts/day: `leads`, `booked`, `paid`, `completed` (определения в metric dictionary)
- conversion proxies (v1): booked/paid/completed rates

4) **Revenue / billing (high level)**

- `net_GMV` / day
- `commission_realized` (определить как сумма `commission_paid` за день; уточнение в SQL)
- `refund_rate` (rolling)

5) **Trust (minimal)**

- `complaints_open` + `complaints_new/day`
- `avg_rating` (rolling)

### API

- `GET /metrics/founder/daily?from=&to=`

## Billing Dashboard

### Цель экрана

Контроль **Fair Success Fee** контура: оплаты/возвраты/комиссии/споры/aging.

### Блоки UI

1) **Cash facts**

- `payments_count`, `payments_amount`
- `refunds_count`, `refunds_amount`

2) **Commission state machine**

- counts by `reconciliationStatus`: accrued/approved/invoiced/paid/reversed/disputed
- `commission_amount` sums by status

3) **Disputes / risk**

- `disputed_commission_amount`
- `statements_failed` (v2; MVP: errors table)

4) **Aging (MVP simplified)**

- buckets: 0-7 / 8-30 / 31+ дней для `invoiced` not `paid` (SQL в mart)

### API

- `GET /metrics/billing/daily?from=&to=`

## Нефункциональные требования

- страница должна работать при отсутствии данных (empty states)
- ошибки API показывать человеку читаемо
