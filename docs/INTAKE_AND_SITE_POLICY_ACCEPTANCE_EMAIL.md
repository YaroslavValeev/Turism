# INTAKE_AND_SITE_POLICY_ACCEPTANCE_EMAIL.md

**Тема:** Intake policy and Wakesurf-first IA accepted — move to limited pilot monitoring

Привет.

Пакет по intake channels и Wakesurf-first site presentation принят.

## Что принято

### 1. Intake model

Принято разделение на два слоя:

#### A. Discovery / scouting

- Telegram parsing
- RSS parsing
- website scraping
- social/manual scouting
- partner referrals

Эти источники только находят кандидатов и не публикуют программы автоматически.

#### B. Canonical publish intake

- organizer form on site
- admin manual entry
- email to admin
- Telegram intake
- CSV / Google Sheets import (trusted only)

Программа проходит:

`source_signal` → `intake_queue` → `organizer_match_or_create` → `draft` → `publish_gate` → `verification/trust` → `published`

### 2. Program intake source

Принято поле `Program.intakeSource` как операторский слой аналитики.

Оно должно быть:

- видно в админке
- не обязательно видно в публичной карточке

### 3. Site presentation policy

Принято Wakesurf-first позиционирование:

- `Wakesurf-first`
- `Krasnodar / Dubai / Bodrum`
- terminology: programs / camps / trips
- assisted booking
- trust + safety + usability first

## Что остаётся в пилоте

Используем только:

1. organizer form
2. admin manual entry
3. email intake
4. Telegram intake
5. Sheets / CSV import for trusted partners

## Что пока не используем как publish channels

- Telegram parsing
- RSS parsing
- website scraping

Они остаются discovery-only.

## Что делать дальше

Не открывать новый product checkpoint.

Переходим к pilot monitoring phase:

1. keep pilot narrow
2. keep pilot visible data clean
3. log friction
4. prepare first signal report

## Product/UI notes from current live admin state

1. keep operator UI language unified (prefer Russian)
2. keep non-pilot data hidden/archived
3. keep intake source visible in admin
4. do not expose intake source publicly for now
5. do not expand pilot beyond Wakesurf-first

## Следующий ожидаемый артефакт

Подготовить:

- `FIRST_SIGNAL_REPORT.md`

Содержимое:

1. active organizers/programs
2. guardrails applied
3. friction collected
4. blockers (if any)
5. operator pain points
6. next recommendation

## Что не делать

- не добавлять auto-publish from Telegram/RSS
- не расширять pilot beyond Wakesurf-first
- не открывать public payment
- не строить broad travel landing before Wakesurf-first IA is proven in pilot
- не смешивать discovery sources with publish sources
- не уходить в новый redesign sprint

Канон документов intake/IA: [INGESTION_POLICY.md](INGESTION_POLICY.md), [SITE_IA_WAKESURF_FIRST.md](SITE_IA_WAKESURF_FIRST.md), [SOURCE_AND_PRESENTATION_POLICY_EMAIL.md](SOURCE_AND_PRESENTATION_POLICY_EMAIL.md). Мониторинг пилота: [../PILOT_MONITORING_PLAN.md](../PILOT_MONITORING_PLAN.md).
