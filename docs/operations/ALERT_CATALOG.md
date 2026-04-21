# Каталог governance alerts

Полное описание типов сигналов, оцениваемых в `runGovernanceAlertCycle` ([`runCycle.ts`](../../services/api/src/modules/economics/governanceAlerts/runCycle.ts)). Доставка: critical — Telegram + email (с cooldown); warning — daily digest email. См. также [`GOVERNANCE_ALERTS_V1.md`](./GOVERNANCE_ALERTS_V1.md).

| `alertType` | Severity | Смысл | Действие owner |
|-------------|----------|--------|----------------|
| `commission_sum_drift` | critical | Расхождение суммы комиссии overview vs сырой суммы по `Commission` | Проверить биллинг и миграции |
| `reward_grant_blocked_burst` | critical | Много audit `reward_grant` → blocked за 24h | Разбор UGC/reward policy |
| `source_runs_failed_burst` | critical | ≥5 failed `SourceRun` за 24h | Ingestion / парсеры |
| `ingestion_sources_stuck` | warning | Активные источники с `lastError`, без успешного сбора 7d+ | `/sources`, разбор каналов |
| `conversion_owner_notify_failed` | warning / critical | Черновики с ошибкой owner Telegram; critical при ≥5 | `/admin/conversion-drafts` |
| `expiry_ratio_high` | warning | expired/granted выше порога env | Rewards / коммуникации |
| `many_active_overrides` | warning | Слишком много ручных override | Свести economics override |
| `program_multiplier_churn` | warning | Частые смены множителя по программе | Стабилизировать правила |
| `discount_surge_low_completion` | warning | WoW рост скидки при слабом completion | Качество воронки |
| `recovery_organizer_cancelled_high` | warning | Доля organizer_cancelled в recovery | Доверие и отмены |

**Read-only UI:** [`/admin/alerts`](../../apps/admin/src/app/alerts/page.tsx) (тот же JSON, что `GET /admin/economics/alerts`).
