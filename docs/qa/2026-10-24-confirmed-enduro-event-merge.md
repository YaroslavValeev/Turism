# Owner-confirmed enduro event identity

## Decision and scope

On 2026-10-24 the owner identified the two enduro cards as **one event** and
explicitly approved retaining «За гранью в Новороссийске» as the primary card,
preserving both source posts/all three images/history and redirecting the old web
link. This new first-party decision supersedes the earlier *unproven identity*
classification for this pair. It does not prove that any other pair is a duplicate.

- Primary: `cmulpo3li0011gghl5vz4oq96`, source https://t.me/raceenduro/2871.
- Duplicate: `cmulpn7bz000rgghlvenfi7ln`, source https://t.me/raceenduro/2878.
- Same organiser/source, date 2026-10-24, Novorossiysk, discipline enduro.
- READ ONLY review found zero bookings, leads, payments, refunds and reviews on
  either card, one image on the primary, two images on the duplicate.

No generic organiser/date-window heuristic is reintroduced. Mountain Guru and
BirdTravel cards are not remapped. No ingestion resync, schema/Compose/config or
API runtime release is part of this change.

## Implementation

Web: `confirmedProgramIdentity.ts` records only the exact owner-confirmed pair.
The legacy `/program/<duplicate>` route redirects to the primary with reversible
HTTP 307, before fetching its archived API record. Query strings (which may hold
tracking/contact data) are not forwarded. Metadata, canonical URL and TouristTrip
structured data resolve to the primary. The primary's provenance block links to
both source posts, conditional on its original source identity still matching.

The additional source is curated documentary metadata, not a service endpoint or
an inferred relationship. It is guarded by exact primary ID and source URL. The
duplicate's original programme, source URL, publication lineage and images remain
in the database for administration/history.

Data: `merge-confirmed-enduro-event.cjs` implements one bounded plan/apply/rollback
operation. It depends on the committed classification helper's pure canonical/hash
and strict CLI-argument utilities, not its four-card write mode.

Planning: RepeatableRead READ ONLY, exact pair/source/date/location/organiser guards,
full programme/media/business-count snapshots and preserved raw-source hashes.
It refuses missing/extra images, duplicate image URLs, manual/source drift or any
business relation that would require a richer booking/payment merge.

Apply: deterministic programme/media row locks, Serializable transaction, fresh
plan identity comparison and update predicates. It appends two image **references**
to the primary in positions 1 and 2; existing position 0 remains the cover and
mediaOrderPinned becomes true. Original file bytes/references are never deleted.
The duplicate becomes archived, not deleted; its source/lineage remains intact.
All original dates/text/classification/locks remain unchanged. One atomic audit
contains both full before/after snapshots and the two created reference IDs.
Unrelated programme/media/organiser/source/run/raw/normalized/publication-link
fingerprints must remain unchanged within the transaction.

Rollback: verified committed receipt/current full snapshots are required. Only the
two references created by this operation are removed, and the previous cover-pin
flag/duplicate publication state are restored. Original references/files are never
removed. Later editor/media/business changes block rollback. Reapply and repeated
rollback are verified no-ops; reapplying a rolled-back plan is refused.

## Validation and release gates

Local commands from the repository root:

```powershell
node --test services/api/scripts/merge-confirmed-enduro-event.test.cjs
pnpm run test:mini-catalog
pnpm --filter web build
```

CI runs existing quality/build/Compose gates and adds the real PostgreSQL merge
suite after the existing disposable classification fixtures. The existing isolated
network/database/explicit-confirmation guard executes before Prisma is loaded.
It tests business drift, rollback after audit failure, copied media/archival,
idempotence, receipt tampering, later media edits and precise restoration. No
production env, application workers or external fetches are used.

Local Docker Desktop is unavailable; exact-head Docker CI is the Docker evidence.
Unit/build success is not production acceptance.

Order: exact-head CI → reviewed merge → pinned web-only release (API and DB
containers protected) → fresh dump/plan/data guards → bounded data apply →
independent API/DB/browser checks. Deploy web identity support first so the old
web link remains functional when the duplicate is archived. If data apply fails,
preserve evidence; never assume that an SSH failure proves no commit happened.
If necessary, rollback data before reverting web support.

The existing immutable `deploy-web-carousel.sh` performs only web build/smoke/
cutover/nginx reload and retains its rollback image/source snapshot. No API build
or database migration is run on production.

Data operation requires a fresh custom-format database dump (checksum/TOC/full
decode), a pinned helper/dependency, exact plan SHA confirmation and an unused
private receipt path. Preserve every artifact, protected container ID and config
hash. The CLI interface matches the prior classification tool: --plan, or
--apply/--rollback PLAN --confirm SHA256 --receipt RECEIPT, executed from the
existing API working directory with its existing environment preload. No full
database restore or automatic rollback is authorised by a failed diagnostic.

## Acceptance and limits

- One active/public enduro card for the confirmed pair.
- Canonical ID/title, original cover, three images in deterministic order.
- Archived duplicate plus all original source/image/lineage records retained.
- Old web URL resolves to the canonical programme; canonical URL/structured data
  agree; provenance exposes both source posts.
- No new lead/booking/payment/notification; API release/config/protected containers
  unchanged; source fingerprints and unrelated cards preserved.
- Archived duplicate API detail may return the existing 404 contract; the approved
  old **web** link redirects. This is not a new API alias contract.
- This is an explicit curated exception, not a complete future cross-post/event
  identity service. New duplicate candidates still require source/owner evidence.
- Ordinary SSR/API caches may briefly show old snapshots; verify after normal
  revalidation rather than purging/restarting unrelated services.
