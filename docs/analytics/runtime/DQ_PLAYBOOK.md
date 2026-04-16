# DQ Playbook (v1)

Версия: 2026-04-16. Краткие действия при деградации. Источник метрик: `GET /metrics/analytics/dq` (admin), логика: [`dqMetrics.ts`](../../../services/api/src/modules/analytics/dqMetrics.ts), пороги: [`dqThresholds.ts`](../../../services/api/src/modules/analytics/dqThresholds.ts) + `Env` в [`packages/config/src/env.ts`](../../../packages/config/src/env.ts).

## Пороги (env, значения по умолчанию)

| Переменная | Default | Назначение |
|------------|---------|------------|
| `ANALYTICS_DQ_EVENT_BASELINE` | 5 | Ниже — warning «мало событий» при ненулевом потоке |
| `ANALYTICS_DQ_INGESTION_ERRORS_WARNING` | 10 | Порог warning по ошибкам ingestion |
| `ANALYTICS_DQ_INGESTION_ERRORS_CRITICAL` | 50 | Порог critical по ошибкам ingestion |
| `ANALYTICS_DQ_DUPLICATE_WARNING` | 20 | Порог warning по idempotency-conflict в errors |
| `ANALYTICS_DQ_LATE_EVENT_LAG_SEC` | 7200 | Порог «опоздавшего» события (eventTime vs ingestedAt) |
| `ANALYTICS_DQ_MAX_PIPELINE_LAG_SEC` | 21600 | Critical lag последнего `ingestedAt`; warning при lag выше трети этого значения |

Расписание refresh/alerts: [`SCHEDULE.md`](./SCHEDULE.md).

## critical:ingestion_errors_high

1. Проверить `analytics_event_errors` за последние 24h (`reasonCode`, `message`).
2. Откатить недавний деплой web/api, если совпало по времени.
3. Проверить allowlist событий и обязательные поля (новые фронтовые emit).

## critical:pipeline_freshness_lag_s

1. Убедиться, что `ANALYTICS_ENABLED=1` и web проксирует с токеном.
2. Проверить сеть между Next и API.
3. Проверить, что пользовательский consent не блокирует весь трафик на пилоте.

## critical:mart_refresh_failure_count

1. Выполнить `POST /internal/analytics/refresh` вручную с токеном.
2. Проверить логи Postgres (ошибка в `analytics_refresh_marts`).
3. Проверить миграции: существуют ли `mv_founder_daily` / `mv_billing_daily`.

## warning:duplicate_idempotency_conflicts

1. Найти клиентов с нестабильным `idempotency_key`.
2. Проверить повторную отправку форм / двойные хуки.

## warning:event_volume_below_baseline

1. Сравнить с реальным трафиком (GA/YM).
2. Проверить consent banner и долю отказов.
3. Откалибровать `ANALYTICS_DQ_EVENT_BASELINE` в окружении.

## warning:orphan_events

1. Проверить рассинхрон id: удалённые booking/payment после emit.
2. Проверить порядок: сначала commit в БД, затем emit аналитики.

## warning:no_analytics_events_in_window

1. Ожидаемо на пустом стенде — не трактовать как prod incident.
2. Иначе — см. pipeline_freshness.

## Алерты в Telegram

Запуск: `POST /internal/analytics/alerts/run`. Критические DQ-issues добавляются в ту же доставку, что и billing-аномалии.
