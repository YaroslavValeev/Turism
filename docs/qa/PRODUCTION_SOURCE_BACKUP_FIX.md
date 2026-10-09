# Production source snapshot and SSH stdin guards

## Incident

The production entry point `/opt/mywave/tourism` is a symlink to the existing
physical directory `/opt/mywave/toutism`. Archiving the entry point from its
parent without following that root produced only a 125-byte symlink archive.
A successful gzip/checksum check did not establish source/config recoverability.
The independently saved pre-deploy PostgreSQL dump is not that source archive.

Do not claim old env files are unchanged based on the link-only archive. A new
snapshot of the deployed code is **current-state protection**, not evidence of
the previous version or a replacement for the pre-migration database dump.
Retain old Docker rollback tags and the original database dump separately.

## Changes

- Stream `scripts/production/create-source-backup.sh` from the checked-out release
  before rsync. Resolve the physical application directory and archive its contents.
- Fail closed for missing application/config files, linked env files, incomplete
  tar reads, output inside the source tree, or an existing output archive.
- Require protected archive permissions, critical manifest entries and matching
  env content hashes without printing env values. Publish the backup marker only
  after those checks succeed. Database/volume backups remain separate operations.
- The new archive layout starts with `./`; any approved restore must use the
  intended application directory as its extraction target, not its parent.
- Detach Docker migration input and redirect stdin for remote commands that do
  not need it. This prevents them from consuming remaining SSH `bash -s` commands.
  The earlier green deploy log ended at container startup without health/audit
  evidence; this patch does not retroactively validate that deploy.

## Validation

```bash
bash scripts/production/create-source-backup.test.sh
bash scripts/production/deploy-stdin.test.sh
```

Backup fixtures cover a symlinked application root, spaces, hidden env files,
excluded generated dependencies, permissions, existing outputs, nested output
paths, broad roots, missing critical files and linked env files. SSH tests extract
the actual workflow remote body and exercise all three build/deploy branches
with stdin-draining child stubs, requiring the final health/audit/release markers.
Run these scripts in an isolated Linux container; fixtures are created under `/tmp`.
CI additionally retains the existing unit, production build and Compose checks.

## Release boundaries, risks and rollback

No Compose, ports, database schema, Telegram behavior or production env changes.
This is infrastructure-only. Do not redeploy solely to repair an already-invalid
backup: first protect the current physical source/config and verify existing
rollback images. A backup stops future deploys if required files or env symlinks
need manual handling; large or changing trees may also fail safely.

Reverting this PR changes only future workflow behavior and must not delete
already-created backups. Do not restore the pre-migration dump automatically:
that can erase legitimate writes since the dump. Live post-deploy health, polling,
schema and delivery-mode checks are still required for release acceptance.
