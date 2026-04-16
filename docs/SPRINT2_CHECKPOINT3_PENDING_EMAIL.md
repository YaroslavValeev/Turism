# Checkpoint 3 — Pending final acceptance (GM)

**Тема:** Checkpoint 3 pending final acceptance — two blocking conditions remain

---

# Статус: Checkpoint 3 Sprint 2 — Pending final acceptance

## Что засчитывается как выполненное

- docs/PILOT_OPERATOR_RUNBOOK.md
- docs/PILOT_GO_NOGO.md
- updates in docs/PILOT_PRELAUNCH_CHECKLIST.md
- admin hint for operator docs
- SPRINT2_CHECKPOINT_3_REPORT.md
- general pilot-operations hardening package

## Что блокирует финальную приёмку

### 1. Commission uniqueness migration must be confirmed in working environment

Нужно явно подтвердить одно из двух:
- `pnpm db:migrate` успешно применил `20250317100000_commission_booking_unique`
- либо constraint уже реально действует в БД и это подтверждено

Без этого correction после Checkpoint 2 считается закрытым не полностью.

### 2. Pilot config requires explicit Owner confirmation

В текущем пакете frozen pilot config указан как: region Alps, niche Alpine skiing.  
Это требует **явного подтверждения Owner / GM**. До такого подтверждения pilot config не считается финально принятым.

## Что нужно сделать дальше

1. Подтвердить применение migration `20250317100000_commission_booking_unique`
2. Получить / зафиксировать явное решение Owner по pilot config: либо Alps / Alpine skiing confirmed, либо config is corrected back to canonical pilot scope
3. Повторно прислать пакет на финальную приёмку
4. Не добавлять новые фичи и не расширять scope до финального решения

## Что НЕ нужно делать

- не добавлять новые сущности
- не менять scope checkpoint
- не делать payment/public expansion
- не перерабатывать runbook/docs сверх необходимого

После закрытия этих двух условий — финальное решение GM: **Accepted / Accepted with corrections**.
