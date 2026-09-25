#!/usr/bin/env bash
set -euo pipefail

EXPECTED_HOSTNAME="${EXPECTED_HOSTNAME:-msk-1-vm-9j6k}"
DEPLOY_PATH="${DEPLOY_PATH:-/opt/mywave/toutism}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.production.yml}"
ENV_FILE="${ENV_FILE:-.env.production}"

if [ "$(hostname)" != "$EXPECTED_HOSTNAME" ]; then
  echo "WRONG SERVER: $(hostname), expected ${EXPECTED_HOSTNAME}" >&2
  exit 1
fi

cd "$DEPLOY_PATH"
test -f "$COMPOSE_FILE"
test -f "$ENV_FILE"

echo "preflight: docker daemon"
docker version >/dev/null

echo "preflight: compose config"
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" config >/tmp/camp-api-compose.config

echo "preflight: service status"
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" ps

echo "preflight: DNS"
getent hosts registry.npmjs.org >/dev/null
getent hosts api.telegram.org >/dev/null

echo "preflight: TCP/HTTPS egress"
timeout 10 bash -c '</dev/tcp/registry.npmjs.org/443'
timeout 10 bash -c '</dev/tcp/api.telegram.org/443'
curl -fsS --max-time 15 https://registry.npmjs.org/pnpm >/dev/null
curl -fsS --max-time 15 https://api.telegram.org >/dev/null || true

echo "preflight: local API health"
curl -fsS --max-time 10 http://127.0.0.1:3001/health >/dev/null

echo "preflight: ok"
