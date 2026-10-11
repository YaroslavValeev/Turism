# Admin card acceptance — 2026-10-11

## Scope

MyWaveTour / Turism, not Event App. This is a QA-only change: no application,
Compose, production env, permissions, schema or notification behavior is changed.
The mixed original checkout was not edited.

## Confirmed HTTP/database evidence

An owned Docker network was verified `Internal=true`; a new PostgreSQL 16 database
`qa_admin` applied all 46 existing migrations. No database ports were published.
The suite used current compiled API/config/shared-types/explore-links as read-only
mounts into a Linux Node 20 runtime. An initial expired-token expectation was
corrected: private organizer routes return 401; forbidden admin catalog scope
returns 403. Production code was not changed to fit the test.

The local run at `2026-10-11T07:49:19.828Z` passed **43/43** HTTP scenarios:
real login, incorrect credentials, member/admin boundaries, expiry, public organizer
allowlist, verification evidence/ladder, draft creation, rejected patches without
record/audit mutation, text/price/capacity edits and manual-field protection,
image/video references, PNG upload/cache reuse, disguised HTML rejection, foreign
media deletion rejection, ordering/cover, publication gates, public visibility,
organizer pause, archival/admin retention, own-media removal and organizer rename.
Twenty audit records were present; expected actors and selected diffs were checked.
Bookings, subscriptions and deliveries stayed at zero. Two external FX fetches
were blocked by the QA fetch guard; SMTP/Telegram/AI settings were cleared and
no application scheduler was started.

Exact-head quality run `38123022728` repeated all 43 scenarios with Linux-built
dependencies and real PostgreSQL in GitHub Actions. The final suite additionally
checks that an `organizer` account cannot log in to the admin portal or create a
program with its role token, bringing the suite to **45** scenarios; its exact-head
CI result must be confirmed independently. Browser navigation eventually reached
the production login form after a transport timeout; no credentials were entered.

## Repeatable validation

- `node --test services/api/scripts/admin-card-qa-guard.test.cjs` — 7 guard cases.
- `scripts/qa/admin-card-docker.sh` — throwaway Linux CI checkout only, after
  dependency installation, Prisma generation and API/package builds. Private
  Docker networking, disposable storage and owned cleanup are required.
- Never run the acceptance suite against production, an existing user database,
  or a local API connected to production. Host/name/identity/confirmation checks
  and initially empty business/user tables are enforced before fixture creation.

## Not certified by this run

This is real router/database acceptance, **not authenticated browser acceptance**.
It does not certify iOS/Android Telegram WebView, video playback, original-photo
provenance/rights, real notification delivery or every admin page. Those remain
separate acceptance gates. No production commands/deploy are needed for QA scripts.
