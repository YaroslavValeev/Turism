#!/usr/bin/env bash
set -euo pipefail

CONFIG=/etc/mywave-tourism/tourism.env
COMMON=/usr/local/libexec/mywave-tourism/tourism/common.sh
PROBE=/usr/local/libexec/mywave-tourism/tourism/health_probe.py

[[ -r ${COMMON} ]] || { printf 'ERROR: missing %s\n' "${COMMON}" >&2; exit 1; }
# shellcheck source=/dev/null
source "${COMMON}"

expected_hostname=$(env_require "${CONFIG}" EXPECTED_HOSTNAME)
socks_host=$(env_require "${CONFIG}" SOCKS_BRIDGE_BIND_HOST)
socks_port=$(env_require "${CONFIG}" SOCKS_BRIDGE_BIND_PORT)
api_host=$(env_require "${CONFIG}" API_BRIDGE_BIND_HOST)
api_port=$(env_require "${CONFIG}" API_BRIDGE_BIND_PORT)
status_url=$(env_require "${CONFIG}" RELAY_STATUS_URL)
container=$(env_require "${CONFIG}" API_CONTAINER_NAME)
timeout=$(env_require "${CONFIG}" HEALTH_TIMEOUT)

require_exact_hostname "${expected_hostname}"
for unit in mywave-tourism-socks-bridge.service mywave-tourism-api-bridge.service mywave-tourism-webhook-repair.timer; do
  systemctl is-active --quiet "${unit}" || die "affected service is not active: ${unit}"
done

repair_result=$(systemctl show mywave-tourism-webhook-repair.service --property=Result --value)
repair_status=$(systemctl show mywave-tourism-webhook-repair.service --property=ExecMainStatus --value)
[[ ${repair_result} == success && ${repair_status} == 0 ]] || die "webhook repair last run was not successful"

/usr/bin/python3 "${PROBE}" tourism \
  --socks-host "${socks_host}" \
  --socks-port "${socks_port}" \
  --status-url "${status_url}" \
  --api-health-url "http://${api_host}:${api_port}/health" \
  --timeout "${timeout}"

docker exec "${container}" sh -lc '
  cd /app/services/api
  node - <<'"'"'NODE'"'"'
const { callTelegramJson } = require("./dist/modules/telegram/telegramApi");

callTelegramJson(process.env, "getMe", {})
  .then((result) => {
    if (!result || result.ok !== true) process.exit(1);
    console.log("API Telegram transport: ok");
  })
  .catch(() => process.exit(1));
NODE
'
printf 'Tourism relay health: ok\n'
