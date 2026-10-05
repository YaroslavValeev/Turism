# Remaining 35 source-run relationships

Dependency: PR #162, commit 88ca702508dd88f39e8609a3874cbe61441e68c3. That immutable 31-record repair has already been applied and verified separately. This change adds an isolated, independently confirmed 35-record maintenance operation. Do not modify or rerun the old helper.

The server read-only preflight at 2026-10-05T06:01:09.939Z confirmed eight complete successful collection cohorts: 20 Telegram, 14 site, 1 Instagram. Each raw record has exactly one canonical original creation audit with the platform-specific reason, matching identities and time window. There are no overlapping collect/manual runs, no existing cohort links, and all expected item counts match. These records postdate the trace migration; synthetic legacy SourceRuns are inappropriate. Historical root cause remains unknown.

## Scope and safety

Only scripts/production/trace-links-35 helpers/tests and the quality-test registration are added. No application code, migrations, Compose, env, access, media, text or statuses change. No notification, ingestion cycle, deploy or restart is triggered. The operator explicitly authorized these additional 35 links.

Default helper mode creates a read-only version-2 plan. Apply and rollback require reconstruct-35-remaining-source-run-links and the saved original plan. The immutable eight-run/type/source/count allowlist, full cohort, canonical audits, absent overlap, row locks and SERIALIZABLE transaction are rechecked. Each link and its honest reconstruction audit are atomic. The original historical pointer is not claimed to be known. Repeat apply/rollback is idempotent; reapply after rollback and cross-use of the old 31-record plan/confirmation are refused.

The guarded server runner creates a NEW protected directory and fresh fully decoded database dump; it never overwrites the earlier 31-record snapshot. Save and checksum the original plan before applying. Verification fingerprints programs, media, organizers, all SourceRuns and raw content. **Only the 35 permitted pointer fields are excluded from the fingerprints**, so the earlier 31 reconstructed pointers remain protected. Expect 35 new reconstruction audits, rawUnlinked=0 and publicationTraceGaps=0. Concurrent content changes cause a STOP for inspection, never automatic full-database restoration.

## Validation and rollback

- Unit: node --test scripts/production/repair-source-run-links.test.cjs scripts/production/trace-links-35/repair-source-run-links.test.cjs
- Local and exact-head CI: pnpm run check:quality.
- Isolated Docker/PostgreSQL integration seeds the old 31 links plus the new mixed-platform 35 records; checks injected audit failure atomicity, apply/repeat/rollback/repeat, immutable content and preservation of all prior links. Fixtures must never be seeded into production.
- Before production: green exact-head CI, pinned helper hashes, deployed cd8dd5c96bc818a0bcb85dc7a2bd3cd6ebe0f4c9 health, fresh protected plan/dump, repeated preflight.
- Rollback: same new helper --rollback with the saved original version-2 plan and the NEW explicit confirmation; restores only the 35 links it owns and adds reversal audits. Preserve the earlier snapshot and its 31 links. No automatic retry after a lost SSH connection; inspect durable audits/state first.

Merging the PR does not execute the maintenance operation. No merge or production deployment is included.
