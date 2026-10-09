#!/usr/bin/env bash
# A real restore into an owned, networkless disposable PostgreSQL; never into production.
set -Eeuo pipefail
umask 077

fail() { printf 'restore rehearsal: %s\n' "$1" >&2; exit 1; }
[[ $# == 5 ]] || fail 'usage: <app> <backup-root> <source-sha> <https-health-url> <compose-project>'
[[ ${MYWAVE_RESTORE_QA_CONFIRM:-} == isolated-copy-only ]] || fail 'explicit isolated-copy-only confirmation required'
app="$(realpath -e -- "$1")"
backup_root="$(realpath -e -- "$2")"
expected="$3"
health_url="$4"
project="$5"
[[ -d "$app" && -d "$backup_root" ]] || fail 'application/backup directory missing'
case "$app" in /|/opt|/opt/mywave|/var|/var/www|/home|/root|/srv|/tmp) fail 'broad application root' ;; esac
case "$backup_root" in /|/var|/var/backups|/opt|/home|/root|/tmp) fail 'broad backup root' ;; esac
case "$backup_root/" in "$app/"*) fail 'backup must be outside application' ;; esac
[[ "$expected" =~ ^[0-9a-f]{40}$ ]] || fail 'expected source SHA must be explicit'
[[ "$health_url" == https://* && "$health_url" != *$'\n'* ]] || fail 'HTTPS health URL required'
[[ "$project" =~ ^[a-z0-9][a-z0-9_-]*$ ]] || fail 'invalid compose project'
script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
[[ -f "$script_dir/create-source-backup.sh" ]] || fail 'validated source helper missing'
cd "$app"
dc() { docker compose --project-name "$project" --env-file .env.production -f docker-compose.production.yml "$@"; }
[[ "$(tr -d '\r\n' < .release/REVISION)" == "$expected" ]] || fail 'source revision changed'
check_health() {
  curl -4 -fsS --connect-timeout 10 --max-time 30 "$health_url" | grep -F "$expected"
}
check_health
available="$(df -B1 --output=avail . | tail -1 | tr -d ' ')"
[[ "$available" -ge 3221225472 ]] || fail 'at least 3 GiB free required'
snapshot="$(mktemp -d "$backup_root/restore-rehearsal-XXXXXXXX")"
chmod 700 "$snapshot"
owner="$(basename "$snapshot")"
container="tourism-restore-qa-$owner"
completed=0
cleanup() {
  result=$?
  trap - EXIT INT TERM HUP
  set +e
  actual_owner="$(docker inspect --format '{{index .Config.Labels "codex.restore.owner"}}' "$container" 2>/dev/null)"
  if [[ "$actual_owner" == "$owner" ]]; then
    if docker rm -f "$container" >/dev/null; then
      printf 'REMOVED_OWN_ISOLATED_RESTORE_CONTAINER=%s\n' "$container"
    else
      printf 'STOP: isolated container cleanup failed: %s\n' "$container" >&2
      result=1
    fi
  elif [[ "$completed" == 1 ]]; then
    printf 'STOP: isolated container ownership could not be confirmed\n' >&2
    result=1
  fi
  if [[ "$result" == 0 && "$completed" == 1 ]]; then
    printf 'ISOLATED_DATABASE_RESTORE_PASSED=%s\n' "$snapshot"
  else
    printf 'STOP: evidence=%s; do not restore or restart production.\n' "$snapshot" >&2
    [[ "$result" != 0 ]] || result=1
  fi
  exit "$result"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
trap 'exit 129' HUP
[[ -z "$(docker ps -aq --filter "name=^/$container$" </dev/null)" ]] || fail 'temporary container name exists'
for service in api web admin postgres reverse-proxy; do
  id="$(dc ps -q "$service" </dev/null)"
  [[ -n "$id" ]] || fail "missing production service: $service"
  printf '%s %s\n' "$service" "$id"
done > "$snapshot/container-ids-before.txt"
for path in .env.production .env services/api/.env services/api/.env.production apps/web/.env.production apps/admin/.env.production; do
  if [[ -f "$path" ]]; then sha256sum "$path"; fi
done > "$snapshot/env-before.sha256"
bash "$script_dir/create-source-backup.sh" "$app" "$snapshot/source-current.tgz" </dev/null
dc exec -T postgres sh -lc 'exec pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom' \
  </dev/null > "$snapshot/database-current.dump"
[[ -s "$snapshot/database-current.dump" ]] || fail 'empty database dump'
dc exec -T postgres pg_restore --list < "$snapshot/database-current.dump" > "$snapshot/dump-toc.txt"
(
  cd "$snapshot"
  sha256sum source-current.tgz database-current.dump > SHA256SUMS
  sha256sum -c SHA256SUMS
)
pg_id="$(dc ps -q postgres </dev/null)"
pg_image="$(docker inspect --format '{{.Image}}' "$pg_id" </dev/null)"
password="$(cat /proc/sys/kernel/random/uuid)"
docker run -d --pull never --network none --memory 256m --cpus 0.5 \
  --label codex.scope=tourism-restore-check --label "codex.restore.owner=$owner" \
  --name "$container" --tmpfs /var/lib/postgresql/data:rw,size=256m,mode=0700 \
  --env POSTGRES_USER=qa_restore_owner --env POSTGRES_DB=qa_restore \
  --env POSTGRES_PASSWORD="$password" \
  "$pg_image" postgres -c shared_buffers=16MB -c max_connections=10 \
  -c work_mem=2MB -c maintenance_work_mem=16MB -c max_parallel_workers=0 </dev/null >/dev/null
unset password
[[ "$(docker inspect --format '{{.HostConfig.NetworkMode}}' "$container" </dev/null)" == none ]] || fail 'network isolation missing'
[[ "$(docker inspect --format '{{len .HostConfig.PortBindings}}' "$container" </dev/null)" == 0 ]] || fail 'ports published'
[[ "$(docker inspect --format '{{index .Config.Labels "codex.restore.owner"}}' "$container" </dev/null)" == "$owner" ]] || fail 'container ownership mismatch'
ready=0
for attempt in $(seq 1 30); do
  if docker exec "$container" pg_isready -U qa_restore_owner -d qa_restore </dev/null >/dev/null 2>&1; then ready=1; break; fi
  sleep 2
done
[[ "$ready" == 1 ]] || fail 'isolated PostgreSQL not ready'
docker exec -i "$container" pg_restore --exit-on-error --no-owner --no-privileges \
  --username=qa_restore_owner --dbname=qa_restore \
  < "$snapshot/database-current.dump" > "$snapshot/restore.log" 2>&1
docker exec "$container" psql -U qa_restore_owner -d qa_restore -v ON_ERROR_STOP=1 -Atc \
  "SELECT jsonb_build_object('programs',(SELECT count(*) FROM programs),'organizers',(SELECT count(*) FROM organizers),'bookings',(SELECT count(*) FROM bookings),'rawItems',(SELECT count(*) FROM raw_items),'appliedMigrations',(SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL));" \
  </dev/null | tee "$snapshot/restored-counts.json"
[[ "$(docker exec "$container" psql -U qa_restore_owner -d qa_restore -Atc 'SELECT count(*) FROM programs;' </dev/null)" -gt 0 ]] || fail 'restored catalog empty'
[[ "$(docker exec "$container" psql -U qa_restore_owner -d qa_restore -Atc 'SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL;' </dev/null)" -gt 0 ]] || fail 'restored migration history empty'
while read -r service expected_id; do
  [[ "$(dc ps -q "$service" </dev/null)" == "$expected_id" ]] || fail "production container changed: $service"
  printf 'UNCHANGED_PRODUCTION_CONTAINER=%s\n' "$service"
done < "$snapshot/container-ids-before.txt"
sha256sum -c "$snapshot/env-before.sha256"
check_health
printf 'restore=passed\nproduction_unchanged=yes\nchecked_at=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$snapshot/restore-evidence.txt"
completed=1
