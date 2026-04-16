# Clock sync — pilot wedge Wakesurf-first (Owner)

**Тема:** Clock sync updated — pilot wedge is now Wakesurf-first, align docs and continue pilot hardening

---

## Что строим

Training-first platform / marketplace для русскоязычной аудитории: пользователь выбирает тренировочную программу с понятными discipline, level, organizer, risk/safety, booking path, trust signals, post-booking operations. Не классическое турагентство и не generic travel aggregator.

## Где проект сейчас

Sprint 2 / pilot operations hardening. Уже собраны: organizer / program / booking / review / incident / commission foundation, publish gate, assisted booking, admin queues, trust/revenue foundation, smoke/e2e/observability basis.

## Обновлённая pilot-конфигурация (Owner-level truth)

**Pilot wedge = Wakesurf-first**

- **Anchor locations:** Krasnodar, Dubai, Bodrum
- **Next catalog lines:** SUP, MTB (не в первом пилоте)
- **Product logic:** русскоязычная аудитория + российские организаторы + программы в России и за рубежом

## Что синхронизировать

startup_config.md; pilot-related docs/checklists/runbooks; все frozen config references (Alps / Alpine skiing → Wakesurf-first); pilot framing в отчётах Checkpoint 3.

## Что не меняем

Доменные сущности, статусные модели, trust/revenue foundation, assisted booking logic, out-of-scope ограничения. Не добавлять новые сущности, public payment, self-serve, public review layer, public auth expansion.

## Технический хвост

Подтвердить применение migration `20250317100000_commission_booking_unique` в рабочем контуре — после этого пакет Checkpoint 3 можно повторно отправлять на финальную приёмку GM.

Дальше работаем от **Wakesurf-first** pilot configuration.
