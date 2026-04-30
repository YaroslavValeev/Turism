#!/usr/bin/env bash
# Копирует PEM из Let's Encrypt в каталог nginx Docker и делает nginx reload.
# Вызывается certbot после успешного renew (renewal-hooks/deploy) или вручную.
set -euo pipefail

MYWAVE_ROOT="${MYWAVE_ROOT:-/opt/mywave/toutism}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.production.yml}"
ENV_FILE="${ENV_FILE:-.env.production}"

LINEAGE="${RENEWED_LINEAGE:-/etc/letsencrypt/live/mywavetour.ru}"

if [[ ! -f "$LINEAGE/fullchain.pem" ]] || [[ ! -f "$LINEAGE/privkey.pem" ]]; then
  echo "le-deploy-sync: нет PEM в $LINEAGE" >&2
  exit 1
fi

cd "$MYWAVE_ROOT"
install -d -m 755 infra/nginx/certs
cp -L "$LINEAGE/fullchain.pem" infra/nginx/certs/fullchain.pem
cp -L "$LINEAGE/privkey.pem" infra/nginx/certs/privkey.pem
chmod 644 infra/nginx/certs/fullchain.pem
chmod 600 infra/nginx/certs/privkey.pem

docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec -T reverse-proxy nginx -t
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec -T reverse-proxy nginx -s reload
echo "le-deploy-sync: обновлено из $LINEAGE"
