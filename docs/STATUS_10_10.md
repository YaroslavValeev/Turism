# Статус готовности «10 / 10» (локальный пилот + задел под Timeweb)

Документ фиксирует, **что реализовано в репозитории** и **что остаётся на стороне окружения/владельца**. Стратегия треков: [`MYWAVE_STRATEGY_TWOTRACKS.md`](MYWAVE_STRATEGY_TWOTRACKS.md).

**Три gate (закрытие пилота / Timeweb):** см. [`gates/README.md`](gates/README.md) — [Gate 1](gates/GATE1_LOCAL_GREEN_SMOKE.md) (локальный smoke), [Gate 2](gates/GATE2_AI_PILOT.md) (AI + owner), [Gate 3](gates/GATE3_TIMEWEB_EVIDENCE.md) (деплой- evidence).

## Выполнено в коде и документах

| Область | Статус | Где смотреть |
|---------|--------|----------------|
| Пилот-режим (сервер) | `PILOT_MODE_ENABLED` в `@mywave/config` | `packages/config/src/env.ts`, `PILOT_MODE_ENABLED` в `services/api/.env` |
| Пилот-баннер (web/admin) | `NEXT_PUBLIC_PILOT_MODE=1` | `PilotModeBanner`, layout |
| Shadow GMV / комиссия (KPI) | `GET /metrics/pilot-kpi` | Админ: **Пилот KPI (shadow)** `/pilot-kpi` |
| Атрибуция брони, сделки, revenue в метриках | Ранее в API | `bookings`, `deals`, `content_metrics.revenueRub` |
| Таксономия событий | Канон + док | `validators.ts` `ALLOWED_EVENT_NAMES`, [`ANALYTICS_EVENT_TAXONOMY.md`](ANALYTICS_EVENT_TAXONOMY.md) |
| Legal / согласия | Форма заявки + фиксация в БД (`legalConsentAt`, `legalConsentPolicyVersion`) + `/privacy-and-consent` | `bookings` POST + админ **Заявка**; `LEGAL_CONSENT_POLICY_VERSION` в `services/api/.env` (опц.) |
| Демо-данные 5 org × 3 prog | Опциональный seed | `SEED_DEMO_CATALOG=1` + `pnpm --filter api db:seed` |
| E2E smoke (API) | Скрипт при запущенном API | `pnpm --filter api smoke:pilot-e2e` |
| Docker health API | `docker-compose.production.yml` | `healthcheck` на `/health` |
| Timeweb evidence (шаблон) | | [`deployment/DEPLOY_EVIDENCE_TEMPLATE.md`](deployment/DEPLOY_EVIDENCE_TEMPLATE.md) |

## Нужно выполнить на машине (без автоматизации в CI)

1. **Миграции БД:** `pnpm exec prisma migrate deploy` в `services/api` (или `migrate dev` локально).
2. **Сид с каталогом:** в `services/api/.env` — `SEED_DEMO_CATALOG=1`, затем `pnpm --filter api db:seed`.
3. **Пилот-флаги:** `PILOT_MODE_ENABLED=1` (API), `NEXT_PUBLIC_PILOT_MODE=1` (web + admin `.env.local`).
4. **Смоук:** в одном терминале `pnpm --filter api dev`, в другом `pnpm --filter api smoke:pilot-e2e`.
5. **Production evidence:** заполнить `DEPLOY_EVIDENCE_YYYY-MM-DD.md` после реального стенда на Timeweb.

## Не заявляется как «закрыто в коде» (roadmap)

- Полный E2E в CI с поднятым стеком (Playwright + docker) — при необходимости отдельный PR.
- Все AI-подсистемы из трека 1 — по отдельным эпикам.
- Юридически выверенный пакет документов (юрист) — вне репозитория.

**Итог:** при выполнении блока «на машине» и зелёных смоук — **10/10 по пилотной готовности коду + одному доказанному контуру**; **production 10/10** = код + **заполненный** evidence-файл с Timeweb.
