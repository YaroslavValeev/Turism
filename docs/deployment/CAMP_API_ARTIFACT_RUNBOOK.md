# MyWaveTour Camp API artifact runbook

Production HOLD: until Tour VPS egress is restored and Owner gives explicit GO,
do not rotate `CAMP_API_TOKEN`, do not build, do not restart, do not change IP,
and do not run deploy.

## Contract

- `GET /api/v1/camps`
- `GET /api/v1/camps/{id}`
- `GET /api/v1/camps/health`
- `GET /camps-feed.json`
- Auth: `Authorization: Bearer <CAMP_API_TOKEN>`
- Invalid/missing token: `401`
- List envelope: `{ "items": [], "next_offset": null }`
- Filters: `status`, `sports`, `audience`, `updated_since`, `limit`, `offset`
- Publication statuses: `published`, `hidden`, `archived`
- Availability statuses: `available`, `few_spots`, `sold_out`, `unknown`
- Content rights: `partner_allowed`, `unknown`, `restricted`

Camp item includes both compatibility aliases and canonical Site handoff fields:
`id`, `title`, `sport`, `level`, `region`, `location`, `start_date`,
`end_date`, `duration`, `price`, `currency`, `inclusions`, `exclusions`,
`organizer`, `audience`, `itinerary`, `cover`, `gallery`, `video`,
`source_url`, `updated_at`, `content_rights_status`.

Removed/deleted policy: Site must not silently delete imported records. Tour
signals lifecycle changes via `publication_status` (`hidden`, `archived`) and
`availability_status` (`sold_out`). A future hard-delete callback needs a
separate contract.

## Artifact

Name: `camp-api-release.tgz`

Selected files:

- `.env.example`
- `packages/config/src/env.ts`
- `services/api/.env.example`
- `services/api/Dockerfile`
- `services/api/src/index.ts`
- `services/api/src/modules/camp-feed/**`
- `scripts/camp-api/**`
- `SHA256SUMS`

Local build:

```bash
pnpm run camp-api:scripts-check
pnpm run camp-api:artifact
tar -tzf artifacts/camp-api-release/camp-api-release.tgz
sha256sum -c artifacts/camp-api-release/stage/SHA256SUMS
```

GitHub Actions artifact:

```powershell
gh workflow run deploy-camp-api.yml --repo YaroslavValeev/Turism -f deploy_to_vps=false -f rotate_camp_token=false
gh run download <RUN_ID> --repo YaroslavValeev/Turism -n camp-api-release.tgz -D .\artifacts\camp-api-release
tar -tzf .\artifacts\camp-api-release\camp-api-release.tgz
```

Copy artifact to the Tour VPS as `/tmp/camp-api-release.tgz` by Timeweb
web-console or another approved private transfer path. Do not paste tokens in
chat, CI logs, or issue comments.

## T1. While VPS egress is blocked

Repository-side only:

```bash
pnpm --filter @mywave/shared-types build
pnpm --filter @mywave/explore-links build
pnpm --filter @mywave/config build
pnpm --filter api db:generate
pnpm --filter api build
pnpm --filter api test -- camp-feed telegram-admin
pnpm run camp-api:scripts-check
pnpm run camp-api:artifact
```

Docker preflight is prepared but must not be run until the VPS network blocker
is cleared:

```bash
bash scripts/camp-api/docker-preflight.sh
```

## T2. After egress is restored and Owner GO is explicit

Project: MyWaveTour
Server: Tour VPS
Hostname: `msk-1-vm-9j6k`
IP: `5.129.249.113`
Terminal: Timeweb web-console or SSH
Working directory: `/opt/mywave/toutism`
Allowed services: `api`, `reverse-proxy`
Forbidden services: `web`, `admin`, Telegram bot/admin services, ParserNews,
TGbotAdmin MyWave, YClients

Preflight:

```bash
set -euo pipefail
cd /opt/mywave/toutism
EXPECTED_HOSTNAME=msk-1-vm-9j6k DEPLOY_PATH=/opt/mywave/toutism bash scripts/camp-api/docker-preflight.sh
```

Verify copied artifact:

```bash
set -euo pipefail
VERIFY_DIR=/tmp/camp-api-release-verify
rm -rf "$VERIFY_DIR"
mkdir -p "$VERIFY_DIR"
tar -xzf /tmp/camp-api-release.tgz -C "$VERIFY_DIR"
(cd "$VERIFY_DIR" && sha256sum -c SHA256SUMS)
```

Deploy selected files, optionally rotating token without printing it:

```bash
set -euo pipefail
cd /opt/mywave/toutism
OWNER_GO=1 \
EXPECTED_HOSTNAME=msk-1-vm-9j6k \
DEPLOY_PATH=/opt/mywave/toutism \
ARTIFACT=/tmp/camp-api-release.tgz \
ROTATE_CAMP_TOKEN=true \
BUILD_MODE=incremental \
bash scripts/camp-api/deploy-selected-artifact.sh
```

Expected result:

- selected files verified by `SHA256SUMS`
- backup path written to `/tmp/camp-api-selected-backup.latest`
- `api` image built
- only `api` and `reverse-proxy` restarted
- authorized smoke writes `/tmp/mywave-camps-sample.json`
- unauthorized smoke returns `401`
- private health writes `/tmp/camp-api-health.json`

## Smoke commands

Do not echo token:

```bash
set -euo pipefail
cd /opt/mywave/toutism
CAMP_API_TOKEN="$(cat /root/CAMP_API_TOKEN.current)"

curl -kfsS --resolve api.mywavetour.ru:443:127.0.0.1 \
  -H "Authorization: Bearer ${CAMP_API_TOKEN}" \
  "https://api.mywavetour.ru/api/v1/camps?status=published&sports=wakesurf,wakeboard&audience=ru&limit=5&offset=0" \
  -o /tmp/mywave-camps-sample.json

curl -ksS --resolve api.mywavetour.ru:443:127.0.0.1 \
  -o /tmp/camp-api-unauthorized.out \
  -w '%{http_code}' \
  "https://api.mywavetour.ru/api/v1/camps" | grep -qx '401'

curl -kfsS --resolve api.mywavetour.ru:443:127.0.0.1 \
  -H "Authorization: Bearer ${CAMP_API_TOKEN}" \
  "https://api.mywavetour.ru/api/v1/camps/health" \
  -o /tmp/camp-api-health.json

unset CAMP_API_TOKEN
```

Sample validation:

```bash
python3 - <<'PY'
import json
p="/tmp/mywave-camps-sample.json"
d=json.load(open(p, encoding="utf-8"))
assert isinstance(d.get("items"), list)
assert "next_offset" in d
required = {"id","title","sport","region","location","start_date","end_date","duration","price","currency","inclusions","exclusions","organizer","audience","itinerary","cover","gallery","video","source_url","updated_at","content_rights_status"}
for item in d["items"]:
    missing = sorted(required - set(item))
    assert not missing, (item.get("id"), missing)
print("sample_file:", p)
print("items:", len(d["items"]))
print("next_offset:", d["next_offset"])
PY
```

## Private token handoff

The token value must never be printed in chat or CI logs.

1. Operator rotates token on VPS with `ROTATE_CAMP_TOKEN=true`, or reads the
   existing token from `/root/CAMP_API_TOKEN.current`.
2. Operator shares the token to the Site owner through the approved secret
   manager or direct secure channel.
3. Site stores it as a private server-side env var, not `NEXT_PUBLIC_*`.
4. Site performs authorized and unauthorized smoke.
5. Operator deletes any temporary local note containing the token.

## Rollback

```bash
set -euo pipefail
cd /opt/mywave/toutism
OWNER_GO=1 \
EXPECTED_HOSTNAME=msk-1-vm-9j6k \
DEPLOY_PATH=/opt/mywave/toutism \
bash scripts/camp-api/rollback-selected-artifact.sh
```

Rollback restores the selected backup, rebuilds only `api`, restarts only
`api reverse-proxy`, and checks local `/health`.
