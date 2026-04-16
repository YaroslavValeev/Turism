# Sprint 2 — Checkpoint 1 Plan

**Назначение:** Первый checkpoint Sprint 2. Утверждённый scope — без расширения продукта вширь; усиление pilot-ready операционного контура.

---

## 1. Управленческая цель checkpoint

Зафиксировать **pilot configuration** (один регион, предусловия запуска) и проверить **один полный E2E-путь** (organizer → program → publish → booking → completed); сделать **один операционный поток** явно пригодным к исполнению (commission accrual или verification) — документированно и без лишних трения в admin. Итог: после Checkpoint 1 есть чёткая база для пилота (конфиг + проверенный путь + один затверждённый ops-flow).

---

## 2. Scope

| Элемент | Содержание |
|---------|------------|
| **Pilot configuration** | Актуализировать/зафиксировать один регион и нишу в [startup_config.md](startup_config.md); при необходимости — краткий документ «Pilot pre-launch preconditions» (один регион, 1–2 организатора, 3–10 программ, assisted booking, что должно быть проверено перед go-live). |
| **E2E path verification** | Один полный сценарий: создание организатора → создание программы (draft) → добавление медиа → прохождение publish gate → published → создание бронирования (public intake) → перевод бронирования в completed (admin). Проверка по существующему smoke/regression (без новых фич). |
| **Один hardened ops flow** | **Verification flow first** (решение GM). Пошаговый runbook: evidence requirements, status transitions (listed → checked → verified/trusted), operator actions, missing evidence logic, audit expectations; опора на [docs/VERIFICATION_LADDER.md](docs/VERIFICATION_LADDER.md). Commission accrual переносится в Checkpoint 2. При необходимости — минимальные подсказки в admin (ссылка на runbook или краткий текст) без усложнения UI. |
| **Checklist** | Обновить [docs/RELEASE_AND_OBSERVABILITY_CHECKLIST.md](docs/RELEASE_AND_OBSERVABILITY_CHECKLIST.md) разделом «Pilot pre-launch» (или отдельный docs/PILOT_PRELAUNCH_CHECKLIST.md) с пунктами: регион/ниша, наличие организаторов/программ, smoke пройден, E2E путь пройден, verification flow выполнен. |

В рамках checkpoint **не вводятся** новые сущности, новые статусы, новые API-эндпоинты. Допускаются: правки конфига/документации, минимальные правки admin (подсказки, ссылки на runbook), обновление скриптов smoke/regression при необходимости.

---

## 3. Deliverables

- **Pilot config:** [startup_config.md](startup_config.md) с актуальными нишей и регионом; при необходимости — docs с перечнем pilot pre-launch preconditions.
- **Pilot pre-launch checklist:** новый раздел или документ (например [docs/PILOT_PRELAUNCH_CHECKLIST.md](docs/PILOT_PRELAUNCH_CHECKLIST.md)) с проверяемыми пунктами перед запуском пилота.
- **E2E verification:** подтверждение (в отчёте по Checkpoint 1), что путь organizer → program → publish → booking → completed выполняется по текущему API/admin и smoke/regression.
- **Verification runbook (hardened):** документ с пошаговой инструкцией: evidence requirements, status transitions, operator actions, missing evidence logic, audit expectations; при необходимости — одна минимальная подсказка в admin (текст/ссылка).
- **Checkpoint 1 report:** по завершении — отчёт в формате: что изменено; файлы созданы/изменены; как тестировать; риски; rollback; source of truth used; что explicitly out of scope; **Proof of execution** (organizer id/slug, program id/slug, publish status before/after, booking id, booking status progression, evidence used for verification, что прошло через UI/API/manual ops).

---

## 4. Риски

| Риск | Митигация |
|------|-----------|
| Размывание в фичи | Ограничиться одним ops flow (commission **или** verification); подсказки в admin — только ссылка/краткий текст, без новых экранов. |
| Регрессия | E2E проверять по существующему regression path; не менять контракты API и схему БД. |
| Дублирование документации | Runbook опирается на существующие docs (COMMISSION_ACCRUAL_PATH, VERIFICATION_LADDER); checklist — расширение RELEASE_AND_OBSERVABILITY_CHECKLIST, а не замена. |

---

## 5. Rollback

- Изменения только в конфиге (startup_config), документации (docs) и, при необходимости, в минимальных правках admin (текст/ссылка). Откат — revert коммитов по этим файлам.
- Миграции БД и изменения API в scope Checkpoint 1 не входят; откат миграций не требуется.

---

## 6. Source of truth used

| Область | Документ/артефакт |
|---------|--------------------|
| Sprint 2 scope | [SPRINT2_GM_BRIEF.md](SPRINT2_GM_BRIEF.md) |
| Pilot config | [startup_config.md](startup_config.md) |
| Commission path | [docs/COMMISSION_ACCRUAL_PATH.md](docs/COMMISSION_ACCRUAL_PATH.md) |
| Verification | [docs/VERIFICATION_LADDER.md](docs/VERIFICATION_LADDER.md) |
| Release/QA | [docs/RELEASE_AND_OBSERVABILITY_CHECKLIST.md](docs/RELEASE_AND_OBSERVABILITY_CHECKLIST.md) |
| Существующий E2E | [SPRINT1_STABILIZATION_REPORT.md](SPRINT1_STABILIZATION_REPORT.md), [docs/RELEASE_AND_OBSERVABILITY_CHECKLIST.md](docs/RELEASE_AND_OBSERVABILITY_CHECKLIST.md) (Regression) |

---

## 7. Explicitly out of scope (Checkpoint 1)

- Public payment, self-serve booking, revenue dashboard, public review layer, public auth expansion.
- Новые сущности/статусы.
- Новые API-эндпоинты или изменения контрактов.
- Полноценный «enterprise» админ-панель или новая аналитика.
- Вне Checkpoint 1: commission accrual runbook (Checkpoint 2), остальные ops flows, расширенные pilot metrics — в следующих checkpoint’ах.

---

## 8. Приёмка GM (verification flow first)

**SPRINT2_CHECKPOINT_1_PLAN.md — Accepted.** Реализацию Checkpoint 1 можно начинать. Hardened ops flow в этом checkpoint — **verification flow**; commission accrual — в очереди на Checkpoint 2. Формат отчёта: что изменено, файлы, как тестировать, риски, rollback, source of truth, **proof of execution** (organizer id/slug, program id/slug, publish status before/after, booking id, booking status progression, evidence used, UI/API/manual). Письмо разработчику: [docs/SPRINT2_CHECKPOINT1_ACCEPTED_EMAIL.md](docs/SPRINT2_CHECKPOINT1_ACCEPTED_EMAIL.md).

---

*Правило Sprint 2: не расширяем продукт вширь; делаем существующий контур pilot-ready и операционно устойчивым.*
