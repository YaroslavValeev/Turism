# Telegram operator menu

The owner-chat operator can send `/start`, `/ops`, or `/menu` to open the inline menu.

Access requires both conditions:

1. the message is in `TELEGRAM_CONTENT_OWNER_CHAT_ID` (or the alert-chat fallback);
2. the Telegram user id is listed in `TELEGRAM_SOURCE_PROPOSAL_USER_IDS`.

The menu provides:

- source proposal instructions (`/source <url> [name]`);
- one-at-a-time manual processing of an already active source: collect, normalize, deduplicate;
- organizer verification status changes;
- non-publication program status changes.

The menu intentionally cannot activate an inactive source, create organizers or programs,
or set a program to `published`. Program publication stays in Admin and retains the existing
publish gate. The runtime `INGESTION_AUTOPUBLISH_ENABLED` setting remains the only
autopublish control.
