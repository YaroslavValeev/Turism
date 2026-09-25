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
SOURCE_DIR="${ROOT}/infra/tourism-telegram-relay"
OUT_DIR="$(normalize_path "${OUT_DIR:-${ROOT}/artifacts/tourism-telegram-relay}")"
STAGE="${OUT_DIR}/stage"
ARTIFACT="${OUT_DIR}/tourism-telegram-relay.tgz"

cleanup() {
  rm -rf -- "$STAGE"
}
trap cleanup EXIT

test -d "$SOURCE_DIR"
command -v sha256sum >/dev/null 2>&1

if python3 -c 'import ast' >/dev/null 2>&1; then
  PYTHON_BIN=python3
elif python -c 'import ast' >/dev/null 2>&1; then
  PYTHON_BIN=python
else
  echo "A working Python 3 interpreter is required" >&2
  exit 1
fi

while IFS= read -r script; do
  bash -n "$script"
done < <(find "$SOURCE_DIR" -type f -name '*.sh' -print | sort)

while IFS= read -r script; do
  "$PYTHON_BIN" - "$script" <<'PY'
import ast
from pathlib import Path
import sys

ast.parse(Path(sys.argv[1]).read_text(encoding="utf-8"), filename=sys.argv[1])
PY
done < <(find "$SOURCE_DIR" -type f -name '*.py' -print | sort)

if grep -RInE --include='*' 'PrivateKey[[:space:]]*=|[0-9]{8,}:[A-Za-z0-9_-]{30,}' "$SOURCE_DIR"; then
  echo "Refusing to package a private key or Telegram token" >&2
  exit 1
fi

rm -rf "$STAGE"
mkdir -p "$STAGE"
cp -a "$SOURCE_DIR"/. "$STAGE"/

(
  cd "$STAGE"
  find . -type f ! -name SHA256SUMS -print | sort | xargs sha256sum > SHA256SUMS
  sha256sum -c SHA256SUMS
)

tar -C "$STAGE" -czf "$ARTIFACT" .
tar -tzf "$ARTIFACT" > "${OUT_DIR}/tourism-telegram-relay.files"
(
  cd "$OUT_DIR"
  sha256sum "$(basename "$ARTIFACT")" > tourism-telegram-relay.tgz.sha256
)

printf 'artifact=%s\n' "$ARTIFACT"
cat "${OUT_DIR}/tourism-telegram-relay.tgz.sha256"
