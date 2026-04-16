# PILOT_LAUNCH_EXECUTION_EMAIL.md

**Тема:** Final gate confirmed — launch limited pilot in GO WITH GUARDRAILS mode

Привет.

Финальное gate-решение подтверждено.

# Pilot launch = GO WITH GUARDRAILS

## Source of truth

Используем как канонические документы:

- `SPRINT2_CHECKPOINT_5_REPORT.md`
- `startup_config.md`

## Что это означает

Можно запускать ограниченный pilot, но только в следующих рамках:

### Pilot wedge

- `Wakesurf-first`

### Anchor locations

- `Krasnodar`
- `Dubai`
- `Bodrum`

### Next catalog lines

- `SUP`
- `MTB`  
  (не в первом пилоте)

## Обязательные guardrails

1. operator follows runbook
2. only pilot-relevant organizers/programs remain visible
3. non-pilot test data is cleaned, hidden or clearly marked
   - first of all: old `Горные лыжи / Альпы` entry
4. all friction is logged during pilot
5. pilot remains limited:
   - 1–2 organizer flows
   - small number of programs
   - assisted only

## Что делать дальше

### 1. Clean pilot-visible data

- убрать / скрыть / пометить непилотные записи

### 2. Launch limited pilot

- только operator-assisted flow
- без public payment
- без self-serve booking
- без public reviews
- без public auth expansion

### 3. Start monitoring

Нужно вести:

- booking friction log
- verification friction log
- commission friction log
- operator UX friction log

### 4. Use monitoring plan

Опереться на:

- `PILOT_MONITORING_PLAN.md`

## Что не делать

- не открывать новый large feature checkpoint
- не расширять pilot до широкого каталога
- не добавлять новые сущности/статусы
- не трогать public/payment layer
- не превращать monitoring phase в redesign sprint

## Следующий ожидаемый артефакт

Подготовить краткий pilot monitoring update / first signal report:

1. active organizers/programs
2. guardrails applied
3. friction collected
4. blockers (if any)
5. operator pain points
6. next recommendation

Можно переходить к ограниченному pilot launch в режиме GO WITH GUARDRAILS.
