#!/usr/bin/env bash
# Local/Docker contract tests; Docker and curl are simulated, production is never contacted.
set -Eeuo pipefail
test_root=$(mktemp -d /tmp/mywave-web-carousel-tests.XXXXXX)
script_root=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
repo_root=$(cd "$script_root/../.." && pwd)
cleanup() { [[ "$test_root" == /tmp/mywave-web-carousel-tests.* ]] && rm -rf -- "$test_root"; }
trap cleanup EXIT
mkdir -p "$test_root/bin"
cat >"$test_root/bin/docker" <<'PY'
#!/usr/bin/env python3
import json, os, pathlib, sys
p = pathlib.Path(os.environ['MW_TEST_CASE'])
state_file = p/'runtime.json'
s = json.loads(state_file.read_text())
a = sys.argv[1:]
with (p/'commands.jsonl').open('a') as f: f.write(json.dumps(a)+'\n')
def save(): state_file.write_text(json.dumps(s))
def out(value): print(value)
if a[0] == 'compose':
    opts, rest, i = {}, [], 1
    while i < len(a):
        if a[i] in ('--project-directory','--env-file','-f','-p'):
            opts[a[i]] = a[i+1]; i += 2
        else: rest = a[i:]; break
    if rest[0] == 'ps': out(s['ids'][rest[-1]])
    elif rest[0] == 'config': out(json.dumps({'services':{'web':{'build':{'args':{'NPM_CONFIG_REGISTRY':'https://registry.npmjs.org/'}}}}}))
    elif rest[0] == 'exec':
        if rest[2] != 'reverse-proxy' or rest[3] != 'nginx': raise SystemExit('unexpected live exec')
    elif rest[0] == 'up':
        if rest[-1] != 'web' or '--no-deps' not in rest or '--no-build' not in rest:
            raise SystemExit('unsafe cutover scope')
        image = json.loads(pathlib.Path(opts['-f']).read_text())['services']['web']['image']
        s['current_image'] = image
        s['ids']['web'] = 'web-restored' if image.startswith('tourism-web-rollback:') else 'web-new'
        s['up_images'].append(image); save()
    else: raise SystemExit('unexpected compose command')
elif a[0] == 'inspect':
    fmt = a[a.index('--format')+1] if '--format' in a else None
    if fmt is None: out(json.dumps([{'Config':{'Env':['INTERNAL_ANALYTICS_TOKEN=do_not_bake_me']}}]))
    elif 'project.working_dir' in fmt: out(str(p/'app-link'))
    elif 'com.docker.compose.project' in fmt: out('test-tour')
    elif '.State.Running' in fmt: out('true')
    elif '.Config.Env' in fmt: out(json.dumps(['NEXT_PUBLIC_API_URL=/api','INTERNAL_ANALYTICS_TOKEN=do_not_bake_me']))
    elif '.Image' in fmt: out(s['images'][s['current_image']]['id'])
    else: raise SystemExit('unexpected inspect format')
elif a[:2] == ['image','inspect']:
    data = s['images'][a[2]]
    if '--format' in a: out(data['revision'] if 'revision' in a[-1] else data['id'])
elif a[0] == 'tag': s['images'][a[2]] = {'id':a[1],'revision':'old'}; save()
elif a[0] == 'info': out(str(p))
elif a[0] == 'build':
    image = a[a.index('-t')+1]
    label = a[a.index('--label')+1].split('=',1)[1]
    source = pathlib.Path(a[-1])
    env = (source/'apps/web/.env.production').read_text()
    if 'do_not_bake_me' in env or 'INTERNAL_ANALYTICS_TOKEN' in env: raise SystemExit('private env baked into image')
    s['images'][image] = {'id':'new-image','revision':label}
    if s['scenario'] == 'protected-drift': s['ids']['api'] = 'api-changed'
    save()
elif a[0] == 'run':
    if '--network' not in a or a[a.index('--network')+1] != 'none' or '-p' in a:
        raise SystemExit('smoke is not isolated')
    out('owned-smoke')
elif a[0] == 'exec':
    if a[1] != 'owned-smoke': raise SystemExit('unexpected container exec')
    if s['scenario'] == 'smoke-failure': raise SystemExit(1)
elif a[0] == 'rm':
    if a[-1] != 'owned-smoke': raise SystemExit('unexpected container removal')
else: raise SystemExit('unexpected docker command: '+str(a))
PY
cat >"$test_root/bin/curl" <<'PY'
#!/usr/bin/env python3
import json, os, pathlib, shutil, sys
p = pathlib.Path(os.environ['MW_TEST_CASE'])
s = json.loads((p/'runtime.json').read_text())
a = sys.argv[1:]
target = pathlib.Path(a[a.index('-o')+1])
url = next(v for v in a if v.startswith('https://'))
if 'codeload.github.com' in url: shutil.copyfile(p/'source.tgz',target)
elif url.endswith('/api/health'):
    release = 'changed' if s['scenario']=='api-health-change' and s['ids']['web']=='web-new' else 'unchanged-api'
    target.write_text(json.dumps({'status':'ok','release':{'releaseSha':release}}))
elif url.endswith('.webp'):
    if s['scenario']=='asset-mismatch' and s['ids']['web']=='web-new': target.write_text('wrong asset')
    else: shutil.copyfile(p/'approved.webp',target)
elif '/_next/' in url:
    target.write_text('discipline-carousel-stage heli-ski-ka62-baskets' if s['scenario']!='chunk-mismatch' else 'old page')
else: target.write_text('<script src="/_next/static/chunks/app/page-current.js"></script>')
PY
cat >"$test_root/bin/df" <<'SH'
#!/usr/bin/env bash
printf 'Filesystem 1024-blocks Used Available Capacity Mounted\nfixture 90000000 1 80000000 1%% /\n'
SH
cat >"$test_root/bin/sleep" <<'SH'
#!/usr/bin/env bash
exit 0
SH
chmod +x "$test_root/bin/"*
export PATH="$test_root/bin:$PATH"
test_number=0
for scenario in success smoke-failure protected-drift asset-mismatch chunk-mismatch api-health-change; do
  test_number=$((test_number+1))
  export MW_TEST_CASE="$test_root/$scenario"
  mkdir -p "$MW_TEST_CASE/app/infra/nginx" "$MW_TEST_CASE/source/release/scripts/production" "$MW_TEST_CASE/source/release/apps/web/public/media/disciplines"
  printf '{"name":"mywave-travel"}\n' >"$MW_TEST_CASE/app/package.json"
  printf 'services: {}\n' >"$MW_TEST_CASE/app/docker-compose.production.yml"
  printf 'PRIVATE_TOKEN=do_not_bake_me\n' >"$MW_TEST_CASE/app/.env.production"
  printf '# fixture\n' >"$MW_TEST_CASE/app/infra/nginx/mywave.conf"
  ln -s "$MW_TEST_CASE/app" "$MW_TEST_CASE/app-link"
  cp "$script_root/create-source-backup.sh" "$MW_TEST_CASE/source/release/scripts/production/"
  cp "$repo_root/apps/web/public/media/disciplines/heli-ski-ka62-baskets.webp" "$MW_TEST_CASE/approved.webp"
  cp "$MW_TEST_CASE/approved.webp" "$MW_TEST_CASE/source/release/apps/web/public/media/disciplines/heli-ski-ka62-baskets.webp"
  printf 'FROM fixture\n' >"$MW_TEST_CASE/source/release/apps/web/Dockerfile"
  tar -czf "$MW_TEST_CASE/source.tgz" -C "$MW_TEST_CASE/source" release
  python3 - "$MW_TEST_CASE/runtime.json" "$scenario" <<'PY'
import json, sys
with open(sys.argv[1],'w') as f: json.dump({'scenario':sys.argv[2],'ids':{'web':'web-old','api':'api-original','admin':'admin-original','postgres':'postgres-original','reverse-proxy':'proxy-original'},'current_image':'old-tag','images':{'old-tag':{'id':'old-image','revision':'old'}},'up_images':[]},f)
PY
  # Backup names use the first 12 SHA characters: keep scenarios distinct within one second.
  test_release=$(printf '%012x%028x' "$test_number" 0)
  test_asset_sha=$(sha256sum <"$MW_TEST_CASE/approved.webp" | awk '{print $1}')
  set +e
  bash "$script_root/deploy-web-carousel.sh" --root "$MW_TEST_CASE/app-link" --release "$test_release" --origin https://fixture.example --heli-sha "$test_asset_sha" >"$MW_TEST_CASE/output" 2>&1
  test_status=$?
  set -e
  python3 - "$MW_TEST_CASE" "$test_status" <<'PY'
import json, pathlib, sys
p = pathlib.Path(sys.argv[1]); status = int(sys.argv[2]); s=json.loads((p/'runtime.json').read_text())
commands=[json.loads(v) for v in (p/'commands.jsonl').read_text().splitlines()]
assert not any(any(word in ('migrate','pg_dump','down') for word in c) for c in commands)
assert s['ids']['admin']=='admin-original' and s['ids']['postgres']=='postgres-original' and s['ids']['reverse-proxy']=='proxy-original'
if s['scenario']=='success':
    assert status==0 and len(s['up_images'])==1 and s['ids']['web']=='web-new'
    assert 'WEB_CAROUSEL_RELEASE_VERIFIED=' in (p/'output').read_text()
elif s['scenario'] in ('smoke-failure','protected-drift'):
    assert status!=0 and not s['up_images'] and s['ids']['web']=='web-old'
else:
    assert status!=0 and len(s['up_images'])==2 and s['up_images'][-1].startswith('tourism-web-rollback:') and s['ids']['web']=='web-restored'
assert 'do_not_bake_me' not in (p/'output').read_text()
PY
  if [[ "$scenario" == success ]]; then
    test_state=$(sed -n 's/^BACKUP=//p' "$MW_TEST_CASE/output")/state.json
    bash "$script_root/deploy-web-carousel.sh" --rollback "$test_state" >"$MW_TEST_CASE/manual-rollback" 2>&1
    python3 - "$MW_TEST_CASE/runtime.json" <<'PY'
import json, sys
s=json.load(open(sys.argv[1])); assert s['ids']['web']=='web-restored' and s['up_images'][-1].startswith('tourism-web-rollback:')
PY
    gzip -t "$(dirname "$test_state")/physical-source.tgz"
    tar -tzf "$(dirname "$test_state")/physical-source.tgz" | grep -Fx './.env.production' >/dev/null
  fi
  printf 'PASS %s\n' "$scenario"
done
set +e
bash "$script_root/deploy-web-carousel.sh" --root / --release invalid --origin http://invalid --heli-sha invalid >"$test_root/invalid" 2>&1
test_status=$?
set -e
[[ "$test_status" != 0 ]] || { printf 'invalid arguments accepted\n' >&2; exit 1; }
printf 'PASS invalid arguments\n'
