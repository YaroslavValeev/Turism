# Sprint 2 Checkpoint 2 — Accepted with corrections (GM)

**Тема:** Sprint 2 Checkpoint 2 accepted with corrections — proceed to pilot-operations hardening

---

# Checkpoint 2 Sprint 2 — Accepted with corrections

## Что принято

- `docs/COMMISSION_RUNBOOK.md`
- commission accrual path from canonical `completed booking`
- минимальная API validation для `POST /commissions`
- duplicate protection at handler level
- `GET /commissions?bookingId=...`
- update of `docs/PILOT_PRELAUNCH_CHECKLIST.md`
- admin hint/link to commission runbook
- `scripts/e2e_checkpoint2_commission.js`
- real proof of execution in `SPRINT2_CHECKPOINT_2_REPORT.md`

## Что отдельно подтверждено

- public payment absent
- revenue dashboard absent
- self-serve booking absent
- no new entities/statuses introduced

## Неблокирующие corrections (включить в следующий delivery)

1. **Commission uniqueness guarantee** — проверить/добавить гарантию уникальности Commission на уровне данных для одного bookingId; если DB constraint пока не добавляется, зафиксировать план внедрения.
2. **Reconciliation transitions** — явно закрепить допустимые переходы reconciliation status; убедиться, что совпадают с канонической status model.
3. **Keep scope narrow** — не расширять commission flow в payment/billing/dashboard complexity.

## Следующий фокус: Sprint 2 Checkpoint 3 — Pilot operations hardening

Цель: сделать pilot-ready операционный контур более пригодным к реальному запуску без добавления новых public/payment features.

**Предлагаемый scope:** freeze pilot config; operator pilot runbook (booking, verification gap, review/incident/commission exceptions); pilot pre-launch hardening (rehearsal path, blockers, go/no-go); minimal admin usability (no new entities, no public expansion).

**Explicitly out of scope:** public payment, revenue dashboard, self-serve booking, public review layer, public auth expansion, new entities/statuses, billing/cron/worker automation unless approved.

**Формат плана:** управленческая цель, scope, deliverables, risks, rollback, source of truth used, explicitly out of scope.
