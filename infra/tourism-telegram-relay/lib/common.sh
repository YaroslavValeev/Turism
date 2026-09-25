#!/usr/bin/env bash
set -euo pipefail

BACKUP_ROOT="/var/backups/mywave-tourism"

die() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

require_root() {
  [[ ${EUID} -eq 0 ]] || die "run as root"
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || die "required command not found: $1"
}

env_get() {
  local file=$1
  local wanted=$2
  awk -v wanted="${wanted}" '
    function trim(value) {
      sub(/^[[:space:]]+/, "", value)
      sub(/[[:space:]]+$/, "", value)
      return value
    }
    {
      line = $0
      sub(/\r$/, "", line)
      line = trim(line)
      if (line == "" || substr(line, 1, 1) == "#") next
      if (substr(line, 1, 7) == "export ") line = trim(substr(line, 8))
      equals = index(line, "=")
      if (!equals) next
      key = trim(substr(line, 1, equals - 1))
      if (key != wanted) next
      count += 1
      value = trim(substr(line, equals + 1))
      first = substr(value, 1, 1)
      last = substr(value, length(value), 1)
      if ((first == "\"" && last == "\"") || (first == "\047" && last == "\047")) {
        value = substr(value, 2, length(value) - 2)
      } else {
        sub(/[[:space:]]+#.*$/, "", value)
        value = trim(value)
      }
      found = value
    }
    END {
      if (count != 1) exit(count == 0 ? 2 : 3)
      print found
    }
  ' "${file}"
}

env_require() {
  local file=$1
  local key=$2
  local value
  if ! value=$(env_get "${file}" "${key}"); then
    die "${file} must contain exactly one ${key} assignment"
  fi
  [[ -n ${value} ]] || die "${key} must not be empty in ${file}"
  printf '%s\n' "${value}"
}

require_exact_hostname() {
  local expected=$1
  local actual
  if command -v hostnamectl >/dev/null 2>&1; then
    actual=$(hostnamectl --static 2>/dev/null || true)
  fi
  actual=${actual:-$(hostname)}
  [[ ${expected} != REPLACE_WITH_* ]] || die "EXPECTED_HOSTNAME is still a placeholder"
  [[ ${actual} == "${expected}" ]] || die "hostname guard failed: expected ${expected}, got ${actual}"
}

require_local_ipv4() {
  local expected=$1
  ip -o -4 address show | awk '{print $4}' | cut -d/ -f1 | grep -Fxq -- "${expected}" ||
    die "required local IPv4 address is absent: ${expected}"
}

require_port() {
  local value=$1
  local name=$2
  [[ ${value} =~ ^[0-9]+$ ]] && ((value >= 1 && value <= 65535)) || die "${name} must be a valid TCP port"
}

require_positive_number() {
  local value=$1
  local name=$2
  awk -v value="${value}" 'BEGIN { exit !(value ~ /^[0-9]+([.][0-9]+)?$/ && value > 0) }' ||
    die "${name} must be positive"
}

require_positive_integer() {
  local value=$1
  local name=$2
  [[ ${value} =~ ^[0-9]+$ ]] && ((value > 0)) || die "${name} must be a positive integer"
}

ensure_service_user() {
  if ! getent passwd mywave-relay >/dev/null; then
    useradd --system --user-group --no-create-home --shell /usr/sbin/nologin mywave-relay
  fi
  [[ $(id -u mywave-relay) != 0 ]] || die "mywave-relay must not be root"
}

verify_package() {
  local package_root=$1
  require_command sha256sum
  (
    cd "${package_root}"
    sha256sum --check --quiet SHA256SUMS
  ) || die "package integrity verification failed"
}

snapshot_create() {
  local role=$1
  local marker=$2
  shift 2
  local mode=units
  local -a units=()
  local -a files=()
  local item
  for item in "$@"; do
    if [[ ${item} == -- ]]; then
      mode=files
    elif [[ ${mode} == units ]]; then
      units+=("${item}")
    else
      files+=("${item}")
    fi
  done
  ((${#units[@]} > 0 && ${#files[@]} > 0)) || die "snapshot requires unit and file lists"

  local timestamp backup unit enabled active path target marker_tmp
  timestamp=$(date -u +%Y%m%dT%H%M%SZ)
  backup="${BACKUP_ROOT}/${timestamp}-${role}-$$"
  install -d -m 0700 -o root -g root "${BACKUP_ROOT}" "${backup}" "${backup}/files" "${backup}/state"
  : >"${backup}/files.list"
  : >"${backup}/absent.list"
  : >"${backup}/units.list"

  for unit in "${units[@]}"; do
    printf '%s\n' "${unit}" >>"${backup}/units.list"
    enabled=$(systemctl is-enabled "${unit}" 2>/dev/null || true)
    active=$(systemctl is-active "${unit}" 2>/dev/null || true)
    printf '%s\n' "${enabled:-not-found}" >"${backup}/state/${unit}.enabled"
    printf '%s\n' "${active:-inactive}" >"${backup}/state/${unit}.active"
  done

  for path in "${files[@]}"; do
    [[ ${path} == /* ]] || die "managed path must be absolute: ${path}"
    [[ ! -L ${path} ]] || die "refusing to replace managed symlink: ${path}"
    printf '%s\n' "${path}" >>"${backup}/files.list"
    if [[ -e ${path} ]]; then
      target="${backup}/files${path}"
      install -d -m 0700 "$(dirname "${target}")"
      cp -a -- "${path}" "${target}"
    else
      printf '%s\n' "${path}" >>"${backup}/absent.list"
    fi
  done

  install -d -m 0700 -o root -g root "$(dirname "${marker}")"
  marker_tmp="${marker}.tmp.$$"
  printf '%s\n' "${backup}" >"${marker_tmp}"
  chmod 0600 "${marker_tmp}"
  mv -f -- "${marker_tmp}" "${marker}"
  printf '%s\n' "${backup}"
}

validate_snapshot() {
  local backup=$1
  [[ ${backup} == "${BACKUP_ROOT}"/* ]] || die "backup is outside ${BACKUP_ROOT}"
  [[ -d ${backup} && ! -L ${backup} ]] || die "backup directory is invalid: ${backup}"
  [[ $(stat -c '%u' "${backup}") == 0 ]] || die "backup directory is not owned by root"
  [[ -f ${backup}/files.list && -f ${backup}/absent.list && -f ${backup}/units.list ]] ||
    die "backup manifest is incomplete"
}

snapshot_from_marker() {
  local marker=$1
  [[ -f ${marker} && ! -L ${marker} ]] || die "rollback marker is missing: ${marker}"
  local backup
  backup=$(<"${marker}")
  validate_snapshot "${backup}"
  printf '%s\n' "${backup}"
}

restore_snapshot() {
  local backup=$1
  shift
  local mode=units
  local -a units=()
  local -a files=()
  local item unit path saved enabled active
  for item in "$@"; do
    if [[ ${item} == -- ]]; then
      mode=files
    elif [[ ${mode} == units ]]; then
      units+=("${item}")
    else
      files+=("${item}")
    fi
  done
  validate_snapshot "${backup}"

  for unit in "${units[@]}"; do
    grep -Fxq -- "${unit}" "${backup}/units.list" || die "unit is absent from backup manifest: ${unit}"
  done
  for path in "${files[@]}"; do
    grep -Fxq -- "${path}" "${backup}/files.list" || die "path is absent from backup manifest: ${path}"
  done

  for unit in "${units[@]}"; do
    systemctl disable "${unit}" >/dev/null 2>&1 || true
    systemctl stop "${unit}" >/dev/null 2>&1 || true
  done

  for path in "${files[@]}"; do
    saved="${backup}/files${path}"
    if [[ -e ${saved} || -L ${saved} ]]; then
      [[ -d $(dirname "${path}") ]] || install -d -m 0755 "$(dirname "${path}")"
      rm -f -- "${path}"
      cp -a -- "${saved}" "${path}"
    elif grep -Fxq -- "${path}" "${backup}/absent.list"; then
      rm -f -- "${path}"
    else
      die "backup has no saved or absent state for ${path}"
    fi
  done

  systemctl daemon-reload
  for unit in "${units[@]}"; do
    enabled=$(<"${backup}/state/${unit}.enabled")
    active=$(<"${backup}/state/${unit}.active")
    case "${enabled}" in
      enabled|enabled-runtime|linked|linked-runtime)
        systemctl enable "${unit}" >/dev/null
        ;;
      masked|masked-runtime)
        systemctl mask "${unit}" >/dev/null
        ;;
      *)
        systemctl disable "${unit}" >/dev/null 2>&1 || true
        ;;
    esac
    if [[ ${active} == active ]]; then
      systemctl restart "${unit}"
    else
      systemctl stop "${unit}" >/dev/null 2>&1 || true
    fi
  done
}

wait_for_health() {
  local command_path=$1
  local attempts=${2:-45}
  local delay=${3:-2}
  local attempt
  for ((attempt = 1; attempt <= attempts; attempt += 1)); do
    if "${command_path}" >/dev/null 2>&1; then
      return 0
    fi
    sleep "${delay}"
  done
  "${command_path}"
}
