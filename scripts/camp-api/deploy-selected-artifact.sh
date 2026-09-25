#!/usr/bin/env bash
set -euo pipefail

: "${OWNER_GO:?Set OWNER_GO=1 only after explicit Owner GO}"
[ "$OWNER_GO" = "1" ] || { echo "OWNER_GO must be 1" >&2; exit 1; }

EXPECTED_HOSTNAME="${EXPECTED_HOSTNAME:-msk-1-vm-9j6k}"
DEPLOY_PATH="${DEPLOY_PATH:-/opt/mywave/toutism}"
ARTIFACT="${ARTIFACT:-/tmp/camp-api-release.tgz}"
ROTATE_CAMP_TOKEN="${ROTATE_CAMP_TOKEN:-false}"
BUILD_MODE="${BUILD_MODE:-incremental}"
ENV_FILE="${ENV_FILE:-.env.production}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.production.yml}"

if [ "$(hostname)" != "$EXPECTED_HOSTNAME" ]; then
  echo "WRONG SERVER: $(hostname), expected ${EXPECTED_HOSTNAME}" >&2
  exit 1
fi

cd "$DEPLOY_PATH"
test -f "$COMPOSE_FILE"
test -s "$ARTIFACT"

VERIFY_DIR="/tmp/camp-api-release-verify"
rm -rf "$VERIFY_DIR"
mkdir -p "$VERIFY_DIR"
tar -xzf "$ARTIFACT" -C "$VERIFY_DIR"
(cd "$VERIFY_DIR" && sha256sum -c SHA256SUMS)

BACKUP_PATH="/tmp/camp-api-selected-backup-$(date +%Y%m%d%H%M%S).tgz"
tar -czf "$BACKUP_PATH" --ignore-failed-read \
  .env.example \
  packages/config/src/env.ts \
  services/api/.env.example \
  services/api/Dockerfile \
  services/api/src/index.ts \
  services/api/src/modules/camp-feed \
  scripts/camp-api
printf '%s\n' "$BACKUP_PATH" > /tmp/camp-api-selected-backup.latest
echo "backup: $BACKUP_PATH"

tar -xzf "$ARTIFACT" -C "$DEPLOY_PATH" --exclude=SHA256SUMS

grep -R 'router.get("/api/v1/camps"' -n services/api/src/modules/camp-feed/routes.ts
grep -R 'router.get("/api/v1/camps/health"' -n services/api/src/modules/camp-feed/routes.ts
grep -R 'router.get("/camps-feed.json"' -n services/api/src/modules/camp-feed/routes.ts
grep -R 'content_rights_status' -n services/api/src/modules/camp-feed/mapper.ts

if [ "$ROTATE_CAMP_TOKEN" = "true" ]; then
  umask 077
  cp -a services/api/.env.production "services/api/.env.production.bak.$(date +%Y%m%d%H%M%S)"
  NEW_CAMP_API_TOKEN="$(openssl rand -hex 32)"
  if grep -q '^CAMP_API_TOKEN=' services/api/.env.production; then
    sed -i "s|^CAMP_API_TOKEN=.*|CAMP_API_TOKEN=${NEW_CAMP_API_TOKEN}|" services/api/.env.production
  else
    printf '\nCAMP_API_TOKEN=%s\n' "$NEW_CAMP_API_TOKEN" >> services/api/.env.production
  fi
  printf '%s\n' "$NEW_CAMP_API_TOKEN" > /root/CAMP_API_TOKEN.current
  chmod 600 /root/CAMP_API_TOKEN.current
  unset NEW_CAMP_API_TOKEN
  echo "CAMP_API_TOKEN rotated; value saved only on VPS"
else
  echo "CAMP_API_TOKEN rotation skipped"
  test -s /root/CAMP_API_TOKEN.current || grep '^CAMP_API_TOKEN=' services/api/.env.production | tail -n1 | cut -d= -f2- | tr -d '"' > /root/CAMP_API_TOKEN.current
  chmod 600 /root/CAMP_API_TOKEN.current
fi

if [ "$BUILD_MODE" = "full" ]; then
  docker compose --progress=plain --env-file "$ENV_FILE" -f "$COMPOSE_FILE" build --no-cache api
else
  docker compose --progress=plain --env-file "$ENV_FILE" -f "$COMPOSE_FILE" build api
fi

docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d --no-deps api reverse-proxy
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" ps api reverse-proxy

CAMP_API_TOKEN="$(cat /root/CAMP_API_TOKEN.current)"
curl -kfsS --resolve api.mywavetour.ru:443:127.0.0.1 \
  -H "Authorization: Bearer ${CAMP_API_TOKEN}" \
  "https://api.mywavetour.ru/api/v1/camps?status=published&sports=wakesurf,wakeboard&audience=ru&limit=5&offset=0" \
  -o /tmp/mywave-camps-sample.json

curl -ksS --resolve api.mywavetour.ru:443:127.0.0.1 \
  -o /tmp/camp-api-unauthorized.out \
  -w '%{http_code}' \
  "https://api.mywavetour.ru/api/v1/camps" | grep -qx '401'

curl -kfsS --resolve api.mywavetour.ru:443:127.0.0.1 \
  -H "Authorization: Bearer ${CAMP_API_TOKEN}" \
  "https://api.mywavetour.ru/api/v1/camps/health" \
  -o /tmp/camp-api-health.json
unset CAMP_API_TOKEN

python3 - <<'PY'
import json
for path in ["/tmp/mywave-camps-sample.json", "/tmp/camp-api-health.json"]:
    data = json.load(open(path, encoding="utf-8"))
    assert isinstance(data, dict), path
print("camp-api deploy smoke: ok")
PY
