# Checkpoint 3 — only migration confirmation remains (GM)

**Тема:** Checkpoint 3 still pending — only migration confirmation remains

---

# Checkpoint 3 Sprint 2 — Pending final acceptance

## Что уже принято

- docs/SPRINT2_CHECKPOINT3_FINAL_BLOCKER_EMAIL.md
- docs/CHECKPOINT3_ACCEPTANCE_BLOCKERS.md
- docs/MIGRATION_CONFIRMATION.md

Clock sync принят. Pilot config больше не является блокером.

## Единственный блокер

Подтвердить **одно** из двух:

**Вариант 1:** `Migration 20250317100000_commission_booking_unique applied in working environment`

**Вариант 2:** `Unique constraint for Commission.bookingId confirmed in database`

Без одной из этих явных формулировок финальная приёмка Checkpoint 3 не выдается.

## Что нужно сделать

1. Остановить процессы, держащие advisory lock: `pnpm dev:api`, Prisma Studio, любые фоновые процессы с Prisma migrate/client.
2. Выполнить `pnpm db:migrate`.
3. Если advisory lock повторяется: перезапустить PostgreSQL-контур, повторить `pnpm db:migrate`; при необходимости отдельно подтвердить наличие уникального ограничения в БД.
4. Добавить в пакет на приёмку одну из точных фраз подтверждения выше.

## Что НЕ делать

Не добавлять новые фичи; не менять scope Checkpoint 3; не трогать public/payment; не добавлять новые документы сверх необходимого; не переходить к следующему checkpoint до снятия блокера.

## После снятия блокера

Повторно отправить пакет Checkpoint 3 на финальную приёмку GM без дополнительных изменений в продукте и scope.
