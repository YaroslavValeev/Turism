#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="${MYWAVE_ROOT:-/opt/mywave/toutism}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.production.yml}"
cd "$ROOT_DIR"

echo "== HTTP health (канон на основном домене: /api/health) =="
curl -fsS https://mywavetour.ru/api/health
echo
echo "== HTTP health (короткий /health после выката nginx alias) =="
if curl -fsS --max-time 20 https://mywavetour.ru/health 2>/dev/null; then
  echo
else
  echo "WARN: GET /health не 200 — пока полагаться на /api/health; выкатите infra/nginx/mywave.conf с location = /health (см. docs/deployment/ADR_PUBLIC_HEALTH_ENDPOINT.md)"
fi

echo "== Home page =="
curl -fsS https://mywavetour.ru/ >/dev/null
echo "home: ok"

echo "== Media placeholder =="
curl -fsSI https://mywavetour.ru/images/placeholders/program-card.svg | sed -n '1,8p'

echo "== Media proxy =="
curl -fsSI 'https://mywavetour.ru/api/media?url=https%3A%2F%2Fimages.unsplash.com%2Fphoto-1506905925346-21bda4d32df4%3Fw%3D200' | sed -n '1,8p'

echo "== Docker status =="
docker compose -f "$COMPOSE_FILE" ps

echo "== Disk =="
df -h

echo "== Memory =="
free -m

echo "== Recent 5xx nginx logs =="
docker compose -f "$COMPOSE_FILE" logs --tail=200 reverse-proxy | grep -E ' 5[0-9][0-9] ' || true

echo "== Recent api errors =="
docker compose -f "$COMPOSE_FILE" logs --tail=200 api | grep -Ei 'error|exception|unhandled| 500 ' || true

echo "prod_healthcheck: OK"
