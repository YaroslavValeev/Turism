# Уведомления: старты и смена дат (MVP, trust-safe beta)

## Принцип

- Триггеры только для программ в статусе **`published`**.
- Источник дат — **`startDate` / `endDate`**; `durationDays` в событиях не используется.
- Отправка не из обработчика PATCH напрямую: в очередь пишется **job** (`notification_jobs`), доставку делает **poller** или отдельный процесс `pnpm --filter api notifications:worker`.

## События (типы job)

| `eventType` | Когда ставится в очередь |
|-------------|---------------------------|
| `program_dates_updated` | После успешного `PATCH /programs/:id`, если программа была **уже опубликована** и изменились `startDate` и/или `endDate`. |
| `program_upcoming_start` | Ежедневный планировщик (локальный час `NOTIFICATIONS_DAILY_HOUR_LOCAL`): все **published** со стартом в **UTC-календарный день = сегодня (UTC) + N дней**, `N` = `NOTIFICATIONS_UPCOMING_LEAD_DAYS` (по умолчанию 14). |

Payload см. в `enqueueProgramJobs.ts` (ISO-строки для дат).

### Анти-flip по датам

Если за последние `NOTIFICATIONS_ANTI_FLIP_WINDOW_HOURS` часов уже был job `program_dates_updated` с переходом «новые даты → старые», а текущий патч возвращает даты к тем, что были до этого перехода, **новый job не создаётся** (шум подавляется; в лог пишется debug `[notifications] suppressed date flip noise`).

## Очередь и доставки

- Таблица **`notification_jobs`**: `dedupeKey` **UNIQUE** — повторная постановка того же события не создаёт вторую запись.
- Поле **`resultCode`** на job: итог обработки (`delivered`, `no_recipients`, `skipped_not_published`, `stale_start_date_skipped`, `failed` и т.д.). Подавление «flip» делается **до** создания job — отдельной строки job с кодом `suppressed_flip` нет.
- Таблица **`notification_deliveries`**: одна строка на попытку доставки подписчику; поле **`outcome`**: `delivered`, `skipped_rate_limited`, `skipped_duplicate`, `unsubscribed`, `pending_confirmation`, `failed`.
- Обработка: `processNotificationsBatch` → для каждого подписчика запись в **`notification_deliveries`** (учёт rate limit и актуального `status` подписки).

## Feedback (реакция на письмо)

- Таблица **`notification_feedback`**: одна запись на **`deliveryId`** (`positive` | `negative`), связь с **`notification_deliveries`**.
- В письмах о программе (не в письме подтверждения подписки): ссылка на каталог + две подписанные ссылки «Это было полезно» / «Не интересно» (JWT с `jobId`, `subscriptionId`, `programId`, `eventType`, `dedupeKey`, типом реакции).
- **`GET /public/notification-feedback?token=...`** — one-click из почты, ответ HTML «спасибо».
- **`POST /public/notification-feedback`** — тело `{ "token": "...", "feedback": "positive"|"negative" }` (оба поля обязательны); `feedback` должен совпадать с типом, зашитым в JWT (для «полезно» / «не интересно» в письме — разные токены).
- Правило MVP: **два отрицательных ответа подряд** по одной подписке (по времени `created_at`) → подписка переводится в **`unsubscribed`**.
- Агрегаты: блок **`feedback`** в **`GET /admin/notifications/overview`** (счётчики и `by_event_type` с долей positive).

## Подписки: статусы и уникальность

- Статусы: **`pending_confirmation`** | **`active`** | **`unsubscribed`**.
- Уникальность: поле **`identityKey`** (канал + получатель + `type` + нормализованный JSON `filters`). Повторная заявка **не создаёт дубликат** — обновляется та же строка (реактивация / повторное письмо подтверждения).

### Double opt-in (email)

1. `POST /public/notification-subscriptions` с `consent: true` создаёт или обновляет запись в **`pending_confirmation`** (кроме явного обхода, см. ниже).
2. На почту уходит письмо со ссылкой **`GET /public/notification-subscriptions/confirm?t=...`** и футером с **отпиской**.
3. После перехода по ссылке подписка становится **`active`**.

**Staging / dev:** `NOTIFICATIONS_EMAIL_CONFIRM_BYPASS=1` — новая email-подписка может сразу создаваться как `active` (в production держать выключенным).

### Отписка (email)

В каждом исходящем письме (включая письмо подтверждения) внизу ссылка:

**`GET /public/notification-unsubscribe?token=<JWT>`**

JWT подписан секретом `NOTIFICATIONS_TOKEN_SECRET` или `JWT_SECRET`, в payload — id подписки. После успеха статус **`unsubscribed`**.

### Telegram: деактивация

**`POST /public/notification-subscriptions/telegram-deactivate`** с телом `{ "token": "<JWT отписки>" }` — тот же формат токена, что и для email (идентифицирует подписку). Подробнее: `docs/qa/NOTIFICATIONS_OPS_RUNBOOK.md`.

## Публичный API

- **`POST /public/notification-subscriptions`** — тело: `consent: true`, `channel` (`email` | `telegram`), `type` (`seasonal` | `program_updates`), `contactEmail` или `telegramChatId`, `filters` (объект).
- Ответ: `subscriptionStatus`, `result` (`created_pending`, `already_active`, …), человекочитаемое `message`.

## Каналы

- **Email**: HTTP **Resend** (`https://api.resend.com/emails`), ключ `EMAIL_PROVIDER_KEY`, поле From — `NOTIFICATIONS_EMAIL_FROM`.
- **Telegram**: `TELEGRAM_BOT_API_BASE_URL` + `telegramChatId` из подписки (`sendMessage`).

## Анти-спам

- **Дедуп событий**: уникальный `dedupeKey` на job.
- **Rate limit**: не более **`NOTIFICATIONS_RATE_LIMIT_PER_DAY`** успешных доставок (`outcome = delivered`) на **получателя** за **UTC-сутки**.
- **Анти-flip**: см. выше.

## Переменные окружения (дополнительно к базовым)

| Переменная | Назначение |
|------------|------------|
| `NOTIFICATIONS_LINK_BASE_URL` | База для ссылок в письмах (подтверждение, отписка). По умолчанию `http://localhost:3001`. |
| `NOTIFICATIONS_EMAIL_CONFIRM_BYPASS` | Пропуск double opt-in для email (только dev/staging). |
| `NOTIFICATIONS_ANTI_FLIP_WINDOW_HOURS` | Окно анти-flip (часы), по умолчанию 48. |
| `NOTIFICATIONS_TOKEN_SECRET` | Опционально: отдельный секрет для JWT отписки. |
| `NOTIFICATIONS_SITE_BASE_URL` | База URL сайта для ссылки «к программе» в письмах (по умолчанию `http://localhost:3000`). |

## Включение

1. Миграции уведомлений (в т.ч. `notifications_trust_beta`).
2. `NOTIFICATIONS_ENABLED=1`.
3. Для poller в API: `NOTIFICATIONS_POLL_MS=30000` (или `0` + отдельный worker).
4. Для «за N дней»: `NOTIFICATIONS_SCHEDULER_ENABLED=1`, `NOTIFICATIONS_UPCOMING_LEAD_DAYS=14`.

## Ops

См. **`docs/qa/NOTIFICATIONS_OPS_RUNBOOK.md`** (`GET /admin/notifications/overview`, SQL).

## UI

- Главная (`/#programs`): блок **«Уведомления по каталогу»** — подписка на дисциплину из активного фильтра (и опционально «изменения дат»); после отправки показывается сообщение из API (в т.ч. про письмо подтверждения).
