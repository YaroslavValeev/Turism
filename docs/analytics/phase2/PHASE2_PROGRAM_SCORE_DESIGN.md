# Program Score — дизайн (Phase 2)

**Цель:** отделить **качество карточки** от **конверсии в спрос**, затем объединить для ранжирования каталога и внутренних приоритетов модерации.

---

## 1) Выходы

- `program_content_score` ∈ [0, 100]
- `program_performance_score` ∈ [0, 100]
- `program_score` ∈ [0, 100] (композит)
- `program_score_version`

---

## 2) `program_content_score` (качество наполнения)

| component | определение | источник |
|-----------|-------------|----------|
| `content_completeness` | доля обязательных полей publish gate | `publishGate` + `programs` |
| `has_media` | ≥1 медиа | `program_media` |
| `has_reviews` | ≥1 approved review | `reviews` |
| `has_schedule` | itinerary заполнен | `programs.itineraryDayByDay` |
| `has_safety` | risk/medical/cancellation | программа |
| `has_cancellation_policy` | cancellationRules | программа |

Нормализация: взвешенная сумма бинарных индикаторов (веса задаёт Product).

---

## 3) `program_performance_score` (конверсии)

Источники:

- web: `view_item`, `page_view` (с consent)
- server: `booking_created`, `leads` (если связка есть)

Метрики:

| metric | формула (канон) | caveats |
|--------|------------------|---------|
| `view_to_lead` | leads / views | нужна атрибуция program_id + дедуп сессий |
| `lead_to_booking` | booked / leads | нужен `lead_id` на booking |
| `booking_to_paid` | paid(booking) / booked | согласовать определение paid |

Нормализация: логистическая/квантильная (чтобы выбросы трафика не ломали шкалу).

---

## 4) Композит

Предложение v0:

\[
program\_score = 0.55\cdot content + 0.45\cdot performance
\]

Смысл: без качества карточки высокая конверсия опасна (несоответствие ожиданий).

---

## 5) Внедрение

1. Сначала **content_score** (детерминированно из БД).
2. Затем performance после `ATTRIBUTION_POLICY` + минимальной связки lead/booking.
