# Booking intake validation

## Scope and reproduction

At release `cd8dd5c`, an isolated HTTP request with a published program, literal consent and `guestContact: "   "` returned **201**. The public form already trims contacts; API clients could bypass that form. Non-string tracking fields could also reach string methods without validation.

The fix validates request shape, required strings, the existing form's 254-character contact limit, and optional text types before Prisma. Required strings are trimmed. Nullable optional text and free-form contacts remain supported; no contact-channel guessing is added. Consent, availability, attribution, status transitions and duplicate response contracts remain in place.

## Local validation

From the repository root:

```text
pnpm --filter api test src/modules/bookings src/modules/subscriptions
pnpm run check:quality
```

## Docker integration

`services/api/scripts/booking-intake.integration.cjs` mounts the compiled booking/subscription routers on a loopback-only Express server and uses real Postgres. It verifies successful intake, consent, unavailable programs, duplicate handling, the six-step status/audit/review-request workflow, subscription idempotency, disabled delivery, unsubscribe and the whitespace regression.

Run ONLY against a newly created empty Postgres database on a Docker network created with `--internal`, with no published ports. The script refuses database hosts other than `tourism-intake-qa-20261005-<hex>-db`, database names other than `qa`/`qa_<suffix>`, or missing `BOOKING_INTAKE_QA_CONFIRM=isolated-no-outbound-network`. Apply migrations only to that disposable database. Use the current API build and config/shared-types/explore-links builds (read-only mounts), not a stale saved image's compiled code.

The runner clears SMTP/Telegram/AI/ingestion settings, generates temporary JWT secrets, disables analytics and review email, and never starts the background application entrypoint. It creates fixtures only in the disposable database. No successful intake smoke script should be run on production.

## Production and rollback

No migration, Compose, ports, permissions, env or notification change is required. Before deployment, require green exact-head CI and verified physical-source/database backups. After deployment, verify release SHA/health/polling and exercise rejected-input cases with unchanged business-row counts. A real valid production inquiry or notification needs an explicitly scoped test recipient and cleanup plan.

Rollback is the normal previous API artifact rollback; no database restore is required. Existing rows are not rewritten. Historical contacts already stored with surrounding whitespace are not migrated by this fix.
