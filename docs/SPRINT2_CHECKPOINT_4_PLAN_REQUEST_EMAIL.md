# SPRINT2_CHECKPOINT_4_PLAN_REQUEST_EMAIL.md

**Тема:** Prepare SPRINT2_CHECKPOINT_4_PLAN.md — Pilot Rehearsal Execution

Привет.

Да, следующим шагом подготовьте:

# `SPRINT2_CHECKPOINT_4_PLAN.md`

## Цель checkpoint

Провести **pilot rehearsal execution** и получить реальный управленческий сигнал:

- контур pilot-ready  
или  
- есть конкретные blockers до go-live

## Что должно быть в плане

### 1. Управленческая цель

Чёткая формулировка checkpoint-а как rehearsal execution step.

### 2. Scope

Только:

- one rehearsal path
- operator trace
- blocker capture
- go / no-go signal
- minimal admin usability fixes only if rehearsal exposes real friction

### 3. Deliverables

- rehearsal plan
- rehearsal execution proof
- operator pain points list
- blocker list
- go / no-go recommendation
- checkpoint report

### 4. Risks

- rehearsal drifts into feature work
- manual frictions are not captured
- proof replaced by narrative
- team starts fixing everything instead of capturing blockers

### 5. Rollback

- only for minimal admin/usability changes if they appear
- no migrations / no new domain entities unless separately approved

### 6. Source of truth used

Include:

- `SPRINT2_GM_BRIEF.md`
- `startup_config.md`
- `docs/PILOT_OPERATOR_RUNBOOK.md`
- `docs/PILOT_GO_NOGO.md`
- `docs/PILOT_PRELAUNCH_CHECKLIST.md`
- `docs/COMMISSION_RUNBOOK.md`
- `docs/VERIFICATION_LADDER.md`
- `SPRINT2_CHECKPOINT_3_REPORT.md`

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

В этом checkpoint-е нужен **реальный rehearsal**, а не только описанный.

В финальном отчёте должен быть отдельный блок:

## Rehearsal Proof

- organizer id / slug
- program id / slug
- booking id
- operator steps
- where manual intervention was required
- what passed cleanly
- what broke / blocked
- go / no-go recommendation

Подготовьте план строго в этом формате.
