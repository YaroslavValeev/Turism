# SPRINT2_CHECKPOINT_5_PLAN_REQUEST_EMAIL.md

**Тема:** Prepare SPRINT2_CHECKPOINT_5_PLAN.md — Pilot Go-Live Gate

Привет.

Да, следующим шагом подготовьте:

# `SPRINT2_CHECKPOINT_5_PLAN.md`

## Цель checkpoint

Принять решение о pilot go-live на основе одного manual operator pass и списка оставшихся operational guardrails.

## Что должно быть в плане

### 1. Управленческая цель

Чёткая формулировка checkpoint-а как pilot go-live gate.

### 2. Scope

Только:

- one manual operator pass
- operator friction capture
- minimal operator-facing fixes only if clearly needed
- pilot go-live recommendation

### 3. Deliverables

- manual operator pass scenario
- operator friction list
- minimal fixes list (only if needed)
- pilot guardrails list
- go-live recommendation
- `SPRINT2_CHECKPOINT_5_REPORT.md`

### 4. Risks

- manual pass drifts into feature work
- friction capture replaced by "fix everything"
- operator path not reproducible
- premature GO without explicit guardrails

### 5. Rollback

- only for minimal admin/usability changes if they appear
- no migrations
- no new domain entities
- no API expansion unless separately approved

### 6. Source of truth used

Include:

- `SPRINT2_GM_BRIEF.md`
- `startup_config.md`
- `docs/PILOT_OPERATOR_RUNBOOK.md`
- `docs/PILOT_GO_NOGO.md`
- `docs/PILOT_PRELAUNCH_CHECKLIST.md`
- `docs/COMMISSION_RUNBOOK.md`
- `docs/VERIFICATION_LADDER.md`
- `SPRINT2_CHECKPOINT_4_REPORT.md`
- `docs/SPRINT2_CHECKPOINT_4_ACCEPTANCE_EMAIL.md`

### 7. Explicitly out of scope

- public payment
- self-serve booking
- revenue dashboard
- public review layer
- public auth expansion
- new entities/statuses
- major admin redesign
- broad analytics expansion

## Дополнительное требование GM

В финальном отчёте нужен отдельный блок:

## Manual Operator Proof

- scenario used
- admin pages used
- what was clear
- what was unclear
- where workaround was required
- what guardrails are needed before pilot go-live
- final recommendation:
  - `GO`
  - `GO WITH GUARDRAILS`
  - `NO-GO`

Подготовьте план строго в этом формате.
