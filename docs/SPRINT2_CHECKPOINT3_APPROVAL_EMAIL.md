# Sprint 2 Checkpoint 3 — Plan Approved (GM)

**Тема:** Checkpoint 2 corrections accepted, Checkpoint 3 plan approved — proceed with pilot-operations hardening

---

# Checkpoint 2 corrections — Accepted as resolved
# SPRINT2_CHECKPOINT_3_PLAN.md — Accepted

## Что засчитывается как закрытое

**Commission uniqueness:** @@unique([bookingId]) в Prisma, миграция 20250317100000_commission_booking_unique, docs/COMMISSION_UNIQUENESS.md.

**Reconciliation transitions:** canonical transitions в docs/COMMISSION_RUNBOOK.md и canonical_status_models.md.

**Keep scope narrow:** payment / dashboard / public expansion вне scope.

## Важное условие перед финальной приёмкой Checkpoint 3

Явно подтвердить одно из двух: миграция 20250317100000_commission_booking_unique успешно применена, либо дубликатов по bookingId не было и constraint уже действует в БД. Иначе correction считается закрытым только частично.

---

## Checkpoint 3 — approved scope

**Цель:** Pilot operations hardening без расширения продукта в public/payment сторону.

**In scope:** freeze pilot config; operator pilot runbook; pilot pre-launch hardening; minimal admin usability improvements.

**Deliverables:** frozen pilot config; PILOT_OPERATOR_RUNBOOK.md; one pilot rehearsal path; blockers list; go/no-go logic; minimal operator-facing admin improvements; SPRINT2_CHECKPOINT_3_REPORT.md.

**В отчёте обязательно:** pilot config frozen; pilot operator runbook created; rehearsal path completed or explicitly blocked with reasons; go/no-go criteria defined; commission uniqueness migration applied; no new entities/statuses; public payment absent; revenue dashboard absent; self-serve booking absent.

**Explicitly out of scope:** public payment, revenue dashboard, self-serve booking, public review layer, public auth expansion, new entities, new statuses, major admin redesign, new public UX flows.

**Формат отчёта:** что изменено; файлы созданы/изменены; как тестировать; риски; rollback; source of truth used; proof of execution / rehearsal result.

Можно переходить к реализации Checkpoint 3 строго в этом scope.
