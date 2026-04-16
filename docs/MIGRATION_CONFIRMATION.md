# Подтверждение применения миграции (Checkpoint 3 final blocker)

Единственный оставшийся блокер финальной приёмки Checkpoint 3 — подтверждение миграции `20250317100000_commission_booking_unique`. См. [SPRINT2_CHECKPOINT3_FINAL_BLOCKER_EMAIL.md](SPRINT2_CHECKPOINT3_FINAL_BLOCKER_EMAIL.md).

---

## Как применить миграцию

1. Освободить БД: остановить `dev:api`, Prisma Studio и другие процессы, держащие соединение с PostgreSQL.
2. В корне проекта выполнить: `pnpm db:migrate` (или `npx pnpm@9.0.0 db:migrate`).
3. Если advisory lock повторяется — перезапустить PostgreSQL (например `docker compose restart`), затем снова `pnpm db:migrate`. При необходимости подтвердить наличие уникального индекса в БД (вариант 2 ниже).
4. Убедиться, что миграция `20250317100000_commission_booking_unique` применена (сообщение в выводе или отсутствие pending-миграций).

См. также [SPRINT2_CHECKPOINT3_MIGRATION_ONLY_EMAIL.md](SPRINT2_CHECKPOINT3_MIGRATION_ONLY_EMAIL.md).

---

## Подтверждение для пакета на приёмку GM

После успешного применения в рабочем контуре заполнить **одно** из двух (и включить в пакет при повторной отправке на приёмку):

- [x] **Migration 20250317100000_commission_booking_unique applied in working environment**

или

- [ ] **Unique constraint for Commission.bookingId confirmed in database**

Дата подтверждения: 2026-03-17  

(После этого пакет Checkpoint 3 можно повторно отправить на финальную приёмку GM.)
