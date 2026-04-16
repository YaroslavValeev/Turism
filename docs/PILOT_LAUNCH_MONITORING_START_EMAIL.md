# PILOT_LAUNCH_MONITORING_START_EMAIL.md

**Тема:** Gate closed — proceed to limited pilot launch in GO WITH GUARDRAILS mode

Привет.

`SPRINT2_CHECKPOINT_5_REPORT.md` принят как финальный gate-документ.

# Финальное решение

## Pilot launch = GO WITH GUARDRAILS

## Что это означает

Можно запускать ограниченный pilot, но только в operator-assisted режиме и только в рамках текущего pilot wedge:

- `Wakesurf-first`
- `Krasnodar`
- `Dubai`
- `Bodrum`

## Обязательные действия перед/во время запуска

### 1. Clean pilot-visible data

Убрать, скрыть или явно пометить непилотные тестовые данные.  
В первую очередь:

- `Горные лыжи / Альпы`

### 2. Keep pilot narrow

Пилот остаётся ограниченным:

- 1–2 organizer flows
- небольшое число pilot programs
- assisted only

### 3. Start Pilot Launch Monitoring Phase

Нужен не новый продуктовый checkpoint, а рабочая фаза мониторинга пилота.

## Что нужно вести во время пилота

### Friction log

Фиксировать минимум 4 типа трения:

- booking friction
- verification friction
- commission friction
- operator UX friction

### Core pilot signals

Отслеживать:

- booking progression by status
- first response speed
- verification completion
- commission reconciliation
- operator confusion points
- any incident/review edge cases

## Что остаётся обязательными guardrails

1. operator follows runbook
2. only pilot-relevant data is visible
3. all friction is logged
4. no public payment
5. no self-serve booking
6. no public reviews
7. no public auth expansion

## Что не делать

- не открывать новый large feature checkpoint
- не расширять pilot в широкий каталог
- не добавлять новые сущности/статусы
- не трогать public/payment layer
- не превращать monitoring phase в redesign sprint

## Следующий ожидаемый артефакт

Подготовьте короткий документ:

# `PILOT_MONITORING_PLAN.md`

Содержимое:

1. pilot scope
2. active organizers/programs
3. guardrails applied
4. metrics to watch
5. friction log format
6. escalation rules
7. next decision point

После этого запускайте ограниченный pilot и собирайте реальные сигналы.
