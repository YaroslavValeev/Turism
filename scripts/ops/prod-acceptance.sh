#!/usr/bin/env bash
# MyWaveTour production acceptance helper (Timeweb VPS). See docs/deployment/PRODUCTION_APPLY_2026-09-29.md.
#
#   bash scripts/ops/prod-acceptance.sh preflight                 # read-only
#   OWNER_GO=1 bash scripts/ops/prod-acceptance.sh env            # writes .env.production (backup first)
#   EXPECTED_RELEASE_SHA=<sha> bash scripts/ops/prod-acceptance.sh verify   # read-only, after Deploy production
#   bash scripts/ops/prod-acceptance.sh instagram <user> [<user>] # read-only probe
#   bash scripts/ops/prod-acceptance.sh osint-validate            # read-only dry-run
#   OWNER_GO=1 bash scripts/ops/prod-acceptance.sh osint-import   # SourceProposal(status=pending) only
#   OWNER_GO=1 bash scripts/ops/prod-acceptance.sh scores         # one-shot score snapshot recalculation
#
# Secrets are never printed: only ok/missing.
set -Eeuo pipefail

MW="${MYWAVE_ROOT:-/opt/mywave/tourism}"
ENV_FILE="${ENV_FILE:-.env.production}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.production.yml}"
cd "$MW"
DC=(docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE")

require_go() {
  [ "${OWNER_GO:-}" = "1" ] || { echo "STOP: this phase changes production. Re-run with OWNER_GO=1 after explicit Owner GO." >&2; exit 1; }
}

# The api container gets env_file: .env.production, then services/api/.env.production (the second one wins).
API_ENV_FILE="${API_ENV_FILE:-services/api/.env.production}"
MANAGED_KEYS=(TELEGRAM_PUBLIC_BOT_ENABLED INSTAGRAM_HTTP_PROXY INSTAGRAM_SESSION_ID)

env_has() { grep -q "^$1=." "$ENV_FILE" || { [ -f "$API_ENV_FILE" ] && grep -q "^$1=." "$API_ENV_FILE"; }; }

# Effective value as the api container sees it (api file overrides root file). Used only for non-secret flags.
env_effective() {
  local value=""
  value="$(sed -n "s/^$1=//p" "$ENV_FILE" | tail -n1)"
  if [ -f "$API_ENV_FILE" ] && grep -q "^$1=" "$API_ENV_FILE"; then value="$(sed -n "s/^$1=//p" "$API_ENV_FILE" | tail -n1)"; fi
  printf '%s' "$value" | tr -d '"\r'
}

report_env() {
  local key
  for key in INSTAGRAM_HTTP_PROXY INSTAGRAM_SESSION_ID TELEGRAM_BOT_HTTP_PROXY; do
    if env_has "$key"; then echo "$key=ok"; else echo "$key=missing"; fi
  done
  if env_has INTERNAL_ANALYTICS_TOKEN || env_has TARGET_INTERNAL_TOKEN; then echo "INTERNAL_ANALYTICS_TOKEN=ok"; else echo "INTERNAL_ANALYTICS_TOKEN=missing"; fi
  if [ "$(env_effective TELEGRAM_PUBLIC_BOT_ENABLED)" = "false" ]; then
    echo "TELEGRAM_PUBLIC_BOT_ENABLED=false (owner-only)"
  else
    echo "TELEGRAM_PUBLIC_BOT_ENABLED=CHECK (effective: '$(env_effective TELEGRAM_PUBLIC_BOT_ENABLED)')"
  fi
  echo "ANALYTICS_OPS_SCHEDULER_ENABLED='$(env_effective ANALYTICS_OPS_SCHEDULER_ENABLED)' (must stay off)"
  if [ -f "$API_ENV_FILE" ]; then
    for key in "${MANAGED_KEYS[@]}"; do
      grep -q "^$key=" "$API_ENV_FILE" && echo "NOTE: $key is also set in $API_ENV_FILE and overrides $ENV_FILE"
    done
  fi
  return 0
}

check_api_dns() {
  local api proxy api_ips dns_ips
  api="$("${DC[@]}" ps -q api)"
  proxy="$("${DC[@]}" ps -q reverse-proxy)"
  [ -n "$api" ] && [ -n "$proxy" ] || { echo "api_dns=FAIL (api or reverse-proxy not running)"; return 1; }
  api_ips="$(docker inspect "$api" --format '{{range .NetworkSettings.Networks}}{{println .IPAddress}}{{end}}' | sed '/^$/d' | sort -u)"
  dns_ips="$(docker exec "$proxy" sh -c 'i=0; while [ $i -lt 20 ]; do getent hosts api; i=$((i+1)); done' | awk '{print $1}' | sort -u)"
  if [ "$(printf '%s\n' "$dns_ips" | sed '/^$/d' | wc -l | tr -d ' ')" = "1" ] && printf '%s\n' "$api_ips" | grep -qxF "$dns_ips"; then
    echo "api_dns=ok ($dns_ips)"
  else
    echo "api_dns=FAIL: reverse-proxy resolves api to:"; printf '  %s\n' $dns_ips
    echo "canonical api container IPs:"; printf '  %s\n' $api_ips
    echo "Look for a second container with alias api: docker ps --format '{{.Names}}' | grep -i api"
    return 1
  fi
}

phase_preflight() {
  echo "=== release ==="; cat .release/REVISION 2>/dev/null || echo "<no .release/REVISION>"
  echo "=== containers ==="; "${DC[@]}" ps
  echo "=== public health ==="; curl -4 -fsS --max-time 15 https://mywavetour.ru/api/health || echo "health=FAIL"; echo
  echo "=== env (presence only) ==="; report_env
  echo "=== docker dns ==="; check_api_dns || true
}

phase_env() {
  require_go
  local backup
  backup="${ENV_FILE}.bak.$(date -u +%Y%m%dT%H%M%SZ)"
  cp -a "$ENV_FILE" "$backup"
  chmod 600 "$ENV_FILE" "$backup"
  echo "backup: $backup"

  # Keep a single source for managed keys: move them out of the overriding api env file.
  if [ -f "$API_ENV_FILE" ]; then
    local key moved=0 api_backup
    api_backup="${API_ENV_FILE}.bak.$(date -u +%Y%m%dT%H%M%SZ)"
    for key in "${MANAGED_KEYS[@]}"; do grep -q "^$key=" "$API_ENV_FILE" && moved=1; done
    if [ "$moved" = 1 ]; then
      cp -a "$API_ENV_FILE" "$api_backup"; chmod 600 "$api_backup"
      echo "backup: $api_backup"
      for key in "${MANAGED_KEYS[@]}"; do
        if grep -q "^$key=" "$API_ENV_FILE"; then
          if [ "$key" != "TELEGRAM_PUBLIC_BOT_ENABLED" ] && ! grep -q "^$key=." "$ENV_FILE"; then
            grep "^$key=" "$API_ENV_FILE" | tail -n1 >> "$ENV_FILE"
          fi
          sed -i "/^$key=/d" "$API_ENV_FILE"
          echo "moved $key: $API_ENV_FILE -> $ENV_FILE"
        fi
      done
    fi
  fi

  sed -i '/^TELEGRAM_PUBLIC_BOT_ENABLED=/d' "$ENV_FILE"
  printf 'TELEGRAM_PUBLIC_BOT_ENABLED=false\n' >> "$ENV_FILE"

  if env_has INSTAGRAM_HTTP_PROXY && [ "${FORCE_PROXY:-}" != "1" ]; then
    echo "INSTAGRAM_HTTP_PROXY already set (FORCE_PROXY=1 to copy from TELEGRAM_BOT_HTTP_PROXY again)"
  else
    local ig_proxy
    ig_proxy="$(env_effective TELEGRAM_BOT_HTTP_PROXY)"
    [ -n "$ig_proxy" ] || { echo "STOP: TELEGRAM_BOT_HTTP_PROXY is empty, cannot derive INSTAGRAM_HTTP_PROXY" >&2; exit 1; }
    sed -i '/^INSTAGRAM_HTTP_PROXY=/d' "$ENV_FILE"
    printf 'INSTAGRAM_HTTP_PROXY=%s\n' "$ig_proxy" >> "$ENV_FILE"
    unset ig_proxy
    echo "INSTAGRAM_HTTP_PROXY=set from TELEGRAM_BOT_HTTP_PROXY"
  fi

  if env_has INSTAGRAM_SESSION_ID && [ "${FORCE_SESSION:-}" != "1" ]; then
    echo "INSTAGRAM_SESSION_ID already set (FORCE_SESSION=1 to replace an expired one)"
  else
    local ig_session
    read -rsp 'Instagram sessionid (cookie of the service account, input hidden): ' ig_session; echo
    [ -n "$ig_session" ] || { echo "STOP: empty sessionid" >&2; exit 1; }
    case "$ig_session" in *';'*|*' '*|*$'\r'*|*$'\n'*) echo "STOP: sessionid must be the bare cookie value" >&2; exit 1;; esac
    sed -i '/^INSTAGRAM_SESSION_ID=/d' "$ENV_FILE"
    printf 'INSTAGRAM_SESSION_ID=%s\n' "$ig_session" >> "$ENV_FILE"
    unset ig_session
    echo "INSTAGRAM_SESSION_ID=set"
  fi
  chmod 600 "$ENV_FILE"
  report_env
  echo "Env takes effect after the api container is recreated (Deploy production does it)."
}

phase_verify() {
  : "${EXPECTED_RELEASE_SHA:?Set EXPECTED_RELEASE_SHA to the approved main SHA}"
  local fail=0 revision
  revision="$(cat .release/REVISION 2>/dev/null || true)"
  if [ "$revision" = "$EXPECTED_RELEASE_SHA" ]; then echo "[1] release SHA ok"; else echo "[1] FAIL release SHA: $revision"; fail=1; fi
  if PROD_HEALTHCHECK_EXPECTED_SHA="$EXPECTED_RELEASE_SHA" MYWAVE_ROOT="$MW" bash scripts/prod_healthcheck.sh; then echo "[2] healthcheck ok"; else echo "[2] FAIL healthcheck"; fail=1; fi
  if check_api_dns; then echo "[3] single api backend ok"; else echo "[3] FAIL api dns"; fail=1; fi
  if DEPLOY_PATH="$MW" ENV_FILE="$ENV_FILE" COMPOSE_FILE="$COMPOSE_FILE" bash scripts/camp-api/contract-smoke.sh; then echo "[4] camp list/detail ok"; else echo "[4] FAIL camp contract"; fail=1; fi
  if "${DC[@]}" exec -T api sh -c 'test -n "$INSTAGRAM_HTTP_PROXY" && test -n "$INSTAGRAM_SESSION_ID" && test "${TELEGRAM_PUBLIC_BOT_ENABLED:-false}" = false'; then
    echo "[5] instagram env + owner-only bot ok (inside api)"
  else
    echo "[5] FAIL instagram env / owner-only inside api"; fail=1
  fi
  [ "$fail" = 0 ] && echo "VERIFY: OK" || { echo "VERIFY: FAIL — production STOP stays"; exit 1; }
}

phase_instagram() {
  [ "$#" -gt 0 ] || { echo "usage: $0 instagram <username> [<username> ...]" >&2; exit 2; }
  local user
  for user in "$@"; do
    [[ "${user#@}" =~ ^[A-Za-z0-9._]{1,30}$ ]] || { echo "invalid instagram username: $user" >&2; exit 2; }
  done
  "${DC[@]}" exec -T -w /app/services/api api pnpm exec tsx scripts/instagram-probe.ts "$@"
}

phase_osint_validate() {
  "${DC[@]}" exec -T api sh -c 'cd /app && pnpm osint:proposals:validate'
}

phase_osint_import() {
  require_go
  "${DC[@]}" exec -T api sh -c 'cd /app && pnpm osint:proposals:import'
}

phase_scores() {
  require_go
  "${DC[@]}" exec -T api sh -c '
    TOKEN="${INTERNAL_ANALYTICS_TOKEN:-${TARGET_INTERNAL_TOKEN:-}}"
    test -n "$TOKEN" || { echo INTERNAL_ANALYTICS_TOKEN=missing; exit 1; }
    TOKEN="$TOKEN" node -e "fetch(\"http://127.0.0.1:3001/internal/analytics/scores/recalculate\", {
      method: \"POST\",
      headers: { authorization: \"Bearer \" + process.env.TOKEN }
    }).then(async (r) => { console.log(\"recalculate HTTP\", r.status, (await r.text()).slice(0, 500)); if (!r.ok) process.exit(1); })
      .catch((e) => { console.error(e.message); process.exit(1); })"
  '
  "${DC[@]}" exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tA -c "SELECT '"'"'organizer_snapshots='"'"' || count(*) FROM organizer_score_snapshots" -c "SELECT '"'"'program_snapshots='"'"' || count(*) FROM program_score_snapshots"'
}

phase="${1:-}"
shift || true
case "$phase" in
  preflight) phase_preflight ;;
  env) phase_env ;;
  verify) phase_verify ;;
  instagram) phase_instagram "$@" ;;
  osint-validate) phase_osint_validate ;;
  osint-import) phase_osint_import ;;
  scores) phase_scores ;;
  *) sed -n '2,12p' "$0"; exit 2 ;;
esac
