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
