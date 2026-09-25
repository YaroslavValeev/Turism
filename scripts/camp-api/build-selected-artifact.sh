#!/usr/bin/env bash
set -euo pipefail

normalize_path() {
  local path="$1"
  if command -v cygpath >/dev/null 2>&1; then
    cygpath -u "$path"
  else
    printf '%s\n' "$path"
  fi
}

ROOT="$(normalize_path "${ROOT:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}")"
OUT_DIR="$(normalize_path "${OUT_DIR:-${ROOT}/artifacts/camp-api-release}")"
STAGE="${OUT_DIR}/stage"
ARTIFACT="${OUT_DIR}/camp-api-release.tgz"

cd "$ROOT"
rm -rf "$STAGE"
mkdir -p "$STAGE"

copy_file() {
  local path="$1"
  mkdir -p "$STAGE/$(dirname "$path")"
  cp -a "$path" "$STAGE/$path"
}

copy_file .env.example
copy_file packages/config/src/env.ts
copy_file services/api/.env.example
copy_file services/api/Dockerfile
copy_file services/api/src/index.ts
mkdir -p "$STAGE/services/api/src/modules" "$STAGE/scripts"
cp -a services/api/src/modules/camp-feed "$STAGE/services/api/src/modules/camp-feed"
cp -a scripts/camp-api "$STAGE/scripts/camp-api"

(
  cd "$STAGE"
  find . -type f ! -name SHA256SUMS -print | sort | xargs sha256sum > SHA256SUMS
  sha256sum -c SHA256SUMS
)

mkdir -p "$OUT_DIR"
tar -C "$STAGE" -czf "$ARTIFACT" .
tar -tzf "$ARTIFACT" > "${OUT_DIR}/camp-api-release.files"
sha256sum "$ARTIFACT" > "${OUT_DIR}/camp-api-release.tgz.sha256"

printf 'artifact=%s\n' "$ARTIFACT"
cat "${OUT_DIR}/camp-api-release.tgz.sha256"
