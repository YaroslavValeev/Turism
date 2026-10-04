#!/usr/bin/env bash
# Source/config snapshot only: database and Docker volumes require separate backups.
set -Eeuo pipefail
umask 077

fail() { printf 'source backup: %s\n' "$1" >&2; exit 1; }
[[ $# == 2 ]] || fail 'usage: create-source-backup.sh <app-directory> <archive.tgz>'
source_root="$(realpath -e -- "$1")"
[[ -d "$source_root" ]] || fail 'application directory is missing'
case "$source_root" in
  /|/opt|/opt/mywave|/var|/var/www|/home|/root|/srv)
    fail 'refusing a broad application directory' ;;
esac

archive_directory="$(realpath -e -- "$(dirname -- "$2")")"
archive="$archive_directory/$(basename -- "$2")"
case "$archive_directory/" in
  "$source_root/"*) fail 'archive must be outside the application directory' ;;
esac
[[ ! -e "$archive" && ! -L "$archive" ]] || fail 'archive already exists'

for required in package.json docker-compose.production.yml .env.production; do
  [[ -f "$source_root/$required" && ! -L "$source_root/$required" ]] ||
    fail "required file is missing or is a symlink: $required"
done
# Do not silently snapshot links instead of the actual configuration contents.
env_files=(.env.production .env services/api/.env services/api/.env.production
  apps/web/.env.production apps/admin/.env.production)
for relative in "${env_files[@]}"; do
  [[ ! -L "$source_root/$relative" ]] || fail "env symlink needs a separate backup: $relative"
done

partial=''
manifest=''
cleanup() {
  [[ -z "$partial" ]] || rm -f -- "$partial"
  [[ -z "$manifest" ]] || rm -f -- "$manifest"
}
trap cleanup EXIT
partial="$(mktemp "$archive.partial.XXXXXX")"
manifest="$(mktemp "$archive.manifest.XXXXXX")"

# Enter the resolved physical directory. Never archive only the deploy-path symlink.
# No --ignore-failed-read: an incomplete snapshot must stop deployment.
tar --exclude='*/node_modules' --exclude='*/.next' --exclude='*/dist' \
  --exclude='*/logs' --exclude='*/backups' --exclude='*/.git' \
  --exclude='*/.turbo' --exclude='*/coverage' --exclude='*/test-results' \
  -czf "$partial" -C "$source_root" .
gzip -t "$partial"
tar -tzf "$partial" > "$manifest"
for required in package.json docker-compose.production.yml .env.production; do
  # Do not use grep -q under pipefail: producers can otherwise fail with SIGPIPE.
  grep -Fx "./$required" "$manifest" >/dev/null || fail "archive lacks $required"
done
for relative in "${env_files[@]}"; do
  if [[ -f "$source_root/$relative" ]]; then
    saved_hash="$(tar -xOzf "$partial" "./$relative" | sha256sum | awk '{print $1}')"
    current_hash="$(sha256sum < "$source_root/$relative" | awk '{print $1}')"
    [[ "$saved_hash" == "$current_hash" ]] || fail "configuration changed during backup: $relative"
  fi
done
mv -T -n -- "$partial" "$archive"
[[ ! -e "$partial" ]] || fail 'archive appeared concurrently; refusing overwrite'
partial=''
printf 'release_backup=%s\n' "$archive"
