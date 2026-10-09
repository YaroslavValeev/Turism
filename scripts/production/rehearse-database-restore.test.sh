#!/usr/bin/env bash
# Control-flow tests with Docker stubs, no real server/data/network access.
set -Eeuo pipefail
script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
fixture="$(mktemp -d /tmp/tourism-restore-test.XXXXXX)"
mkdir -p "$fixture/bin" "$fixture/app/.release" "$fixture/backups"
printf '{}\n' > "$fixture/app/package.json"
printf 'services: {}\n' > "$fixture/app/docker-compose.production.yml"
printf 'TEST_ONLY=true\n' > "$fixture/app/.env.production"
expected=ffffffffffffffffffffffffffffffffffffffff
printf '%s\n' "$expected" > "$fixture/app/.release/REVISION"
cat > "$fixture/bin/curl" <<'STUB'
#!/usr/bin/env bash
printf '{"releaseSha":"ffffffffffffffffffffffffffffffffffffffff"}\n'
STUB
cat > "$fixture/bin/df" <<'STUB'
#!/usr/bin/env bash
printf 'Avail\n8589934592\n'
STUB
cat > "$fixture/bin/docker" <<'STUB'
#!/usr/bin/env bash
set -euo pipefail
case "$1" in
  compose)
    case "$*" in
      *'ps -q '*) printf 'production-%s\n' "${!#}" ;;
      *pg_dump*) printf 'QA_ONLY_CUSTOM_DUMP' ;;
      *'pg_restore --list'*) cat >/dev/null; printf 'QA TOC\n' ;;
      *) echo 'unexpected production mutation' >&2; exit 90 ;;
    esac ;;
  ps) : ;;
  run)
    [[ "$*" == *'--network none'* && "$*" == *'--memory 256m'* && "$*" == *'--tmpfs /var/lib/postgresql/data'* ]] || exit 91
    [[ "$*" != *' --publish '* && "$*" != *' --volume '* ]] || exit 92
    for arg in "$@"; do
      case "$arg" in codex.restore.owner=*) printf '%s\n' "${arg#*=}" > "$QA_OWNER" ;; esac
    done
    printf 'ran\n' >> "$QA_TRACE" ;;
  inspect)
    case "$*" in
      *NetworkMode*) printf 'none\n' ;;
      *PortBindings*) printf '0\n' ;;
      *codex.restore.owner*)
        if [[ ${QA_FOREIGN_OWNER:-0} == 1 ]]; then printf 'not-owned-by-this-test\n';
        elif [[ -f "$QA_OWNER" ]]; then cat "$QA_OWNER"; else exit 1; fi ;;
      *'.Image'*) printf 'sha256:qa-only-image\n' ;;
      *) exit 93 ;;
    esac ;;
  exec)
    [[ "$*" == *'tourism-restore-qa-'* ]] || exit 94
    case "$*" in
      *pg_isready*) : ;;
      *pg_restore*) cat >/dev/null; [[ ${QA_RESTORE_FAIL:-0} != 1 ]] || exit 7 ;;
      *jsonb_build_object*) printf '{"programs":1,"appliedMigrations":1}\n' ;;
      *psql*) printf '1\n' ;;
      *) exit 95 ;;
    esac ;;
  rm)
    [[ "$*" == *'tourism-restore-qa-'* ]] || exit 96
    printf 'removed-owned\n' >> "$QA_TRACE" ;;
  *) exit 97 ;;
esac
STUB
chmod +x "$fixture/bin/"*
export PATH="$fixture/bin:$PATH" QA_OWNER="$fixture/owner" QA_TRACE="$fixture/trace"
args=("$fixture/app" "$fixture/backups" "$expected" https://qa.example.invalid/health qa)
if bash "$script_dir/rehearse-database-restore.sh" "${args[@]}" > "$fixture/no-confirm.log" 2>&1; then
  echo 'FAIL: missing confirmation accepted' >&2; exit 1
fi
[[ ! -f "$QA_TRACE" ]]
export MYWAVE_RESTORE_QA_CONFIRM=isolated-copy-only
if bash "$script_dir/rehearse-database-restore.sh" / "$fixture/backups" "$expected" https://qa.example.invalid/health qa > "$fixture/broad.log" 2>&1; then
  echo 'FAIL: broad application root accepted' >&2; exit 1
fi
if bash "$script_dir/rehearse-database-restore.sh" "$fixture/app" "$fixture/app" "$expected" https://qa.example.invalid/health qa > "$fixture/nested.log" 2>&1; then
  echo 'FAIL: nested backup root accepted' >&2; exit 1
fi
if bash "$script_dir/rehearse-database-restore.sh" "$fixture/app" "$fixture/backups" "$expected" http://qa.example.invalid/health qa > "$fixture/http.log" 2>&1; then
  echo 'FAIL: insecure health URL accepted' >&2; exit 1
fi
bash "$script_dir/rehearse-database-restore.sh" "${args[@]}" > "$fixture/success.log" 2>&1
grep -F 'ISOLATED_DATABASE_RESTORE_PASSED=' "$fixture/success.log" >/dev/null
grep -Fx removed-owned "$QA_TRACE" >/dev/null
grep -F 'UNCHANGED_PRODUCTION_CONTAINER=api' "$fixture/success.log" >/dev/null
printf 'PASS: isolated resource limits, unchanged production, protected backup, owned cleanup\n'
rm -f "$QA_OWNER" "$QA_TRACE"
if QA_RESTORE_FAIL=1 bash "$script_dir/rehearse-database-restore.sh" "${args[@]}" > "$fixture/failure.log" 2>&1; then
  echo 'FAIL: restore failure hidden' >&2; exit 1
fi
grep -Fx removed-owned "$QA_TRACE" >/dev/null
if grep -F 'ISOLATED_DATABASE_RESTORE_PASSED=' "$fixture/failure.log" >/dev/null; then
  echo 'FAIL: false successful restore marker' >&2; exit 1
fi
printf 'PASS: failed restore propagates failure and cleans only its own disposable copy\n'
rm -f "$QA_OWNER" "$QA_TRACE"
if QA_FOREIGN_OWNER=1 bash "$script_dir/rehearse-database-restore.sh" "${args[@]}" > "$fixture/foreign.log" 2>&1; then
  echo 'FAIL: foreign container accepted' >&2; exit 1
fi
if grep -Fx removed-owned "$QA_TRACE" >/dev/null; then
  echo 'FAIL: foreign container deleted' >&2; exit 1
fi
printf 'PASS: foreign ownership blocks restore and prevents deletion\n'
