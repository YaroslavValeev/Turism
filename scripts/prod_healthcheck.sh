#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Корень репозитория = родитель каталога scripts/; на VPS при запуске вне каталога: MYWAVE_ROOT=/opt/mywave/tourism
ROOT_DIR="${MYWAVE_ROOT:-$(cd "$SCRIPT_DIR/.." && pwd)}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.production.yml}"
cd "$ROOT_DIR"

if [[ -f .env.production ]]; then
  DC=(docker compose --env-file .env.production -f "$COMPOSE_FILE")
else
  DC=(docker compose -f "$COMPOSE_FILE")
fi

# -4: на части VPS ответ по AAAA ломается или уходит не туда — ручной curl по IPv4 даёт 200, а без -4 скрипт мог падать на 404
CURL_EXT=(curl -4 -fsS)
CURL_EXT_I=(curl -4 -fsSI)
# Самоподписанный PEM (временный пилот): иначе curl: (60). С нормальным Let's Encrypt не задавать.
# Алиас TLS=1 — частая опечатка в консоли (канон: PROD_HEALTHCHECK_INSECURE_TLS=1).
_insecure_tls=0
case "${PROD_HEALTHCHECK_INSECURE_TLS:-0}" in 1|true|TRUE|yes|YES|on|ON) _insecure_tls=1 ;; esac
case "${TLS:-0}" in 1|true|TRUE|yes|YES|on|ON) _insecure_tls=1 ;; esac
if [[ "$_insecure_tls" == "1" ]]; then
  CURL_EXT+=(--insecure)
  CURL_EXT_I+=(--insecure)
  echo "prod_healthcheck: внешний HTTPS с --insecure (самоподписанный сертификат на nginx)" >&2
fi

echo "== HTTP health (канон на основном домене: /api/health) =="
"${CURL_EXT[@]}" https://mywavetour.ru/api/health
echo
echo "== HTTP health short alias (/health) =="
"${CURL_EXT[@]}" https://mywavetour.ru/health
echo

echo "== Public catalog (nginx /api/ → api /programs) =="
"${CURL_EXT[@]}" https://mywavetour.ru/api/programs | head -c 400
echo
echo "(truncated)"

echo "== Home page =="
"${CURL_EXT[@]}" https://mywavetour.ru/ >/dev/null
echo "home: ok"

echo "== Media placeholder =="
"${CURL_EXT_I[@]}" https://mywavetour.ru/images/placeholders/program-card.svg | sed -n '1,8p'

echo "== Media proxy =="
"${CURL_EXT_I[@]}" 'https://mywavetour.ru/api/media?url=https%3A%2F%2Fimages.unsplash.com%2Fphoto-1506905925346-21bda4d32df4%3Fw%3D200' | sed -n '1,8p'

echo "== Docker status =="
"${DC[@]}" ps

echo "== Disk =="
df -h

echo "== Memory =="
free -m

echo "== Recent 5xx nginx logs =="
"${DC[@]}" logs --tail=200 reverse-proxy | grep -E ' 5[0-9][0-9] ' || true

echo "== Recent api errors =="
"${DC[@]}" logs --tail=200 api | grep -Ei 'error|exception|unhandled| 500 ' || true

echo "prod_healthcheck: OK"
