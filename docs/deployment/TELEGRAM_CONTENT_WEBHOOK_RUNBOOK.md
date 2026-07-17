# Telegram Content Pipeline Webhook Runbook

Полный production-чеклист (миграции, `PUBLIC_*`, smoke, ручные проверки, ротация секретов): [CONTENT_PIPELINE_PROD_ROLLOUT.md](./CONTENT_PIPELINE_PROD_ROLLOUT.md).

## Что нужно до старта

- `TELEGRAM_API_BASE_URL=https://api.telegram.org`
- `TELEGRAM_BOT_TOKEN=<token>` (secret manager / `.env`, не выводить в лог)
- `TELEGRAM_CONTENT_OWNER_CHAT_ID=<chat_id owner>`
- `CONTENT_PIPELINE_TELEGRAM_WEBHOOK_TOKEN=<long-random-secret>`
- (опционально voice) `OPENAI_API_KEY=<...>`

## Endpoint

- `POST /public/telegram/content-pipeline/:token`
- если токен не совпал -> `404`
- если токен не задан -> `503`

## SetWebhook (prod)

1. Сформировать URL:
   - `https://<api-domain>/public/telegram/content-pipeline/<CONTENT_PIPELINE_TELEGRAM_WEBHOOK_TOKEN>`
2. Выполнить:

```bash
set +x
BOT_API="${TELEGRAM_API_BASE_URL%/}/bot${TELEGRAM_BOT_TOKEN}"
curl --fail --silent --show-error -X POST "${BOT_API}/setWebhook" \
  -H "Content-Type: application/json" \
  -d "{\"url\":\"https://<api-domain>/public/telegram/content-pipeline/<token>\"}"
unset BOT_API
```

3. Проверить:

```bash
set +x
BOT_API="${TELEGRAM_API_BASE_URL%/}/bot${TELEGRAM_BOT_TOKEN}"
curl --fail --silent --show-error "${BOT_API}/getWebhookInfo"
unset BOT_API
```

Ожидаемо:
- `url` заполнен
- `last_error_date` пустой/0
- `pending_update_count` не растет бесконечно

## Smoke-check

1. В админке отправить draft owner (`/content-review` -> `Resend`).
2. В Telegram нажать `Publish`.
3. Проверить в API:
   - `content_item.workflowStatus=approved`
   - новая запись в `content_approvals`
   - запись `processed_telegram_callbacks`.

### One-command smoke script

```bash
pnpm --filter api smoke:content-pipeline
```

Скрипт проверяет:
- API `/health`
- `getWebhookInfo`
- обязательные env для Telegram/content pipeline
- наличие `approved + ready` draft
- publish в `telegram_channel` и `site_blog`
- записи в `content_publications`, `blog_posts`, `content_metrics`
- идемпотентность при повторном publish (без дублей)
- JSON-отчёт PASS/FAIL.

## Частые проблемы

- `404` на webhook: неправильный `:token`.
- `503`: не задан `CONTENT_PIPELINE_TELEGRAM_WEBHOOK_TOKEN`.
- callback не обрабатывается: webhook URL старый/битый.
- дубли callback: проверять `processed_telegram_callbacks`.

## Rollback

Отключить webhook:

```bash
set +x
BOT_API="${TELEGRAM_API_BASE_URL%/}/bot${TELEGRAM_BOT_TOKEN}"
curl --fail --silent --show-error -X POST "${BOT_API}/deleteWebhook"
unset BOT_API
```

Временно перейти на ручные действия из админки (`/content-review` и admin decision API).

