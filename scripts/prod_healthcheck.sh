#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Корень репозитория = родитель каталога scripts/; на VPS при запуске вне каталога: MYWAVE_ROOT=/opt/mywave/tourism
ROOT_DIR="${MYWAVE_ROOT:-$(cd "$SCRIPT_DIR/.." && pwd)}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.production.yml}"
PUBLIC_ORIGIN="${PROD_HEALTHCHECK_PUBLIC_ORIGIN:-https://mywavetour.ru}"
PUBLIC_ORIGIN="${PUBLIC_ORIGIN%/}"
cd "$ROOT_DIR"

if [[ -f .env.production ]]; then
  DC=(docker compose --env-file .env.production -f "$COMPOSE_FILE")
else
  DC=(docker compose -f "$COMPOSE_FILE")
fi

# -4: на части VPS ответ по AAAA ломается или уходит не туда — ручной curl по IPv4 даёт 200, а без -4 скрипт мог падать на 404
CURL_EXT=(curl -4 -fsS)
CURL_EXT_I=(curl -4 -fsSI)
CURL_STATUS=(curl -4 -sS)
# Самоподписанный PEM (временный пилот): иначе curl: (60). С нормальным Let's Encrypt не задавать.
# Алиас TLS=1 — частая опечатка в консоли (канон: PROD_HEALTHCHECK_INSECURE_TLS=1).
_insecure_tls=0
case "${PROD_HEALTHCHECK_INSECURE_TLS:-0}" in 1|true|TRUE|yes|YES|on|ON) _insecure_tls=1 ;; esac
case "${TLS:-0}" in 1|true|TRUE|yes|YES|on|ON) _insecure_tls=1 ;; esac
if [[ "$_insecure_tls" == "1" ]]; then
  CURL_EXT+=(--insecure)
  CURL_EXT_I+=(--insecure)
  CURL_STATUS+=(--insecure)
  echo "prod_healthcheck: внешний HTTPS с --insecure (самоподписанный сертификат на nginx)" >&2
fi

echo "== HTTP health (канон на основном домене: /api/health) =="
_health_tmp="$(mktemp)"
trap 'rm -f "$_health_tmp"' EXIT
"${CURL_EXT[@]}" "${PUBLIC_ORIGIN}/api/health" -o "$_health_tmp"
cat "$_health_tmp"
echo
if [[ -n "${PROD_HEALTHCHECK_EXPECTED_SHA:-}" ]]; then
  if ! grep -q "\"releaseSha\"[[:space:]]*:[[:space:]]*\"${PROD_HEALTHCHECK_EXPECTED_SHA}\"" "$_health_tmp"; then
    echo "prod_healthcheck: expected /api/health releaseSha ${PROD_HEALTHCHECK_EXPECTED_SHA}" >&2
    exit 1
  fi
  echo "release identity: ok (${PROD_HEALTHCHECK_EXPECTED_SHA})"
fi
rm -f "$_health_tmp"
trap - EXIT
echo "== HTTP health short alias (/health) =="
"${CURL_EXT[@]}" "${PUBLIC_ORIGIN}/health"
echo

echo "== Public catalog (nginx /api/ → api /programs) =="
_catalog_tmp="$(mktemp)"
trap 'rm -f "$_catalog_tmp"' EXIT
"${CURL_EXT[@]}" "${PUBLIC_ORIGIN}/api/programs" -o "$_catalog_tmp"
head -c 400 "$_catalog_tmp"
echo
echo "(truncated)"

echo "== Explore hub pages =="
_explore_tmp="$(mktemp)"
_explore_links_tmp="$(mktemp)"
trap 'rm -f "$_catalog_tmp" "$_explore_tmp" "$_explore_links_tmp"' EXIT
"${CURL_EXT[@]}" "${PUBLIC_ORIGIN}/explore" -o "$_explore_tmp"
grep -o 'href="/explore/[^"?#]*' "$_explore_tmp" \
  | sed 's/^href="//' \
  | sort -u \
  | head -n "${PROD_HEALTHCHECK_EXPLORE_LINK_LIMIT:-5}" >"$_explore_links_tmp"
if [[ ! -s "$_explore_links_tmp" ]]; then
  echo "prod_healthcheck: /explore contains no /explore/* links" >&2
  exit 1
fi
while IFS= read -r _explore_path; do
  [[ -n "$_explore_path" ]] || continue
  _explore_status="$("${CURL_STATUS[@]}" -o /dev/null -w '%{http_code}' "${PUBLIC_ORIGIN}${_explore_path}")"
  echo "${_explore_path}: HTTP ${_explore_status}"
  if [[ "$_explore_status" != "200" ]]; then
    echo "prod_healthcheck: expected ${_explore_path} to return 200, got ${_explore_status}" >&2
    exit 1
  fi
done <"$_explore_links_tmp"
rm -f "$_explore_tmp" "$_explore_links_tmp"
trap 'rm -f "$_catalog_tmp"' EXIT

echo "== Booking intake contract (safe negative) =="
_booking_negative_tmp="$(mktemp)"
_booking_negative_status="$("${CURL_STATUS[@]}" -o "$_booking_negative_tmp" -w '%{http_code}' \
  -X POST "${PUBLIC_ORIGIN}/api/bookings" \
  -H 'content-type: application/json' \
  --data '{"programId":"prod-healthcheck-negative","guestContact":"prod-healthcheck@example.invalid","legalConsent":false}')"
cat "$_booking_negative_tmp"
rm -f "$_booking_negative_tmp"
echo
if [[ "$_booking_negative_status" != "400" ]]; then
  echo "prod_healthcheck: expected POST /api/bookings without legal consent to return 400, got $_booking_negative_status" >&2
  exit 1
fi
echo "booking negative: ok"

if [[ "${PROD_HEALTHCHECK_CREATE_BOOKING:-0}" == "1" ]]; then
  : "${PROD_HEALTHCHECK_BOOKING_PROGRAM_ID:?PROD_HEALTHCHECK_BOOKING_PROGRAM_ID is required when PROD_HEALTHCHECK_CREATE_BOOKING=1}"
  _booking_program_id="$PROD_HEALTHCHECK_BOOKING_PROGRAM_ID"
  if [[ "$_booking_program_id" == "auto" ]]; then
    _booking_program_id="$(grep -o '"id"[[:space:]]*:[[:space:]]*"[^"]*"' "$_catalog_tmp" | head -n 1 | sed 's/.*"id"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/')"
    if [[ -z "$_booking_program_id" ]]; then
      echo "prod_healthcheck: could not auto-select a published program id from /api/programs" >&2
      exit 1
    fi
    echo "booking auto program id: $_booking_program_id"
  fi
  _booking_contact="prod-healthcheck+$(date -u +%Y%m%dT%H%M%SZ)@example.invalid"
  _booking_payload="$(mktemp)"
  _booking_create_tmp="$(mktemp)"
  _booking_duplicate_tmp="$(mktemp)"
  trap 'rm -f "$_catalog_tmp" "$_booking_payload" "$_booking_create_tmp" "$_booking_duplicate_tmp"' EXIT
  cat >"$_booking_payload" <<JSON
{"programId":"${_booking_program_id}","guestContact":"${_booking_contact}","sourceChannel":"prod_healthcheck","sourceCampaign":"prod_healthcheck","notes":"Automated production healthcheck booking. Safe to archive after release evidence.","legalConsent":true}
JSON
  _booking_create_status="$("${CURL_STATUS[@]}" -o "$_booking_create_tmp" -w '%{http_code}' \
    -X POST "${PUBLIC_ORIGIN}/api/bookings" \
    -H 'content-type: application/json' \
    --data-binary @"$_booking_payload")"
  head -c 600 "$_booking_create_tmp"
  echo
  if [[ "$_booking_create_status" != "201" ]]; then
    echo "prod_healthcheck: expected booking create 201, got $_booking_create_status" >&2
    exit 1
  fi
  if ! grep -q '"legalConsentAt"' "$_booking_create_tmp"; then
    echo "prod_healthcheck: booking create response has no legalConsentAt" >&2
    exit 1
  fi
  _booking_duplicate_status="$("${CURL_STATUS[@]}" -o "$_booking_duplicate_tmp" -w '%{http_code}' \
    -X POST "${PUBLIC_ORIGIN}/api/bookings" \
    -H 'content-type: application/json' \
    --data-binary @"$_booking_payload")"
  cat "$_booking_duplicate_tmp"
  echo
  if [[ "$_booking_duplicate_status" != "409" ]]; then
    echo "prod_healthcheck: expected duplicate booking 409, got $_booking_duplicate_status" >&2
    exit 1
  fi
  rm -f "$_booking_payload" "$_booking_create_tmp" "$_booking_duplicate_tmp"
  trap - EXIT
  echo "booking create + duplicate: ok"
else
  echo "booking create + duplicate: skipped (set PROD_HEALTHCHECK_CREATE_BOOKING=1 and PROD_HEALTHCHECK_BOOKING_PROGRAM_ID=<id|auto>)"
fi
rm -f "$_catalog_tmp"
trap - EXIT

echo "== Home page =="
"${CURL_EXT[@]}" "${PUBLIC_ORIGIN}/" >/dev/null
echo "home: ok"

echo "== Media placeholder =="
"${CURL_EXT_I[@]}" "${PUBLIC_ORIGIN}/images/placeholders/program-card.svg" | sed -n '1,8p'

echo "== Media proxy =="
"${CURL_EXT_I[@]}" "${PUBLIC_ORIGIN}/api/media?url=https%3A%2F%2Fimages.unsplash.com%2Fphoto-1506905925346-21bda4d32df4%3Fw%3D200" | sed -n '1,8p'

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
