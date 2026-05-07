#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="${MYWAVE_ROOT:-/opt/mywave/toutism}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.production.yml}"
cd "$ROOT_DIR"

echo "== source_runs status summary =="
docker compose -f "$COMPOSE_FILE" exec -T postgres sh -lc '
psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "
SELECT status, COUNT(*)
FROM source_runs
GROUP BY status
ORDER BY COUNT(*) DESC;
"'

echo "== failed categories =="
docker compose -f "$COMPOSE_FILE" exec -T postgres sh -lc '
psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "
SELECT
  CASE
    WHEN \"errorMessage\" ILIKE '\''%timeout%'\'' THEN '\''timeout'\''
    WHEN \"errorMessage\" ILIKE '\''%429%'\'' THEN '\''http_429'\''
    WHEN \"errorMessage\" ILIKE '\''%404%'\'' THEN '\''http_404'\''
    WHEN \"errorMessage\" ILIKE '\''%403%'\'' THEN '\''http_403'\''
    WHEN \"errorMessage\" ILIKE '\''%fetch failed%'\'' THEN '\''fetch_failed'\''
    WHEN \"errorMessage\" ILIKE '\''%parser%'\'' THEN '\''parser_error'\''
    WHEN \"errorMessage\" ILIKE '\''%media%'\'' THEN '\''media_fetch_failed'\''
    WHEN \"errorMessage\" ILIKE '\''%invalid%url%'\'' THEN '\''invalid_url'\''
    WHEN \"errorMessage\" ILIKE '\''%unsupported%'\'' THEN '\''unsupported_source'\''
    WHEN \"errorMessage\" ILIKE '\''%empty%'\'' THEN '\''empty_response'\''
    WHEN \"errorMessage\" ILIKE '\''%network%'\'' THEN '\''network_error'\''
    ELSE '\''unknown'\''
  END AS reason,
  COUNT(*) AS cnt
FROM source_runs
WHERE status = '\''failed'\''
GROUP BY 1
ORDER BY cnt DESC;
"'

echo "== running details (possible stale) =="
docker compose -f "$COMPOSE_FILE" exec -T postgres sh -lc '
psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "
SELECT id, \"sourceId\", \"runType\", status, \"startedAt\", \"finishedAt\"
FROM source_runs
WHERE status = '\''running'\''
ORDER BY \"startedAt\" ASC;
"'

echo "triage_source_runs: OK"
