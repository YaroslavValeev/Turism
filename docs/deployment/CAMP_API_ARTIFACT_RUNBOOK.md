# Camp API artifact manual-console runbook

Production HOLD: use this runbook only when the approved `camp-api-release.tgz`
GitHub Actions artifact has already been copied to the Tour VPS manually.

This path does not require outbound connectivity from the VPS and does not
rotate `CAMP_API_TOKEN`.

## Artifact contract

The artifact is a gzip tarball named `camp-api-release.tgz`.

It contains only selected Camp/API/config files plus `SHA256SUMS`:

- `.env.example`
- `packages/config/src/env.ts`
- `services/api/.env.example`
- `services/api/Dockerfile`
- `services/api/src/index.ts`
- `services/api/src/modules/camp-feed/**`
- `SHA256SUMS`

## Local download after GitHub Actions run

Run from an operator machine with GitHub access:

```powershell
gh run download <RUN_ID> --repo YaroslavValeev/Turism -n camp-api-release.tgz -D .\artifacts\camp-api-release
tar -tzf .\artifacts\camp-api-release\camp-api-release.tgz
```

Copy `artifacts/camp-api-release/camp-api-release.tgz` to the VPS as:

```text
/tmp/camp-api-release.tgz
```

Use the provider console or another approved private transfer path. Do not paste
tokens in chat or CI logs.

## VPS preflight

Run in the Tour VPS console as `root`:

```bash
set -euo pipefail

[ "$(hostname)" = "msk-1-vm-9j6k" ] || { echo "WRONG SERVER: $(hostname)"; exit 1; }

DEPLOY_PATH=/opt/mywave/toutism
ARTIFACT=/tmp/camp-api-release.tgz

cd "$DEPLOY_PATH"
test -f docker-compose.production.yml
test -s "$ARTIFACT"
tar -tzf "$ARTIFACT"
```

## Verify artifact manifest

```bash
set -euo pipefail

VERIFY_DIR=/tmp/camp-api-release-verify
rm -rf "$VERIFY_DIR"
mkdir -p "$VERIFY_DIR"
tar -xzf /tmp/camp-api-release.tgz -C "$VERIFY_DIR"

(
  cd "$VERIFY_DIR"
  test -f SHA256SUMS
  sha256sum -c SHA256SUMS
  test -f .env.example
  test -f packages/config/src/env.ts
  test -f services/api/.env.example
  test -f services/api/Dockerfile
  test -f services/api/src/index.ts
  test -f services/api/src/modules/camp-feed/routes.ts
  test -f services/api/src/modules/camp-feed/mapper.ts
  test -f services/api/src/modules/camp-feed/auth.ts
)
```

## Backup selected production files

```bash
set -euo pipefail

cd /opt/mywave/toutism

BACKUP_PATH="/tmp/camp-api-selected-backup-$(date +%Y%m%d%H%M%S).tgz"
tar -czf "$BACKUP_PATH" --ignore-failed-read \
  .env.example \
  packages/config/src/env.ts \
  services/api/.env.example \
  services/api/Dockerfile \
  services/api/src/index.ts \
  services/api/src/modules/camp-feed

printf '%s\n' "$BACKUP_PATH" > /tmp/camp-api-selected-backup.latest
echo "backup: $BACKUP_PATH"
```

## Extract selected files

This extracts only the selected artifact files and leaves `SHA256SUMS` in the
temporary verification directory, not in the production tree.

```bash
set -euo pipefail

cd /opt/mywave/toutism
tar -xzf /tmp/camp-api-release.tgz -C /opt/mywave/toutism --exclude=SHA256SUMS

grep -R 'pnpm --filter @mywave/shared-types build' -n services/api/Dockerfile
grep -R 'pnpm --filter @mywave/explore-links build' -n services/api/Dockerfile
grep -R 'router.get("/api/v1/camps"' -n services/api/src/modules/camp-feed/routes.ts
grep -R 'router.get("/api/v1/camps/:id"' -n services/api/src/modules/camp-feed/routes.ts
grep -R 'router.get("/camps-feed.json"' -n services/api/src/modules/camp-feed/routes.ts
grep -R 'campFeedRoutes' -n services/api/src/index.ts
grep -R 'CAMP_API_TOKEN' -n packages/config/src/env.ts
grep -R 'next_offset' -n services/api/src/modules/camp-feed/routes.ts
```

## Build and restart only API

```bash
set -euo pipefail

cd /opt/mywave/toutism

docker compose --progress=plain --env-file .env.production -f docker-compose.production.yml build api
docker compose --env-file .env.production -f docker-compose.production.yml up -d --no-deps api reverse-proxy
docker compose --env-file .env.production -f docker-compose.production.yml ps api reverse-proxy
```

## Smoke without token rotation

This reads the existing `CAMP_API_TOKEN` from `services/api/.env.production`.
It does not create `/root/CAMP_API_TOKEN.current`.

```bash
set -euo pipefail

cd /opt/mywave/toutism

CAMP_API_TOKEN="$(grep '^CAMP_API_TOKEN=' services/api/.env.production | tail -n1 | cut -d= -f2- | tr -d '"')"
test -n "$CAMP_API_TOKEN"

curl -kfsS --resolve api.mywavetour.ru:443:127.0.0.1 \
  -H "Authorization: Bearer ${CAMP_API_TOKEN}" \
  "https://api.mywavetour.ru/api/v1/camps?status=published&sports=wakesurf,wakeboard&audience=ru&limit=5&offset=0" \
  -o /tmp/mywave-camps-sample.json

python3 - <<'PY'
import json
p="/tmp/mywave-camps-sample.json"
d=json.load(open(p, encoding="utf-8"))
items=d.get("items") or []
empty=lambda v: v is None or v=="" or v==[]
print("sample_file:", p)
print("total_items:", len(items))
print("next_offset:", d.get("next_offset"))
print("without_photo:", sum(1 for x in items if empty(x.get("cover_image_url"))))
print("without_price:", sum(1 for x in items if empty(x.get("price_from"))))
print("without_booking_url:", sum(1 for x in items if empty(x.get("booking_url"))))
print("content_rights_unknown:", sum(1 for x in items if x.get("content_rights_status")=="unknown"))
PY

unset CAMP_API_TOKEN
```

## Rollback

```bash
set -euo pipefail

cd /opt/mywave/toutism

BACKUP_PATH="$(cat /tmp/camp-api-selected-backup.latest)"
test -s "$BACKUP_PATH"

tar -xzf "$BACKUP_PATH" -C /opt/mywave/toutism
docker compose --progress=plain --env-file .env.production -f docker-compose.production.yml build api
docker compose --env-file .env.production -f docker-compose.production.yml up -d --no-deps api reverse-proxy
docker compose --env-file .env.production -f docker-compose.production.yml ps api reverse-proxy
```
