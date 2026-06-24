# MyWaveTour Telegram Platform Runbook

## 1. Canonical env names

Do not mix the Telegram Bot API endpoint with the public project webhook endpoint.

```env
# Outbound calls to Telegram Bot API only.
TELEGRAM_BOT_API_BASE_URL=https://api.telegram.org
TELEGRAM_BOT_TOKEN=<server-only bot token>

# Public backend/API domain used only to build setWebhook.url.
TELEGRAM_WEBHOOK_PUBLIC_BASE_URL=https://api.mywavetour.ru
TELEGRAM_WEBHOOK_SECRET=<server-only random hex>

# Real OPS/channel identifiers; not bot token secrets.
TELEGRAM_PLATFORM_OPS_IDS=510686579
TELEGRAM_ALERT_CHAT_ID=-1003491522243
TELEGRAM_CHANNEL_CHAT_ID=-1003491522243
LEGAL_CONSENT_POLICY_VERSION=telegram-v1
TRAVELER_KEY_SALT=<server-only random salt>
```

Legacy `TELEGRAM_BOT_API_BASE_URL=https://api.telegram.org/bot<TOKEN>` is still supported by API helpers for compatibility, but new production env should use the separated form above.

## 2. Install or verify production webhook

Check env presence without printing secrets:

```bash
printenv | grep -E 'TELEGRAM_PLATFORM_OPS_IDS|TELEGRAM_ALERT_CHAT_ID|TELEGRAM_CHANNEL_CHAT_ID|LEGAL_CONSENT_POLICY_VERSION|TELEGRAM_WEBHOOK_SECRET|TELEGRAM_WEBHOOK_PUBLIC_BASE_URL'
```

Generate `TELEGRAM_WEBHOOK_SECRET` if missing:

```bash
openssl rand -hex 32
```

Install webhook. Keep token and secret in shell env; do not paste them into docs or PRs.

```bash
curl -sS -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook" \
  -H "Content-Type: application/json" \
  -d "{
    \"url\": \"${TELEGRAM_WEBHOOK_PUBLIC_BASE_URL%/}/public/telegram/webhook\",
    \"secret_token\": \"${TELEGRAM_WEBHOOK_SECRET}\",
    \"drop_pending_updates\": false
  }"
```

Sanitized verification command:

```bash
curl -sS "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getWebhookInfo" \
  | jq '{ ok, url: .result.url, pending_update_count: .result.pending_update_count, last_error_message: (.result.last_error_message // "") }'
```

Expected sanitized summary:

```text
ok=true
url=<project-domain>/public/telegram/webhook
pending_update_count=<number>
last_error_message=<empty or sanitized>
```

## 3. How to run real e2e on staging/production-like environment

Run only where real env and a real published program exist. The command must not seed fake programs, organizers, leads, or Telegram contacts.

Required env:

```env
DATABASE_URL=<real DB>
TELEGRAM_BOT_API_BASE_URL=https://api.telegram.org
TELEGRAM_BOT_TOKEN=<server-only bot token>
TELEGRAM_WEBHOOK_SECRET=<server-only webhook secret>
TELEGRAM_WEBHOOK_PUBLIC_BASE_URL=https://api.mywavetour.ru
TELEGRAM_ALERT_CHAT_ID=-1003491522243
TELEGRAM_PLATFORM_OPS_IDS=510686579
TRAVELER_KEY_SALT=<server-only salt>
```

Commands:

```bash
pnpm smoke:telegram-platform
pnpm e2e:telegram-platform-real
```

Acceptance:

```text
real published program
→ webhook/platform handler update
→ real Lead
→ organizer routing if OrganizerContactChannel.telegramChatId exists
→ otherwise OPS routing with organizer_telegram_channel_missing / missing_real_data
→ TelegramPlatformActionLog after inline callback
```

If env or real DB state is missing, keep the `missing_real_data` result and route the missing-data task to OPS. Do not create fake contacts.

## 4. OPS notification proof without PII

For the missing organizer contact path, sanitized evidence should include only:

```text
chat_id=-1003491522243
status=organizer_telegram_channel_missing
reason=missing_real_data
lead_id=<redacted or internal id only>
program_title=<ok if public>
buttons=[claim, manual_contacted, request_contact, no_contact]
```

Do not include traveler phone/email/name or bot token values in reports.

## 5. Gitleaks runbook

Preferred Docker commands, useful when `go install` is blocked:

```bash
docker run --rm -v "$PWD:/repo" ghcr.io/gitleaks/gitleaks:latest git -v --redact=100 --report-format=json --report-path=/repo/gitleaks-git-report.json /repo
```

```bash
docker run --rm -v "$PWD:/repo" ghcr.io/gitleaks/gitleaks:latest dir -v --redact=100 --report-format=json --report-path=/repo/gitleaks-dir-report.json /repo
```

If Docker is unavailable, run locally installed gitleaks:

```bash
gitleaks detect --source . -v --redact=100 --report-format=json --report-path=gitleaks-dir-report.json
```

Sanitized report format for PR/status updates:

```text
gitleaks git findings count=<number>
gitleaks dir findings count=<number>
file=<path>
line=<line if available>
rule_id=<rule>
commit_short=<hash if available>
status=false_positive|removed|rotated|needs_action
```

Never paste secret values into issue comments, PR body, or markdown reports.

## 6. Polling conflict guard

Production long-polling on the same token must stay disabled after webhook setup. The agents `getUpdates` helper refuses polling when `APP_ENV=production` and `TELEGRAM_WEBHOOK_SECRET` is set unless `TELEGRAM_AGENT_POLLING_ENABLED=1` is explicitly set for a maintenance window.
