#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"

CONFIG_DIR=/etc/mywave-tourism
CONFIG=${CONFIG_DIR}/eu.env
MARKER=/var/lib/mywave-tourism/last-eu-backup
new_units=(mywave-tourism-socks5.service mywave-tourism-cloudflared.service mywave-tourism-relay-status.service)
legacy_units=(
  tourism-wg-socks.service
  tourism-cloudflared-webhook-ingress.service
  tourism-webhook-host-status.service
  tourism-microsocks-local.service
  tourism-cloudflared-socks-server.service
)
units=("${new_units[@]}" "${legacy_units[@]}")
managed=(
  "${CONFIG}"
  /usr/local/libexec/mywave-tourism/eu/common.sh
  /usr/local/libexec/mywave-tourism/eu/socks5_server.py
  /usr/local/libexec/mywave-tourism/eu/relay_status.py
  /usr/local/libexec/mywave-tourism/eu/health_probe.py
  /usr/local/sbin/mywave-tourism-health-eu
  /usr/local/sbin/mywave-tourism-rollback-eu
  /usr/local/share/mywave-tourism/eu.VERSION
  /etc/systemd/system/mywave-tourism-socks5.service
  /etc/systemd/system/mywave-tourism-cloudflared.service
  /etc/systemd/system/mywave-tourism-relay-status.service
)

require_root
for command in awk cloudflared cut getent grep hostname ip journalctl python3 sha256sum systemctl systemd-analyze useradd usermod wg; do
  require_command "${command}"
done
verify_package "${SCRIPT_DIR}"
ensure_service_user
getent group systemd-journal >/dev/null || die "systemd-journal group is missing"
usermod -a -G systemd-journal mywave-relay
install -d -m 0750 -o root -g mywave-relay "${CONFIG_DIR}"
if [[ ! -e ${CONFIG} ]]; then
  install -m 0640 -o root -g mywave-relay "${SCRIPT_DIR}/config/eu.env.example" "${CONFIG}"
  die "created ${CONFIG}; set EXPECTED_HOSTNAME and rerun"
fi
[[ -f ${CONFIG} && ! -L ${CONFIG} ]] || die "${CONFIG} must be a regular file"

expected_hostname=$(env_require "${CONFIG}" EXPECTED_HOSTNAME)
socks_host=$(env_require "${CONFIG}" SOCKS_BIND_HOST)
socks_port=$(env_require "${CONFIG}" SOCKS_BIND_PORT)
status_host=$(env_require "${CONFIG}" STATUS_BIND_HOST)
status_port=$(env_require "${CONFIG}" STATUS_BIND_PORT)
allowed_clients=$(env_require "${CONFIG}" SOCKS_ALLOWED_CLIENTS)
allowed_ports=$(env_require "${CONFIG}" SOCKS_ALLOWED_PORTS)
max_connections=$(env_require "${CONFIG}" SOCKS_MAX_CONNECTIONS)
origin_url=$(env_require "${CONFIG}" CLOUDFLARED_ORIGIN_URL)
protocol=$(env_require "${CONFIG}" CLOUDFLARED_PROTOCOL)
edge_ip_version=$(env_require "${CONFIG}" CLOUDFLARED_EDGE_IP_VERSION)
require_exact_hostname "${expected_hostname}"
require_local_ipv4 "${socks_host}"
require_local_ipv4 "${status_host}"
require_port "${socks_port}" SOCKS_BIND_PORT
require_port "${status_port}" STATUS_BIND_PORT
require_positive_integer "${max_connections}" SOCKS_MAX_CONNECTIONS
[[ ${allowed_clients} == *10.77.0.2* ]] || die "SOCKS_ALLOWED_CLIENTS must include the Tourism WireGuard IP"
[[ ${allowed_ports} == 443 ]] || die "SOCKS_ALLOWED_PORTS must be restricted to 443"
wg show wg0 >/dev/null 2>&1 || die "WireGuard interface wg0 is not active"
[[ ${origin_url} == http://* ]] || die "CLOUDFLARED_ORIGIN_URL must use private HTTP"
[[ ${protocol} == http2 ]] || die "CLOUDFLARED_PROTOCOL must be http2"
[[ ${edge_ip_version} == 4 ]] || die "CLOUDFLARED_EDGE_IP_VERSION must be 4"
python3 -m py_compile "${SCRIPT_DIR}/bin/socks5_server.py" "${SCRIPT_DIR}/bin/relay_status.py" "${SCRIPT_DIR}/bin/health_probe.py"

backup=$(snapshot_create eu "${MARKER}" "${units[@]}" -- "${managed[@]}")
rollback_pending=true
on_exit() {
  local rc=$?
  if [[ ${rollback_pending} == true ]]; then
    printf 'Install failed; restoring previous EU relay snapshot.\n' >&2
    set +e
    restore_snapshot "${backup}" "${units[@]}" -- "${managed[@]}"
  fi
  exit "${rc}"
}
trap on_exit EXIT

install -d -m 0755 /usr/local/libexec/mywave-tourism/eu /usr/local/sbin /usr/local/share/mywave-tourism /etc/systemd/system
chown root:mywave-relay "${CONFIG}"
chmod 0640 "${CONFIG}"
install -m 0755 "${SCRIPT_DIR}/lib/common.sh" /usr/local/libexec/mywave-tourism/eu/common.sh
install -m 0755 "${SCRIPT_DIR}/bin/socks5_server.py" /usr/local/libexec/mywave-tourism/eu/socks5_server.py
install -m 0755 "${SCRIPT_DIR}/bin/relay_status.py" /usr/local/libexec/mywave-tourism/eu/relay_status.py
install -m 0755 "${SCRIPT_DIR}/bin/health_probe.py" /usr/local/libexec/mywave-tourism/eu/health_probe.py
install -m 0755 "${SCRIPT_DIR}/health-eu.sh" /usr/local/sbin/mywave-tourism-health-eu
install -m 0755 "${SCRIPT_DIR}/rollback-eu.sh" /usr/local/sbin/mywave-tourism-rollback-eu
install -m 0644 "${SCRIPT_DIR}/VERSION" /usr/local/share/mywave-tourism/eu.VERSION
for unit in "${new_units[@]}"; do
  install -m 0644 "${SCRIPT_DIR}/systemd/${unit}" "/etc/systemd/system/${unit}"
done
systemctl daemon-reload
systemd-analyze verify "${new_units[@]/#//etc/systemd/system/}"
for unit in "${legacy_units[@]}"; do
  systemctl disable --now "${unit}" >/dev/null 2>&1 || true
done
systemctl enable "${new_units[@]}"
systemctl restart "${new_units[@]}"
wait_for_health /usr/local/sbin/mywave-tourism-health-eu 45 2

rollback_pending=false
trap - EXIT
printf 'EU relay installation complete; backup snapshot retained.\n'
