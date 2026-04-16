# Commission uniqueness guarantee

**Контекст:** Sprint 2 Checkpoint 2 acceptance — correction «Commission uniqueness guarantee».

## Гарантия на уровне данных

На одного `bookingId` допускается не более одной записи Commission. Обеспечено:

1. **Уникальный индекс в БД:** в таблице `commissions` создан уникальный индекс по полю `bookingId` (миграция `20250317100000_commission_booking_unique`). Повторная вставка с тем же `bookingId` приводит к ошибке на уровне PostgreSQL.
2. **Проверка в API:** перед созданием записи handler проверяет наличие существующей Commission по `bookingId` и возвращает 409 с `commissionId` существующей записи, чтобы не доводить до DB-ошибки.

## План (выполнен)

- Добавлен `@@unique([bookingId])` в модель Commission (Prisma schema).
- Создана миграция, добавляющая `CREATE UNIQUE INDEX "commissions_bookingId_key" ON "commissions"("bookingId")`.
- Применение: `pnpm db:migrate` (или `prisma migrate deploy` в production).

## Rollback

При необходимости отката миграции: выполнить `DROP INDEX "commissions_bookingId_key";` вручную и удалить миграцию из папки migrations (с учётом политики версионирования миграций в проекте).
