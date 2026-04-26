# Ingestion policy — MyWave Travel

Канон для разделения **обнаружения программы** и **публикации программы**. Согласовано с пилотом: [startup_config.md](../startup_config.md), [SOURCE_AND_PRESENTATION_POLICY_EMAIL.md](SOURCE_AND_PRESENTATION_POLICY_EMAIL.md). Guardrails запуска: [docs/PILOT_LAUNCH_EXECUTION_EMAIL.md](PILOT_LAUNCH_EXECUTION_EMAIL.md).

## 1. Два слоя

### 1.1 Discovery / scouting

Система **узнаёт**, что где-то есть кандидат в каталог. Это **не публикация**.

Примеры механик (пилот — не обязательно реализованы в продукте):

- парсинг Telegram-каналов
- RSS
- scraping сайтов
- ручной мониторинг соцсетей
- рекомендации / партнёры
- входящие в intake-чат

Результат слоя: **candidate / source lead / draft intake** во внутренней очереди — без автоматического `published`.

### 1.2 Canonical publish intake

Сигнал превращается в **нормализованную программу** в каталоге после прохождения pipeline.

Пилотные каналы (приоритет):

1. Форма организатора на сайте
2. Создание программы оператором в админке
3. Письмо администратору → ручная нормализация
4. Telegram / мессенджер → intake оператору (не автопубликация)
5. Импорт CSV / Google Sheets — **только для trusted / pilot partners**

## 2. Pipeline (канон)

Упрощённо:

`source_signal` → `intake_queue` → `organizer_match_or_create` → `program_draft` → `publish_gate` → `verification_trust` (по политике) → `published`

**Правило:** ни Telegram parsing, ни RSS, ни scraping **не** ставят статус «опубликовано» без человека/гейта.

## 3. Поле `Program.intakeSource` (коды в БД)

В API хранится строковый код источника **канонического intake** (не discovery). Allowlist в коде: `@mywave/shared-types` (`PROGRAM_INTAKE_SOURCES`).

| Код | Смысл |
|-----|--------|
| `organizer_form` | Организатор заполнил на сайте |
| `admin_manual` | Создано/нормализовано оператором в админке |
| `email` | Входящий email → обработка → черновик/публикация |
| `telegram` | Intake через Telegram/оператора |
| `sheets_csv` | Импорт из Sheets/CSV (trusted) |
| `seed` | Тестовые/сид-данные (dev) |

Значение может быть пустым для старых записей до backfill.

Публичная карточка программы **не обязана** показывать источник; в пилоте источник — для **операторской аналитики и чистки каналов**.

## 4. Заявки: `Booking.sourceChannel`

Отдельная ось: **откуда пришла заявка** (лендинг, страница программы, реферал и т.д.). См. контракт в Prisma (`sourceChannel`, `sourceCampaign`).

Связь с программой:

- `Program.intakeSource` — как программа попала в каталог
- `Booking.sourceChannel` — как гость дошёл до заявки

Обе метрики нужны для оценки supply-каналов и demand-каналов по отдельности.

## 5. Что не делаем в пилоте

- Автопубликация из Telegram/RSS/scraping
- Широкий неразобранный импорт без trusted-политики
- Новые сущности статусов сверх уже принятых в продукте без отдельного gate

## 6. Фазы (напоминание)

**Phase 1 — pilot:** форма организатора, админка, email, Telegram intake, Sheets/CSV для trusted.

**Phase 2 — scouting:** parsing RSS/Telegram/site → только очередь кандидатов.

**Phase 3 — интеграции:** API, webhooks, ICS/partner feeds.

## 7. Тематический фильтр (пилот MyWave Travel)

Согласно [SOURCE_AND_PRESENTATION_POLICY_EMAIL.md](SOURCE_AND_PRESENTATION_POLICY_EMAIL.md) и [SITE_IA_WAKESURF_FIRST.md](SITE_IA_WAKESURF_FIRST.md), витрина про **тренировочные выезды, кэмпы и программы** (discipline + format), а не про generic travel news. В коде нормализации/скоринга кандидаты, похожие на **климатические/статистические посты** без события и с низким `tourismFit`, уходят в `archived`; автопубликация требует сигнала **дисциплины в тексте** и/или **формата программы** (кэмп, выезд, набор, …), а не только дисциплины из профиля канала.

## 8. Canonical keys reference

Детальная каноника по merge-key / idempotency / duplicate behavior / opt-out / gate / batch counters вынесена в отдельный reference: [INGESTION_AUTOPUBLISH_KEYS.md](INGESTION_AUTOPUBLISH_KEYS.md).
