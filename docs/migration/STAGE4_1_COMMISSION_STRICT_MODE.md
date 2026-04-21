# Stage 4.1 — Commission strict mode (управляемое ужесточение)

## Зачем

После введения зон для `reconciliationStatus` резкий режим «только 400» ломает прод на legacy-данных. Нужен **наблюдаемый, обратимый** переход.

## Как вводится

| Параметр | Значение по умолчанию | Поведение |
|----------|------------------------|-----------|
| `COMMISSION_RECONCILIATION_STRICT_MODE` | не задан / не `true` | **Soft:** нарушение зон не блокирует PATCH; пишется `console.warn`, доменное событие `commission_transition_violation_detected`, обычный переход и audit; ответ с заголовком `X-Commission-Policy-Violation-Observed: 1`. |
| `COMMISSION_RECONCILIATION_STRICT_MODE=true` | strict | **Strict:** `applyCommissionReconciliationPatch` возвращает `invalid_transition` → **400** без записи статуса. |

## Billing (отдельно)

Контур **billing** не использует strict/soft для остановки пайплайна: при несовпадении с `isValidCommissionReconciliationBillingTransition` выполняется **лог + `commission_transition_violation_detected`**, затем **upsert/update продолжается** (critical path платежей/начислений не прерывается).

## Когда включать strict

1. По метрикам: частота `commission_transition_violation_detected` → ~0 за отчётный период.
2. После ручной/скриптовой нормализации данных.
3. По решению владельца продукта + запись в ADR / close report.

## Как контролируется

- События в `DomainStatusEvent` с `eventType = commission_transition_violation_detected` (payload: from, to, reason, actorId, source `admin` | `billing`).
- Логи `[commission]` / `[billing]` в stdout API.
- Заголовок ответа PATCH при soft-нарушении.

## Откат

Выставить `COMMISSION_RECONCILIATION_STRICT_MODE` в пусто или `false` и перезапустить API — немедленный возврат к soft-режиму.

---

## План наблюдения перед включением strict в проде

### Где смотреть violation events

| Источник | Как |
|----------|-----|
| БД | Таблица `DomainStatusEvent`, фильтр `eventType = 'commission_transition_violation_detected'`, сортировка по `createdAt`. |
| Payload | Поля в `payloadJson`: `from`, `to`, `reason`, `actorId`, `source` (`admin` / `billing`), при billing — `billingKind`. |
| Analytics (дубль для дашбордов) | При включённом `ANALYTICS_ENABLED` — событие `event_name = commission_transition_violation_detected` в `AnalyticsEvent` (best-effort из `emitCommissionPolicyViolationAnalyticsBestEffort`), поля `commission_id`, `properties_json.violation_source` / `billing_kind`. |
| HTTP | Ответ PATCH комиссии: заголовок `X-Commission-Policy-Violation-Observed: 1` (только soft-режим admin). |
| Логи процесса API | Строки `[commission]` и `[billing]` с текстом `policy mismatch` / `soft-allowed`. |

Пример подсчёта за окно (PostgreSQL), подставьте интервал:

```sql
SELECT date_trunc('day', "createdAt") AS day, COUNT(*)::int AS violations
FROM "DomainStatusEvent"
WHERE "eventType" = 'commission_transition_violation_detected'
  AND "createdAt" >= NOW() - INTERVAL '30 days'
GROUP BY 1
ORDER BY 1 DESC;
```

### Какой порог считать безопасным для `strict`

Ориентиры (не жёсткий SLA — решение владельца + QA):

1. **Стабильный ноль или единичные выбросы:** по дням нет устойчивого потока нарушений; всплески объяснимы разовой миграцией данных.
2. **Две отчётные недели подряд** без необходимости soft-fix legacy через PATCH (или после явной нормализации БД).
3. **Billing:** отдельно смотреть строки с `source` / `billingKind` в payload — если они не нулевые, выяснять причину **до** strict; strict на PATCH не отключает billing-логирование, но показывает зрелость данных.

**Журнал наблюдений** фиксировать в `STAGE4_1_QA_SCENARIOS.md` или отдельной ops-заметке перед переключением env в проде.
