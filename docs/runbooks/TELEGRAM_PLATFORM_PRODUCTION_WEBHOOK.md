# MyWaveTour Telegram Platform Production Webhook Runbook

Canonical operational runbook: `docs/telegram/RUNBOOK.md`.

Key rule: do not mix Telegram Bot API base with the public webhook base.

```env
TELEGRAM_BOT_API_BASE_URL=https://api.telegram.org
TELEGRAM_BOT_TOKEN=<server-only bot token>
TELEGRAM_WEBHOOK_PUBLIC_BASE_URL=https://api.mywavetour.ru
TELEGRAM_WEBHOOK_SECRET=<server-only random hex>
```

The production webhook URL is:

```text
${TELEGRAM_WEBHOOK_PUBLIC_BASE_URL%/}/public/telegram/webhook
```

The Telegram Bot API URL for `setWebhook` / `getWebhookInfo` remains:

```text
https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/...
```

See `docs/telegram/RUNBOOK.md` for real e2e, gitleaks Docker commands, sanitized evidence format, and polling conflict guard.
