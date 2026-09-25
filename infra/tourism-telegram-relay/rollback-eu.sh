#!/usr/bin/env bash
set -euo pipefail

CONFIG=/etc/mywave-tourism/eu.env
MARKER=/var/lib/mywave-tourism/last-eu-backup
COMMON_INSTALLED=/usr/local/libexec/mywave-tourism/eu/common.sh
SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)

if [[ -r ${COMMON_INSTALLED} ]]; then
  # shellcheck source=/dev/null
  source "${COMMON_INSTALLED}"
else
  # shellcheck source=lib/common.sh
  source "${SCRIPT_DIR}/lib/common.sh"
fi

units=(
  mywave-tourism-socks5.service
  mywave-tourism-cloudflared.service
  mywave-tourism-relay-status.service
  tourism-wg-socks.service
  tourism-cloudflared-webhook-ingress.service
  tourism-webhook-host-status.service
  tourism-microsocks-local.service
  tourism-cloudflared-socks-server.service
)
managed=(
  /etc/mywave-tourism/eu.env
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
expected_hostname=$(env_require "${CONFIG}" EXPECTED_HOSTNAME)
require_exact_hostname "${expected_hostname}"
backup=${1:-$(snapshot_from_marker "${MARKER}")}
restore_snapshot "${backup}" "${units[@]}" -- "${managed[@]}"
printf 'EU relay rollback restored the selected snapshot.\n'
