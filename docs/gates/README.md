# Пилот: три gate

| Gate | Документ | Смысл |
|------|----------|--------|
| 1 | [GATE1_LOCAL_GREEN_SMOKE.md](./GATE1_LOCAL_GREEN_SMOKE.md) | Локальный пилот: env, smoke, UI, legal в БД, pilot-kpi. |
| 2 | [GATE2_AI_PILOT.md](./GATE2_AI_PILOT.md) | Минимальный AI-слой, owner approval, fallbacks, аудит. |
| 3 | [GATE3_TIMEWEB_EVIDENCE.md](./GATE3_TIMEWEB_EVIDENCE.md) | Depлой, env, миграции, evidence, rollback. |

**Критерий:** после Gate 1+2 — **pilot-ready локально**; после Gate 3 — **готово к выкатке** с заполненным `DEPLOY_EVIDENCE_YYYY-MM-DD.md`.
