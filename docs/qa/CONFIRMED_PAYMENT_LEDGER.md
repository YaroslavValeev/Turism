# Confirmed manual payment ledger

This change fixes new manual payment records. It does not process a bank transfer, contact an organizer, alter historical rows, add an idempotency contract, or deploy an API.

`recorded`, `failed`, and `reversed` create a payment/audit record but leave booking totals, deal and commission unchanged. The response may contain `commission: null` when no commission exists. Only `confirmed` affects paid/net totals. A partial payment keeps `paid_partial` until an explicit full payment, and does not downgrade an existing `paid_full`. Payment recording preserves `completed` and `disputed`.

One PostgreSQL transaction locks the booking row and writes payment, booking totals, audit, deal and commission. The shared audit/deal helpers accept a transaction client; existing callers retain their default client. Ensuring a deal preserves an existing record through an upsert; concurrency between payment writers is protected by the booking lock. This does not provide global idempotency for other writers. Payment/commission analytics are emitted after commit. The existing refund algorithm and commission eligibility policy remain unchanged.

## Verification

Unit: `pnpm --filter api test src/modules/billing src/modules/bookings` after the normal dependency builds/Prisma generation. `service.test.ts` checks non-confirmed effects, partial/full/completed/disputed, input bounds, transactional client use and analytics on success/failure.

The `Confirmed payment ledger` workflow builds the exact PR head with the official API Dockerfile target `build`, runs API units without network, and invokes `scripts/qa/confirmed-payment-docker.sh` on an owned internal Docker network with an empty tmpfs Postgres, no published ports and no external service settings. The CJS suite refuses an unrecognized QA database target, does not start the application/background entrypoint, tests failure after ledger/booking/audit/deal writes, and checks concurrent distinct payments from two API processes. Its analytics boundary is instrumented in memory; payment events must observe committed rows. Cleanup checks owner labels.

This runner must never target production. It requires `CI=true`, an image labeled with `QA_SOURCE_SHA`, and `QA_IMAGE`; the normal workflow supplies these. A developer can reproduce it only with an isolated Docker daemon/throwaway checkout and the same built image.

## Remaining gates

Repeated financial POSTs with the same external reference are still distinct records. A stable operation key plus database uniqueness and payload conflict rules is a separate API/schema decision. Public booking concurrent deduplication is separate. Existing historical totals/statements require read-only reconciliation before any repair. No old data is rewritten here.

Current production API identity differs from main's web release. This PR remains draft until owner review and a full API release qualification: exact API image/source, green head CI, physical source/database backup and restore proof, Compose identity, health and polling. The web-only carousel release helper cannot deploy this API change. No migration is required by this PR. Rollback uses the prior API image; preserve new ledger/audit rows and do not restore a database over later inquiries.
