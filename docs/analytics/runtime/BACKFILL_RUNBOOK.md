# Runbook: backfill `travelerKeyHash`

## Зачем

После миграции колонки `travelerKeyHash` на `bookings` / `leads` существующие строки остаются `NULL`. Без backfill cohort/repeat/LTV по истории искажены.

## Предусловия

1. Миграция `20260416001000_runtime_traveler_dq_scores` (или эквивалент) применена.
2. В окружении задан **`TRAVELER_KEY_SALT`** (тот же, что будет в prod; смена соли меняет все хеши).
3. Резервная копия БД на prod — по политике команды.

## Запуск

Из каталога `services/api` (с теми же переменными, что и API):

```bash
pnpm run backfill:traveler-key
```

Скрипт: [`scripts/backfill-traveler-key.ts`](../../../services/api/scripts/backfill-traveler-key.ts).

- Идемпотентен: повторный запуск обновляет только строки с `travelerKeyHash IS NULL`.
- Пустой `guestContact` пропускается.
- Без `TRAVELER_KEY_SALT` скрипт завершается с кодом 1.

## После запуска

- Проверить долю NULL: `SELECT COUNT(*) FILTER (WHERE "travelerKeyHash" IS NULL) FROM bookings;` (и для `leads`).
- Пересчитать score при необходимости: `POST /internal/analytics/scores/recalculate`.

## Rollback

Осознанно обнулить колонку только если нужно полностью пересчитать с **новой** солью:

```sql
UPDATE bookings SET "travelerKeyHash" = NULL;
UPDATE leads SET "travelerKeyHash" = NULL;
```

Затем снова backfill с новой солью.
