#!/usr/bin/env bash
set -euo pipefail

CONFIG=/etc/mywave-tourism/eu.env
COMMON=/usr/local/libexec/mywave-tourism/eu/common.sh
PROBE=/usr/local/libexec/mywave-tourism/eu/health_probe.py

[[ -r ${COMMON} ]] || { printf 'ERROR: missing %s\n' "${COMMON}" >&2; exit 1; }
# shellcheck source=/dev/null
source "${COMMON}"

expected_hostname=$(env_require "${CONFIG}" EXPECTED_HOSTNAME)
socks_host=$(env_require "${CONFIG}" SOCKS_BIND_HOST)
socks_port=$(env_require "${CONFIG}" SOCKS_BIND_PORT)
status_host=$(env_require "${CONFIG}" STATUS_BIND_HOST)
status_port=$(env_require "${CONFIG}" STATUS_BIND_PORT)
cloudflared_unit=$(env_require "${CONFIG}" STATUS_CLOUDFLARED_UNIT)
timeout=$(env_require "${CONFIG}" HEALTH_TIMEOUT)

require_exact_hostname "${expected_hostname}"
for unit in mywave-tourism-socks5.service mywave-tourism-cloudflared.service mywave-tourism-relay-status.service; do
  systemctl is-active --quiet "${unit}" || die "affected service is not active: ${unit}"
done

/usr/bin/python3 "${PROBE}" eu \
  --socks-host "${socks_host}" \
  --socks-port "${socks_port}" \
  --status-url "http://${status_host}:${status_port}/v1/status" \
  --cloudflared-unit "${cloudflared_unit}" \
  --timeout "${timeout}"
printf 'EU relay health: ok\n'
