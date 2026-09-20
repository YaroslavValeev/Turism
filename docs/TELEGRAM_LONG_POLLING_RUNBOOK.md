# Telegram long polling: controlled transport cutover

Scope: MyWaveTour's existing bot only. This change does not register, delete, or alter a Telegram webhook automatically. The default remains `TELEGRAM_LONG_POLLING_ENABLED=false` and the existing webhook path continues to work unchanged. The operator must approve a production cutover separately.

## Why and prerequisites

Telegram reported webhook delivery timeouts while the application and public HTTPS routes remained healthy. Long polling moves update delivery to an outbound Bot API connection. It does not fix a broken outbound path, so verify `getWebhookInfo` from the API container before considering cutover. Keep the existing bot token and handlers. Never run two different bot instances/transports against the same token.

Before enabling, verify the proposed release and green CI, take a database backup, deploy the additive Prisma migration, verify API health, and confirm the existing bot token, outbound Telegram access and `TELEGRAM_BOT_HTTP_PROXY` (if used). Ensure one API deployment owns the token; the database lease prevents two polling workers in that deployment from polling concurrently. Do not use `drop_pending_updates=true`.

## Staged cutover (requires an explicit production GO)

1. Record UTC time, deployed SHA, container status, current `getWebhookInfo` fields (`url`, `pending_update_count`, `last_error_date`, `last_error_message`), and database backup location. Do not print the bot token or webhook secret. Identify a private operator chat for a `/ops` test.
2. Deploy the code and additive migration with the flag **false**. Verify the existing webhook still works, and that the new `telegram_polling_state` and `telegram_polling_updates` tables exist. This proves backward compatibility before changing delivery.
3. Set `TELEGRAM_LONG_POLLING_ENABLED=true` in the API environment and recreate **only** the API service. Confirm the API is healthy and the log says the worker is waiting for webhook removal. While the flag is true, webhook requests deliberately return 503 so Telegram retains/retries them. If the worker or API is unhealthy, restore the flag to false immediately; do not delete the webhook.
4. Through the authenticated Telegram Bot API client, call `deleteWebhook` with `drop_pending_updates:false`. This is the one-way transport switch: the worker first checks that `getWebhookInfo.url` is empty, then starts `getUpdates` with `message` and `callback_query`. Never call `getUpdates` while a webhook is registered and never reset the bot token.
5. Send `/ops` from the private allowed operator chat, press one read-only menu button, and verify a fresh response. Check `pending_update_count` falls toward zero, the webhook URL stays empty, the API logs contain no polling cycle/handler failures, and a row appears in `telegram_polling_state` with an advancing `nextOffset` and fresh `lastReceivedAt`. Monitor for at least 15 minutes, including a restart of the API service if the owner accepts that test.

Do not infer success from an API health 200, `pending_update_count=0` alone, or an old `/ops` response. Record timestamps of a freshly sent message and received response. If no fresh response appears, stop and roll back.

## Failure handling and rollback

Restore `TELEGRAM_LONG_POLLING_ENABLED=false` and recreate only the API service. Re-register the original webhook URL, secret token, and allowed updates (`message`, `callback_query`) using the existing protected configuration. Set `drop_pending_updates:false` if the registration call supports it. Verify `getWebhookInfo.url`, send a fresh `/ops`, and check delivery. Keep the additive tables during emergency rollback; dropping them risks losing an update received during cutover. The previous code ignores the tables.

The inbox stores the update and next offset in one transaction before dispatch, so a crash before completion replays an update from the inbox. The handlers are not globally idempotent: a crash after a side effect but before the completion record may repeat that side effect. On a handler failure the row is marked `failed` (not retried automatically) with its payload retained for six days for operator-led investigation; successful payloads are cleared. Completed rows are pruned after six days. Do not re-inject failed updates blindly. Review failed IDs and handler effects before any manual recovery.

The worker's lease protects against overlapping pollers using this database, but not an unrelated deployment with the same token and a different database. Do not run a second instance of the bot elsewhere. A queue of updates without fresh responses is a failed cutover, even when Telegram's pending count later reaches zero.

## Local verification

Use a dedicated disposable PostgreSQL database, never a production dump or token. Run `pnpm install --frozen-lockfile`, `pnpm --filter api exec prisma generate`, `pnpm --filter api exec prisma migrate deploy`, `pnpm --filter api build`, `pnpm --filter api exec vitest run --maxWorkers=2`, and `pnpm --filter @mywave/config test`. Test the Docker API image build separately. With the flag unset/false, confirm existing webhook tests still pass; with it true, confirm the webhook guard returns 503. Production Telegram and webhook settings are not part of local verification.
