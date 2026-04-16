# Startup Config — MyWave Travel

Конфигурация запуска. Обновляй при изменении команды или фокуса.

## 1. Owners (владельцы)

Источник: [team_roles_and_owners.csv](team_roles_and_owners.csv)

| Функция | Main Owner | Backup |
|---------|------------|--------|
| Founder | Yaroslav | — |
| Supply | Yaroslav | AI Partnerships Agent |
| Trust & Safety | Yaroslav | AI Trust & Safety Agent |
| Demand | Yaroslav | AI Growth Agent |
| Ops | Yaroslav | AI Ops Agent |
| Tech | Cursor / Dev Agent | Yaroslav |
| Finance | Yaroslav | AI Finance Agent |

**При смене команды:** обнови `team_roles_and_owners.csv` и этот раздел.

---

## 2. Pilot wedge и конфигурация (Owner-level truth)

**Pilot wedge = Wakesurf-first.** Обновлено по clock sync: [docs/SPRINT2_CLOCK_SYNC_UPDATED_PILOT_EMAIL.md](docs/SPRINT2_CLOCK_SYNC_UPDATED_PILOT_EMAIL.md).

| Элемент | Значение |
|---------|----------|
| **Pilot wedge** | Wakesurf (вейксерфинг) — первая пилотная ниша |
| **Anchor locations** | Krasnodar, Dubai, Bodrum |
| **Next catalog lines** | SUP, MTB (не в первом пилоте) |
| **Product logic** | Русскоязычная аудитория + российские организаторы + программы в России и за рубежом |

**Pilot assumptions:** Assisted booking только вручную; 1–2 организатора; 3–10 программ; нет public payment, self-serve, public auth.

**Граница между внешней production-surface и внутренним rollout/control:** [docs/PRODUCTION_SURFACE_AND_INTERNAL_CONTROL.md](docs/PRODUCTION_SURFACE_AND_INTERNAL_CONTROL.md).

**Pre-launch:** См. §3 и [docs/PILOT_PRELAUNCH_CHECKLIST.md](docs/PILOT_PRELAUNCH_CHECKLIST.md), [docs/PILOT_GO_NOGO.md](docs/PILOT_GO_NOGO.md).

**Канон запуска пилота (email):** [docs/PILOT_LAUNCH_EXECUTION_EMAIL.md](docs/PILOT_LAUNCH_EXECUTION_EMAIL.md) · заморозка артефакта: [docs/PILOT_LAUNCH_EXECUTION_EMAIL_FREEZE.md](docs/PILOT_LAUNCH_EXECUTION_EMAIL_FREEZE.md).

**Intake и презентация сайта (канон):** [docs/INGESTION_POLICY.md](docs/INGESTION_POLICY.md) · IA пилота: [docs/SITE_IA_WAKESURF_FIRST.md](docs/SITE_IA_WAKESURF_FIRST.md) · решение GM: [docs/SOURCE_AND_PRESENTATION_POLICY_EMAIL.md](docs/SOURCE_AND_PRESENTATION_POLICY_EMAIL.md) · принятие пакета (GM): [docs/INTAKE_AND_SITE_POLICY_ACCEPTANCE_EMAIL.md](docs/INTAKE_AND_SITE_POLICY_ACCEPTANCE_EMAIL.md) · публичный UX/контент (лендинг + программа): [docs/WAKESURF_FIRST_PUBLIC_CONTENT_EMAIL.md](docs/WAKESURF_FIRST_PUBLIC_CONTENT_EMAIL.md) · visual polish публичной витрины (GM): [docs/PUBLIC_WAKESURF_UX_POLISH_EMAIL.md](docs/PUBLIC_WAKESURF_UX_POLISH_EMAIL.md) · **приёмка публичной витрины (pilot-ready):** [docs/PUBLIC_WAKESURF_UX_ACCEPTANCE_EMAIL.md](docs/PUBLIC_WAKESURF_UX_ACCEPTANCE_EMAIL.md) · **финальная приёмка UX + переход к monitoring:** [docs/PUBLIC_UX_FINAL_ACCEPTANCE_AND_MONITORING_EMAIL.md](docs/PUBLIC_UX_FINAL_ACCEPTANCE_AND_MONITORING_EMAIL.md) · **filmstrip hero — принято (freeze, без webp-pipeline):** [docs/FILMSTRIP_HERO_ACCEPTANCE_EMAIL.md](docs/FILMSTRIP_HERO_ACCEPTANCE_EMAIL.md) · first signal report: [docs/FIRST_SIGNAL_REPORT.md](docs/FIRST_SIGNAL_REPORT.md).

**Активная фаза — только pilot signals (без расширения визуала/доков):** [docs/PILOT_MONITORING_ONLY_EMAIL.md](docs/PILOT_MONITORING_ONLY_EMAIL.md).

**Фаза pilot signals зафиксирована — следующий артефакт только FIRST_SIGNAL_REPORT:** [docs/PILOT_SIGNALS_PHASE_LOCK_EMAIL.md](docs/PILOT_SIGNALS_PHASE_LOCK_EMAIL.md).

**First signal report — принят; следующий цикл monitoring (чек-лист внутрь отчёта не вшивать):** [docs/FIRST_SIGNAL_REPORT_NEXT_CYCLE_EMAIL.md](docs/FIRST_SIGNAL_REPORT_NEXT_CYCLE_EMAIL.md).

**Публичная витрина — Kinopoisk-inspired adventure catalog (адаптация, не клон):** [docs/KINOPOISK_INSPIRED_UI_ADAPTATION_EMAIL.md](docs/KINOPOISK_INSPIRED_UI_ADAPTATION_EMAIL.md) · план внедрения: [docs/KINOPOISK_STYLE_ADAPTATION_PLAN.md](docs/KINOPOISK_STYLE_ADAPTATION_PLAN.md).

При расширении — добавлять новые дисциплины и локации отдельными запусками. Конфиг пилота не меняется без решения Owner/GM.

---

## 3. Pilot pre-launch preconditions

Во время работы пилота (фаза мониторинга): [PILOT_MONITORING_PLAN.md](PILOT_MONITORING_PLAN.md).

Перед go-live пилота проверить:

| # | Условие | Как проверить |
|---|---------|----------------|
| 1 | Pilot wedge и anchor locations зафиксированы | [startup_config.md](startup_config.md) §2 (Wakesurf-first, Krasnodar/Dubai/Bodrum) |
| 2 | 1–2 организатора в статусе checked или выше | Admin: очередь организаторов, verificationStatus; по необходимости — пройти verification flow ([docs/VERIFICATION_RUNBOOK.md](docs/VERIFICATION_RUNBOOK.md)) |
| 3 | 3–10 программ в статусе published | Admin: очередь программ, фильтр publish_status=published |
| 4 | Smoke пройден | `pnpm smoke` или пункты из [docs/RELEASE_AND_OBSERVABILITY_CHECKLIST.md](docs/RELEASE_AND_OBSERVABILITY_CHECKLIST.md) |
| 5 | E2E путь organizer → program → publish → booking → completed выполнен | [docs/PILOT_PRELAUNCH_CHECKLIST.md](docs/PILOT_PRELAUNCH_CHECKLIST.md) |
| 6 | Assisted booking только вручную; нет public payment, self-serve, public auth | По процессу и конфигу |
