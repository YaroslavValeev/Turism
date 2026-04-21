# Commission violations — snapshot и решение по strict-mode

Заполняется ops/lead вручную по данным БД (не автогенерируется в репозитории).

## 1. Подсчёт `commission_transition_violation_detected`

Общее число за период:

```sql
SELECT COUNT(*)::int AS total
FROM "DomainStatusEvent"
WHERE "eventType" = 'commission_transition_violation_detected'
  AND "createdAt" >= NOW() - INTERVAL '14 days';
```

Разбивка **admin** (PATCH) vs **billing** по полю `source` / payload:

```sql
SELECT
  CASE
    WHEN "source" LIKE 'billing:%' THEN 'billing'
    WHEN "source" = 'admin:PATCH' OR "source" LIKE '%PATCH%' THEN 'admin'
    ELSE COALESCE("source", 'unknown')
  END AS channel,
  COUNT(*)::int AS cnt
FROM "DomainStatusEvent"
WHERE "eventType" = 'commission_transition_violation_detected'
  AND "createdAt" >= NOW() - INTERVAL '14 days'
GROUP BY 1
ORDER BY cnt DESC;
```

Уточнение по billing-виду (если в payload есть `billingKind`):

```sql
SELECT
  COALESCE(("payloadJson"->>'billingKind')::text, 'n/a') AS billing_kind,
  COUNT(*)::int AS cnt
FROM "DomainStatusEvent"
WHERE "eventType" = 'commission_transition_violation_detected'
  AND "createdAt" >= NOW() - INTERVAL '14 days'
  AND "source" LIKE 'billing:%'
GROUP BY 1;
```

## 2. Шаблон снимка (заполнить)

| Период | Всего violations | admin | billing | Примечание |
|--------|------------------|-------|---------|------------|
| | | | | |

## 3. Решение по `COMMISSION_RECONCILIATION_STRICT_MODE`

| Состояние данных | Рекомендация |
|------------------|--------------|
| Стабильный ноль / единичные выбросы, billing-строки объяснимы | Можно планировать strict в staging → prod по [STAGE4_1_COMMISSION_STRICT_MODE.md](./STAGE4_1_COMMISSION_STRICT_MODE.md) |
| Ненулевой поток admin soft-fix legacy | Продолжить soft; нормализовать данные или оставить как есть |
| Частые billing violations | Разбор продукта/данных **до** strict; strict на PATCH не лечит billing mismatch |

**Краткий вердикт (выбрать одно):** ещё рано / частично (только staging) / готово к strict в prod — после заполнения таблицы и sign-off владельца.
