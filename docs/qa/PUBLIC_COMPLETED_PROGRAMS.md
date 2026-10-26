# Public completed programme details

Goal: a previously public trip remains readable by its direct link after automatic expiry, while the current catalogue and booking rules continue to reject it.

## Access contract

`GET /programs/:id` may return a completed fixed-date trip with `publicView: "completed"` when:

- its valid date range ended before the current UTC day;
- its status is still `published`, or its latest unambiguous `publish_status_change` audit is the canonical automatic `published -> archived` transition;
- organizer visibility, ingestion review and synthetic-record restrictions still pass.

The automatic evidence requires actor `system:expired-program-archiver`, reason `AUTO_ARCHIVED: program endDate is in the past`, a valid timestamp after the final UTC day and no later manual transition. Missing, conflicting or unreadable evidence fails closed. A manual archive, draft, paused programme, merged duplicate or hidden organizer does not become public by merely having a past date. On-request season windows retain their existing lifecycle.

Availability limits apply to booking; they do not hide an otherwise eligible historical description. This read endpoint creates no booking, subscription, audit, publication transition or notification.

`GET /programs` and `isProgramPubliclyVisible` are unchanged. Booking intake continues to use that stricter predicate. Completed details remain absent from the current catalogue and reject inquiries.

## Web and cache

The programme RSC route is dynamic. Page, metadata and fallback client requests fetch programme details with `cache: "no-store"`; the detail API also returns `Cache-Control: no-store`, including failures. A subsequent manual withdrawal therefore cannot be hidden behind a previously cached successful detail response.

The API completion marker closes the form even when the browser timezone differs from the UTC lifecycle. Completed metadata describes a historical trip, uses noindex/follow, and preserves canonical/source/media links. The owner-confirmed enduro alias and three preserved media references remain unchanged.

## Validation

```bash
pnpm --filter api exec vitest run src/modules/programs/completedPublicAccess.test.ts src/modules/programs/completedPublicRoutes.test.ts src/modules/programs/publicVisibility.test.ts src/modules/bookings/intakeRoutes.test.ts
pnpm --filter api build
pnpm --filter web build
node scripts/qa/completed-program-web.mjs
```

The existing CI-owned disposable PostgreSQL runner additionally runs `services/api/scripts/completed-programs.integration.cjs`. It verifies completed/current detail access, hidden/draft/manual archives, catalogue exclusion, original media, a later manual withdrawal, no-cache headers, rejection of valid-looking completed booking requests, and unchanged business counts. It never uses production credentials or starts application schedulers.

## Release and rollback

No schema, migration, package, environment, port or Compose changes are required. API and web have independently deployed baselines: validate each source/image identity before release. Do not deploy unrelated main changes merely to obtain this fix.

The API runtime change is limited to compiled `modules/programs/routes.js` and new `modules/programs/completedPublicAccess.js`. A selected patch image must record the original API image ID/base revision, reviewed patch SHA and exact checksums for both files. A base `RELEASE_SHA` alone is insufficient proof of that composite image. Verify dependency compatibility with the baseline source and exercise the exact patch in isolation before production.

Deploy API access support before the dynamic web route. Preserve original images, effective Compose configuration, container identities, programme/media fingerprints and a fresh verified physical-source/DB backup. Validate an automatically archived canonical trip returns 200 with the completion marker; its merged duplicate remains 404; the legacy web alias redirects to the canonical page; current catalogue IDs and business counts remain identical. Verify the rendered page and its disabled application state without sending a notification or creating a production inquiry.

Rollback restores the retained web image and API base image/configuration; no data restore or repeated enduro merge is needed. If a step fails, preserve evidence and inspect actual active image identities before deciding which service needs rollback. Tests and CI are distinct from runtime and owner acceptance.
