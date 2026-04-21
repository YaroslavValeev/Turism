# Founder OS Kit — MyWave Travel

Набор шаблонов для операционного запуска платформы спортивно-тренировочных выездов.

## Стартовый фокус
- **Pilot wedge:** Wakesurf-first
- **Anchor locations:** Krasnodar, Dubai, Bodrum
- **Конфиг:** [startup_config.md](startup_config.md)

## Состав
- startup_config.md — pilot wedge, anchor locations, owners
- weekly_founder_dashboard.csv — еженедельный дашборд основателя
- organizer_pipeline.csv — CRM пайплайн первых организаторов
- organizer_scoring_sheet.csv — скоринг организаторов
- first_100_bookings_plan.md — план достижения первых 100 бронирований
- outreach_pack.md — шаблоны outreach-сообщений
- operating_rhythm.md — weekly operating rhythm
- ninety_day_execution_board.csv — доска исполнения на 90 дней
- release_gate_checklist.md — релизная дисциплина
- verification_framework.md — уровни verified organizers
- decision_log.csv — журнал ключевых решений
- complaints_incidents_log.csv — лог жалоб и инцидентов
- program_card_definition.md — каноническая структура карточки программы

## Как использовать
1. Открой [startup_config.md](startup_config.md) — pilot wedge и anchor locations зафиксированы.
2. Залей CSV в Google Sheets / Excel / Notion.
3. Заполни organizer_pipeline.csv по первым 30 кандидатам.
4. Пропусти каждого через organizer_scoring_sheet.csv.
5. Используй weekly_founder_dashboard.csv как основной еженедельный контур управления.

## Архитектурная опора (обновлено)
- Главный навигатор: [`docs/PROJECT_SOURCEBOOK.md`](docs/PROJECT_SOURCEBOOK.md)
- Закрытие разработческого этапа Stage 4.1 (status backbone, ADR-007/008, guard, platform mode, UI/API, QA): см. раздел «Версия» в sourcebook и конец [`docs/migration/STAGE4_1_START_EXECUTION_REPORT.md`](docs/migration/STAGE4_1_START_EXECUTION_REPORT.md) (раздел «Закрытие разработческого этапа»); далее — эксплуатация и доказательство ценности данными, без включения commission strict-mode до отдельного решения.
- Stage-0 execution pack: [`docs/migration/EXECUTION_START_PACK.md`](docs/migration/EXECUTION_START_PACK.md)
- DoD для запуска реализации: [`docs/migration/STAGE_DOD_1_3.md`](docs/migration/STAGE_DOD_1_3.md)
- Legacy migration policy: [`docs/migration/LEGACY_CONTENT_MIGRATION_POLICY.md`](docs/migration/LEGACY_CONTENT_MIGRATION_POLICY.md)
- Терминология lead/booking: [`docs/decisions/ADR-005-lead-vs-booking.md`](docs/decisions/ADR-005-lead-vs-booking.md)
- Idempotency для delivery/sync: [`docs/architecture/IDEMPOTENCY_DELIVERY_AND_SYNC.md`](docs/architecture/IDEMPOTENCY_DELIVERY_AND_SYNC.md)
