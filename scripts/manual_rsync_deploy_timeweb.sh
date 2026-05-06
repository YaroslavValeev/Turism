#!/usr/bin/env bash
# Ручной выкат на Timeweb, когда GitHub Actions не достучался до VPS по SSH.
# Запускать с машины, где `ssh DEPLOY_USER@DEPLOY_HOST` уже работает (WSL, Git Bash, macOS, Linux).
# Из корня репозитория: bash scripts/manual_rsync_deploy_timeweb.sh
# infra/nginx/certs/ не копируем и не трогаем на сервере (PEM только на VPS).
#
# Переменные окружения:
#   DEPLOY_HOST       — IP или хост VPS
#   DEPLOY_USER       — пользователь SSH (например root или deploy)
#   DEPLOY_KEY_FILE   — путь к приватному ключу OpenSSH (chmod 600)
#   DEPLOY_PATH       — каталог на сервере (по умолчанию /opt/mywave/toutism)
#   DEPLOY_PORT       — SSH порт (по умолчанию 22)
#   BUILD_MODE        — incremental (по умолчанию) или full
#
# Пример:
#   export DEPLOY_HOST=1.2.3.4 DEPLOY_USER=root DEPLOY_KEY_FILE=~/.ssh/id_ed25519_timeweb
#   bash scripts/manual_rsync_deploy_timeweb.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

: "${DEPLOY_HOST:?Задайте DEPLOY_HOST}"
: "${DEPLOY_USER:?Задайте DEPLOY_USER}"
: "${DEPLOY_KEY_FILE:?Задайте DEPLOY_KEY_FILE — путь к приватному ключу}"

DEPLOY_PATH="${DEPLOY_PATH:-/opt/mywave/toutism}"
DEPLOY_PORT="${DEPLOY_PORT:-22}"
BUILD_MODE="${BUILD_MODE:-incremental}"

KEY_FILE="${DEPLOY_KEY_FILE/#\~/$HOME}"
if [[ ! -f "$KEY_FILE" ]]; then
  echo "manual_rsync_deploy: нет файла ключа: $KEY_FILE" >&2
  exit 1
fi

SSH_BASE=(ssh -4 -i "$KEY_FILE" -p "$DEPLOY_PORT" -o BatchMode=yes -o StrictHostKeyChecking=accept-new \
  -o ConnectTimeout=45 -o ConnectionAttempts=1 \
  -o ServerAliveInterval=20 -o ServerAliveCountMax=60)

echo ">>> mkdir $DEPLOY_PATH на сервере"
"${SSH_BASE[@]}" "${DEPLOY_USER}@${DEPLOY_HOST}" "mkdir -p '${DEPLOY_PATH}' && echo ssh-ok"

echo ">>> rsync -> ${DEPLOY_USER}@${DEPLOY_HOST}:${DEPLOY_PATH}/"
rsync -avz -e "ssh -4 -i ${KEY_FILE} -p ${DEPLOY_PORT} -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=45" \
  --delete \
  --exclude='.git/' \
  --exclude='node_modules/' \
  --exclude='.next/' \
  --exclude='dist/' \
  --exclude='backups/' \
  --exclude='logs/' \
  --exclude='.env' \
  --exclude='.env.*' \
  --exclude='.cursor/' \
  --exclude='.turbo/' \
  --exclude='coverage/' \
  --exclude='**/.turbo/' \
  --exclude='**/test-results/' \
  --exclude='**/*.tsbuildinfo' \
  --exclude='infra/nginx/certs/' \
  "$REPO_ROOT/" "${DEPLOY_USER}@${DEPLOY_HOST}:${DEPLOY_PATH}/"

REMOTE_CMD="set -euo pipefail; cd '${DEPLOY_PATH}';"
if [[ "$BUILD_MODE" == "full" ]]; then
  REMOTE_CMD+=" echo '>>> docker compose build --no-cache api web admin';"
  REMOTE_CMD+=" docker compose -f docker-compose.production.yml build --no-cache api web admin;"
  REMOTE_CMD+=" echo '>>> docker compose up -d api web admin reverse-proxy';"
  REMOTE_CMD+=" docker compose -f docker-compose.production.yml up -d api web admin reverse-proxy;"
else
  REMOTE_CMD+=" echo '>>> docker compose up -d --build api web admin reverse-proxy (incremental)';"
  REMOTE_CMD+=" docker compose -f docker-compose.production.yml up -d --build api web admin reverse-proxy;"
fi
REMOTE_CMD+=" docker compose -f docker-compose.production.yml ps"

echo ">>> SSH: docker compose ($BUILD_MODE)"
"${SSH_BASE[@]}" "${DEPLOY_USER}@${DEPLOY_HOST}" "$REMOTE_CMD"

echo ">>> Готово. Проверка: curl -sS -I 'https://mywavetour.ru/api/media?url=https%3A%2F%2Fimages.unsplash.com%2Fphoto-1506905925346-21bda4d32df4%3Fw%3D200'"
