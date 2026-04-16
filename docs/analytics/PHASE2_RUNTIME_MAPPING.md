# Phase 2 → Runtime mapping

Сводка: что из Phase 2 документов отражено в коде/SQL/UI по состоянию текущего этапа.

| Phase 2 артефакт | Код / схема | SQL / marts | Jobs / internal API | Dashboard API | Admin UI |
|------------------|-------------|-------------|----------------------|---------------|----------|
| Event dictionary + contract funnel | `validators.ts` (`contract_*`), web `ContractDownloadBlock`, `EVENT_TAXONOMY.md` | `analytics_events` | `POST /internal/analytics/events` (через web BFF) | — | — |
| DQ schema / dashboard design | `dqMetrics.ts` | агрегаты по `analytics_events`, `analytics_event_errors`; orphan join к `bookings`/`payments`/`refunds` | — | `GET /metrics/analytics/dq` | `/analytics/dq` |
| Mart refresh observability | `AnalyticsMartRefreshLog` Prisma + миграция | `analytics_refresh_marts()` без изменений | `POST /internal/analytics/refresh` пишет лог | поля `martRefresh*`, `martFreshnessLagSeconds` в DQ | DQ страница |
| Organizer score design | `scoreEngine.ts` → `OrganizerScoreSnapshot` | данные из `organizers`, `bookings`, `reviews`, `incidents` | `POST /internal/analytics/scores/recalculate` | `GET /metrics/organizers/scores/latest`, `GET /metrics/founder/summary` | Founder summary блок |
| Program score design | `scoreEngine.ts` → `ProgramScoreSnapshot` | программа + `analytics_events` по `programId` | тот же recalculate | `GET /metrics/programs/scores/latest`, founder summary | Founder summary |
| Cohorts / LTV / repeat (дизайн) | `travelerKeyHash` на `Lead`/`Booking`, `travelerKey.ts`, policy MD | будущие marts (не в этом PR) | хеш при `POST /bookings` | — | — |
| Attribution policy | без изменений runtime (документ остаётся SOT) | — | — | — | — |
| Alerts | `alerts.ts` + DQ critical issues | `mv_billing_daily` | `POST /internal/analytics/alerts/run` | — | — |

## Operations (v1.1)

| Задача | Артефакт / код |
|--------|----------------|
| Backfill traveler key | [`docs/analytics/runtime/BACKFILL_RUNBOOK.md`](./runtime/BACKFILL_RUNBOOK.md), `pnpm run backfill:traveler-key` |
| Расписание marts / scores / alerts | [`docs/analytics/runtime/SCHEDULE.md`](./runtime/SCHEDULE.md); опционально `ANALYTICS_OPS_SCHEDULER_ENABLED` + [`opsScheduler.ts`](../../services/api/src/modules/analytics/opsScheduler.ts) |
| Пороги DQ | `ANALYTICS_DQ_*` в `packages/config`, [`dqThresholds.ts`](../../services/api/src/modules/analytics/dqThresholds.ts) |
| Governance score | [`docs/analytics/runtime/SCORE_GOVERNANCE.md`](./runtime/SCORE_GOVERNANCE.md) |
| Действия по ролям | [`docs/analytics/runtime/ACTIONS_BY_ROLE.md`](./runtime/ACTIONS_BY_ROLE.md) |

## Блокировки

| Возможность | Блокируется без |
|-------------|-----------------|
| Repeat / LTV / когорты по клиенту в marts | Заполненного `travelerKeyHash` + миграций mart SQL |
| Точные contract funnel KPI в marts | Только событиями; mart-колонки под contract можно добавить позже |
| Program performance score с высокой точностью | Достаточного трафика (`sampleViews`); иначе `insufficient_data` |

## Риски и ограничения

- **Traveler key:** ложные merge/split (см. policy); без `TRAVELER_KEY_SALT` хеш не пишется.
- **DQ baseline:** константа `DEFAULT_EVENT_BASELINE` в коде — для prod задать через последующий конфиг.
- **Scores v1:** эвристики упрощены; cold start → `unknown` / `insufficient_data`.
- **WoW на founder summary:** сравнение «последний снимок» vs «снимки старше 7d» — при редких пересчётах дельта может быть 0.

## Следующий спринт (рекомендации)

1. SQL marts: `traveler_key_hash` в витринах repeat/LTV.
2. Нормализация телефона для traveler key; mapping user↔traveler после auth.
3. Публичные пороги score / partner-facing отчёты.
4. Contract events в materialized view для founder daily (если нужны в одной таблице).
