# Tourism Telegram relay: manual production runbook

Этот runbook устанавливает только сетевой relay для `@MyWaveTour_bot`. Он не
пересобирает приложение и не меняет `web`, `admin` или `postgres`.

Рабочая схема:

```text
Telegram -> trycloudflare (EU) -> 10.77.0.2:3002 -> API webhook
API -> socks5://172.18.0.1:1088 -> 10.77.0.1:1080 (EU) -> Telegram/OpenAI
```

Важные ограничения:

- команды выполняются сначала на `shared-eu-socks`, затем на
  `msk-1-vm-9j6k`;
- shell tracing запрещён: токены и ключи не должны попадать в вывод;
- API proxy должен иметь схему `socks5://`, не `socks5h://`;
- Quick Tunnel динамический. Его URL нельзя фиксировать в `.env` или unit;
- установщик сам создаёт snapshot затрагиваемых unit-файлов и умеет откат;
- полный API через tunnel не публикуется. Разрешены только `GET /health` и
  `POST /public/telegram/webhook`.

## 1. Сборка артефакта на рабочем компьютере

В Git Bash из корня репозитория:

```bash
set -euo pipefail
./scripts/tourism-telegram-relay/build-artifact.sh

cd artifacts/tourism-telegram-relay
sha256sum -c tourism-telegram-relay.tgz.sha256
```

Через файловый менеджер Timeweb загрузите оба файла на **каждый** VPS в
`/tmp`:

```text
artifacts/tourism-telegram-relay/tourism-telegram-relay.tgz
artifacts/tourism-telegram-relay/tourism-telegram-relay.tgz.sha256
```

В панели firewall для Tourism VPS должны существовать правила:

```text
IN:  source 72.56.99.214, UDP, destination port 44181
OUT: destination 72.56.99.214, UDP, destination port 44180
```

## 2. EU VPS (`shared-eu-socks`) - выполнить первым

Вставьте блок целиком в консоль EU VPS:

```bash
set -euo pipefail
set +x

[ "$(hostname)" = "shared-eu-socks" ] || {
  echo "WRONG SERVER: $(hostname)"
  exit 1
}

cd /tmp
sha256sum -c tourism-telegram-relay.tgz.sha256

RELEASE_ID="$(sha256sum tourism-telegram-relay.tgz | awk '{print substr($1,1,16)}')"
RELEASE="/opt/mywave/releases/tourism-telegram-relay-${RELEASE_ID}"
install -d -m 0755 "$RELEASE"
tar -xzf /tmp/tourism-telegram-relay.tgz -C "$RELEASE"
(cd "$RELEASE" && sha256sum -c SHA256SUMS)

install -d -m 0750 /etc/mywave-tourism
if [ ! -f /etc/mywave-tourism/eu.env ]; then
  install -m 0640 "$RELEASE/config/eu.env.example" /etc/mywave-tourism/eu.env
fi
sed -i 's/^EXPECTED_HOSTNAME=.*/EXPECTED_HOSTNAME=shared-eu-socks/' \
  /etc/mywave-tourism/eu.env

wg show wg0
ip -4 address show dev wg0 | grep -F '10.77.0.1/24'

if ufw status | grep -q '^Status: active'; then
  ufw allow from 5.129.249.113 to any port 44180 proto udp
  ufw allow in on wg0 from 10.77.0.2 to 10.77.0.1 port 1080 proto tcp
  ufw allow in on wg0 from 10.77.0.2 to 10.77.0.1 port 18080 proto tcp
fi

"$RELEASE/install-eu.sh"
/usr/local/sbin/mywave-tourism-health-eu

systemctl is-active \
  wg-quick@wg0 \
  mywave-tourism-socks5.service \
  mywave-tourism-cloudflared.service \
  mywave-tourism-relay-status.service

curl -fsS http://10.77.0.1:18080/v1/status
```

Ожидается: три `active`, `EU relay health: ok` и JSON с текущим
`tunnel_host`. Не продолжайте на Tourism, если этот блок завершился ошибкой.

## 3. Tourism VPS (`msk-1-vm-9j6k`) - выполнить вторым

Вставьте блок целиком в консоль Tourism VPS:

```bash
set -euo pipefail
set +x

[ "$(hostname)" = "msk-1-vm-9j6k" ] || {
  echo "WRONG SERVER: $(hostname)"
  exit 1
}

cd /opt/mywave/tourism
test -f docker-compose.production.yml
docker compose -p toutism -f docker-compose.production.yml ps api

cd /tmp
sha256sum -c tourism-telegram-relay.tgz.sha256

RELEASE_ID="$(sha256sum tourism-telegram-relay.tgz | awk '{print substr($1,1,16)}')"
RELEASE="/opt/mywave/releases/tourism-telegram-relay-${RELEASE_ID}"
install -d -m 0755 "$RELEASE"
tar -xzf /tmp/tourism-telegram-relay.tgz -C "$RELEASE"
(cd "$RELEASE" && sha256sum -c SHA256SUMS)

cd /opt/mywave/tourism
DOCKER_GW="$(docker network inspect toutism_default -f '{{(index .IPAM.Config 0).Gateway}}')"
DOCKER_SUBNET="$(docker network inspect toutism_default -f '{{(index .IPAM.Config 0).Subnet}}')"
[ -n "$DOCKER_GW" ]
[ -n "$DOCKER_SUBNET" ]

install -d -m 0750 /etc/mywave-tourism
if [ ! -f /etc/mywave-tourism/tourism.env ]; then
  install -m 0640 "$RELEASE/config/tourism.env.example" \
    /etc/mywave-tourism/tourism.env
fi
sed -i \
  -e 's/^EXPECTED_HOSTNAME=.*/EXPECTED_HOSTNAME=msk-1-vm-9j6k/' \
  -e "s/^SOCKS_BRIDGE_BIND_HOST=.*/SOCKS_BRIDGE_BIND_HOST=${DOCKER_GW}/" \
  -e "s#^WEBHOOK_SOCKS_URL=.*#WEBHOOK_SOCKS_URL=socks5://${DOCKER_GW}:1088#" \
  /etc/mywave-tourism/tourism.env

API_ENV_BACKUP="/var/backups/mywave-tourism/$(date -u +%Y%m%dT%H%M%SZ)-api-env"
install -d -m 0700 "$API_ENV_BACKUP"
export API_ENV_BACKUP DOCKER_GW

python3 - <<'PY'
from pathlib import Path
import os
import shutil

root = Path('/opt/mywave/tourism')
backup = Path(os.environ['API_ENV_BACKUP'])
proxy = f"socks5://{os.environ['DOCKER_GW']}:1088"
wanted = {
    'TELEGRAM_BOT_HTTP_PROXY': proxy,
    'OPENAI_HTTP_PROXY': proxy,
}
files = [Path('.env'), Path('.env.production'), Path('services/api/.env.production')]
updated = 0

for relative in files:
    path = root / relative
    if not path.is_file() or path.is_symlink():
        continue
    target = backup / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(path, target)

    lines = path.read_text(encoding='utf-8').splitlines()
    counts = {key: 0 for key in wanted}
    output = []
    for line in lines:
        stripped = line.lstrip()
        key = stripped.split('=', 1)[0].strip() if '=' in stripped else ''
        if key in wanted and not stripped.startswith('#'):
            counts[key] += 1
            output.append(f'{key}={wanted[key]}')
        else:
            output.append(line)
    duplicates = [key for key, count in counts.items() if count > 1]
    if duplicates:
        raise SystemExit(f'duplicate proxy assignments in {relative}: {duplicates}')
    for key, value in wanted.items():
        if counts[key] == 0:
            output.append(f'{key}={value}')
    temporary = path.with_name(path.name + '.tmp-relay')
    temporary.write_text('\n'.join(output) + '\n', encoding='utf-8')
    os.chmod(temporary, path.stat().st_mode & 0o777)
    os.replace(temporary, path)
    updated += 1

if updated == 0:
    raise SystemExit('no production env files were found')

print(f'API proxy updated in {updated} env file(s); values were not printed')
PY

install -d -m 0700 /var/lib/mywave-tourism
printf '%s\n' "$API_ENV_BACKUP" > /var/lib/mywave-tourism/last-api-env-backup
chmod 0600 /var/lib/mywave-tourism/last-api-env-backup

cd /opt/mywave/tourism
docker compose -p toutism -f docker-compose.production.yml \
  up -d --no-deps --force-recreate api

for attempt in $(seq 1 45); do
  STATUS="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' toutism-api-1 2>/dev/null || true)"
  [ "$STATUS" = healthy ] && break
  [ "$STATUS" = running ] && break
  sleep 2
done
docker compose -p toutism -f docker-compose.production.yml ps api

wg show wg0
ip -4 address show dev wg0 | grep -F '10.77.0.2/24'
nc -vz -w5 10.77.0.1 1080

if ufw status | grep -q '^Status: active'; then
  ufw allow from 72.56.99.214 to any port 44181 proto udp
  ufw allow in on wg0 from 10.77.0.1 to 10.77.0.2 port 3002 proto tcp
  ufw allow from "$DOCKER_SUBNET" to "$DOCKER_GW" port 1088 proto tcp
fi

"$RELEASE/install-tourism.sh"
/usr/local/sbin/mywave-tourism-health-tourism

systemctl is-active \
  wg-quick@wg0 \
  mywave-tourism-socks-bridge.service \
  mywave-tourism-api-bridge.service \
  mywave-tourism-webhook-repair.timer

docker exec toutism-api-1 sh -lc '
cd /app/services/api
node - <<'"'"'NODE'"'"'
const { callTelegramJson } = require("./dist/modules/telegram/telegramApi");

Promise.all([
  callTelegramJson(process.env, "getMe", {}),
  callTelegramJson(process.env, "getWebhookInfo", {}),
]).then(([bot, webhook]) => {
  const result = webhook && webhook.result;
  console.log(JSON.stringify({
    proxy: process.env.TELEGRAM_BOT_HTTP_PROXY,
    bot_ok: bot && bot.ok === true,
    bot_username: bot && bot.result && bot.result.username,
    webhook_ok: webhook && webhook.ok === true,
    webhook_url: result && result.url,
    pending_update_count: result && result.pending_update_count,
    last_error_message: result && result.last_error_message || null,
  }, null, 2));
  process.exit(bot && bot.ok === true && webhook && webhook.ok === true ? 0 : 1);
}).catch(() => process.exit(1));
NODE
'
```

Ожидается: четыре `active`, `Tourism relay health: ok`, `bot_ok: true`,
`webhook_ok: true`, proxy `socks5://172.18.0.1:1088`. Поле
`webhook_url` должно содержать текущий случайный `trycloudflare.com` host.

### 3a. Только авторемонт webhook поверх legacy `tourism-wg-*` (текущий прод)

На `msk-1-vm-9j6k` полный `install-tourism.sh` откатывался; работают legacy-юниты
`tourism-wg-socks-bridge` (1088 → EU 10.77.0.1:**1081**) и `tourism-wg-api-bridge` (10.77.0.2:3002).
Quick tunnel (`trycloudflare.com`) меняет host при каждом рестарте `mywave-tourism-cloudflared` на EU —
без таймера webhook приходится переставлять руками.

Таймер раз в ~2 мин берёт текущий host из `RELAY_STATUS_URL`, проверяет `POST /public/telegram/webhook`
(нужен маршрут в API, есть с 2026-09-24) и вызывает `setWebhook` только при расхождении.

Проверить скрипт вручную (VPS, одна строка). Ожидаемо `webhook repair: already current` или `updated`:

```bash
set -a; . /etc/mywave-tourism/tourism.env; set +a; python3 /usr/local/libexec/mywave-tourism/tourism/webhook_repair.py --env-root="$WEBHOOK_ENV_ROOT" --env-files="$WEBHOOK_ENV_FILES" --status-url="$RELAY_STATUS_URL" --socks-url="$WEBHOOK_SOCKS_URL" --telegram-api-origin="$TELEGRAM_API_ORIGIN" --timeout="$WEBHOOK_HTTP_TIMEOUT"
```

Поставить только service + timer (скрипт и `/etc/mywave-tourism/tourism.env` уже на месте):

```bash
cp /opt/mywave/tourism/infra/tourism-telegram-relay/systemd/mywave-tourism-webhook-repair.service /opt/mywave/tourism/infra/tourism-telegram-relay/systemd/mywave-tourism-webhook-repair.timer /etc/systemd/system/ && systemctl daemon-reload && systemctl enable --now mywave-tourism-webhook-repair.timer && systemctl list-timers mywave-tourism-webhook-repair.timer --no-pager
```

Журнал: `journalctl -u mywave-tourism-webhook-repair.service -n 20 --no-pager -o cat`.
Ошибка `... returned non-JSON (HTTP 404)` для `/public/telegram/webhook` = в API нет маршрута webhook
или туннель смотрит не туда; для `api.telegram.org` = проблема SOCKS/EU.

## 4. Проверка реального входящего сообщения

1. Отправьте `/start` боту `@MyWaveTour_bot`.
2. Убедитесь, что бот ответил по-русски.
3. На Tourism VPS выполните:

```bash
set -euo pipefail
set +x
cd /opt/mywave/tourism

docker compose -p toutism -f docker-compose.production.yml exec -T postgres sh -lc '
psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -P pager=off -c "
select
  \"telegramUserId\",
  username,
  \"firstName\",
  \"lastSeenAt\",
  \"updatedAt\"
from telegram_users
order by \"updatedAt\" desc
limit 5;
"
'

journalctl -u mywave-tourism-api-bridge.service --since '5 minutes ago' --no-pager
docker compose -p toutism -f docker-compose.production.yml logs --since=5m --tail=200 api
```

`lastSeenAt` и `updatedAt` должны соответствовать времени отправки `/start`.

## 5. Откат

### EU VPS

```bash
set -euo pipefail
set +x
[ "$(hostname)" = "shared-eu-socks" ]
/usr/local/sbin/mywave-tourism-rollback-eu
/usr/local/sbin/mywave-tourism-health-eu || true
```

### Tourism VPS

```bash
set -euo pipefail
set +x
[ "$(hostname)" = "msk-1-vm-9j6k" ]

/usr/local/sbin/mywave-tourism-rollback-tourism

BACKUP="$(cat /var/lib/mywave-tourism/last-api-env-backup)"
case "$BACKUP" in
  /var/backups/mywave-tourism/*-api-env) ;;
  *) echo "Invalid API env backup path"; exit 1 ;;
esac

cd /opt/mywave/tourism
for file in .env .env.production services/api/.env.production; do
  if [ -f "$BACKUP/$file" ]; then
    cp -a "$BACKUP/$file" "$file"
  fi
done

docker compose -p toutism -f docker-compose.production.yml \
  up -d --no-deps --force-recreate api
docker compose -p toutism -f docker-compose.production.yml ps api
```

После отката проверьте именно восстановленные старые unit-файлы; новые health
scripts могут быть удалены snapshot-откатом.

## 6. Риски, которые остаются

- `trycloudflare.com` Quick Tunnel не имеет гарантии uptime. Timer обновляет
  Telegram webhook после смены host, но кратковременный перерыв возможен.
- Это инфраструктурный пакет. Он не исправляет бизнес-логику Telegram update
  handler и не пересобирает API.
- Развёртываемый API обязан содержать `dist/modules/telegram/telegramApi` и
  поддерживать `TELEGRAM_BOT_HTTP_PROXY`. Установщик проверяет это через
  реальный `getMe` из контейнера.
- WireGuard private keys и Telegram token не входят в артефакт и не должны
  передаваться в чат или попадать в логи.
