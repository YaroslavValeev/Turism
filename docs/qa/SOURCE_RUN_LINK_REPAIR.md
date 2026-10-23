# Bounded source-run relationship reconstruction

This is a one-off repair for release `cd8dd5c96bc818a0bcb85dc7a2bd3cd6ebe0f4c9`, not a collector or a migration. The four existing September 25 collection runs have 11, 13, 3 and 4 raw records. All 31 have original canonical creation audits within the corresponding unique source/run interval. Five publication-ledger entries (four visible cards and one archived card) depend on this cohort. The records postdate the August 30 trace migration, so the generic legacy backfill is inappropriate.

The associations are **reconstructed from evidence**, not asserted to have been stored originally. No fictitious SourceRun is created. Why the original links are absent is still unknown. Program content, media, publication/organizer status, consent, notifications and access are outside scope.

## Modes and gates

Run the helper from the API runtime working directory, with the runtime environment preloaded. No arguments produces a JSON plan, without DB writes. Save it outside the container in a protected, checksummed backup directory **before** apply. Copy that exact plan into the container for use with `--apply <plan>` or `--rollback <plan>`; either write mode requires `TRACE_REPAIR_CONFIRM=reconstruct-31-existing-source-run-links`.

Both modes enforce the deployed release, exact run/source/count scope, complete raw cohort, absence of overlapping collect/manual runs, a unique canonical creation audit with matching old/new values, and a digest of original identities/timestamps. Apply/rollback lock existing run and raw rows and revalidate inside one SERIALIZABLE transaction. Each conditional update and audit entry is atomic. No automatic retries. Rollback requires ownership by this repair's audit records and the current pointer/identity state; it restores only these 31 nullable pointers and adds reversal audit entries. It does not delete audit history or restore a whole database. Repeat apply/rollback is read-only and idempotent; reapply after rollback is refused.

## Verification

- `node --test scripts/production/repair-source-run-links.test.cjs`
- `pnpm run check:quality` (includes the helper unit tests; existing CI runs this)
- Isolated PostgreSQL/Docker: plan, apply 31, repeat apply 0, rollback 31, repeat rollback 0, rejected changed audit/state, transaction failure rollback. Never seed fixtures into production.
- Before production writes: exact-head CI green, protected saved plan and verified fresh database dump, repeat dry-run evidence, running API release/health. After: 31 pointer links and 31 reconstruction audits; ingestion trace strict audit has no unlinked publication records; public catalog/content/status/media unchanged. Keep the original saved plan for rollback, not a post-apply plan.

This PR does not change Compose, deployment workflows, schema or normal application behavior. The infrastructure backup fix remains separate in PR #161. Production repair is an explicit maintenance operation; merging this helper alone does not run it.

`run-source-run-link-repair.sh` is the guarded server runner. It requires explicit confirmation, saves the plan and a fresh fully decoded database dump in a new protected directory, rechecks the plan after backup, then applies the transaction. `verify-source-run-link-repair.cjs` fingerprints every program, media record, organizer, SourceRun and the raw content excluding only the permitted link pointer. Verification requires unchanged fingerprints, exactly 31 fewer unlinked raw records, and zero publication trace gaps. Concurrent content changes cause a verification STOP, not an automatic destructive rollback. Temporary helper copies in the API container do not survive recreation; the protected host snapshot is the durable plan/rollback source. No restart is performed.
