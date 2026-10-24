# Four source-backed card classification corrections

Owner approved correction of confirmed card errors after the independent web-only
release of PR #181. This is a separate, bounded data operation, not an API/web
release, parser resync or blanket update of main.

## Exact scope

| Program | Field | Before | After | Documentary source |
| --- | --- | --- | --- | --- |
| cmulpn7bz000rgghlvenfi7ln | discipline | Unknown | enduro | https://t.me/raceenduro/2878 |
| cmulpo3li0011gghl5vz4oq96 | discipline | Unknown | enduro | https://t.me/raceenduro/2871 |
| cmuf9vok500wgl57wmf0k34fc | region | Chile | Красное море | https://t.me/RusKiteNews/1004 |
| cmuf9pvx300upl57w5hhv36e3 | region | Кавказ и др. | Турция | https://mountainguru.ru/climb/0_64/ |

Fresh READ ONLY review at 2026-10-24T05:16:08.835Z still found all four expected
values, published status, no classification manual locks and matching stored raw
source evidence. No changes were made by that review. The primary Mountain Guru
page independently confirms Turkey/Antalya. Its date blocks disagree, and no
unambiguous year-specific corrected schedule was established. Dates, durations,
statuses, media, source pointers and unrelated text are explicitly excluded.

Telegram pages could not be opened through the web lookup tool; the three Telegram
classifications use preserved source text with exact source ID/URL/type rather
than a claim of freshly fetched Telegram content. Source equality corroborates
classification, not canonical publication lineage or photographic rights.

## Implementation and guards

`services/api/scripts/repair-source-card-classifications.cjs` is dependency-free
apart from the existing Prisma runtime. It does not load the app, start workers,
call external services or modify schema/configuration. Planning uses RepeatableRead
READ ONLY. Its four fixed targets and source identities cannot be expanded by CLI.

Apply requires a checked JSON plan, its exact SHA-256 identity, an unused receipt
path, a fresh backup and the owner's approval. The transaction takes deterministic
row locks, uses Serializable isolation, re-reads source evidence and compares the
entire scalar card snapshot (including updatedAt). Each corrected field is added
to manualFields, preserving existing locks, so later ingestion cannot revert it.
Each update also uses a timestamp/value/manualFields compare-and-swap predicate.

Exactly four audit entries store complete old/new scalar snapshots and the plan
identity in the same transaction. No audit failure can leave a partial correction.
The transaction hashes all unrelated programmes, media, organisers, sources, source
runs, raw/normalized items and publication links before/after; any unexpected change
fails the operation. The four target snapshots are checked column-by-column, with
only the approved field, manualFields and automatic updatedAt allowed to change.

Same-plan reapply is a verified no-op if committed audits and current snapshots
still match. Drift is an error, not an instruction to retry or bypass a guard.

## Validation

Local commands, from the repository root:

```powershell
node --check services/api/scripts/repair-source-card-classifications.cjs
node --test services/api/scripts/repair-source-card-classifications.test.cjs
```

CI extends the existing owned internal Docker network and disposable PostgreSQL
acceptance harness. It does not change Compose. The classification suite uses
the existing database/hostname/explicit-confirmation guard before loading Prisma.
It tests planning, manual drift, real transaction rollback after audit failure,
four-field apply, idempotence, tampered receipts, post-apply operator edits,
four-field rollback and replay prevention after rollback. It runs after the
existing admin router tests on fixture IDs absent from the disposable database.

Local Docker Desktop is unavailable; do not claim local Docker proof. Exact-head
CI success is a prerequisite for production use; unit success alone is not enough.

## Production operation and rollback

Correct SSH host: root@5.129.249.113. Canonical app root /opt/mywave/tourism resolves
to /opt/mywave/toutism, Compose project toutism must be retained.

Before writing: check running API/web releases, container identities, configuration
hashes, API/PG health and available space. Use only the exact checked helper from
the reviewed commit in a new private backup directory. Keep a fresh custom-format
PostgreSQL dump, verify its checksum/TOC/full decode, and preserve the checked plan.
Do not print credentials or restore the full database automatically on failure.

The CLI is invoked from `/app/services/api` inside the existing API container with
the existing `dist/env/loadProcessEnv.js` preload. A helper in an owned `/tmp`
directory is sufficient; no application source replacement or restart is needed.

```text
node -r ./dist/env/loadProcessEnv.js /owned/helper.cjs --plan
node -r ./dist/env/loadProcessEnv.js /owned/helper.cjs --apply /owned/plan.json --confirm PLAN_SHA256 --receipt /owned/receipt.json
node -r ./dist/env/loadProcessEnv.js /owned/helper.cjs --rollback /owned/plan.json --confirm PLAN_SHA256 --receipt /owned/receipt.json
```

These are interface examples, not commands to paste with placeholder paths.
The release operator resolves and verifies every path before use. Apply refuses
to overwrite a receipt; preserve even an empty receipt after any uncertain failure
and inspect committed audits before further action. A transport error after commit
does not prove a rolled-back transaction.

Rollback verifies the committed apply audit and exact receipt/current full card
snapshots. It restores only the four previous classification values and each
previous manualFields array, leaves automatic updatedAt current, and appends four
rollback audits atomically. Any later operator edit blocks rollback. No deletion,
media mutation, date inference or database-wide restore is part of this tool.

Independent acceptance must verify all four DB values and locks, audit count,
unmodified dates/media/status/other rows, unchanged container/config identities,
API release, public detail responses and browser filter labels. Remaining source
quality, real Telegram WebView and delivery gates are not closed by this repair.
