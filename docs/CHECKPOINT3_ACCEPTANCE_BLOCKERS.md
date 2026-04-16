# Checkpoint 3 — условия для финальной приёмки

По [SPRINT2_CHECKPOINT3_FINAL_BLOCKER_EMAIL.md](SPRINT2_CHECKPOINT3_FINAL_BLOCKER_EMAIL.md): clock sync принят, блокер по pilot config закрыт. **Остаётся один блокер:** подтверждение применения миграции commission uniqueness. После его закрытия — повторно отправить пакет на финальную приёмку GM.

---

## 1. Commission uniqueness migration

**Требуется:** явно подтвердить одно из двух:
- `pnpm db:migrate` успешно применил миграцию `20250317100000_commission_booking_unique`
- либо constraint уже действует в БД и это подтверждено (например, проверка уникального индекса в БД)

**Как подтвердить:**
1. В корне проекта при доступной БД выполнить: `pnpm db:migrate` (или `npx pnpm@9.0.0 db:migrate`).
2. Убедиться, что в выводе есть применение миграции `20250317100000_commission_booking_unique` (или что все миграции уже применены и новая не создаётся).
3. Опционально: в БД выполнить `SELECT indexname FROM pg_indexes WHERE tablename = 'commissions' AND indexname = 'commissions_bookingId_key';` — индекс должен существовать.

После подтверждения — зафиксировать в пакете на приёмку **одно явное подтверждение** (в отчёте, в [MIGRATION_CONFIRMATION.md](MIGRATION_CONFIRMATION.md) или в сопроводительном сообщении GM):
- «Migration 20250317100000_commission_booking_unique applied in working environment»  
- или «Unique constraint for Commission.bookingId confirmed in database»

---

## 2. Pilot config — подтверждение Owner/GM

**Закрыто по clock sync:** Owner зафиксировал pilot wedge **Wakesurf-first**, anchor locations Krasnodar / Dubai / Bodrum, next lines SUP/MTB. Конфиг обновлён в [startup_config.md](../startup_config.md) §2 и в pilot docs. См. [SPRINT2_CLOCK_SYNC_UPDATED_PILOT_EMAIL.md](SPRINT2_CLOCK_SYNC_UPDATED_PILOT_EMAIL.md).

---

После выполнения п.1 и п.2 — повторно отправить пакет на финальную приёмку. Новые фичи и расширение scope до решения не вносить.
