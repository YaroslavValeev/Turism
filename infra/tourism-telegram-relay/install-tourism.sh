#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"

CONFIG_DIR=/etc/mywave-tourism
CONFIG=${CONFIG_DIR}/tourism.env
MARKER=/var/lib/mywave-tourism/last-tourism-backup
new_units=(mywave-tourism-socks-bridge.service mywave-tourism-api-bridge.service mywave-tourism-webhook-repair.service mywave-tourism-webhook-repair.timer)
legacy_units=(
  tourism-wg-socks-bridge.service
  tourism-wg-api-bridge.service
  tourism-webhook-repair.service
  tourism-webhook-repair.timer
  tourism-cloudflared-socks-client.service
  tourism-egress-watchdog.timer
)
units=("${new_units[@]}" "${legacy_units[@]}")
managed=(
  "${CONFIG}"
  /usr/local/libexec/mywave-tourism/tourism/common.sh
  /usr/local/libexec/mywave-tourism/tourism/tcp_bridge.py
  /usr/local/libexec/mywave-tourism/tourism/webhook_ingress.py
  /usr/local/libexec/mywave-tourism/tourism/webhook_repair.py
  /usr/local/libexec/mywave-tourism/tourism/health_probe.py
  /usr/local/sbin/mywave-tourism-health-tourism
  /usr/local/sbin/mywave-tourism-rollback-tourism
  /usr/local/share/mywave-tourism/tourism.VERSION
  /etc/systemd/system/mywave-tourism-socks-bridge.service
  /etc/systemd/system/mywave-tourism-api-bridge.service
  /etc/systemd/system/mywave-tourism-webhook-repair.service
  /etc/systemd/system/mywave-tourism-webhook-repair.timer
)

require_root
for command in awk cut docker getent grep hostname ip python3 sha256sum systemctl systemd-analyze useradd wg; do
  require_command "${command}"
done
verify_package "${SCRIPT_DIR}"
ensure_service_user
install -d -m 0750 -o root -g mywave-relay "${CONFIG_DIR}"
if [[ ! -e ${CONFIG} ]]; then
  install -m 0640 -o root -g mywave-relay "${SCRIPT_DIR}/config/tourism.env.example" "${CONFIG}"
  die "created ${CONFIG}; set EXPECTED_HOSTNAME and rerun"
fi
[[ -f ${CONFIG} && ! -L ${CONFIG} ]] || die "${CONFIG} must be a regular file"

expected_hostname=$(env_require "${CONFIG}" EXPECTED_HOSTNAME)
socks_host=$(env_require "${CONFIG}" SOCKS_BRIDGE_BIND_HOST)
socks_port=$(env_require "${CONFIG}" SOCKS_BRIDGE_BIND_PORT)
socks_target_port=$(env_require "${CONFIG}" SOCKS_BRIDGE_TARGET_PORT)
api_host=$(env_require "${CONFIG}" API_BRIDGE_BIND_HOST)
api_port=$(env_require "${CONFIG}" API_BRIDGE_BIND_PORT)
container=$(env_require "${CONFIG}" API_CONTAINER_NAME)
container_port=$(env_require "${CONFIG}" API_CONTAINER_PORT)
api_network=$(env_require "${CONFIG}" API_DOCKER_NETWORK)
health_path=$(env_require "${CONFIG}" API_HEALTH_PATH)
webhook_path=$(env_require "${CONFIG}" API_WEBHOOK_PATH)
max_body=$(env_require "${CONFIG}" API_MAX_BODY_BYTES)
max_response=$(env_require "${CONFIG}" API_MAX_RESPONSE_BYTES)
max_connections=$(env_require "${CONFIG}" API_MAX_CONNECTIONS)
env_root=$(env_require "${CONFIG}" WEBHOOK_ENV_ROOT)
env_files=$(env_require "${CONFIG}" WEBHOOK_ENV_FILES)
api_origin=$(env_require "${CONFIG}" TELEGRAM_API_ORIGIN)
require_exact_hostname "${expected_hostname}"
require_local_ipv4 "${socks_host}"
require_local_ipv4 "${api_host}"
wg show wg0 >/dev/null 2>&1 || die "WireGuard interface wg0 is not active"
require_port "${socks_port}" SOCKS_BRIDGE_BIND_PORT
require_port "${socks_target_port}" SOCKS_BRIDGE_TARGET_PORT
require_port "${api_port}" API_BRIDGE_BIND_PORT
require_port "${container_port}" API_CONTAINER_PORT
[[ ${health_path} == /health ]] || die "API_HEALTH_PATH must be /health"
[[ ${webhook_path} == /public/telegram/webhook ]] || die "API_WEBHOOK_PATH must be /public/telegram/webhook"
require_positive_integer "${max_body}" API_MAX_BODY_BYTES
require_positive_integer "${max_response}" API_MAX_RESPONSE_BYTES
require_positive_integer "${max_connections}" API_MAX_CONNECTIONS
[[ $(docker inspect --format '{{.State.Running}}' "${container}" 2>/dev/null) == true ]] || die "target API container is not running"
docker_network=$(env_require "${CONFIG}" DOCKER_NETWORK)
[[ ${api_network} == "${docker_network}" ]] || die "API_DOCKER_NETWORK must equal DOCKER_NETWORK"
gateway=$(docker network inspect "${docker_network}" --format '{{(index .IPAM.Config 0).Gateway}}' 2>/dev/null) || die "cannot inspect Docker network ${docker_network}"
[[ ${gateway} == "${socks_host}" ]] || die "SOCKS bridge bind host must equal the ${docker_network} gateway (${gateway})"
python3 "${SCRIPT_DIR}/bin/webhook_repair.py" \
  --env-root "${env_root}" \
  --env-files "${env_files}" \
  --telegram-api-origin "${api_origin}" \
  --validate-env \
  --expected-api-proxy "socks5://${socks_host}:${socks_port}"
python3 -m py_compile "${SCRIPT_DIR}/bin/tcp_bridge.py" "${SCRIPT_DIR}/bin/webhook_ingress.py" "${SCRIPT_DIR}/bin/webhook_repair.py" "${SCRIPT_DIR}/bin/health_probe.py"

backup=$(snapshot_create tourism "${MARKER}" "${units[@]}" -- "${managed[@]}")
rollback_pending=true
on_exit() {
  local rc=$?
  if [[ ${rollback_pending} == true ]]; then
    printf 'Install failed; restoring previous Tourism relay snapshot.\n' >&2
    set +e
    restore_snapshot "${backup}" "${units[@]}" -- "${managed[@]}"
  fi
  exit "${rc}"
}
trap on_exit EXIT

install -d -m 0755 /usr/local/libexec/mywave-tourism/tourism /usr/local/sbin /usr/local/share/mywave-tourism /etc/systemd/system
chown root:mywave-relay "${CONFIG}"
chmod 0640 "${CONFIG}"
install -m 0755 "${SCRIPT_DIR}/lib/common.sh" /usr/local/libexec/mywave-tourism/tourism/common.sh
install -m 0755 "${SCRIPT_DIR}/bin/tcp_bridge.py" /usr/local/libexec/mywave-tourism/tourism/tcp_bridge.py
install -m 0755 "${SCRIPT_DIR}/bin/webhook_ingress.py" /usr/local/libexec/mywave-tourism/tourism/webhook_ingress.py
install -m 0755 "${SCRIPT_DIR}/bin/webhook_repair.py" /usr/local/libexec/mywave-tourism/tourism/webhook_repair.py
install -m 0755 "${SCRIPT_DIR}/bin/health_probe.py" /usr/local/libexec/mywave-tourism/tourism/health_probe.py
install -m 0755 "${SCRIPT_DIR}/health-tourism.sh" /usr/local/sbin/mywave-tourism-health-tourism
install -m 0755 "${SCRIPT_DIR}/rollback-tourism.sh" /usr/local/sbin/mywave-tourism-rollback-tourism
install -m 0644 "${SCRIPT_DIR}/VERSION" /usr/local/share/mywave-tourism/tourism.VERSION
for unit in "${new_units[@]}"; do
  install -m 0644 "${SCRIPT_DIR}/systemd/${unit}" "/etc/systemd/system/${unit}"
done
systemctl daemon-reload
systemd-analyze verify "${new_units[@]/#//etc/systemd/system/}"
for unit in "${legacy_units[@]}"; do
  systemctl disable --now "${unit}" >/dev/null 2>&1 || true
done
systemctl enable mywave-tourism-socks-bridge.service mywave-tourism-api-bridge.service mywave-tourism-webhook-repair.timer
systemctl restart mywave-tourism-socks-bridge.service mywave-tourism-api-bridge.service
systemctl start mywave-tourism-webhook-repair.service
systemctl restart mywave-tourism-webhook-repair.timer
wait_for_health /usr/local/sbin/mywave-tourism-health-tourism 30 2

rollback_pending=false
trap - EXIT
printf 'Tourism relay installation complete; backup snapshot retained.\n'
