#!/usr/bin/env bash
# Exercise the actual workflow's remote shell with Docker/health stubs that drain stdin.
set -Eeuo pipefail
script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
repo="$(cd "$script_dir/../.." && pwd -P)"
fixture="$(mktemp -d /tmp/tourism-deploy-stdin-test.XXXXXX)"
mkdir -p "$fixture/bin" "$fixture/app/.release" "$fixture/app/scripts"
printf 'qa-release\n' > "$fixture/app/.release/REVISION"
printf '#!/usr/bin/env bash\ncat >/dev/null\nprintf "docker %%s\\n" "$*" >> "$QA_TRACE"\n' > "$fixture/bin/docker"
chmod +x "$fixture/bin/docker"
printf '#!/usr/bin/env bash\ncat >/dev/null\nprintf "healthcheck\\n" >> "$QA_TRACE"\n' > "$fixture/app/scripts/prod_healthcheck.sh"
awk '
  { sub(/\r$/, "") }
  /<<\047REMOTE\047/ { inside=1; next }
  inside && /^          REMOTE$/ { exit }
  inside { sub(/^          /, ""); print }
' "$repo/.github/workflows/deploy-production.yml" > "$fixture/remote.sh"
test -s "$fixture/remote.sh"
bash -n "$fixture/remote.sh"

# Demonstrate that the unguarded heredoc can falsely exit successfully before gates.
sed 's@ </dev/null@@g; s@ -T --interactive=false@@g' "$fixture/remote.sh" > "$fixture/unguarded.sh"
PATH="$fixture/bin:$PATH" QA_TRACE="$fixture/unguarded.trace" \
  DEPLOY_PATH="$fixture/app" DEPLOY_MODE=full BUILD_MODE=incremental \
  EXPECTED_SHA=qa-release bash -s < "$fixture/unguarded.sh" > "$fixture/unguarded.output"
if grep -Fx release_sha=qa-release "$fixture/unguarded.output" >/dev/null; then
  echo 'FAIL: stdin-draining fixture did not reproduce missing release gates' >&2; exit 1
fi
echo 'PASS: unguarded stdin reproduces a green exit with missing release gates'

for mode in full incremental web_only; do
  deploy_mode=full
  build_mode="$mode"
  if [[ "$mode" == web_only ]]; then deploy_mode=web_only; build_mode=incremental; fi
  PATH="$fixture/bin:$PATH" QA_TRACE="$fixture/$mode.trace" \
    DEPLOY_PATH="$fixture/app" DEPLOY_MODE="$deploy_mode" BUILD_MODE="$build_mode" \
    EXPECTED_SHA=qa-release bash -s < "$fixture/remote.sh" > "$fixture/$mode.output"
  grep -Fx healthcheck "$fixture/$mode.trace" >/dev/null
  grep -Fx release_sha=qa-release "$fixture/$mode.output" >/dev/null
  if [[ "$mode" != web_only ]]; then
    grep -F 'audit:ingestion-trace' "$fixture/$mode.trace" >/dev/null
    grep -F 'audit:pilot-readiness' "$fixture/$mode.trace" >/dev/null
    grep -F -- 'run --rm -T --interactive=false' "$fixture/$mode.trace" >/dev/null
  fi
  printf 'PASS: %s reaches health/audit/release gates despite stdin-draining children\n' "$mode"
done
