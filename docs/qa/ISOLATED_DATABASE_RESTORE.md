# Isolated production-backup restore rehearsal

The helper takes five explicit arguments: application directory, existing protected
backup root, current **source/API** SHA, HTTPS health URL and existing Compose project.
It requires `MYWAVE_RESTORE_QA_CONFIRM=isolated-copy-only`; no production `.env` is edited.

It snapshots physical source/config and creates a fresh PostgreSQL custom-format dump.
The dump is fully restored with `pg_restore --exit-on-error` into a newly owned container
using the exact production PostgreSQL image, `--network none`, no published ports or
production mounts, a 256 MiB tmpfs and bounded CPU/memory. No API/scheduler is launched
against this copy. Logs, dumps and hashes remain in a mode-700 backup directory.

After restore, catalog/migration history must be present and production container IDs,
env hashes and health must remain unchanged. Cleanup removes only the labelled disposable
container; the original production database and saved dump are never restored/deleted.
A restore or cleanup failure cannot emit the success marker. Confirm protected host
resources and the real rehearsal result before declaring the production recovery gate closed.

Linux control-flow tests use stubs and prove guards/cleanup, **not** a real database restore:

```bash
bash scripts/production/rehearse-database-restore.test.sh
```

The helper deliberately does not enable notification delivery, add a scheduler,
recalculate scores, apply migrations, restart production or change access controls.

## Confirmed rehearsal — 2026-10-09

- Helper commit: `c6179a48549930b84dbc79f2df3716ec5adb935b`; exact-head quality
  run `37969323333` passed. Uploaded helpers were checked against their SHA-256.
- Production source/API remained `1732d9aaadca5cb4b396efb0b156798b1034aa95`.
- Evidence: `/var/backups/mywave-tourism/restore-rehearsal-BfpigK1J`.
- Full `pg_restore --exit-on-error` succeeded: 254 programs, 29 organizers,
  3 bookings, 1800 raw items and 46 applied migrations were present in the copy.
- Source/dump checksums passed; all five production container IDs and all saved
  env hashes remained unchanged; the final public health check passed.
- The owned networkless/tmpfs PostgreSQL container was removed after validation.
  Dumps, source archive and private logs were retained in the protected snapshot.
- This proves backup restorability, not notification delivery, every business
  scenario or original-media provenance. No production database restore occurred.
