#!/usr/bin/env bash
# Run in an isolated Linux container; fixtures remain only in its temporary filesystem.
set -Eeuo pipefail
script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
fixture="$(mktemp -d /tmp/tourism-source-backup-test.XXXXXX)"
mkdir -p "$fixture/app with spaces/services/api" "$fixture/archives"
app="$fixture/app with spaces"
printf '{}\n' > "$app/package.json"
printf 'services: {}\n' > "$app/docker-compose.production.yml"
printf 'TEST_ONLY=value\n' > "$app/.env.production"
printf 'TEST_ONLY=root\n' > "$app/.env"
printf 'TEST_ONLY=api\n' > "$app/services/api/.env.production"
mkdir -p "$app/node_modules" "$app/apps/web/.next"
printf 'excluded\n' > "$app/node_modules/ignored"
printf 'excluded\n' > "$app/apps/web/.next/ignored"
ln -s "$app" "$fixture/tourism"

bash "$script_dir/create-source-backup.sh" "$fixture/tourism" "$fixture/archives/source.tgz"
[[ "$(tar -xOzf "$fixture/archives/source.tgz" ./.env.production)" == TEST_ONLY=value ]]
[[ "$(tar -xOzf "$fixture/archives/source.tgz" ./services/api/.env.production)" == TEST_ONLY=api ]]
[[ "$(stat -c %a "$fixture/archives/source.tgz")" == 600 ]]
entries="$(tar -tzf "$fixture/archives/source.tgz")"
if printf '%s\n' "$entries" | grep -E 'node_modules|\.next' >/dev/null; then
  echo 'FAIL: generated dependencies included' >&2; exit 1
fi
echo 'PASS: symlink root, spaces, hidden env contents, exclusions, protected permissions'

expect_failure() {
  if bash "$script_dir/create-source-backup.sh" "$1" "$2"; then
    echo 'FAIL: unsafe backup accepted' >&2; exit 1
  fi
}
hash_before="$(sha256sum "$fixture/archives/source.tgz")"
expect_failure "$app" "$fixture/archives/source.tgz"
[[ "$(sha256sum "$fixture/archives/source.tgz")" == "$hash_before" ]]
expect_failure "$app" "$app/inside.tgz"
[[ ! -e "$app/inside.tgz" ]]
expect_failure / "$fixture/archives/root.tgz"
mkdir "$fixture/missing-files"
expect_failure "$fixture/missing-files" "$fixture/archives/missing.tgz"
ln -s "$app/.env.production" "$app/services/api/.env"
expect_failure "$app" "$fixture/archives/env-link.tgz"
[[ ! -e "$fixture/archives/env-link.tgz" ]]
echo 'PASS: existing archive, nested output, broad root, missing files, env symlinks rejected'
