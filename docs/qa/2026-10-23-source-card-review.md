# Four-card source review — 2026-10-23

## Scope

MyWaveTour, not Event App. The helper is diagnostic and **cannot apply changes**.
It has no write mode, notification, ingestion, media fetch or publication action.
No Compose, schema, service configuration or application route changes are needed.

The four scoped program IDs are in `services/api/scripts/source-card-review.cjs`.
Each proposed classification is checked against the exact source ID, URL and type,
preserved raw text, current value and manual-field locks. A snapshot hash is for
review evidence only; it does not authorize a future repair. Source URL equality
does not establish a missing canonical lineage link.

## Confirmed read-only observations

On 2026-10-23, the four published rows still had empty manualFields:

| Program suffix | Current classification | Review proposal |
| --- | --- | --- |
| venfi7ln | Unknown | enduro |
| 5vz4oq96 | Unknown | enduro |
| mf0k34fc | Chile | Красное море |
| 5hhv36e3 | Кавказ и др. | Турция |

The saved race posts identify the enduro source and Novorossiysk race classes.
The Red Sea text explicitly describes a kite/wing safari in the Red Sea; a newer
normalized revision already says Egypt/Red Sea, while the old revision says Chile.
One newer race revision is normalized as enduro while its program remains Unknown.
These observations prove differences, not the precise historical writer or cause.

The saved Mountain Guru text identifies Turkey/Antalya. Its source page contains
multiple course dates: the older normalized item and published row use October 29
to November 8, while the newer item uses November 1–10. The helper flags date
review separately and never proposes date, duration, media or status changes.

The application also intentionally returns an existing published link early in
`publishCandidateToDraft`. Merely re-running publication is not a general repair
mechanism, and a mass source resync is outside this operation.

## Validation and operation

The 17 Node tests passed locally. The helper body with SHA-256
`bf714a065e871192fee65d262e845c946c2089a0d2b4cbba042d168769af52bd`
was then sent through SSH stdin (no server file installed) to the existing API
runtime. At `2026-10-23T19:38:44.934Z` it completed the read-only database review:
four proposals, zero missing/source/manual/value/evidence blockers, Turkey date
review required, and `executionAllowed: false`. No business data was changed.
Docker Desktop was unavailable locally, so this is not a local Docker acceptance
claim. The separate committed-SHA CI result must be checked independently.

Local checks (no database or Docker required):

    node --check services/api/scripts/source-card-review.cjs
    node --test services/api/scripts/source-card-review.test.cjs

The CLI requires the existing compiled Prisma module and caller-provided runtime
environment. Inside the already deployed API directory, invoke the checked helper
with the existing `dist/env/loadProcessEnv.js` preload. It opens RepeatableRead,
sets `SET TRANSACTION READ ONLY` before SELECTs, and prints proposals only.
Do not copy repository env files or start the application/schedulers for this tool.
Unsupported CLI arguments (including --apply) fail before loading the DB client.
Exit 2 means one or more rows need manual review, not permission to bypass guards.

The tests check transaction ordering, source identity, raw evidence, manual locks,
current-value drift, missing/duplicate IDs, stable hashes and rejection of write
flags. They do not prove current source availability, rights, video playback,
delivery, or every field of the published program.

## Next gate / rollback

Before any separate write tool: review the complete card, confirm the date issue,
preserve a fresh before snapshot/backup, specify exact fields and ownership,
validate compare-and-swap and audit behavior on an isolated database, and obtain
the release/data-change approval required by the owner. Preserve program media,
publication state, historical raw items and lineage. No production rollback is
needed for this helper because it performs no data changes.
