# Cohort Analytics — дизайн (Phase 2)

**Цель:** ответить на вопросы удержания и повторности **без PII** и с явными опорными датами (anchor events).

---

## 1) Сущности и ключи

### 1.1 Customer cohort (traveler)

**Проблема сейчас:** в MVP бронь хранит `guestContact` как строку (PII), отдельного `traveler_id` нет.

**Канон Phase 2:**

- Ввести `traveler_id` (uuid) в `bookings` **или** использовать `traveler_key_hash` = `HMAC_SHA256(salt, normalized_contact)` на write-path брони (не в analytics_events).
- `normalized_contact` — результат отдельного privacy-пайплайна (вне аналитики).

**Anchor cohort (вариант A — first lead):**

- `cohort_month = date_trunc('month', first_lead_at)` где `first_lead_at = MIN(leads.createdAt)` для `traveler_key_hash`.

**Anchor cohort (вариант B — first booking):**

- `cohort_month = date_trunc('month', first_booking_at)` где `first_booking_at = MIN(bookings.createdAt)`.

**Рекомендация продукта:** отчёты строить **в двух срезах** (A и B), но в UI по умолчанию один — выбрать после пилота.

### 1.2 Organizer cohort

Якоря (несколько полезных срезов):

1. **activation_cohort:** первый переход `onboardingStatus` в `active` (или proxy: `billing_connected` + signed contract) — требует `fact_organizer_state_at` или audit.
2. **first_published_program_cohort:** `MIN(programs.createdAt)` при `publishStatus` стал `published`.
3. **first_paid_booking_cohort:** первый `booking` организатора, где `paidAmountRub>0` или статус paid-*.

---

## 2) Витрины (рекомендуемые таблицы)

### 2.1 `cohort_customer_monthly`

Grain: `(cohort_month, activity_month, cohort_definition)`.

Колонки:

- `cohort_month` (date)
- `activity_month` (date)
- `cohort_definition` (`first_lead` | `first_booking`)
- `cohort_size` (int)
- `active_travelers` (int) — имели ≥1 активность в activity_month
- `retention_rate` = `active_travelers / cohort_size`

Активность (MVP): наличие `booking` в статусе ≥ `booked` **или** новый `lead` (продуктово обсуждается).

### 2.2 `cohort_organizer_monthly`

Аналогично для organizer cohort anchors.

---

## 3) Метрики «времени до»

Все считаются от якорной даты `t0` до первого события типа X:

| metric | определение | источник |
|--------|-------------|----------|
| `ttfb_booking` | `MIN(booking.createdAt) - t0` | bookings |
| `ttfb_paid` | первый момент paid-* или первый payment | bookings/payments |
| `ttfb_completed` | первый completed | bookings |
| `organizer_activation_to_first_revenue` | `first_payment_paidAt - activation_at` | payments + organizer facts |

Визуализация: гистограммы p50/p90 + таблица по когортам.

---

## 4) Retention by month

Классическая матрица: строки = `cohort_month`, столбцы = `month_offset` (0..N), значения = retention.

**month_offset 0:** обычно 100% по определению (или «eligible subset» — зафиксировать).

---

## 5) Зависимости / риски

1. Без `traveler_key_hash` customer cohort **недостоверна** — нельзя публиковать как KPI.
2. Organizer cohorts требуют **fact transitions** (сейчас частично можно из audit, но лучше отдельная таблица).
3. Когорты чувствительны к сезонности турпродукта — в отчётах обязательны сравнения YoY и discipline breakdown (v2).
