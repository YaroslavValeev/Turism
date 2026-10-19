#!/usr/bin/env bash
set -Eeuo pipefail
[[ ${CI:-} == true ]] || { echo 'CI throwaway checkout required' >&2; exit 1; }
: "${QA_IMAGE:?QA_IMAGE is required}"
: "${QA_SOURCE_SHA:?QA_SOURCE_SHA is required}"
[[ "$QA_SOURCE_SHA" =~ ^[0-9a-f]{40}$ ]]
[[ "$(docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$QA_IMAGE")" == "$QA_SOURCE_SHA" ]]
run_id="$(od -An -N4 -tx1 /dev/urandom | tr -d ' \n')"
network="tourism-payments-qa-$run_id"
db="$network-db"
api="$network-api"
migration="$network-migrate"
password="$(od -An -N24 -tx1 /dev/urandom | tr -d ' \n')"
cleanup() {
  result=$?
  trap - EXIT INT TERM
  set +e
  for container in "$api" "$migration" "$db"; do
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
docker run -d --name "$db" --network "$network" --memory 384m --cpus 1 \
  --label "codex.qa.owner=$run_id" --tmpfs /var/lib/postgresql/data:rw,size=256m \
  -e POSTGRES_USER=qa_payments -e POSTGRES_DB=qa_payments -e "POSTGRES_PASSWORD=$password" \
  postgres:16-alpine postgres -c shared_buffers=16MB -c maintenance_work_mem=16MB >/dev/null
ready=0
for attempt in $(seq 1 30); do
  if docker exec "$db" pg_isready -U qa_payments -d qa_payments >/dev/null 2>&1; then ready=1; break; fi
  sleep 1
done
[[ "$ready" == 1 ]]
[[ -z "$(docker port "$db")" ]]
url="postgresql://qa_payments:$password@$db:5432/qa_payments"
docker run --rm --name "$migration" --network "$network" --memory 768m \
  --label "codex.qa.owner=$run_id" -w /app/services/api -e "DATABASE_URL=$url" \
  --entrypoint node "$QA_IMAGE" node_modules/prisma/build/index.js migrate deploy
docker run --rm --name "$api" --network "$network" --memory 1g \
  --label "codex.qa.owner=$run_id" -w /app/services/api \
  -e "DATABASE_URL=$url" -e CONFIRMED_PAYMENT_QA_CONFIRM=isolated-no-outbound-network \
  --entrypoint node "$QA_IMAGE" scripts/confirmed-payment-ledger.integration.cjs
