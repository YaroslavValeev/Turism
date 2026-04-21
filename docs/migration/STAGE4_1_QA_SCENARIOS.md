# Stage 4.1 — расширенные QA-сценарии (commission / billing)

Результаты прогонов фиксирует QA вручную или в чеклисте релиза. Автотесты policy — см. `services/api/src/modules/status-engine/transitionPolicy.test.ts`.

## 1. Legacy PATCH: `paid` → `draft` (комиссия)

**Условие:** в БД у комиссии `reconciliationStatus = paid` (или иное settlement-состояние), админ запрашивает переход в `draft`.

| Режим | Ожидание |
|-------|----------|
| Soft (по умолчанию) | HTTP 200, статус сохранён как `draft`, заголовок `X-Commission-Policy-Violation-Observed: 1`, в `DomainStatusEvent` есть `commission_transition_violation_detected` и обычный переход. |
| Strict (`COMMISSION_RECONCILIATION_STRICT_MODE=true`) | HTTP 400, тело с `from` / `to`, статус в БД **не** меняется. |

## 2. Billing: путь к `invoiced` (statement)

**Условие:** комиссии в статусах из `ELIGIBLE_STATEMENT_COMMISSION_STATUSES` (`accrued`, `approved`), генерация statement за период.

**Ожидание:** массовое обновление `invoiced` без ошибки HTTP; биллинг не падает при единичном рассинхроне — лог + `commission_transition_violation_detected`, строка всё равно переводится в `invoiced` (critical path).

## 3. Массовый invoiced + одна «битая» запись

**Условие:** в выборку попала комиссия с неожиданным `reconciliationStatus` (например legacy), не проходящим policy для `statement_invoiced`.

**Ожидание:** процесс **не** прерывается Exception; для проблемной строки — `console.warn` + событие нарушения; `invoiced` записывается (как в п.2).

## 4. Recalculate (платежи)

**Условие:** после оплаты/возврата вызывается `recalculateCommissionForBooking`.

**Ожидание:** не выбрасывается ошибка policy; при теоретическом mismatch — лог + `commission_transition_violation_detected`, upsert комиссии завершается.

---

## Журнал прогонов

| Дата | Сценарий | Окружение | Результат | Примечание |
|------|----------|-----------|-----------|------------|
| | | | | |
