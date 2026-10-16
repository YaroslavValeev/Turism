#!/usr/bin/env bash
# Immutable, web-only release. Run on the production host; never runs API or DB jobs.
set -Eeuo pipefail
umask 077

fail() { printf 'web-carousel: %s\n' "$*" >&2; exit 1; }
mw_root='' mw_release='' mw_origin='' mw_heli_sha='' mw_rollback='' mw_backup='' mw_smoke='' mw_activated=0
while [[ $# -gt 0 ]]; do
  [[ $# -ge 2 ]] || fail 'every option requires a value'
  case "$1" in
    --root) mw_root=$2 ;; --release) mw_release=$2 ;; --origin) mw_origin=$2 ;;
    --heli-sha) mw_heli_sha=$2 ;; --rollback) mw_rollback=$2 ;; *) fail "unknown option: $1" ;;
  esac
  shift 2
done
for mw_tool in docker curl python3 tar sha256sum realpath flock stat id install df awk cmp grep seq gzip; do command -v "$mw_tool" >/dev/null || fail "missing tool: $mw_tool"; done
[[ $(id -u) == 0 ]] || fail 'run as root (or with sudo)'
mw_script=$(realpath -e -- "${BASH_SOURCE[0]}")

if [[ -n "$mw_rollback" ]]; then
  mw_rollback=$(realpath -e -- "$mw_rollback")
  [[ "$mw_rollback" == /var/backups/mywave-tourism/web-carousel-*/state.json ]] || fail 'rollback state must be in a web-carousel backup'
  [[ $(stat -c '%u' "$mw_rollback") == 0 ]] || fail 'rollback state must be root-owned'
  mw_backup=$(dirname -- "$mw_rollback")
  python3 - "$mw_rollback" >"$mw_backup/rollback-fields" <<'PY'
import json, re, sys
s = json.load(open(sys.argv[1]))
for key in ('root', 'origin', 'rollback_image', 'project'):
    value = s[key]
    if not isinstance(value, str) or not value or '\n' in value or '\r' in value:
        raise SystemExit('invalid rollback field')
    if key == 'rollback_image' and not re.fullmatch(r'tourism-web-rollback:[a-zA-Z0-9_.-]+', value):
        raise SystemExit('invalid rollback image')
    print(value)
PY
  mapfile -t mw_fields <"$mw_backup/rollback-fields"
  mw_root=${mw_fields[0]} mw_origin=${mw_fields[1]} mw_old_image=${mw_fields[2]} mw_saved_project=${mw_fields[3]}
else
  [[ "$mw_release" =~ ^[0-9a-f]{40}$ ]] || fail '--release requires an exact 40-character commit SHA'
  [[ "$mw_heli_sha" =~ ^[0-9a-f]{64}$ ]] || fail '--heli-sha requires the approved asset SHA-256'
fi
[[ -n "$mw_root" && -n "$mw_origin" ]] || fail '--root and --origin are required'
mw_root=$(realpath -e -- "$mw_root")
case "$mw_root" in /|/opt|/opt/mywave|/var|/var/www|/root|/srv|/home) fail 'application root is too broad' ;; esac
for mw_file in package.json docker-compose.production.yml .env.production infra/nginx/mywave.conf; do
  [[ -f "$mw_root/$mw_file" && ! -L "$mw_root/$mw_file" ]] || fail "required regular file is missing: $mw_file"
done
python3 - "$mw_root/package.json" <<'PY'
import json, sys
if json.load(open(sys.argv[1])).get('name') != 'mywave-travel':
    raise SystemExit('wrong application root')
PY
mw_host=$(python3 - "$mw_origin" <<'PY'
from urllib.parse import urlsplit
import sys
u = urlsplit(sys.argv[1])
if u.scheme != 'https' or not u.hostname or u.username or u.password or u.query or u.fragment or u.path not in ('', '/') or u.port not in (None, 443):
    raise SystemExit('origin must be a plain HTTPS origin on port 443')
print(u.hostname)
PY
)
mw_origin=${mw_origin%/}
for mw_directory in /var/backups/mywave-tourism /var/lib/mywave-tourism; do
  if [[ -e "$mw_directory" ]]; then
    [[ -d "$mw_directory" && ! -L "$mw_directory" && $(stat -c '%u' "$mw_directory") == 0 ]] || fail 'release metadata directory must be a root-owned regular directory'
  else
    install -m 700 -d "$mw_directory"
  fi
done
exec 9>/var/lib/mywave-tourism/web-carousel.lock
flock -n 9 || fail 'another web-carousel operation is running'
MW_DC=(docker compose --project-directory "$mw_root" --env-file "$mw_root/.env.production" -f "$mw_root/docker-compose.production.yml")
mw_web=$("${MW_DC[@]}" ps -q web)
[[ -n "$mw_web" && "$mw_web" != *$'\n'* ]] || fail 'expected one running web container'
mw_project=$(docker inspect "$mw_web" --format '{{ index .Config.Labels "com.docker.compose.project" }}')
mw_workdir=$(docker inspect "$mw_web" --format '{{ index .Config.Labels "com.docker.compose.project.working_dir" }}')
[[ -n "$mw_project" && "$mw_project" != '<no value>' ]] || fail 'missing Compose project label'
[[ $(realpath -e -- "$mw_workdir") == "$mw_root" ]] || fail 'web container belongs to another application root'
MW_DC+=(-p "$mw_project")
MW_CURL=(curl -4 -fsS --connect-timeout 5 --max-time 20 --resolve "$mw_host:443:127.0.0.1")

protected_ids() {
  local service cid
  for service in api admin postgres reverse-proxy; do
    cid=$("${MW_DC[@]}" ps -q "$service")
    [[ -n "$cid" && "$cid" != *$'\n'* ]] || fail "expected one running $service container"
    [[ $(docker inspect "$cid" --format '{{.State.Running}}') == true ]] || fail "$service is not running"
    printf '%s %s\n' "$service" "$cid"
  done
}
configuration_hashes() {
  local file
  for file in .env.production .env services/api/.env services/api/.env.production apps/web/.env.production apps/admin/.env.production docker-compose.production.yml infra/nginx/mywave.conf; do
    [[ ! -L "$mw_root/$file" ]] || fail "configuration symlink requires a separate deployment: $file"
    if [[ -f "$mw_root/$file" ]]; then sha256sum -- "$mw_root/$file"; fi
  done
}
unchanged() {
  protected_ids >"$mw_backup/protected.current"
  cmp -s "$mw_backup/protected.before" "$mw_backup/protected.current" || fail 'protected container identity changed'
  configuration_hashes >"$mw_backup/configuration.current"
  cmp -s "$mw_backup/configuration.before" "$mw_backup/configuration.current" || fail 'configuration changed during release'
}
write_override() {
  python3 - "$1" "$2" <<'PY'
import json, sys
with open(sys.argv[1], 'w') as f:
    json.dump({'services': {'web': {'image': sys.argv[2], 'pull_policy': 'never'}}}, f)
PY
}
restore_web() {
  unchanged
  docker image inspect "$mw_old_image" >/dev/null
  write_override "$mw_backup/rollback.compose.json" "$mw_old_image"
  "${MW_DC[@]}" -f "$mw_backup/rollback.compose.json" up -d --no-deps --no-build --pull never --force-recreate web
  "${MW_DC[@]}" exec -T reverse-proxy nginx -t
  "${MW_DC[@]}" exec -T reverse-proxy nginx -s reload
  unchanged
  printf 'WEB_ROLLBACK_IMAGE=%s\n' "$mw_old_image"
}
cleanup() {
  if [[ -n "$mw_smoke" ]]; then docker rm -f "$mw_smoke" >/dev/null 2>&1 || true; fi
}
on_exit() {
  local status=$?
  trap - ERR EXIT
  cleanup
  if [[ "$status" != 0 && "$mw_activated" == 1 ]]; then
    printf 'web-carousel: verification failed; restoring the previous web image\n' >&2
    set +e
    (set -Eeuo pipefail; restore_web)
    local rollback_status=$?
    set -e
    if [[ "$rollback_status" != 0 ]]; then
      printf 'web-carousel: automatic rollback failed; use the saved state: %s/state.json\n' "$mw_backup" >&2
    fi
  fi
  exit "$status"
}
trap on_exit EXIT
if [[ -n "$mw_rollback" ]]; then
  [[ "$mw_saved_project" == "$mw_project" ]] || fail 'rollback state belongs to another Compose project'
  restore_web
  exit 0
fi

mw_stamp=$(date -u +%Y%m%dT%H%M%SZ)
mw_backup=/var/backups/mywave-tourism/web-carousel-${mw_stamp}-${mw_release:0:12}
[[ ! -e "$mw_backup" ]] || fail 'backup directory already exists'
install -m 700 -d "$mw_backup" "$mw_backup/source"
protected_ids >"$mw_backup/protected.before"
configuration_hashes >"$mw_backup/configuration.before"
docker inspect "$mw_web" >"$mw_backup/web.before.json"
"${MW_DC[@]}" config --format json >"$mw_backup/compose.effective.json"
mw_registry=$(python3 - "$mw_backup/compose.effective.json" <<'PY'
import json, sys
from urllib.parse import urlsplit
cfg = json.load(open(sys.argv[1]))
registry = cfg['services']['web'].get('build', {}).get('args', {}).get('NPM_CONFIG_REGISTRY', 'https://registry.npmjs.org/')
u = urlsplit(registry)
if u.scheme != 'https' or not u.hostname or u.username or u.password or u.query or u.fragment:
    raise SystemExit('registry must be a plain HTTPS URL without credentials')
print(registry)
PY
)
"${MW_DC[@]}" exec -T reverse-proxy nginx -t
"${MW_CURL[@]}" "$mw_origin/api/health" -o "$mw_backup/api-health.before.json"
python3 - "$mw_backup/api-health.before.json" <<'PY'
import json, sys
if json.load(open(sys.argv[1])).get('status') != 'ok': raise SystemExit('API is not healthy before release')
PY
mw_docker_root=$(docker info --format '{{.DockerRootDir}}')
mw_free=$(df -Pk "$mw_docker_root" | awk 'NR==2 {print $4}')
[[ "$mw_free" =~ ^[0-9]+$ && "$mw_free" -ge 5000000 ]] || fail 'at least 5 GB of free Docker disk space is required'

curl -4 -fSL --retry 3 --connect-timeout 20 --max-time 900 "https://codeload.github.com/YaroslavValeev/Turism/tar.gz/$mw_release" -o "$mw_backup/release.tgz"
python3 - "$mw_backup/release.tgz" <<'PY'
import pathlib, sys, tarfile
with tarfile.open(sys.argv[1]) as t:
    for m in t.getmembers():
        p = pathlib.PurePosixPath(m.name)
        if p.is_absolute() or '..' in p.parts or m.issym() or m.islnk() or not (m.isfile() or m.isdir()):
            raise SystemExit('unsafe release archive member')
PY
tar -xzf "$mw_backup/release.tgz" -C "$mw_backup/source" --strip-components=1 --no-same-owner --no-same-permissions
mw_source=$mw_backup/source
mw_asset=$mw_source/apps/web/public/media/disciplines/heli-ski-ka62-baskets.webp
[[ -f "$mw_source/apps/web/Dockerfile" && -f "$mw_source/scripts/production/create-source-backup.sh" && -f "$mw_asset" ]] || fail 'release source is incomplete'
[[ $(sha256sum <"$mw_asset" | awk '{print $1}') == "$mw_heli_sha" ]] || fail 'release does not contain the approved helicopter'
bash "$mw_source/scripts/production/create-source-backup.sh" "$mw_root" "$mw_backup/physical-source.tgz"
docker inspect "$mw_web" --format '{{json .Config.Env}}' >"$mw_backup/web-env.json"
python3 - "$mw_backup/web-env.json" "$mw_source/apps/web/.env.production" <<'PY'
import json, re, sys
with open(sys.argv[2], 'w') as f:
    for item in json.load(open(sys.argv[1])):
        name, sep, value = item.partition('=')
        if sep and re.fullmatch(r'NEXT_PUBLIC_[A-Z0-9_]+', name):
            if any(c in value for c in ('$', '\\', '"', "'", '\n', '\r')):
                raise SystemExit('public build variable needs manual quoting: ' + name)
            f.write(name + '=' + json.dumps(value, ensure_ascii=False) + '\n')
PY
mw_old_image=tourism-web-rollback:${mw_stamp}-${mw_release:0:12}
mw_old_id=$(docker inspect "$mw_web" --format '{{.Image}}')
docker tag "$mw_old_id" "$mw_old_image"
mw_new_image=tourism-web-carousel:${mw_release:0:12}-${mw_stamp}
install -m 700 "$mw_script" "$mw_backup/deploy-web-carousel.sh"
python3 - "$mw_backup/state.json" "$mw_root" "$mw_origin" "$mw_old_image" "$mw_project" "$mw_new_image" "$mw_release" "$mw_heli_sha" <<'PY'
import json, sys
keys = ('root','origin','rollback_image','project','image','release','heli_sha')
with open(sys.argv[1], 'w') as f: json.dump(dict(zip(keys, sys.argv[2:])), f, indent=2)
PY
docker build --network host --build-arg "NPM_CONFIG_REGISTRY=$mw_registry" --label "org.opencontainers.image.revision=$mw_release" -f "$mw_source/apps/web/Dockerfile" -t "$mw_new_image" "$mw_source"
mw_smoke=$(docker run -d --network none "$mw_new_image")
mw_ready=0
for mw_attempt in $(seq 1 20); do
  if docker exec "$mw_smoke" node -e 'fetch("http://127.0.0.1:3000/",{signal:AbortSignal.timeout(3000)}).then(r=>process.exit(r.status===200?0:1)).catch(()=>process.exit(1))' >/dev/null 2>&1; then mw_ready=1; break; fi
  sleep 2
done
[[ "$mw_ready" == 1 ]] || fail 'isolated web image did not start'
docker exec "$mw_smoke" node -e 'const fs=require("fs"),c=require("crypto"),d="/app/apps/web/.next/static/chunks/app";if(c.createHash("sha256").update(fs.readFileSync("/app/apps/web/public/media/disciplines/heli-ski-ka62-baskets.webp")).digest("hex")!==process.argv[1])process.exit(1);if(!fs.readdirSync(d).filter(n=>n.startsWith("page-")&&n.endsWith(".js")).some(n=>{const t=fs.readFileSync(d+"/"+n,"utf8");return t.includes("discipline-carousel-stage")&&t.includes("heli-ski-ka62-baskets")}))process.exit(1)' "$mw_heli_sha"
docker rm -f "$mw_smoke" >/dev/null
mw_smoke=''
unchanged
write_override "$mw_backup/release.compose.json" "$mw_new_image"
mw_activated=1
"${MW_DC[@]}" -f "$mw_backup/release.compose.json" up -d --no-deps --no-build --pull never --force-recreate web
"${MW_DC[@]}" exec -T reverse-proxy nginx -t
"${MW_DC[@]}" exec -T reverse-proxy nginx -s reload
mw_live=0
for mw_attempt in $(seq 1 10); do
  if "${MW_CURL[@]}" "$mw_origin/media/disciplines/heli-ski-ka62-baskets.webp" -o "$mw_backup/heli.live.webp" && [[ $(sha256sum <"$mw_backup/heli.live.webp" | awk '{print $1}') == "$mw_heli_sha" ]]; then mw_live=1; break; fi
  sleep 2
done
[[ "$mw_live" == 1 ]] || fail 'live helicopter hash does not match the approved release'
"${MW_CURL[@]}" "$mw_origin/" -o "$mw_backup/home.live.html"
python3 - "$mw_backup/home.live.html" >"$mw_backup/page-chunk.path" <<'PY'
import re, sys
paths = re.findall(r'<script[^>]*src="([^"<>]+)"', open(sys.argv[1]).read())
paths = [p for p in paths if re.fullmatch(r'/_next/static/chunks/app/page-[a-zA-Z0-9_.-]+\.js(?:\?[^"<>]*)?', p)]
if not paths: raise SystemExit('live homepage has no page chunk')
print(paths[0])
PY
mw_chunk=$(cat "$mw_backup/page-chunk.path")
"${MW_CURL[@]}" "$mw_origin$mw_chunk" -o "$mw_backup/page-chunk.live.js"
grep -F 'discipline-carousel-stage' "$mw_backup/page-chunk.live.js" >/dev/null
grep -F 'heli-ski-ka62-baskets' "$mw_backup/page-chunk.live.js" >/dev/null
"${MW_CURL[@]}" "$mw_origin/api/health" -o "$mw_backup/api-health.after.json"
python3 - "$mw_backup/api-health.before.json" "$mw_backup/api-health.after.json" <<'PY'
import json, sys
before, after = (json.load(open(p)) for p in sys.argv[1:])
if after.get('status') != 'ok' or before.get('release') != after.get('release'):
    raise SystemExit('API health or release identity changed')
PY
unchanged
mw_current=$("${MW_DC[@]}" ps -q web)
[[ $(docker inspect "$mw_current" --format '{{.Image}}') == "$(docker image inspect "$mw_new_image" --format '{{.Id}}')" ]] || fail 'active web image mismatch'
[[ $(docker image inspect "$mw_new_image" --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}') == "$mw_release" ]] || fail 'web image release label mismatch'
mw_activated=0
printf '%s\n' "$mw_backup/state.json" > /var/lib/mywave-tourism/last-web-carousel-state
printf 'WEB_CAROUSEL_RELEASE_VERIFIED=%s\nBACKUP=%s\n' "$mw_release" "$mw_backup"
printf 'ROLLBACK: sudo bash %q --rollback %q\n' "$mw_backup/deploy-web-carousel.sh" "$mw_backup/state.json"
