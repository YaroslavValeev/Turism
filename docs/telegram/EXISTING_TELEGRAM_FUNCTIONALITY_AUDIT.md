# Existing Telegram / ТН Functionality Audit

Дата аудита: 2026-06-02.

## Что уже было в репозитории

- `services/api/src/modules/telegram/telegramContentRoutes.ts` — старый public webhook для content-pipeline по path token: `POST /public/telegram/content-pipeline/:token`.
- `services/api/src/modules/telegram/telegramApprovalHandler.ts` — обработчик Telegram callback/message для approval/rewrite content drafts и organizer outreach callbacks.
- `services/api/src/modules/telegram/telegramApi.ts` — общий Telegram Bot API helper.
- `services/api/src/modules/content-pipeline/*` — генерация drafts, owner approval, публикация в Telegram channel/site/blog.
- `services/api/src/modules/organizer-outreach/*` — owner approval для outreach кампаний через Telegram callbacks.
- `services/agents/shared/telegram.ts` — исходящие Telegram сообщения для agents/orchestrator.
- `services/agents/shared/telegramUpdates.ts` и `services/agents/orchestrator/telegramControl.ts` — long-polling `getUpdates` для agent control commands.
- Отдельного каталога `services/telegram-bot/*` в текущем checkout нет.
- Отдельного `services/api/src/modules/telegram-platform/*` до этого PR не было.

## Что работает

- Content-pipeline already has reusable approval/rewrite callback processing and owner chat authorization.
- Organizer outreach already reuses Telegram callbacks for approve/rewrite/skip/no-send decisions.
- Telegram publisher already sends content drafts to a configured updates channel via shared API helper.
- Root/API scripts already include Telegram-related smoke/check entry points for alerts and content-pipeline.

## Что не работает

- Не было единого canonical endpoint `POST /public/telegram/webhook` with `X-Telegram-Bot-Api-Secret-Token` validation.
- Не было dispatcher, который безопасно делит один bot token между content-pipeline и platform leadgen.
- Не было real Telegram lead attempt flow for published programs.
- Не было таблицы real `OrganizerContactChannel`; следовательно, нельзя было корректно отличить реальный organizer `telegramChatId` от missing real data.
- Не было OPS action log for inline buttons по missing organizer contact.
- Existing `TELEGRAM_BOT_API_BASE_URL` convention assumed `.../bot<TOKEN>` in several places; new production canon separates Telegram API (`TELEGRAM_BOT_API_BASE_URL=https://api.telegram.org` + `TELEGRAM_BOT_TOKEN`) from project webhook public base (`TELEGRAM_WEBHOOK_PUBLIC_BASE_URL`).

## Что конфликтует

- Production webhook and production long-polling on the same bot token conflict. Existing agents have `getUpdates` polling path; it must not be enabled in production while the platform webhook is active.
- Legacy path-token webhook for content-pipeline can coexist temporarily, but production should migrate traffic to the single dispatcher endpoint.
- Any future OSINT/researcher bot must be a dispatcher mode/handler, not a second production bot process on the same token.

## Что переиспользуем

- Reuse `handleTelegramContentPipelineUpdate` for legacy content-pipeline routing inside the new dispatcher.
- Reuse shared Telegram Bot API helper for platform leadgen/OPS/organizer notifications.
- Reuse existing `Lead` entity for real Telegram lead attempts; do not introduce mock lead storage.
- Reuse `travelerKeyHash` logic when `TRAVELER_KEY_SALT` is configured.

## Что удалять нельзя

- Do not remove `telegramContentRoutes.ts` yet: it is the legacy content-pipeline webhook compatibility surface.
- Do not remove `telegramApprovalHandler.ts`: it owns content approval/rewrite and outreach callbacks.
- Do not remove `services/agents/*` Telegram helpers: they are used for internal analytics/orchestrator workflows, but polling must remain explicitly gated.
- Do not remove content-pipeline Telegram publisher or organizer-outreach Telegram approval logic.

## Что мигрируем в единый webhook dispatcher

- New canonical ingress: `POST /public/telegram/webhook`.
- Dispatcher routes platform leadgen deep-links/callbacks (`/start lead_*`, `/lead`, `lead:*`, `mtlead:*`, `mtops:*`) to `telegram-platform` handler.
- Dispatcher routes all other updates to existing content-pipeline handler.
- Legacy content-pipeline path remains for migration/backward compatibility, but should not be the final production webhook URL.

## Какие риски остаются

- Real production e2e requires production DB/env and Telegram bot token; local CI must not seed fake data to satisfy it.
- Existing production env may still use legacy `TELEGRAM_BOT_API_BASE_URL=https://api.telegram.org/bot<TOKEN>`; code now supports both, but runbooks should migrate to separated token/base plus `TELEGRAM_WEBHOOK_PUBLIC_BASE_URL` for `setWebhook.url`.
- OPS callback actions currently log action state; richer admin UI for contact capture is Priority 2.
- Kids/high-risk legal flow is not fully implemented in this Priority 1 patch and remains next scope.
- OSINT/researcher mode and Mini App are planned Priority 3 and must be added as dispatcher modes using real sources only.
