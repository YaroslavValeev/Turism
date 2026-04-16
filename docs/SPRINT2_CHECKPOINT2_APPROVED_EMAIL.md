# Sprint 2 Checkpoint 2 — Plan Accepted (GM)

**Тема:** Sprint 2 Checkpoint 2 plan accepted — proceed with commission-first implementation

---

Привет.

`SPRINT2_CHECKPOINT_2_PLAN.md` принят.

# Sprint 2 Checkpoint 2 — Plan Accepted

## Зафиксированная цель checkpoint

Сделать `commission accrual flow` явно исполняемым и пригодным к pilot-операционке:

- от канонического `completed booking`
- к созданию `Commission`
- к `reconciliation`
- с audit trail
- с понятным runbook
- без payment flow
- без revenue dashboard

## In scope

1. Усиление пути по `docs/COMMISSION_ACCRUAL_PATH.md`
2. Подготовка `docs/COMMISSION_RUNBOOK.md`
3. Proof of execution для commission path
4. При необходимости — минимальная безопасная валидация в существующем API
5. Обновление pilot/ops checklist, если это требуется по итогам

## Что должно выйти по итогам

1. `COMMISSION_RUNBOOK.md`
2. Подтверждённый путь: completed booking → Commission created → reconciliation status visible → audit entries present
3. Checkpoint report с proof of execution
4. При необходимости — точечные безопасные правки API/admin без расширения scope

## Что обязательно показать в отчёте

**Proof of execution:** bookingId, booking status = completed, commissionId, reconciliationStatus, audit trail confirmation, viaApi / viaUi / manualOps.

**Подтвердить:** public payment absent, revenue dashboard absent, self-serve booking absent, no new entities/statuses introduced.

## Риски (удержать)

1. Уход в payment/revenue complexity — строго out of scope
2. Дубликат Commission на один booking — правило в runbook; защита в API минимально
3. Регрессия — сохранять smoke/regression

## Explicitly out of scope

public payment, revenue dashboard, self-serve booking, public review layer, public auth expansion, новые сущности, новые статусы, новые эндпоинты без необходимости, cron/worker automation.

## Формат финального отчёта

1. что изменено  
2. какие файлы созданы/изменены  
3. как тестировать  
4. риски  
5. rollback  
6. source of truth used  
7. proof of execution  

Можно переходить к реализации Checkpoint 2 строго в этом scope.
