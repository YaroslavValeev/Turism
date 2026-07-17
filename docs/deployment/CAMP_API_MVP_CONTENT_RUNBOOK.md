# Camp API MVP content runbook

This runbook publishes exactly one idempotent wake camp after the private Camp API is deployed and authenticated. It does not rotate tokens or recreate web, admin, or Postgres.

## Data contract

- Stable program ID: `camp_api_mvp_wakesurf_v1`.
- API camp ID: `tour_camp_api_mvp_wakesurf_v1`.
- Publication status: `published`.
- Content rights: `unknown`; no partner permission is inferred.
- No personal phone, name, or external organizer data is created.
- Re-running updates the same rows and moves the date window 45 days ahead.

## Publish from the Tourism VPS

The script must come from a reviewed committed SHA. If the running API image does not contain it, copy only this script into the running API container before execution.

```bash
set -euo pipefail
set +x
cd /opt/mywave/tourism

test -s /tmp/ensure-camp-api-mvp.ts
docker cp /tmp/ensure-camp-api-mvp.ts \
  toutism-api-1:/app/services/api/scripts/ensure-camp-api-mvp.ts

docker exec toutism-api-1 sh -lc '
  cd /app/services/api
  pnpm exec tsx scripts/ensure-camp-api-mvp.ts
'
```

## Verify the list and detail contracts

```bash
set -euo pipefail
set +x
cd /opt/mywave/tourism

CAMP_API_TOKEN="$(python3 - <<'PY'
from pathlib import Path

for raw in Path("services/api/.env.production").read_text(encoding="utf-8").splitlines():
    line = raw.strip()
    if line and not line.startswith("#") and line.startswith("CAMP_API_TOKEN="):
        print(line.split("=", 1)[1].strip().strip('"').strip("'"))
PY
)"
test -n "$CAMP_API_TOKEN"

LIST_FILE="$(mktemp)"
DETAIL_FILE="$(mktemp)"
trap 'rm -f "$LIST_FILE" "$DETAIL_FILE"; unset CAMP_API_TOKEN' EXIT

curl -fsS \
  -H "Authorization: Bearer ${CAMP_API_TOKEN}" \
  'https://api.mywavetour.ru/api/v1/camps?status=published&sports=wakesurf,wakeboard&audience=ru&limit=5&offset=0' \
  > "$LIST_FILE"

curl -fsS \
  -H "Authorization: Bearer ${CAMP_API_TOKEN}" \
  'https://api.mywavetour.ru/api/v1/camps/tour_camp_api_mvp_wakesurf_v1' \
  > "$DETAIL_FILE"

python3 - "$LIST_FILE" "$DETAIL_FILE" <<'PY'
import json
import sys

listing = json.load(open(sys.argv[1], encoding="utf-8"))
detail = json.load(open(sys.argv[2], encoding="utf-8"))
assert any(item.get("id") == "tour_camp_api_mvp_wakesurf_v1" for item in listing.get("items", []))
assert detail.get("publication_status") == "published"
assert detail.get("content_rights_status") == "unknown"
assert "wakesurf" in detail.get("sport", [])
print(json.dumps({
    "ok": True,
    "items_count": len(listing.get("items", [])),
    "camp_id": detail.get("id"),
    "title": detail.get("title"),
    "publication_status": detail.get("publication_status"),
    "content_rights_status": detail.get("content_rights_status"),
    "cover_image_url": detail.get("cover_image_url"),
}, ensure_ascii=False, indent=2))
PY
```

## Rollback only this fixture

```bash
set -euo pipefail
set +x
docker exec toutism-api-1 sh -lc '
  cd /app/services/api
  pnpm exec tsx scripts/ensure-camp-api-mvp.ts --rollback
'
```
