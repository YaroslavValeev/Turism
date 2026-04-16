# Расписание: marts, scores, alerts

## Вариант A — внешний cron (рекомендуется для prod)

Все вызовы: `POST` с заголовком `Authorization: Bearer <INTERNAL_ANALYTICS_TOKEN>`.

| Задача | Endpoint | Типичный cadence |
|--------|----------|------------------|
| Обновление MV | `/internal/analytics/refresh` | 1× в час или после больших батчей событий |
| Пересчёт score | `/internal/analytics/scores/recalculate` | 1× в сутки (UTC end-of-day уже заложен в логике `period_end`) |
| Алерты | `/internal/analytics/alerts/run` | каждые 15–60 мин |

Пример `curl` (подставить `API_BASE` и токен):

```bash
curl -sS -X POST "$API_BASE/internal/analytics/refresh" -H "Authorization: Bearer $INTERNAL_ANALYTICS_TOKEN"
curl -sS -X POST "$API_BASE/internal/analytics/scores/recalculate" -H "Authorization: Bearer $INTERNAL_ANALYTICS_TOKEN"
curl -sS -X POST "$API_BASE/internal/analytics/alerts/run" -H "Authorization: Bearer $INTERNAL_ANALYTICS_TOKEN"
```

Опционально: `scores/recalculate?period_end=2026-04-15` (дата UTC).

При падении job: логи HTTP + для refresh смотреть таблицу `analytics_mart_refresh_logs`.

## Вариант B — планировщик в процессе API

Переменные:

- `ANALYTICS_OPS_SCHEDULER_ENABLED=1` — включить тик в [`services/api/src/modules/analytics/opsScheduler.ts`](../../../services/api/src/modules/analytics/opsScheduler.ts).
- `ANALYTICS_OPS_INTERVAL_MS` — интервал в миллисекундах (по умолчанию `3600000`, 1 час).

На одном тике последовательно: mart refresh → scores → alerts. Не включать параллельно с внешним cron без согласования (двойной refresh).

## Связанные документы

- Go-live (полный чеклист перед стендом/prod): [`GO_LIVE_CHECKLIST.md`](./GO_LIVE_CHECKLIST.md)
- Backfill traveler key: [`BACKFILL_RUNBOOK.md`](./BACKFILL_RUNBOOK.md)
- DQ playbook: [`DQ_PLAYBOOK.md`](./DQ_PLAYBOOK.md)
