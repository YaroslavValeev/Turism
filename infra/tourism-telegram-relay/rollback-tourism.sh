#!/usr/bin/env bash
set -euo pipefail

CONFIG=/etc/mywave-tourism/tourism.env
MARKER=/var/lib/mywave-tourism/last-tourism-backup
COMMON_INSTALLED=/usr/local/libexec/mywave-tourism/tourism/common.sh
SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)

if [[ -r ${COMMON_INSTALLED} ]]; then
  # shellcheck source=/dev/null
  source "${COMMON_INSTALLED}"
else
  # shellcheck source=lib/common.sh
  source "${SCRIPT_DIR}/lib/common.sh"
fi

units=(
  mywave-tourism-socks-bridge.service
  mywave-tourism-api-bridge.service
  mywave-tourism-webhook-repair.service
  mywave-tourism-webhook-repair.timer
  tourism-wg-socks-bridge.service
  tourism-wg-api-bridge.service
  tourism-webhook-repair.service
  tourism-webhook-repair.timer
  tourism-cloudflared-socks-client.service
  tourism-egress-watchdog.timer
)
managed=(
  /etc/mywave-tourism/tourism.env
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
expected_hostname=$(env_require "${CONFIG}" EXPECTED_HOSTNAME)
require_exact_hostname "${expected_hostname}"
backup=${1:-$(snapshot_from_marker "${MARKER}")}
restore_snapshot "${backup}" "${units[@]}" -- "${managed[@]}"
printf 'Tourism relay rollback restored the selected snapshot.\n'
