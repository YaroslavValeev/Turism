# Telegram Platform — запуск и эксплуатация

## Компоненты

| Сервис | Порт | Назначение |
|--------|------|------------|
| API | 3001 | REST `/public/telegram/platform/*`, миграции, аналитика |
| telegram-bot | 3002 | grammY webhook/polling |
| Web | 3000 | Каталог, PDP (deep-link «На сайте») |

Спецификация: `docs/telegram-system-v3/`, план: `docs/telegram/REPO_AUDIT_AND_IMPLEMENTATION_PLAN.md`.

## Env (канон)

```env
TELEGRAM_BOT_TOKEN=
TELEGRAM_BOT_USERNAME=
TELEGRAM_BOT_API_BASE_URL=https://api.telegram.org/bot<TOKEN>
TELEGRAM_WEBHOOK_SECRET=

TELEGRAM_ALERT_CHAT_ID=-1003491522243
TELEGRAM_CHANNEL_CHAT_ID=-1003491522243
TELEGRAM_PLATFORM_OPS_IDS=510686579

TELEGRAM_USE_POLLING=0
LEGAL_CONSENT_POLICY_VERSION=telegram-v1
TRAVELER_KEY_SALT=

PUBLIC_API_BASE_URL=https://<project-api-domain>
PUBLIC_WEB_BASE_URL=https://<project-web-domain>

# RU VPS only: внешний egress через EU SOCKS5
OPENAI_HTTP_PROXY=socks5://<PROXY_USER>:<PROXY_PASSWORD>@<EU_PROXY_HOST>:1080
# По умолчанию выключено; включать только если Bot API напрямую не проходит
TELEGRAM_BOT_HTTP_PROXY=
```

`510686579` — только OPS allowlist (личный user ID).  
`-1003491522243` — канал/группа для алертов и публикаций.
Legacy `TELEGRAM_BOT_API_BASE_URL` содержит bot token в URL и считается secret-equivalent:
не печатать, не логировать и не включать в sanitized evidence. Следующий безопасный refactor —
перейти на `TELEGRAM_API_BASE_URL=https://api.telegram.org` + `TELEGRAM_BOT_TOKEN`.

Канал: `TELEGRAM_UPDATES_CHANNEL_CHAT_ID=-1003491522243` — см. `docs/reference/TELEGRAM_MYWAVETOUR.md`.

## EU SOCKS5 proxy для RU VPS

Tourism сейчас не использует Telethon/MTProto. Значит `PROXY_ENABLED` / `PROXY_HOST` / `PROXY_PORT` из Parser News сюда не переносим.

Обязательный proxy для RU VPS: `OPENAI_HTTP_PROXY`. Через него идут:

- AI Pilot JSON calls (`/ai-pilot/*`);
- organizer outreach AI draft (`/organizer-outreach/campaigns/:id/ai-suggest-body`);
- OpenAI audio transcription для Telegram content-pipeline voice rewrite.

Telegram Bot API (`api.telegram.org`) по умолчанию остаётся прямым. Если на конкретном сервере Bot API тоже начинает падать по сети, включить только:

```env
TELEGRAM_BOT_HTTP_PROXY=socks5://<PROXY_USER>:<PROXY_PASSWORD>@<EU_PROXY_HOST>:1080
```

Важно:

- не указывать реальные proxy password в git, issue, PR или логах;
- использовать отдельного proxy user проекта;
- whitelist на EU firewall должен содержать внешний IP RU VPS;
- `TELEGRAM_BOT_API_BASE_URL` остаётся `https://api.telegram.org/bot<TOKEN>`;
- webhook URL остаётся `${PUBLIC_API_BASE_URL}/public/telegram/webhook`, proxy URL для webhook не используется.

Проверка с RU VPS:

```bash
printenv OPENAI_HTTP_PROXY >/dev/null && echo "OPENAI_HTTP_PROXY=set"
pnpm --filter api build
pnpm --filter api exec tsx scripts/smoke-ai-pilot.ts
```

`scripts/smoke-ai-pilot.ts` не печатает `OPENAI_HTTP_PROXY` целиком. Если нет `OPENAI_API_KEY`,
`OPENAI_HTTP_PROXY` или `AI_ENABLED=1`, он завершится `missing_env` до smoke-запросов.

Если включён `TELEGRAM_BOT_HTTP_PROXY`, дополнительно:

```bash
pnpm run check:telegram-alerts
pnpm smoke:telegram-platform
```

## Локальный старт

Для локального запуска допускаются:

```env
PUBLIC_API_BASE_URL=http://localhost:3001
PUBLIC_WEB_BASE_URL=http://localhost:3000
```

```bash
pnpm local:bootstrap
pnpm db:migrate
pnpm db:seed
pnpm dev:api
pnpm --filter @mywave/telegram-bot dev
```

Polling (dev): `TELEGRAM_USE_POLLING=1` в env бота.

Production webhook (единый ingress в API):

Webhook URL = **`${PUBLIC_API_BASE_URL}/public/telegram/webhook`** (напр. `https://api.mywavetour.ru/public/telegram/webhook`).  
`TELEGRAM_BOT_API_BASE_URL` — это только `https://api.telegram.org/bot<TOKEN>` для `sendMessage`.

```bash
curl -s -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook" \
  -d "url=https://api.mywavetour.ru/public/telegram/webhook" \
  -d "secret_token=<TELEGRAM_WEBHOOK_SECRET>" \
  -d 'allowed_updates=["message","callback_query","channel_post","edited_channel_post","my_chat_member"]' \
  -d "drop_pending_updates=false"
```

## Проверка webhook (без вывода токена)

```bash
curl -s "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/getMe"
curl -s "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/getWebhookInfo"
```

## SQL / Prisma: реальные данные перед e2e

Опубликованные программы (Prisma: `publishStatus`):

```sql
SELECT id, title, "publishStatus", "organizerId", "sourceUrl", "updatedAt"
FROM programs
WHERE "publishStatus" = 'published'
ORDER BY "updatedAt" DESC
LIMIT 10;
```

Контакты организаторов:

```sql
SELECT id, "organizerId", "channelType", "telegramChatId", "telegramUsername", "isPrimary", "isVerified"
FROM organizer_contact_channels
ORDER BY "createdAt" DESC;
```

Программы без telegram contact:

```sql
SELECT p.id AS program_id, p.title, p."organizerId", occ."telegramChatId"
FROM programs p
LEFT JOIN organizer_contact_channels occ
  ON occ."organizerId" = p."organizerId" AND occ."channelType" = 'telegram'
WHERE p."publishStatus" = 'published'
ORDER BY p."updatedAt" DESC
LIMIT 20;
```

## Real e2e (без синтетики)

```bash
pnpm dev:api
pnpm e2e:telegram-platform-real
```

Скрипт берёт реальную `published` program с `sourceUrl` и организатором не из demo/e2e списка.
Он не создаёт заявку на synthetic traveler data. Перед запуском нужны реальные значения:

```env
TELEGRAM_E2E_REAL_CONFIRM=1
TELEGRAM_E2E_REAL_USER_ID=<real traveler Telegram user id>
TELEGRAM_E2E_REAL_CHAT_ID=<real private chat id with bot>
TELEGRAM_E2E_REAL_FIRST_NAME=<real Telegram first name>
TELEGRAM_E2E_REAL_USERNAME=<optional real username without @>
TELEGRAM_E2E_REAL_GUEST_NAME=<real traveler name>
TELEGRAM_E2E_REAL_PHONE=<real traveler phone>
TELEGRAM_E2E_REAL_COMMENT=<optional real comment>
```

Если этих env нет, e2e завершится `missing_env` и не создаст lead/booking. Если реальной `published`
program с реальным organizer нет, e2e завершится `missing_real_data`.

Запрещено подставлять bot ID, OPS user ID, channel ID, fake/test chat ID или вымышленные контакты.
Если у organizer нет `telegramChatId`, ожидаемый путь:

```text
status=organizer_telegram_channel_missing
reason=missing_real_data
route_to=OPS
```

## Организатор: contact channel

Перед уведомлением организатора добавьте в БД:

```sql
INSERT INTO organizer_contact_channels (id, "organizerId", "channelType", "telegramChatId", "isPrimary", "isVerified", "createdAt", "updatedAt")
VALUES (gen_random_uuid()::text, '<organizer_id>', 'telegram', '<chat_id>', true, true, now(), now());
```

`<chat_id>` должен быть реальным контактом организатора. Не использовать bot ID, OPS user ID,
channel ID, fake chat ID или test chat ID. При отсутствии контакта заявка маршрутизируется в OPS.

## Action log / event log

Callback-действия пишутся в:

```sql
SELECT "leadToken", "actorType", "actorId", action, "statusFrom", "statusTo", "createdAt"
FROM telegram_platform_action_logs
ORDER BY "createdAt" DESC
LIMIT 20;

SELECT "eventName", "leadToken", "organizerId", "createdAt"
FROM telegram_event_log
ORDER BY "createdAt" DESC
LIMIT 20;
```

## Smoke

```bash
node scripts/smoke_telegram_platform.mjs
```

## Internal cron (без Redis)

```bash
curl -X POST http://localhost:3001/internal/telegram/platform/abandoned/run -H "x-internal-token: $INTERNAL_ANALYTICS_TOKEN"
curl -X POST http://localhost:3001/internal/telegram/platform/reconciliation/run -H "x-internal-token: $INTERNAL_ANALYTICS_TOKEN"
```

## Deep-link в канале

`https://t.me/<bot_username>?start=program_<program_id>`

Payload валидируется на API (`POST /public/telegram/platform/deeplink/validate`).

## Gitleaks

Docker-вариант, если локальный `gitleaks` или `go install` недоступны:

```bash
docker run --rm -v "$PWD:/repo" ghcr.io/gitleaks/gitleaks:latest git \
  -v --redact=100 \
  --report-format=json \
  --report-path=/repo/gitleaks-git-report.json \
  /repo

docker run --rm -v "$PWD:/repo" ghcr.io/gitleaks/gitleaks:latest dir \
  -v --redact=100 \
  --report-format=json \
  --report-path=/repo/gitleaks-dir-report.json \
  /repo
```

В отчёте не показывать секреты, Telegram token, `OPENAI_HTTP_PROXY` целиком, `PROXY_PASS`
или proxy password. Публиковать только `file`, `line`, `rule_id`, `commit_short`,
`status` (`false_positive` / `removed` / `rotated` / `needs_action`).
