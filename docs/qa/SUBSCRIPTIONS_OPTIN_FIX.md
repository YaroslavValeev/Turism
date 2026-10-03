# Subscription consent and private Telegram delivery

## Scope and release boundary

This change is separate from Mini App UI (PR #158), catalog deduplication (PR #159),
design and infrastructure. No Compose, ports, permissions or production flags are changed.
The existing owner/operator Telegram flow is retained. This is not a production acceptance claim.

## Corrected behavior

- POST requires boolean `consent: true`; stores timestamp and policy version without losing source/UTM.
- Discipline (comma-separated OR), region, level and inclusive UTC start-date bounds are retained and used for delivery.
- Subscription identity is unique. Repeated/concurrent signup does not create multiple identities.
- Telegram opt-in uses a random 24-hour single-use token (hash only in DB), a private chat,
  matching username and an atomic claim. No DM is attempted to `@username`.
- `/stop` clears the Telegram binding/token without disabling the email channel.
  Resubscription after unsubscribe requires a fresh Telegram confirmation.
- A per-subscription/program/channel delivery claim prevents concurrent publication and replay from sending twice.
  An ambiguous provider result remains `uncertain`; no blind retry. A crash can leave `sending`.
- The catalog signup form shows inherited filters and does not claim Telegram confirmation before Start.
  Public Telegram mode remains opt-in through existing configuration; disabled mode returns an honest 503.
- Email signup can save conditions while SMTP is absent, but explicitly says no emails are being sent.
  Disabled Telegram suggests email only when SMTP is configured; configuration is not proof of delivery.

## Migration and legacy data

Additive migration: `20261003090000_subscription_optin_delivery`.
New subscription fields, nullable unique identities/token hashes and `subscription_deliveries`.
Apply with the normal reviewed release's `pnpm --filter api db:deploy` before starting its API.
Existing contacts have no proven consent timestamp and are **not automatically notified**.
Ask them to explicitly subscribe again; do not fabricate consent or bulk-bind Telegram chats.

## Local validation

From the repository root (PowerShell):

```powershell
pnpm --filter api exec vitest run src/modules/subscriptions
pnpm run check:quality
git diff --check
docker build -f services/api/Dockerfile -t tourism-subscriptions-qa-api:local .
```

For integration, provide `DATABASE_URL` for an owned loopback Postgres database named
`tourism_qa`, migrate it, seed disposable fixtures, then run:

```powershell
pnpm --filter api db:deploy
pnpm --filter api exec tsx scripts/subscriptions-local-qa.ts
```

The script rejects non-loopback/non-`tourism_qa` databases and uses a loopback fake
Telegram transport, never real contacts or repository env files.
Do not run the SMTP Sprint 3 script without an explicitly consenting recipient;
it now requires `SPRINT3_E2E_CONSENT=true` before any email.

Initial evidence on 2026-10-03: 34 targeted tests passed; API TypeScript build passed;
12 real-Postgres/fake-Telegram integration checks passed, including concurrent signup,
atomic chat binding, one delivery under concurrency/replay and `/stop`.
Browser: empty form and missing consent rejected, email signup saved, disabled Telegram
shown as unavailable, inherited dates/level visible, no signup input overflow at 320px.
Full quality gate passed after the final rebind regression/SMTP-script consent guard:
938 API + 64 web/admin model + 18 config + 3 explore-link tests (1023 total);
API, web and admin production builds passed. API Docker build and loopback health
passed against the migrated disposable database. The exact committed head must pass CI before merge.

SMTP-readiness follow-up: operator-provided production diagnostics show public bot disabled,
polling enabled, SMTP absent and an updates username configured. No flags were changed.
The follow-up adds truthful unavailable-channel feedback: 35 targeted tests and fresh API/web
builds passed. Initial Docker/integration results above refer to the pre-follow-up artifact;
real production delivery remains unverified.

## Production acceptance gates (not executed)

1. Review migration, backup and deployment artifact; apply migration before API startup.
2. Check SMTP configuration and an explicitly consenting allowlisted test recipient.
3. Verify `TELEGRAM_UPDATES_BOT_USERNAME` matches `getMe` for the configured token.
   Review public-bot access separately before enabling `TELEGRAM_PUBLIC_BOT_ENABLED`.
4. Test Start in the private bot chat, expired/reused/wrong-user link, `/stop`, re-opt-in,
   a matching/nonmatching program and publication replay. Preserve operator `/ops` behavior.
5. Inspect delivery states, health, migrations and application errors; do not reset claims automatically.

Read-only reconciliation query (no contact data):

```sql
SELECT status, channel, COUNT(*) FROM subscription_deliveries GROUP BY status, channel;
SELECT id, "subscriptionId", "programId", channel, status, "createdAt", "completedAt"
FROM subscription_deliveries WHERE status IN ('sending', 'uncertain') ORDER BY "createdAt";
```

## Remaining boundaries and rollback

Real SMTP/Telegram and production migration are not verified. Mini App inline signup is a
separate integration task; this PR fixes the full-catalog form. Email double opt-in and signed
unsubscribe links are not implemented; existing contact-based unsubscribe routes are unchanged.
Channel announcement delivery is outside the new subscriber ledger. Withdrawal cannot recall
an already in-flight external message. Provider ambiguity is not exactly-once delivery.

Keep additive columns/tables and delivery evidence on rollback; do not drop them or backfill consent.
Frontend rollback is independent. Do not blindly roll the API back to the old unsafe notifier:
pause new program publication/notifications under an approved maintenance plan until a compatible
safe artifact is restored. No automatic environment rollback or permission expansion is included.
