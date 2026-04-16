# Data Quality — схема метрик и хранилища (Phase 2)

**Цель:** измерять «здоровье конвейера данных» отдельно от бизнес-KPI: ingestion, идемпотентность, сироты, свежесть, marts.

---

## 1) Принципы

1. **DQ-метрики не смешиваем с бизнес-marts** (`mv_founder_daily`): отдельные таблицы/витрины.
2. **Считаем на двух слоях:**
   - *Operational* (минуты/часы): near-real-time алерты.
   - *Analytical* (день): тренды и baseline.
3. **Источники истины:**
   - `analytics_events` + `analytics_event_errors`
   - лог refresh marts (новая таблица)
   - опционально `audit_logs` для cross-check (не обязательно)

---

## 2) Таблицы (рекомендуемый DDL-черновик)

### 2.1 `analytics_ingestion_hourly` (агрегат ingestion)

Grain: `bucket_start` (UTC hour).

| column | type | описание |
|--------|------|----------|
| `bucket_start` | timestamptz PK | начало часа |
| `accepted_count` | int | `ingestSingleEvent.status=accepted` |
| `duplicate_count` | int | duplicate |
| `skipped_count` | int | ANALYTICS_ENABLED off |
| `rejected_count` | int | rejected |
| `pii_rejected_count` | int | reason `PII_DETECTED` |
| `schema_rejected_count` | int | `INVALID_FIELD` / `UNKNOWN_FIELD` / allowlist |
| `idempotency_conflict_count` | int | конфликт payload |
| `batch_count` | int | число батчей |
| `avg_batch_size` | float | средний размер батча |

**Заполнение:** фоновый flush из in-memory счётчиков **или** триггер на уровне сервиса после `ingestEventsBatch` (предпочтительно сервисный агрегатор, без DB trigger на hot path).

### 2.2 `analytics_event_quality_daily` (событийные DQ по содержанию)

Grain: `day` (UTC date).

| column | type | описание |
|--------|------|----------|
| `day` | date PK | |
| `events_total` | int | принятые события |
| `late_events_count` | int | `ingestedAt - event_time > threshold` (например 24h) |
| `missing_required_params_count` | int | правила per `event_name` (v2 validator) |
| `orphan_booking_id_count` | int | `booking_id` not exists |
| `orphan_payment_id_count` | int | |
| `orphan_refund_id_count` | int | |
| `orphan_organizer_id_count` | int | |
| `orphan_program_id_count` | int | |

**Заполнение:** nightly SQL job (лучше incremental по партициям `event_time`).

### 2.3 `analytics_mart_refresh_log`

| column | type |
|--------|------|
| `id` | uuid PK |
| `started_at` | timestamptz |
| `finished_at` | timestamptz |
| `status` | text (`success`/`failed`) |
| `error_message` | text |
| `duration_ms` | int |

**Заполнение:** обёртка вокруг `SELECT analytics_refresh_marts()` + запись результата.

### 2.4 `analytics_data_freshness_snapshot`

Grain: `captured_at` (каждые N минут).

| column | type | описание |
|--------|------|----------|
| `captured_at` | timestamptz PK | |
| `max_backend_event_time` | timestamptz | max по `event_source in ('backend','system')` |
| `lag_seconds` | int | `now() - max` |
| `max_booking_updated_at` | timestamptz | из `bookings` |
| `max_payment_paid_at` | timestamptz | из `payments` |

---

## 3) Метрики (маппинг на требования)

| metric | определение | источник Phase 2 |
|--------|--------------|------------------|
| `ingestion_success_count` | `accepted_count` | `analytics_ingestion_hourly` |
| `ingestion_error_count` | `rejected_count` | hourly |
| `invalid_payload_count` | schema/unknown field | hourly (`schema_rejected_count`) |
| `missing_required_params_count` | per-event rules | `analytics_event_quality_daily` |
| `duplicate_event_count` | duplicates | hourly |
| `late_event_count` | см. выше | daily |
| `orphan_*` | FK-проверки | daily |
| `mart_refresh_success` | count success / window | `analytics_mart_refresh_log` |
| `mart_refresh_failure` | count failed | log |
| `data_freshness_lag_seconds` | см. выше | snapshot |

---

## 4) Пороги и baseline (для алертов)

Рекомендации (калибруются на пилоте):

- `pii_rejected_count` > 0 за час → **page** (не paging) + разбор источника.
- `rejected_count` / `accepted_count` > 5% за 24h → warning.
- `lag_seconds` > 6h для backend критических событий → warning (после включения полного покрытия).
- `mart_refresh_failure` = 1 → critical.
- `duplicate_event_count` резкий рост vs 7d median × 3 → warning (возможен double-emit баг).

---

## 5) Совместимость с текущим MVP

Сейчас ingestion **не пишет** hourly/daily DQ-таблицы — это **следующий инкремент**. Документ фиксирует целевую схему, чтобы инженерия не «изобретала метрики на ходу».
