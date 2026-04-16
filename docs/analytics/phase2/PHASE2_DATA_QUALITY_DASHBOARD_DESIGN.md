# Data Quality Dashboard — дизайн (Phase 2)

**Аудитория:** Tech Lead, Ops, Product Analytics.  
**Цель:** за 30 секунд понять: «сломался ли конвейер данных» и «можно ли доверять витринам сегодня».

---

## 1) Структура экрана (v1)

### Блок A — «Светофор конвейера»

Карточки (последние 24h):

1. **Ingestion health:** accepted / rejected / duplicate / skipped (stacked bar по часам).
2. **Error taxonomy:** топ `reasonCode` из `analytics_event_errors`.
3. **PII guard:** количество `PII_DETECTED` (должно быть ~0).
4. **Marts refresh:** последний статус + `duration_ms` + история 14 дней.
5. **Freshness lag:** `data_freshness_lag_seconds` (backend events + доменные max timestamps).

### Блок B — «Качество ссылочной целостности»

Таблица за 7 дней:

- orphan_booking / payment / refund / organizer / program counts.

### Блок C — «Аномалии объёма»

- ingestion volume vs 7-day baseline (rolling median).
- duplicates spike.

### Блок D — «Drilldown»

- таблица последних 50 `analytics_event_errors` (без raw PII; raw payload только admin с маскированием).

---

## 2) API (предложение)

Админ-эндпоинты (JWT admin), рядом с `/metrics/*`:

- `GET /metrics/data-quality/hourly?from=&to=`
- `GET /metrics/data-quality/daily?from=&to=`
- `GET /metrics/data-quality/freshness` (последний снимок)
- `GET /metrics/data-quality/mart-refresh?limit=50`

Формат ответа: `{ series: [...], summary: {...}, warnings: [...] }`.

---

## 3) Алерты (минимальный набор)

Интеграция с существующим `runAnalyticsAlerts()` + расширение:

| rule_id | условие | severity |
|---------|---------|----------|
| `dq_pii_spike` | `pii_rejected_count>0` в час | high |
| `dq_reject_rate` | rejected/accepted > порога | medium |
| `dq_mart_fail` | последний refresh failed | high |
| `dq_freshness` | lag > порога | medium |
| `dq_volume_drop` | accepted < baseline × 0.5 | medium |
| `dq_dup_spike` | duplicate > baseline × 3 | medium |

**Dedup:** через `analytics_alert_state` (как сейчас) + отдельные ключи `dq:*`.

---

## 4) UX / безопасность

- Никогда не показывать `raw_payload` целиком без маскирования ключей (`email`, `phone`, `guestContact`, ...).
- Кнопка «скопировать idempotency_key» для расследований.
- Ссылка на `PHASE2_EVENT_DICTIONARY_CANONICAL.md` из drilldown по `event_name`.

---

## 5) Зависимости

Реализация UI возможна после появления таблиц из `PHASE2_DATA_QUALITY_METRICS_SCHEMA.md` (или временных SQL views поверх `analytics_events` для MVP-DQ).
