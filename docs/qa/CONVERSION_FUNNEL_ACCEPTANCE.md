# Conversion funnel — приёмка, rollout и QA-пакет

Документ фиксирует аудит, матрицу флагов, безопасность доставки, сценарии QA и шаблон итогового отчёта. Код: `services/api/src/modules/conversion-funnel/`.

---

## A. Краткий audit (состояние на момент фиксации)

| Тема | Факт |
|------|------|
| **Флаги** | См. §4 матрицу; источник правды — `packages/config/src/env.ts`. |
| **Этапы 0–5** | Логика в `rules.ts` + `rolloutPolicy.ts` (`CONVERSION_ALLOWED_MAX_STAGE`, `CONVERSION_ENABLE_STAGE4/5`). По умолчанию автоматика до **этапа 2** (`CONVERSION_ALLOWED_MAX_STAGE=2`). Этапы 4–5 выключены флагами. |
| **Тексты** | `messages.ts`; для Telegram и email одна смысловая копия: TG — plain из `buildPlainTextForStage`, email — HTML из того же текста. In-app — блок «Твой прогресс» на `/organizers/analytics` (данные с `conversion-progress`). |
| **Каналы** | `deliver.ts`: при наличии `telegramChatId` — сначала Telegram, иначе или при ошибке — email (одна попытка доставки на вызов, без двойной отправки в оба канала при успехе). |
| **Rate limit** | Не более одного **успешного** conversion-сообщения на организатора за `CONVERSION_ORGANIZER_MIN_INTERVAL_HOURS` (по умолчанию 48 ч), все программы: `organizerCooldown.ts`. |
| **Источник правды** | `program_conversion_states` — этапы и тайминги; `program_conversion_deliveries` — `dedupeKey`, `outcome`, `channel`, `sentAt`. Метрики — события `analytics_events` + `leads` + `bookings` (см. `metrics.ts`). |
| **Дубли / спам** | Уникальный `dedupeKey` на этап/программу; cooldown по организатору; один исходящий сценарий за вызов `processOneProgramConversion` (одно из: follow-up ИЛИ один этап). Scheduler обходит до 200 программ за тик — у одного организатора второе сообщение подряд подавляется cooldown. |
| **Follow-up vs этап 3** | При включённом `CONVERSION_ENABLE_FOLLOWUP` этап 3 не отправляется, пока не отправлен follow-up после этапа 2 (`rules.shouldSendStage3`). |
| **Launch Mode** | `PLATFORM_MODE=launch`: тексты этапов 4–5 смягчены (нет обещания выставления комиссии как текущего процесса). |

**Риски перед включением:** отсутствие `EMAIL_PROVIDER_KEY` / Telegram → сообщения падают в `failed:*` в deliveries; нет silent success — смотреть `conversion-funnel-stats` и таблицу deliveries; при `CONVERSION_ALLOWED_MAX_STAGE` выше плана — лишние этапы; при слишком низком cooldown — риск восприятия как спама.

---

## B. Rollout design (рекомендуемая последовательность)

1. **Техпроверка:** `CONVERSION_FUNNEL_ENABLED=1`, `CONVERSION_FUNNEL_SCHEDULER_ENABLED=0` — ручной `POST /jobs/run-conversion-funnel`.
2. **Внутренний пилот:** 1–3 организатора, `CONVERSION_ALLOWED_MAX_STAGE=2`, `CONVERSION_ENABLE_STAGE4=0`, `CONVERSION_ENABLE_STAGE5=0`; при необходимости `CONVERSION_ENABLE_FOLLOWUP=0` на первый день.
3. **Scheduler низкой интенсивности:** `CONVERSION_FUNNEL_SCHEDULER_ENABLED=1`, интервал ≥ 15 мин (`CONVERSION_FUNNEL_INTERVAL_MS`), ежедневный просмотр stats.
4. **Расширение:** больше организаторов; этапы 3+ только после стабильности и решения владельца.
5. **Этапы 4–5:** только после данных и явного `CONVERSION_ENABLE_STAGE4/5` + при необходимости `CONVERSION_ALLOWED_MAX_STAGE=5`.

**Rollback:** выставить `CONVERSION_FUNNEL_ENABLED=0` или `CONVERSION_FUNNEL_SCHEDULER_ENABLED=0`; состояние в БД сохраняется, повторного спама при выключении нет.

---

## C. Message catalog (владелец текста)

| Этап | Назначение | Файл |
|------|------------|------|
| 0 | Публикация в каталоге | `messages.ts` case 0 |
| 1 | Первые просмотры/клики | case 1 |
| 2 | Первые лиды | case 2 |
| 3 | Стабильные метрики + рост (опционально WoW) | case 3 |
| 4 | Обсуждение модели (launch vs monetization ветки) | case 4 |
| 5 | Результаты и следующий шаг | case 5 |
| follow-up | Напоминание после этапа 2 | `buildFollowUpPlain` |

**Copy review:** продукт-владелец сверяет tone of voice; инженерный критерий — отсутствие противоречий с блоком Launch на `/organizers/analytics`.

---

## D. Delivery safety (чеклист)

- [x] Не более одного сообщения на программу за один проход `processOneProgramConversion`.
- [x] Cooldown 48 ч на организатора (настраивается).
- [x] `dedupeKey` предотвращает повторную успешную доставку того же этапа; retry не дублирует успех.
- [x] Telegram ошибка → fallback на email в том же вызове (одна запись delivery).
- [x] Отписка: `serviceCommsOptIn` + публичный маршрут отписки (см. `publicRoutes.ts`).
- [x] События: `value_threshold_reached`, `organizer_conversion_stage_sent`, `organizer_conversion_followup_sent` при `ANALYTICS_ENABLED`.

---

## E. UI

- Блок «Твой прогресс»: программа, метрики с публикации, чеклист, rollout-флаги, `platformMode` / `launchMode`.
- Объяснение метрик: подсказка по clicks/views на той же странице в общей аналитике.

---

## F. Матрица feature flags

| Переменная | Default (код) | Безопасное значение старта | Rollout | Production recommendation |
|------------|---------------|----------------------------|---------|---------------------------|
| `CONVERSION_FUNNEL_ENABLED` | `false` | `0` до готовности | `1` после QA | `1` когда команда готова к сообщениям |
| `CONVERSION_FUNNEL_SCHEDULER_ENABLED` | `false` | `0` | `1` после ручного периода | `1` в проде с мониторингом |
| `CONVERSION_FUNNEL_INTERVAL_MS` | `900000` | `≥900000` | по нагрузке | 15–60 мин |
| `CONVERSION_ALLOWED_MAX_STAGE` | `2` | `2` | `3`… по решению | по продуктовому плану |
| `CONVERSION_ENABLE_STAGE4` | `false` | `false` | `true` осознанно | только после пилота |
| `CONVERSION_ENABLE_STAGE5` | `false` | `false` | `true` осознанно | только после пилота |
| `CONVERSION_ENABLE_FOLLOWUP` | `true` | `false` на 1-й день опционально | `true` | `true` если нужен мягкий ping |
| `CONVERSION_ORGANIZER_MIN_INTERVAL_HOURS` | `48` | `48` | `24` только если ок по тону | `48` для старта |
| `PLATFORM_MODE` | `launch` | `launch` | `launch` до договорённости | `launch` / `monetization` по ADR |
| `NOTIFICATIONS_LINK_BASE_URL` / `NOTIFICATIONS_SITE_BASE_URL` | — | задать для отписки в email | как в проде | публичный URL web/API для ссылок |
| `EMAIL_PROVIDER_KEY`, `NOTIFICATIONS_EMAIL_FROM` | — | нужны для email | обязательны для fallback | обязательны если нет только TG |
| `TELEGRAM_BOT_API_BASE_URL` | — | для TG-доставки | как в проде | если используете TG |

---

## G. Обязательные сценарии QA (галочки)

**Базовые (1–5):** публикация → stage 0; пороги 1–2 → по одному сообщению; progress API = UI.

**Delivery (6–10):** TG / email / ошибка TG → email; retry без дубликата успеха; отписка.

**Anti-spam (11–14):** один тик — одно сообщение на программу; несколько программ — cooldown; follow-up не раньше этапа 2; этап 3 после follow-up если follow-up включён; 4/5 не уходят без флагов.

**Launch (15–18):** тексты launch не обещают счёт; analytics platform mode; billing не из этого блока — смок отдельно.

**Regression (19–22):** overview analytics, billing page, scheduler off/on.

Маршруты и curl: `docs/qa/BROWSER_CHECK_ROUTES.md`, `docs/qa/CONVERSION_FUNNEL_ROLLOUT.md`.

---

## H. Тестовые контуры (шаблон, без реальных PII)

Подготовьте **2–3 тестовых организатора** в БД с разными комбинациями:

| # | Назначение | `contactEmail` | `telegramChatId` |
|---|------------|----------------|------------------|
| A | Только email | `qa.conv.a@your-test.domain` | пусто |
| B | Telegram | рабочий тестовый email | тестовый chat id из @BotFather |
| C | Две программы | тот же email что у B | тот же chat id |

**Telegram контур:** dev-бот, `TELEGRAM_BOT_API_BASE_URL` указывает на `https://api.telegram.org/bot<token>` (внутренний секрет, не в репозитории).

**Email контур:** Resend test / sandbox inbox.

**Ручной demo-сценарий (этапы 1–3):**

1. Опубликовать программу для org A → ручной `run-conversion-funnel` → проверить stage 0 в deliveries и почту.
2. Накидать события analytics / лиды до порога stage 1 → тик → одно письмо, нет дубля stage 0.
3. Довести до stage 2 → тик → сообщение этапа 2; дождаться окна follow-up или отключить follow-up и накрутить метрики для stage 3 → убедиться в порядке «сначала follow-up (если вкл.), потом этап 3».

---

## I. Шаблон итогового отчёта (для владельца)

1. Что проверено  
2. Что изменено в коде/конфиге  
3. Что включено в rollout и на какой среде  
4. Какие env/flags  
5. Какие сценарии QA пройдены (номера)  
6. Найденные проблемы  
7. Ограничения и долги  
8. Рекомендация следующего шага  
9. **Вердикт:** можно считать funnel production-ready — да/нет и условия  

---

## J. Вердикт по готовности к production

Считать **production-ready** можно, если одновременно: CI зелёный; пилот пройден без стабильных `failed:*` без объяснения; нет жалоб на спам; мониторинг `conversion-funnel-stats` подключён; тексты launch согласованы; этапы 4–5 не включены без отдельного решения.
