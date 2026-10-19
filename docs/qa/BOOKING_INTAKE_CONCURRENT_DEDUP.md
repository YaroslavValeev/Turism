# Concurrent booking intake retries

## Problem and boundary

The public `POST /bookings` endpoint already returns 409 and an existing `bookingId` when the same program/contact is submitted within two minutes. A separate lookup followed by insert allowed concurrent requests to all pass the lookup. An isolated baseline run created three bookings from eight simultaneous requests.

The lookup and insert now share one PostgreSQL `ReadCommitted` transaction, preceded by a transaction-scoped advisory lock. Its two integer keys come from SHA-256 of the program id and validated, trimmed contact. The contact is not placed in the advisory-lock SQL. The duplicate lookup uses the same program/contact identity, and calculates the rolling two-minute window after acquiring the lock.

This preserves the existing normalization contract: surrounding whitespace is trimmed; case and internal whitespace are not reinterpreted. The booking keeps its original validated contact. Different program/contact keys can progress concurrently. A lock hash collision would serialize independent requests but cannot make their full-identity lookup match.

Validation, literal consent and public program availability remain before transaction entry. Consent and attribution are inserted with the booking. Deal creation and analytics remain after commit and are skipped for duplicates. Transaction failures go through the existing error middleware. Admin routes are unchanged.

This is a bounded retry guard for this public intake route, not permanent idempotency or a shared identity policy for other lead/Telegram/admin channels. Requests after two minutes remain able to create another inquiry. No schema, migration, existing-row rewrite, payment or notification change is included.

## Local and Docker validation

```text
pnpm --filter api test src/modules/bookings
pnpm --filter api build
docker build --target build --label org.opencontainers.image.revision=<exact-40-character-sha> -f services/api/Dockerfile -t tourism-booking-dedup:qa .
docker run --rm --network none --entrypoint pnpm tourism-booking-dedup:qa --filter api test src/modules/bookings
node services/api/scripts/booking-intake-dedup.qa.cjs --image tourism-booking-dedup:qa --source <exact-40-character-sha> --out artifacts/booking-intake-dedup
```

Run from a clean checkout of that exact SHA. The QA runner checks the image revision label; local Docker build evidence must separately show that the build context came from that checkout/archive. The dedicated `booking-intake-dedup.yml` workflow builds the official Dockerfile from its checked-out SHA before unit and HTTP/Postgres acceptance.

The runner owns an internal Docker network and a newly created, empty Postgres database in tmpfs. It publishes no ports, generates temporary credentials and disables outbound delivery. It never starts the application's scheduler entrypoint. Its isolated HTTP endpoints run in two child processes so the concurrent check is not limited to one Node.js process. Host/name/database guards refuse arbitrary databases. Cleanup validates ownership labels and preserves the pre-existing protected containers.

Acceptance assertions:

- Eight concurrent requests across two HTTP workers: one booking row, one 201 and seven 409 responses referring to that same booking id; surrounding whitespace variants use the same key.
- Sequential retry keeps 409; attribution and literal consent are persisted.
- A deliberately held PostgreSQL key blocks its matching request, while a different contact and a different program can complete independently.
- An inquiry older than two minutes does not prevent another booking; the existing case-sensitive contact behavior remains unchanged.
- Malformed input, missing consent, hidden program and unauthenticated admin queue retain their rejection contracts; no subscription delivery is created.

## Release and rollback

Require exact-head unit/build/CI and the disposable HTTP/Postgres evidence before merging. This PR does not deploy itself. API deployment must use the established guarded API procedure with actual runtime SHA, Compose identity, backup and rollback evidence; a web-only carousel command is not an API deployment command.

Do not send successful production POST requests as a smoke check without explicit contact/destination and cleanup authorization. Read-only health/version checks are separate from proof of this concurrent behavior. Rollback uses the preceding API artifact; no database restore or migration reversal is required. Already committed inquiries remain intact.
