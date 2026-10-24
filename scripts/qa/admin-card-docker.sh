#!/usr/bin/env bash
# CI-only runner. Local Windows QA uses the same CJS suite with Linux-built deps.
set -Eeuo pipefail
[[ ${CI:-} == true ]] || { echo 'CI throwaway checkout required' >&2; exit 1; }
repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"
test -f "$repo/services/api/dist/modules/programs/routes.js"
test -f "$repo/services/api/node_modules/prisma/build/index.js"
run_id="$(od -An -N4 -tx1 /dev/urandom | tr -d ' \n')"
network="tourism-admin-qa-$run_id"
db="$network-db"
api="$network-api"
password="$(od -An -N24 -tx1 /dev/urandom | tr -d ' \n')"
cleanup() {
  result=$?
  trap - EXIT INT TERM
  set +e
  for container in "$api" "$db"; do
    owner="$(docker inspect --format '{{index .Config.Labels "codex.qa.owner"}}' "$container" 2>/dev/null)"
    if [[ "$owner" == "$run_id" ]]; then docker rm -f "$container" >/dev/null || result=1; fi
  done
  owner="$(docker network inspect --format '{{index .Labels "codex.qa.owner"}}' "$network" 2>/dev/null)"
  if [[ "$owner" == "$run_id" ]]; then docker network rm "$network" >/dev/null || result=1; fi
  exit "$result"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
docker network create --internal --label "codex.qa.owner=$run_id" "$network" >/dev/null
[[ "$(docker network inspect --format '{{.Internal}}' "$network")" == true ]]
docker run -d --name "$db" --network "$network" --memory 256m --cpus 0.5 \
  --label "codex.qa.owner=$run_id" --tmpfs /var/lib/postgresql/data:rw,size=256m \
  -e POSTGRES_USER=qa_admin -e POSTGRES_DB=qa_admin -e "POSTGRES_PASSWORD=$password" \
  postgres:16-alpine postgres -c shared_buffers=16MB -c maintenance_work_mem=16MB >/dev/null
ready=0
for attempt in $(seq 1 30); do
  if docker exec "$db" pg_isready -U qa_admin -d qa_admin >/dev/null 2>&1; then ready=1; break; fi
  sleep 1
done
[[ "$ready" == 1 ]]
url="postgresql://qa_admin:$password@$db:5432/qa_admin"
# No ports are published. Everything here is inside an owned internal Docker network.
docker run --rm --network "$network" --memory 512m --cpus 1 \
  --label "codex.qa.owner=$run_id" -v "$repo:/repo:ro" -w /repo/services/api \
  -e "DATABASE_URL=$url" node:20-bookworm \
  node node_modules/prisma/build/index.js migrate deploy
# Uploaded fixture bytes must stay in the disposable container, not the checkout.
mkdir -p "$repo/apps/web/public/ingestion-media"
docker run --rm --name "$api" --network "$network" --memory 512m --cpus 1 \
  --label "codex.qa.owner=$run_id" -v "$repo:/repo:ro" -w /repo/services/api \
  --tmpfs /repo/apps/web/public/ingestion-media:rw,size=16m \
  -e "DATABASE_URL=$url" -e ADMIN_CARD_QA_CONFIRM=isolated-no-outbound-network \
  node:20-bookworm node scripts/admin-card.integration.cjs

# Same disposable database/network; never loads production environment or starts workers.
docker run --rm --name "$api" --network "$network" --memory 512m --cpus 1 \
  --label "codex.qa.owner=$run_id" -v "$repo:/repo:ro" -w /repo/services/api \
  -e "DATABASE_URL=$url" -e ADMIN_CARD_QA_CONFIRM=isolated-no-outbound-network \
  node:20-bookworm node scripts/repair-source-card-classifications.integration.cjs

docker run --rm --name "$api" --network "$network" --memory 512m --cpus 1 \
  --label "codex.qa.owner=$run_id" -v "$repo:/repo:ro" -w /repo/services/api \
  -e "DATABASE_URL=$url" -e ADMIN_CARD_QA_CONFIRM=isolated-no-outbound-network \
  node:20-bookworm node scripts/merge-confirmed-enduro-event.integration.cjs
