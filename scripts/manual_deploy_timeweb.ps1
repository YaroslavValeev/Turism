# Выкат на Timeweb из Windows PowerShell (без bash/export).
# Запуск из корня репозитория:
#   powershell -ExecutionPolicy Bypass -File .\scripts\manual_deploy_timeweb.ps1
#
# Переменные (можно задать до запуска):
#   $env:DEPLOY_HOST = "5.129.249.113"
#   $env:DEPLOY_USER = "root"
#   $env:DEPLOY_KEY_FILE = "$env:USERPROFILE\.ssh\id_ed25519"
#   $env:DEPLOY_PATH = "/opt/mywave/tourism"
#   $env:DEPLOY_PORT = "22"
# Resume (архив уже на VPS после успешного scp, упал только ssh):
#   $env:DEPLOY_REMOTE_ARCHIVE = "/tmp/mywave-tourism-deploy-YYYYMMDD-HHMMSS.tgz"

$ErrorActionPreference = "Stop"

$DeployHost = if ($env:DEPLOY_HOST) { $env:DEPLOY_HOST } else { "5.129.249.113" }
$DeployUser = if ($env:DEPLOY_USER) { $env:DEPLOY_USER } else { "root" }
$DeployPath = if ($env:DEPLOY_PATH) { $env:DEPLOY_PATH } else { "/opt/mywave/tourism" }
$DeployPort = if ($env:DEPLOY_PORT) { $env:DEPLOY_PORT } else { "22" }
$KeyFile = if ($env:DEPLOY_KEY_FILE) { $env:DEPLOY_KEY_FILE } else { Join-Path $env:USERPROFILE ".ssh\id_ed25519" }
$ResumeArchive = if ($env:DEPLOY_REMOTE_ARCHIVE) { $env:DEPLOY_REMOTE_ARCHIVE.Trim() } else { "" }

if (-not (Test-Path -LiteralPath $KeyFile)) {
  Write-Error "SSH key missing: $KeyFile (set DEPLOY_KEY_FILE)"
}

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location -LiteralPath $RepoRoot

$SshTarget = "${DeployUser}@${DeployHost}"
# Keepalive: длинный docker build иначе рвёт NAT/fail2ban после scp
$SshCommon = @(
  "-o", "StrictHostKeyChecking=accept-new",
  "-o", "ConnectTimeout=45",
  "-o", "ServerAliveInterval=30",
  "-o", "ServerAliveCountMax=120"
)
$ScpArgs = @("-i", $KeyFile, "-P", $DeployPort) + $SshCommon
$SshArgs = @("-i", $KeyFile, "-p", $DeployPort) + $SshCommon

$Archive = $null
if ($ResumeArchive) {
  if ($ResumeArchive -notmatch '^/tmp/mywave-tourism-deploy-.+\.tgz$') {
    Write-Error "DEPLOY_REMOTE_ARCHIVE must look like /tmp/mywave-tourism-deploy-*.tgz"
  }
  $RemoteArchive = $ResumeArchive
  Write-Host ('>>> resume: skip tar+scp, remote={0}' -f $RemoteArchive)
} else {
  $Stamp = Get-Date -Format "yyyyMMdd-HHmmss"
  $Archive = Join-Path $env:TEMP "mywave-tourism-deploy-$Stamp.tgz"

  Write-Host ('>>> tar archive -> {0}' -f $Archive)
  # Windows tar (bsdtar): исключения
  & tar -czf $Archive `
    --exclude=.git `
    --exclude=node_modules `
    --exclude=*/node_modules `
    --exclude=.next `
    --exclude=*/.next `
    --exclude=dist `
    --exclude=*/dist `
    --exclude=backups `
    --exclude=logs `
    --exclude=.env `
    --exclude=.env.* `
    --exclude=.cursor `
    --exclude=.turbo `
    --exclude=coverage `
    --exclude=infra/nginx/certs `
    --exclude=artifacts `
    -C $RepoRoot .

  if (-not (Test-Path -LiteralPath $Archive)) {
    Write-Error "Archive was not created"
  }

  $RemoteArchive = "/tmp/mywave-tourism-deploy-$Stamp.tgz"

  Write-Host ('>>> scp -> {0}:{1}' -f $SshTarget, $RemoteArchive)
  & scp @ScpArgs $Archive "${SshTarget}:${RemoteArchive}"
  if ($LASTEXITCODE -ne 0) { Write-Error ("scp failed ({0})" -f $LASTEXITCODE) }
}

$RemoteCmd = @"
set -euo pipefail
mkdir -p '$DeployPath'
cd '$DeployPath'

# Сохраняем секреты: tar с ПК их не содержит, а wipe раньше их стирал.
ENV_BAK=`$(mktemp -d)
for f in .env.production apps/admin/.env.production services/api/.env.production apps/web/.env.production; do
  if [ -f "`$f" ]; then
    mkdir -p "`$ENV_BAK/`$(dirname "`$f")"
    cp -a "`$f" "`$ENV_BAK/`$f"
  fi
done

# Важно: tar НЕ удаляет лишние файлы. Старый WIP на VPS ломал tsc.
rm -rf services/api/src packages apps/admin
tar -xzf '$RemoteArchive'
rm -f '$RemoteArchive'
rm -f packages/config/src/env.test.ts 2>/dev/null || true

# Возвращаем env после распаковки
for f in .env.production apps/admin/.env.production services/api/.env.production apps/web/.env.production; do
  if [ -f "`$ENV_BAK/`$f" ]; then
    mkdir -p "`$(dirname "`$f")"
    cp -a "`$ENV_BAK/`$f" "`$f"
  fi
done
rm -rf "`$ENV_BAK"

# compose требует apps/admin/.env.production — если потерян, собрать минимальный из корня
if [ ! -f apps/admin/.env.production ]; then
  mkdir -p apps/admin
  : > apps/admin/.env.production
  if [ -f .env.production ]; then
    grep -E '^(NEXT_PUBLIC_API_URL|NEXT_PUBLIC_WEB_URL|NEXT_PUBLIC_SITE_URL|NEXT_PUBLIC_PILOT_MODE)=' .env.production >> apps/admin/.env.production || true
  fi
  if ! grep -q '^NEXT_PUBLIC_API_URL=' apps/admin/.env.production 2>/dev/null; then
    echo 'NEXT_PUBLIC_API_URL=https://api.mywavetour.ru' >> apps/admin/.env.production
  fi
  if ! grep -q '^NEXT_PUBLIC_WEB_URL=' apps/admin/.env.production 2>/dev/null; then
    echo 'NEXT_PUBLIC_WEB_URL=https://mywavetour.ru' >> apps/admin/.env.production
  fi
  echo 'WARN: restored apps/admin/.env.production from defaults/root' >&2
fi

# NEXT_PUBLIC_* вшиваются в Next на build — прокидываем из env-файлов
set -a
. ./.env.production
if [ -f apps/admin/.env.production ]; then . ./apps/admin/.env.production; fi
set +a

docker compose --env-file .env.production -f docker-compose.production.yml build --no-cache api admin web
docker compose --env-file .env.production -f docker-compose.production.yml up -d api admin web
sleep 20
docker compose --env-file .env.production -f docker-compose.production.yml ps
docker compose --env-file .env.production -f docker-compose.production.yml exec -T api wget -qO- http://127.0.0.1:3001/health || true
"@

Write-Host '>>> ssh: unpack + rebuild api admin'
$sshOk = $false
for ($attempt = 1; $attempt -le 3; $attempt++) {
  Write-Host (">>> ssh attempt {0}/3 ..." -f $attempt)
  & ssh @SshArgs $SshTarget $RemoteCmd
  if ($LASTEXITCODE -eq 0) { $sshOk = $true; break }
  Write-Host (">>> ssh exit {0} - pause 20s (fail2ban after scp)" -f $LASTEXITCODE)
  Start-Sleep -Seconds 20
}
if (-not $sshOk) {
  $hint = "ssh remote failed. Archive may remain on VPS: $RemoteArchive. Unban IP in Timeweb VNC, then set DEPLOY_REMOTE_ARCHIVE and re-run this script."
  Write-Error $hint
}

if ($Archive) {
  Remove-Item -LiteralPath $Archive -Force -ErrorAction SilentlyContinue
}
Write-Host '>>> OK. Ctrl+F5: https://admin.mywavetour.ru/event-candidates'
Write-Host 'After deploy: Jobs -> ingest sources, then re-publish candidates for media.'
