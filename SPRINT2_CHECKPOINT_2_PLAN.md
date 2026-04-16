# Sprint 2 — Checkpoint 2 Plan

**Назначение:** Второй checkpoint Sprint 2. Commission accrual flow first — затвердить операционный путь от completed booking к Commission и reconciliation, без payment/revenue-фич.

---

## 1. Управленческая цель checkpoint

Сделать путь **commission accrual** явно пригодным к исполнению оператором: от завершённого бронирования (bookingStatus = completed) к созданию записи Commission, смене reconciliation status и полной прослеживаемости в audit. Итог: один затверждённый ops-flow по начислению и сверке комиссий, документированный runbook и proof of execution для приёмки GM.

---

## 2. Scope

| Элемент | Содержание |
|---------|------------|
| **Commission accrual path (hardened)** | Опираться на [docs/COMMISSION_ACCRUAL_PATH.md](docs/COMMISSION_ACCRUAL_PATH.md). Путь: completed booking → POST /commissions (bookingId, organizerId, programId, gmvRub, rate/fixed) → запись с reconciliationStatus (pending_evidence / accrued) → PATCH /commissions/:id/reconciliation при смене статуса сверки. Audit по созданию и по смене reconciliation. Проверка: только для booking со статусом completed; при необходимости — явная валидация в API (bookingId существует и bookingStatus = completed). |
| **Commission runbook** | Новый документ [docs/COMMISSION_RUNBOOK.md](docs/COMMISSION_RUNBOOK.md): когда начислять (триггер — completed booking); какие поля обязательны при POST /commissions; переходы reconciliation (pending_evidence → accrued → invoiced → … → paid / written_off); действия оператора; ожидания по audit_log; что не входит (payment flow, списания, revenue UI). |
| **Proof of execution** | В отчёте Checkpoint 2 — блок proof: bookingId (completed), commissionId, gmvRub, commissionAccruedRub, reconciliationStatus до/после, запись в audit_log (commission_created, commission_reconciliation_change), viaApi/viaUi/manual ops. |
| **Checklist** | При необходимости обновить [docs/PILOT_PRELAUNCH_CHECKLIST.md](docs/PILOT_PRELAUNCH_CHECKLIST.md) или [docs/RELEASE_AND_OBSERVABILITY_CHECKLIST.md](docs/RELEASE_AND_OBSERVABILITY_CHECKLIST.md): пункт про выполнение commission flow (создание Commission для completed booking, смена reconciliation). Не дублировать runbook — ссылка на COMMISSION_RUNBOOK. |

В рамках checkpoint **не вводятся** новые сущности, новые статусы reconciliation, новые API-эндпоинты. Допускаются: валидация при POST /commissions (booking completed, отсутствие дубликата Commission по bookingId — по договорённости), документация, минимальные подсказки в admin (ссылка на runbook), скрипт e2e/regression для commission path при необходимости.

---

## 3. Deliverables

- **Commission runbook (hardened):** [docs/COMMISSION_RUNBOOK.md](docs/COMMISSION_RUNBOOK.md) — пошаговая инструкция: триггер (completed booking), создание Commission (POST), поля и расчёт accrued, переходы reconciliation, действия оператора, audit expectations, явно out of scope.
- **Commission accrual path:** подтверждение (в коде/API при необходимости), что путь completed → POST /commissions → PATCH reconciliation выполним и аутируем; при необходимости — проверка в API: booking существует и bookingStatus = completed перед созданием Commission; опционально — проверка на один Commission на bookingId (по решению при реализации).
- **Pilot/ops checklist:** обновление при необходимости — один пункт «Commission flow выполнен по COMMISSION_RUNBOOK» со ссылкой.
- **Checkpoint 2 report:** по завершении — отчёт: что изменено; файлы созданы/изменены; как тестировать; риски; rollback; source of truth used; explicitly out of scope; **Proof of execution** (bookingId, commissionId, gmvRub, commissionAccruedRub, reconciliation progression, audit evidence, viaApi/viaUi/manual).

---

## 4. Риски

| Риск | Митигация |
|------|-----------|
| Размывание в payment/revenue | Жёстко держать out of scope: платёжные шлюзы, списания, revenue dashboard, публичные суммы. Runbook и контракт — только accrual и reconciliation, без payment logic. |
| Дублирование Commission на один booking | Описать в runbook правило «один Commission на один completed booking»; при реализации — опциональная проверка в API (409 при повторном POST с тем же bookingId). |
| Регрессия | Smoke и существующий regression (в т.ч. пункт про Commission в RELEASE_AND_OBSERVABILITY_CHECKLIST) сохраняются; не менять контракты без необходимости. |

---

## 5. Rollback

- Изменения — в документации (COMMISSION_RUNBOOK, checklist), при необходимости в API (валидация POST /commissions) и минимальных правках admin (ссылка на runbook). Откат — revert коммитов по затронутым файлам.
- Миграции БД и новые сущности/статусы в scope не входят; откат миграций не требуется.

---

## 6. Source of truth used

| Область | Документ/артефакт |
|---------|--------------------|
| Sprint 2 scope | [SPRINT2_GM_BRIEF.md](SPRINT2_GM_BRIEF.md) |
| Commission path (canonical) | [docs/COMMISSION_ACCRUAL_PATH.md](docs/COMMISSION_ACCRUAL_PATH.md) |
| Commission data contract | [commission_data_contract.md](commission_data_contract.md) |
| Reconciliation statuses | [canonical_status_models.md](canonical_status_models.md), packages/shared-types (COMMISSION_RECONCILIATION_STATUSES) |
| API/audit | services/api (commissions routes, audit_log); [docs/RELEASE_AND_OBSERVABILITY_CHECKLIST.md](docs/RELEASE_AND_OBSERVABILITY_CHECKLIST.md) (Regression) |
| Pilot checklist | [docs/PILOT_PRELAUNCH_CHECKLIST.md](docs/PILOT_PRELAUNCH_CHECKLIST.md) |

---

## 7. Explicitly out of scope (Checkpoint 2)

- Public payment, платёжные шлюзы, списания, приём оплаты от пользователей.
- Revenue dashboard (пользовательский или админский финансовый дашборд).
- Self-serve booking, public review layer, public auth expansion.
- Новые сущности, новые статусы reconciliation.
- Новые API-эндпоинты сверх существующих GET/POST /commissions, GET/PATCH /commissions/:id, PATCH /commissions/:id/reconciliation.
- Автоматический cron/worker для создания Commission (может быть в следующих checkpoint’ах; контракт и runbook должны быть готовы для его опоры).

---

*Правило Sprint 2: не расширяем продукт вширь; делаем существующий контур pilot-ready и операционно устойчивым.*
