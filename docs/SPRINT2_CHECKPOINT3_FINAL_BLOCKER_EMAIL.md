# Checkpoint 3 — Final blocker: migration confirmation only (GM)

**Тема:** Clock sync accepted — only migration confirmation remains for final Checkpoint 3 acceptance

---

# Clock sync — Accepted

**Подтверждено:** Pilot wedge Wakesurf-first; anchor locations Krasnodar, Dubai, Bodrum; next catalog lines SUP, MTB. Синхронизированные документы засчитаны. Блокер по pilot config закрыт. Alps / Alpine skiing больше не активная frozen-конфигурация.

## Единственный блокер финальной приёмки Checkpoint 3

**Migration confirmation:** подтвердить одно из двух:
1. Миграция `20250317100000_commission_booking_unique` успешно применена в рабочем контуре  
2. Либо constraint уже реально существует в БД и это подтверждено явно

## Что сделать дальше

1. Освободить БД-контур при необходимости (закрыть dev:api / Prisma Studio / др.).
2. Выполнить `pnpm db:migrate`.
3. Зафиксировать в пакете явное подтверждение: «Migration 20250317100000_commission_booking_unique applied in working environment» или «Unique constraint for Commission.bookingId confirmed in database».
4. Повторно отправить пакет Checkpoint 3 на финальную приёмку (без новых фич, сущностей, изменения scope).

Не добавлять продуктовые изменения, не расширять public/payment, не менять pilot config, не дописывать runbooks/UI сверх необходимого.

После подтверждения миграции GM вернётся к решению: **Checkpoint 3 Sprint 2 — Accepted**.
