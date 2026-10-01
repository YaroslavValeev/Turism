#!/usr/bin/env bash
# Camp API production guards: single Docker DNS backend for `api` and list/detail contract smoke.
#
# Usage on VPS (read-only, safe to run any time):
#   cd /opt/mywave/tourism && bash scripts/camp-api/contract-smoke.sh
#
# Can also be sourced by deploy scripts to reuse the functions:
#   source scripts/camp-api/contract-smoke.sh
#   prepare_camp_api_auth "$TOKEN"; assert_single_api_dns; assert_camp_api_contract
#
# Pagination contract is camp-based (collectCampListPage in services/api/src/modules/camp-feed/routes.ts):
# offset/limit apply to valid camps after the mapper, so limit=5 returns exactly min(5, total) camps
# and offset=5 continues right after them.

CAMP_API_DC="${CAMP_API_DC:-docker compose --env-file ${ENV_FILE:-.env.production} -f ${COMPOSE_FILE:-docker-compose.production.yml}}"
CAMP_API_HOST="${CAMP_API_HOST:-api.mywavetour.ru}"
CAMP_API_CURL_CONFIG=""
CAMP_API_SMOKE_DIR=""

cleanup_camp_api_auth() {
  if [ -n "$CAMP_API_CURL_CONFIG" ]; then
    rm -f "$CAMP_API_CURL_CONFIG"
    CAMP_API_CURL_CONFIG=""
  fi
  if [ -n "$CAMP_API_SMOKE_DIR" ]; then
    rm -rf "$CAMP_API_SMOKE_DIR"
    CAMP_API_SMOKE_DIR=""
  fi
}

# Token goes into a 0600 curl config file so it never appears in argv (`ps`) or shell traces.
prepare_camp_api_auth() {
  local camp_api_token="$1"
  test -n "$camp_api_token" || { echo ">>> ERROR: empty CAMP_API_TOKEN" >&2; return 1; }
  if [ -n "$CAMP_API_CURL_CONFIG" ]; then rm -f "$CAMP_API_CURL_CONFIG"; fi
  CAMP_API_CURL_CONFIG="$(umask 077 && mktemp /tmp/camp-api-curl.XXXXXX)"
  printf 'header = "Authorization: Bearer %s"\n' "$camp_api_token" > "$CAMP_API_CURL_CONFIG"
}

# services/api/.env.production is what the api container actually reads; the /root copy is a fallback.
read_camp_api_token() {
  local token
  token="$(grep '^CAMP_API_TOKEN=' services/api/.env.production 2>/dev/null | tail -n1 | cut -d= -f2- | tr -d '"\r' || true)"
  if [ -z "$token" ] && [ -s /root/CAMP_API_TOKEN.current ]; then
    token="$(tr -d '\r\n' < /root/CAMP_API_TOKEN.current)"
  fi
  printf '%s' "$token"
}

assert_single_api_dns() {
  local api_container proxy_container api_ips dns_api_ips dns_count
  api_container="$($CAMP_API_DC ps -q api)"
  proxy_container="$($CAMP_API_DC ps -q reverse-proxy)"
  test -n "$api_container" || { echo ">>> ERROR: api container is not running" >&2; return 1; }
  test -n "$proxy_container" || { echo ">>> ERROR: reverse-proxy container is not running" >&2; return 1; }

  api_ips="$(docker inspect "$api_container" --format '{{range .NetworkSettings.Networks}}{{println .IPAddress}}{{end}}' | sed '/^$/d' | sort -u)" || return 1
  dns_api_ips="$(
    docker exec "$proxy_container" sh -c '
      i=0
      while [ "$i" -lt 20 ]; do
        getent hosts api
        i=$((i + 1))
      done
    ' | awk '{print $1}' | sort -u
  )"
  dns_count="$(printf '%s\n' "$dns_api_ips" | sed '/^$/d' | wc -l | tr -d ' ')"

  if [ "$dns_count" != "1" ] || ! printf '%s\n' "$api_ips" | grep -qxF "$dns_api_ips"; then
    echo ">>> ERROR: Docker DNS alias api is ambiguous or points to a foreign container" >&2
    echo ">>> canonical api container IPs:" >&2
    printf '%s\n' "$api_ips" >&2
    echo ">>> IPs resolved by reverse-proxy for 'api':" >&2
    printf '%s\n' "$dns_api_ips" >&2
    return 1
  fi
  echo ">>> Docker DNS api: $dns_api_ips (single canonical endpoint)"
}

camp_api_get() {
  local path="$1" out="$2"
  curl -kfsS --resolve "${CAMP_API_HOST}:443:127.0.0.1" \
    --config "$CAMP_API_CURL_CONFIG" \
    "https://${CAMP_API_HOST}${path}" \
    -o "$out"
}

assert_camp_api_contract() {
  local query='status=published&sports=wakesurf,wakeboard&audience=ru'
  local dir camp_id detail_status
  test -s "$CAMP_API_CURL_CONFIG" || { echo ">>> ERROR: call prepare_camp_api_auth first" >&2; return 1; }

  CAMP_API_SMOKE_DIR="$(mktemp -d /tmp/camp-api-smoke.XXXXXX)"
  dir="$CAMP_API_SMOKE_DIR"

  # Explicit `|| return 1`: errexit is ignored when the caller invokes this function inside a condition.
  camp_api_get "/api/v1/camps?${query}&offset=0&limit=5&smoke=$(date +%s%N)" "$dir/limit5.json" || return 1
  camp_api_get "/api/v1/camps?${query}&offset=5&limit=5&smoke=$(date +%s%N)" "$dir/limit5-page2.json" || return 1
  camp_api_get "/api/v1/camps?${query}&offset=0&limit=100&smoke=$(date +%s%N)" "$dir/limit100.json" || return 1
  camp_api_get "/api/v1/camps?${query}&offset=0&smoke=$(date +%s%N)" "$dir/default.json" || return 1

  SMOKE_DIR="$dir" python3 - <<'PY' || return 1
import json
import os

d = os.environ["SMOKE_DIR"]
load = lambda name: json.load(open(os.path.join(d, name), encoding="utf-8"))
five, page2, hundred, default = (load(n) for n in ("limit5.json", "limit5-page2.json", "limit100.json", "default.json"))
ids = lambda payload: [item.get("id") for item in (payload.get("items") or [])]

five_ids, page2_ids, hundred_ids, default_ids = ids(five), ids(page2), ids(hundred), ids(default)

assert all(isinstance(i, str) and i for i in hundred_ids), hundred_ids
assert len(hundred_ids) == len(set(hundred_ids)), "duplicate camp ids in limit=100"
assert default_ids == hundred_ids, {"default": len(default_ids), "limit100": len(hundred_ids)}
assert five_ids == hundred_ids[:5], {"limit5": five_ids, "limit100_head": hundred_ids[:5]}
assert page2_ids == hundred_ids[5:10], {"page2": page2_ids, "limit100_next": hundred_ids[5:10]}
assert five.get("next_offset") == (5 if len(hundred_ids) > 5 else None), five.get("next_offset")
assert hundred.get("next_offset") in (None, 100), hundred.get("next_offset")
assert not set(five_ids) & set(page2_ids), "pages overlap"

with open(os.path.join(d, "ids.txt"), "w", encoding="utf-8") as target:
    target.write("".join(f"{i}\n" for i in hundred_ids))
print("camp_list_consistency: ok")
print("records_returned:", len(hundred_ids))
PY

  while IFS= read -r camp_id; do
    [ -n "$camp_id" ] || continue
    detail_status="$(
      curl -ksS --resolve "${CAMP_API_HOST}:443:127.0.0.1" \
        --config "$CAMP_API_CURL_CONFIG" \
        -o "$dir/detail.json" \
        -w '%{http_code}' \
        "https://${CAMP_API_HOST}/api/v1/camps/${camp_id}?smoke=$(date +%s%N)"
    )"
    if [ "$detail_status" != "200" ]; then
      echo ">>> ERROR: detail ${camp_id} returned HTTP ${detail_status}" >&2
      return 1
    fi
    CAMP_ID="$camp_id" DETAIL="$dir/detail.json" python3 - <<'PY' || return 1
import json
import os

payload = json.load(open(os.environ["DETAIL"], encoding="utf-8"))
assert payload.get("id") == os.environ["CAMP_ID"], {"expected": os.environ["CAMP_ID"], "got": payload.get("id")}
PY
  done < "$dir/ids.txt"
  echo ">>> Camp API list/detail consistency: ok"
}

if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  set -Eeuo pipefail
  cd "${DEPLOY_PATH:-/opt/mywave/tourism}"
  trap cleanup_camp_api_auth EXIT
  assert_single_api_dns
  prepare_camp_api_auth "$(read_camp_api_token)"
  assert_camp_api_contract
fi
