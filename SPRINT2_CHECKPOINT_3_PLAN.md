# Sprint 2 — Checkpoint 3 Plan

**Назначение:** Третий checkpoint Sprint 2. Pilot operations hardening — заморозить pilot-конфигурацию, ввести единый operator runbook, усилить pre-launch и минимально улучшить удобство админки для оператора без новых сущностей и public-расширения.

---

## 1. Управленческая цель checkpoint

Сделать операционный контур пилота явно пригодным к реальному запуску: зафиксировать pilot configuration, дать оператору один сводный runbook по обработке заявок, верификации, отзывов, инцидентов и комиссий (включая исключения), ввести один репетиционный путь и go/no-go логику перед go-live, при необходимости — минимальные улучшения admin usability без расширения домена и без новых public/payment-фич.

---

## 2. Scope

| Элемент | Содержание |
|---------|------------|
| **Freeze pilot configuration** | Явно зафиксировать в одном месте (или актуализировать [startup_config.md](startup_config.md)): регион, ниша, pilot assumptions (assisted booking only, no public payment, 1–2 организатора, 3–10 программ), pre-launch preconditions из [docs/PILOT_PRELAUNCH_CHECKLIST.md](docs/PILOT_PRELAUNCH_CHECKLIST.md). Без изменения значений — консолидация и явная пометка «pilot config frozen». |
| **Operator pilot runbook** | Один документ [docs/PILOT_OPERATOR_RUNBOOK.md](docs/PILOT_OPERATOR_RUNBOOK.md) (или аналог): сценарии обработки заявок (booking handling — от new до completed, nextStatuses, когда эскалировать); verification gap (что делать при отсутствии evidence, при отказе в checked); обработка исключений по review (модерация, отклонение), incident (статусы, эскалация), commission (дубликат, оспаривание, written_off). Ссылки на существующие VERIFICATION_RUNBOOK, COMMISSION_RUNBOOK, REVIEW_PUBLISH_POLICY; без дублирования — сводка и «где смотреть детали». |
| **Pilot pre-launch hardening** | Один pilot rehearsal path: последовательность шагов (конфиг → организаторы/программы → smoke → E2E path → verification flow → commission flow → checklist). Документировать блокеры и go/no-go: при каких условиях не выходить в go-live (например: smoke не прошёл, нет completed booking для проверки commission, критические инциденты не закрыты). Разместить в [docs/PILOT_PRELAUNCH_CHECKLIST.md](docs/PILOT_PRELAUNCH_CHECKLIST.md) или в отдельном docs/PILOT_GO_NOGO.md. |
| **Admin usability (minimal)** | Только минимальные улучшения, ориентированные на оператора: подсказки, ссылки на runbook, при необходимости — одна общая страница «Pilot runbook» или пункты в существующих очередях. Без новых доменных сущностей, без изменений контрактов API, без public expansion. |

В рамках checkpoint **не вводятся** новые сущности, новые статусы, новые API-эндпоинты, billing/cron/worker. Допускаются: консолидация конфига и документации, новый сводный runbook, обновление checklist и go/no-go, минимальные правки admin (текст/ссылки).

---

## 3. Deliverables

- **Pilot config frozen:** явная фиксация в [startup_config.md](startup_config.md) (или в одном pilot-config разделе): регион, ниша, pilot assumptions, ссылка на pre-launch preconditions.
- **Operator pilot runbook:** [docs/PILOT_OPERATOR_RUNBOOK.md](docs/PILOT_OPERATOR_RUNBOOK.md) — сводка сценариев: booking handling, verification gap, review/incident/commission exception handling; ссылки на VERIFICATION_RUNBOOK, COMMISSION_RUNBOOK, REVIEW_PUBLISH_POLICY, инциденты.
- **Pilot pre-launch hardening:** один rehearsal path и go/no-go (в PILOT_PRELAUNCH_CHECKLIST или docs/PILOT_GO_NOGO.md): блокеры, условия «не go», порядок проверок.
- **Admin usability (minimal):** при необходимости — ссылка на pilot runbook в admin (например, общий пункт в навигации или на главной после логина), без новых экранов и сущностей.
- **Checkpoint 3 report:** что изменено; файлы созданы/изменены; как тестировать; риски; rollback; source of truth used; explicitly out of scope.

---

## 4. Риски

| Риск | Митигация |
|------|-----------|
| Раздувание runbook | Operator runbook — сводка и ссылки на существующие runbook’и; не копировать целиком VERIFICATION_RUNBOOK/COMMISSION_RUNBOOK. |
| Размывание в enterprise/admin | Admin — только минимальные подсказки и ссылки; не строить новый «pilot dashboard» или аналитику. |
| Жёсткий go/no-go без гибкости | Go/no-go описать как рекомендацию и перечень блокеров; финальное решение за GM. |
| Регрессия | Smoke и regression сохраняются; изменения только в docs и минимальном UI. |

---

## 5. Rollback

- Изменения в конфиге, документации и при необходимости в минимальных правках admin (текст/ссылки). Откат — revert коммитов по затронутым файлам. Миграции БД и изменения API не входят в scope.

---

## 6. Source of truth used

| Область | Документ/артефакт |
|---------|--------------------|
| Sprint 2 scope | [SPRINT2_GM_BRIEF.md](SPRINT2_GM_BRIEF.md) |
| Pilot config | [startup_config.md](startup_config.md) |
| Pre-launch | [docs/PILOT_PRELAUNCH_CHECKLIST.md](docs/PILOT_PRELAUNCH_CHECKLIST.md) |
| Verification | [docs/VERIFICATION_RUNBOOK.md](docs/VERIFICATION_RUNBOOK.md), [docs/VERIFICATION_LADDER.md](docs/VERIFICATION_LADDER.md) |
| Commission | [docs/COMMISSION_RUNBOOK.md](docs/COMMISSION_RUNBOOK.md), [docs/COMMISSION_ACCRUAL_PATH.md](docs/COMMISSION_ACCRUAL_PATH.md) |
| Review | [docs/REVIEW_PUBLISH_POLICY.md](docs/REVIEW_PUBLISH_POLICY.md) |
| Release/QA | [docs/RELEASE_AND_OBSERVABILITY_CHECKLIST.md](docs/RELEASE_AND_OBSERVABILITY_CHECKLIST.md) |
| Статусы | [canonical_status_models.md](canonical_status_models.md) |

---

## 7. Explicitly out of scope (Checkpoint 3)

- Public payment, revenue dashboard, self-serve booking, public review layer, public auth expansion.
- Новые сущности, новые статусы.
- Новые API-эндпоинты, billing logic, cron/worker automation (если не согласовано отдельно с GM).
- «Большая» аналитика, enterprise admin-panel, полноценный pilot dashboard с новыми метриками сверх существующих GET /metrics/admin/funnel.
- Изменение канонических статусов или контрактов существующих потоков.

---

*Правило Sprint 2: не расширяем продукт вширь; делаем существующий контур pilot-ready и операционно устойчивым.*
