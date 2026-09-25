#!/usr/bin/env bash
set -euo pipefail

: "${OWNER_GO:?Set OWNER_GO=1 only after explicit Owner GO}"
[ "$OWNER_GO" = "1" ] || { echo "OWNER_GO must be 1" >&2; exit 1; }

EXPECTED_HOSTNAME="${EXPECTED_HOSTNAME:-msk-1-vm-9j6k}"
DEPLOY_PATH="${DEPLOY_PATH:-/opt/mywave/toutism}"
BACKUP_PATH="${BACKUP_PATH:-$(cat /tmp/camp-api-selected-backup.latest)}"
ENV_FILE="${ENV_FILE:-.env.production}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.production.yml}"

if [ "$(hostname)" != "$EXPECTED_HOSTNAME" ]; then
  echo "WRONG SERVER: $(hostname), expected ${EXPECTED_HOSTNAME}" >&2
  exit 1
fi

cd "$DEPLOY_PATH"
test -f "$COMPOSE_FILE"
test -s "$BACKUP_PATH"

tar -tzf "$BACKUP_PATH" >/tmp/camp-api-rollback.files
tar -xzf "$BACKUP_PATH" -C "$DEPLOY_PATH"

docker compose --progress=plain --env-file "$ENV_FILE" -f "$COMPOSE_FILE" build api
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d --no-deps api reverse-proxy
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" ps api reverse-proxy

curl -fsS --max-time 10 http://127.0.0.1:3001/health >/dev/null
echo "camp-api rollback: ok"
