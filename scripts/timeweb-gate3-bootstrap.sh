#!/usr/bin/env bash
# Gate 3 (Timeweb): подготовка хоста под docker-compose.production.yml
# Запускать ТОЛЬКО в [Timeweb → Serial console] под root.
# Секреты сюда не вносить — только после клонирования заполняете .env.production вручную.

set -euo pipefail

echo "==> swap 4G (если ещё нет)"
if ! swapon --show | grep -q '/swapfile'; then
  fallocate -l 4G /swapfile 2>/dev/null || dd if=/dev/zero of=/swapfile bs=1M count=4096
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi
free -h

echo "==> Docker CE + compose plugin"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y ca-certificates curl gnupg git htop unzip jq
install -m 0755 -d /etc/apt/keyrings
if [[ ! -f /etc/apt/keyrings/docker.gpg ]]; then
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg
fi
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "${VERSION_CODENAME}") stable" \
  > /etc/apt/sources.list.d/docker.list
apt-get update -y
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
docker --version
docker compose version

echo "==> каталог приложения"
mkdir -p /opt/mywave
echo "Дальше вручную: cd /opt/mywave && git clone <ваш репо> tourism && cd tourism"
echo "После клонирования запустите снова этот скрипт с аргументом пути к репо:"
echo "  bash scripts/timeweb-gate3-bootstrap.sh /opt/mywave/tourism"

REPO_ROOT="${1:-}"
if [[ -n "${REPO_ROOT}" ]]; then
  if [[ ! -f "${REPO_ROOT}/docker-compose.production.yml" ]]; then
    echo "Ошибка: не найден ${REPO_ROOT}/docker-compose.production.yml"
    exit 1
  fi
  echo "==> самоподписанный TLS для первого старта nginx (потом замените на Let's Encrypt)"
  mkdir -p "${REPO_ROOT}/infra/nginx/certs"
  openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -keyout "${REPO_ROOT}/infra/nginx/certs/privkey.pem" \
    -out "${REPO_ROOT}/infra/nginx/certs/fullchain.pem" \
    -subj "/CN=mywavetour.ru"
  chmod 600 "${REPO_ROOT}/infra/nginx/certs/privkey.pem"
  chmod 644 "${REPO_ROOT}/infra/nginx/certs/fullchain.pem"
  ls -la "${REPO_ROOT}/infra/nginx/certs"
  echo "Создайте корневые env-файлы (см. docs/deployment/TIMEWEB_PRODUCTION_BASELINE.md), затем:"
  echo "  cd ${REPO_ROOT} && docker compose -f docker-compose.production.yml --env-file .env.production config"
  echo "  cd ${REPO_ROOT} && docker compose -f docker-compose.production.yml --env-file .env.production up -d --build"
fi
