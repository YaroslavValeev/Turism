#!/usr/bin/env bash
# Локальная проверка синтаксиса nginx для infra/nginx/mywave.conf без VPS и без PEM в git.
# Генерирует одноразовый self-signed в `.tmp-nginx-verify/` (в .gitignore), монтирует вместе с конфигом, запускает `nginx -t`.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
# Не mktemp в /tmp: на Windows + Docker Desktop монтирование в контейнер часто ломается.
SCRATCH="$ROOT_DIR/.tmp-nginx-verify"
mkdir -p "$SCRATCH"
trap 'rm -rf "$SCRATCH"' EXIT

if ! command -v openssl >/dev/null 2>&1; then
  echo "verify_nginx_config: нужен openssl в PATH" >&2
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "verify_nginx_config: нужен docker в PATH" >&2
  exit 1
fi

# -addext есть в OpenSSL ≥1.1.1; иначе — только CN (для nginx -t достаточно).
if openssl req -x509 -nodes -days 1 -newkey rsa:2048 \
  -keyout "$SCRATCH/privkey.pem" -out "$SCRATCH/fullchain.pem" \
  -subj "/CN=mywavetour.ru" \
  -addext "subjectAltName=DNS:mywavetour.ru,DNS:www.mywavetour.ru" 2>/dev/null; then
  :
else
  openssl req -x509 -nodes -days 1 -newkey rsa:2048 \
    -keyout "$SCRATCH/privkey.pem" -out "$SCRATCH/fullchain.pem" \
    -subj "/CN=mywavetour.ru"
fi

docker run --rm \
  -v "$ROOT_DIR/infra/nginx/mywave.conf:/etc/nginx/conf.d/default.conf:ro" \
  -v "$SCRATCH:/etc/nginx/certs:ro" \
  nginx:1.27-alpine nginx -t

echo "verify_nginx_config: OK"
