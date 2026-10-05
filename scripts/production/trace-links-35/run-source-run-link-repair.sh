#!/usr/bin/env bash
# Run only after exact-head CI and explicit authorization. Does not deploy/restart.
set -Eeuo pipefail
umask 077
test "${TRACE_REPAIR_CONFIRM:-}" = 'reconstruct-35-remaining-source-run-links'
SCRIPT_DIR="$(cd -- "$(dirname -- "$0")" && pwd -P)"
for file in repair-source-run-links.cjs verify-source-run-link-repair.cjs; do
  test -s "$SCRIPT_DIR/$file"
done
cd /opt/mywave/tourism
test "$(pwd -P)" = '/opt/mywave/toutism'
TARGET='cd8dd5c96bc818a0bcb85dc7a2bd3cd6ebe0f4c9'
test "$(tr -d '\r\n' < .release/REVISION)" = "$TARGET"
dc() { docker compose --env-file .env.production -f docker-compose.production.yml "$@"; }
api_id="$(dc ps -q api)"
test -n "$api_id"
test "$(docker inspect --format '{{.State.Health.Status}}' "$api_id")" = healthy
test "$(df --output=avail -B1 . | tail -1 | tr -d ' ')" -gt 1073741824
SNAPSHOT="$(mktemp -d /var/backups/mywave-tourism/trace-repair-remaining35-XXXXXXXX)"
trap 'printf "STOP: inspect snapshot=%s; no automatic rollback or retry\n" "$SNAPSHOT" >&2' ERR
chmod 700 "$SNAPSHOT"
cp "$SCRIPT_DIR/repair-source-run-links.cjs" "$SCRIPT_DIR/verify-source-run-link-repair.cjs" "$SNAPSHOT/"
printf '%s\n' "$api_id" > "$SNAPSHOT/api-container-id"
CONTAINER_DIR="/tmp/$(basename "$SNAPSHOT")"
dc exec -T api mkdir -m 700 "$CONTAINER_DIR"
docker cp "$SNAPSHOT/repair-source-run-links.cjs" "$api_id:$CONTAINER_DIR/repair-source-run-links.cjs"
docker cp "$SNAPSHOT/verify-source-run-link-repair.cjs" "$api_id:$CONTAINER_DIR/verify-source-run-link-repair.cjs"
runtime() { dc exec -T api sh -lc 'cd /app/services/api && exec node -r ./dist/env/loadProcessEnv.js "$@"' sh "$@"; }
runtime "$CONTAINER_DIR/repair-source-run-links.cjs" > "$SNAPSHOT/plan.json"
docker cp "$SNAPSHOT/plan.json" "$api_id:$CONTAINER_DIR/plan.json"
runtime "$CONTAINER_DIR/verify-source-run-link-repair.cjs" "$CONTAINER_DIR/plan.json" > "$SNAPSHOT/before.json"
dc exec -T postgres sh -lc 'exec pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$SNAPSHOT/database-before.dump"
test -s "$SNAPSHOT/database-before.dump"
dc exec -T postgres pg_restore --file=/dev/null < "$SNAPSHOT/database-before.dump"
(
  cd "$SNAPSHOT"
  sha256sum repair-source-run-links.cjs verify-source-run-link-repair.cjs plan.json before.json database-before.dump > SHA256SUMS
  sha256sum -c SHA256SUMS
)
docker cp "$SNAPSHOT/plan.json" "$api_id:$CONTAINER_DIR/plan.json"
docker cp "$SNAPSHOT/before.json" "$api_id:$CONTAINER_DIR/before.json"
# Repeat preparation after the backup; compare identity, not preparation timestamp.
runtime "$CONTAINER_DIR/repair-source-run-links.cjs" > "$SNAPSHOT/plan-rechecked.json"
dc exec -T api node -e 'const fs=require("fs");const a=JSON.parse(fs.readFileSync(0,"utf8"));if(a.length!==2||a[0].id!==a[1].id||a[0].links.length!==35)process.exit(1)' < <(printf '[%s,%s]' "$(< "$SNAPSHOT/plan.json")" "$(< "$SNAPSHOT/plan-rechecked.json")")
test "$(dc ps -q api)" = "$api_id"
printf 'VERIFIED_REPAIR_BACKUP=%s\n' "$SNAPSHOT"
dc exec -T -e TRACE_REPAIR_CONFIRM="$TRACE_REPAIR_CONFIRM" api sh -lc 'cd /app/services/api && exec node -r ./dist/env/loadProcessEnv.js "$@"' sh "$CONTAINER_DIR/repair-source-run-links.cjs" --apply "$CONTAINER_DIR/plan.json" | tee "$SNAPSHOT/apply-result.json"
runtime "$CONTAINER_DIR/verify-source-run-link-repair.cjs" "$CONTAINER_DIR/before.json" "$CONTAINER_DIR/plan.json" | tee "$SNAPSHOT/after.json"
(
  cd "$SNAPSHOT"
  sha256sum plan-rechecked.json apply-result.json after.json > RESULT_SHA256SUMS
  sha256sum -c SHA256SUMS
  sha256sum -c RESULT_SHA256SUMS
)
printf 'REMAINING35_SOURCE_RUN_LINK_REPAIR_VERIFIED snapshot=%s\n' "$SNAPSHOT"
printf 'ROLLBACK: keep plan.json; --rollback with the same helper and explicit confirmation restores only these 35 pointers.\n'
