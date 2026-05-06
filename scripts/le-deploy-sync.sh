#!/usr/bin/env bash
# Копирует PEM из Let's Encrypt в каталог nginx Docker и поднимает reverse-proxy.
# Вызывается certbot после успешного renew (renewal-hooks/deploy) или вручную.
set -euo pipefail

MYWAVE_ROOT="${MYWAVE_ROOT:-/opt/mywave/toutism}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.production.yml}"
ENV_FILE="${ENV_FILE:-.env.production}"
COMPOSE_ENV=( -f "$COMPOSE_FILE" )
if [[ -f "$MYWAVE_ROOT/$ENV_FILE" ]]; then
  COMPOSE_ENV+=( --env-file "$MYWAVE_ROOT/$ENV_FILE" )
fi

LINEAGE=""
if [[ -n "${RENEWED_LINEAGE:-}" ]] && [[ -f "${RENEWED_LINEAGE}/fullchain.pem" ]] && [[ -f "${RENEWED_LINEAGE}/privkey.pem" ]]; then
  LINEAGE="$RENEWED_LINEAGE"
fi
if [[ -z "$LINEAGE" ]] && [[ -f /etc/letsencrypt/live/mywavetour.ru/fullchain.pem ]]; then
  LINEAGE="/etc/letsencrypt/live/mywavetour.ru"
fi
if [[ -z "$LINEAGE" ]] && [[ -f /etc/letsencrypt/live/www.mywavetour.ru/fullchain.pem ]]; then
  LINEAGE="/etc/letsencrypt/live/www.mywavetour.ru"
fi

if [[ -z "$LINEAGE" ]]; then
  echo "le-deploy-sync: не найден fullchain.pem/privkey.pem ни в одном из путей:" >&2
  echo "  RENEWED_LINEAGE=${RENEWED_LINEAGE:-}" >&2
  echo "  /etc/letsencrypt/live/mywavetour.ru" >&2
  echo "  /etc/letsencrypt/live/www.mywavetour.ru" >&2
  echo "le-deploy-sync: содержимое /etc/letsencrypt/live (если есть):" >&2
  ls -la /etc/letsencrypt/live 2>/dev/null || echo "  (каталога нет — certbot на этом хосте не выпускал сертификат)" >&2
  exit 1
fi

cd "$MYWAVE_ROOT"
install -d -m 755 infra/nginx/certs
cp -L "$LINEAGE/fullchain.pem" infra/nginx/certs/fullchain.pem
cp -L "$LINEAGE/privkey.pem" infra/nginx/certs/privkey.pem
chmod 644 infra/nginx/certs/fullchain.pem
chmod 600 infra/nginx/certs/privkey.pem

# После восстановления PEM контейнер мог быть в CrashLoop — сначала up, потом проверка.
docker compose "${COMPOSE_ENV[@]}" up -d reverse-proxy
sleep 3
docker compose "${COMPOSE_ENV[@]}" exec -T reverse-proxy nginx -t
docker compose "${COMPOSE_ENV[@]}" exec -T reverse-proxy nginx -s reload 2>/dev/null || true
echo "le-deploy-sync: обновлено из $LINEAGE"
