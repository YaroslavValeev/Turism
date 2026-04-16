# Attribution Policy — черновик (Phase 2)

**Цель:** заранее убрать хаос между web-событиями, server truth и деньгами, особенно для `view_to_lead`, `lead_to_booking`, `repeat`, `attributable revenue`.

---

## 1) Принципы

1. **Деньги всегда атрибутируются к бизнес-фактам** (`payments`, `refunds`, `commissions`, `bookings`) — не к GA4.
2. **Маркетинговая атрибуция (GA4/YM)** — отдельный контур; не смешивать с комиссией до явного маппинга.
3. **Склейка web↔server** только через **не-PII ключи**:
   - `program_id`, `organizer_id`, `session_id` (web), `booking_id`/`lead_id` (server)
   - опционально `utm` классы (не raw URL)

---

## 2) Touch модель

### 2.1 Поля (рекомендуемые)

На уровне `analytics_events.properties_json` (и/или отдельной таблицы `attribution_facts`):

- `first_touch_channel` (enum: organic, paid, referral, direct, unknown)
- `last_touch_channel`
- `first_touch_at`, `last_touch_at`
- `attribution_window_days` (число)

### 2.2 Правило по умолчанию (v0)

- **Marketing attribution window:** 7 дней для catalog→lead.
- **Booking attribution window:** 14 дней от последнего `view_item` по `program_id` до `booking_created`.

### 2.3 First touch / last touch

- **Отчёты по умолчанию:** `last_touch` для конверсии в lead (короткий цикл решения).
- **Параллельно хранить** `first_touch` для paid acquisition анализа.

---

## 3) Cross-session behavior

- `session_id` — web session scope.
- Для связки между сессиями использовать **только**:
  - залогиненный user id (если появится публичный аккаунт), или
  - `traveler_key_hash` (см. cohort doc), или
  - device id (осторожно, compliance) — **не рекомендуется** без юридического заключения.

Если ничего нет — cross-session **unknown**, не строить ложную уверенность.

---

## 4) Organizer continuation / same funnel

Если пользователь возвращается к **той же программе** в пределах окна:

- считать это **одним вороночным контекстом** (не удваивать `view_item` weighting в v1 отчётах; в v2 — capped frequency).

---

## 5) Attributable revenue

**Канон:**

- `attributable_revenue = SUM(payments.amountRub)` по факту оплаты, атрибутируемые к `program_id` через `booking.programId`.
- Возвраты уменьшают attributable revenue **в день возврата** (cash view) и/или **в день брони** (order view) — выбрать один отчёт; второй пометить как alternate.

---

## 6) Дедупликация web + server

- Server события (`payment_recorded`) **не дублируют** GA4 purchase (если появится) — GA4 остаётся маркетинговым слоем.
- Если в будущем появится `purchase_web`, то правило:
  - один `order_key` (например `booking_id`) — один «публичный purchase event».

---

## 7) Искажения, которые мы принимаем в v0

- Нет traveler cross-session → занижаем repeat/attribution качество, но не делаем вид, что оно есть.
- `sourceChannel` на брони — грубый классификатор; не заменяет UTM.
