# SOURCE_AND_PRESENTATION_POLICY_EMAIL.md

**Тема:** Define intake channels and Wakesurf-first site presentation policy

Привет.

После сверки по текущему состоянию пилота фиксируем следующие продуктовые решения.

## 1. Intake model

Нужно разделить:

### A. Discovery / scouting sources

Эти источники только находят потенциальные программы, но не публикуют их автоматически:

- Telegram parsing
- RSS parsing
- website scraping
- social/manual scouting
- partner referrals

### B. Canonical publish intake

Эти каналы могут привести программу в нормализованный draft/publish pipeline:

- organizer form on site
- admin manual entry
- email to admin
- Telegram intake
- CSV / Google Sheets import for trusted organizers

### Правило

Ни один scouting-канал не должен публиковать программу напрямую.

Любая программа проходит:

`source` → `intake queue` → `organizer match/create` → `draft` → `publish gate` → `publish`

Подробнее: [INGESTION_POLICY.md](INGESTION_POLICY.md).

## 2. Что используем в пилоте

### Pilot channels

1. organizer form on site
2. admin manual entry
3. email to admin
4. Telegram intake
5. CSV / Google Sheets import (trusted only)

### Later / scouting only

- Telegram parsing
- RSS parsing
- website scraping

### Later / integrations

- API / webhooks / calendar feeds

## 3. Site presentation policy

Сайт презентует не «туры», а:

- программы
- кэмпы
- выезды

### Pilot positioning

- Wakesurf-first
- Krasnodar / Dubai / Bodrum
- operator-assisted flow
- trust + safety + usability first

Структура и блоки: [SITE_IA_WAKESURF_FIRST.md](SITE_IA_WAKESURF_FIRST.md).

## 4. Нужные артефакты

Подготовлены без расширения scope:

1. [INGESTION_POLICY.md](INGESTION_POLICY.md) — source taxonomy, discovery vs publish channels, moderation / publish rules
2. [SITE_IA_WAKESURF_FIRST.md](SITE_IA_WAKESURF_FIRST.md) — landing, catalog, program page, CTA logic, content blocks, usability

Конфиг пилота: [startup_config.md](../startup_config.md). Мониторинг: [PILOT_MONITORING_PLAN.md](../PILOT_MONITORING_PLAN.md).

## 5. Product/UI corrections from current pilot state

1. Поле **источника intake программы** (`intakeSource` в API/админке) — см. INGESTION_POLICY
2. Источник заявки (`booking.sourceChannel`) сохраняется отдельно; модель согласована в INGESTION_POLICY
3. Единый язык операторского UI — предпочтительно русский для заголовков админки
4. Режим пилота виден в каталоге/админке (фокус, бейджи — по мере необходимости)
5. Позиционирование training-first — «программы / кэмпы / выезды», не generic travel

## 6. Что не делать

- не добавлять auto-publish from Telegram/RSS
- не расширять pilot beyond Wakesurf-first
- не открывать public payment
- не строить broad travel landing before Wakesurf-first IA is fixed
- не смешивать scouting sources с publish sources

## Следующий ожидаемый результат

- [INGESTION_POLICY.md](INGESTION_POLICY.md)
- [SITE_IA_WAKESURF_FIRST.md](SITE_IA_WAKESURF_FIRST.md)

Без изменения текущего pilot scope сверх описанного.
