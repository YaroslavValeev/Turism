# MyWaveTour Telegram Admin runbook

Production HOLD: this is the MyWaveTour Telegram Admin contract/runbook only.
It is not TGbotAdmin MyWave, Site Admin, ParserNews Admin, Parser, or YClients.

## Scope

Telegram Admin manages internal MyWaveTour entities that can later be exposed
through Camp API after approval. Site only reads Camp API and performs its own
moderation. ParserNews must not write directly to Tour Camp API without a
separate contract.

## Data contract

Camp moderation status:

```text
new -> needs_review -> approved -> published -> hidden/archived
```

Content rights status:

- `partner_allowed`
- `unknown`
- `restricted`

`partner_allowed` is allowed only after explicit confirmation. Automatic ingest
must keep `unknown` unless a human/partner confirmation is recorded.

Availability status:

- `available`
- `few_spots`
- `sold_out`
- `unknown`

Duplicate signals to show in the admin:

- possible duplicate
- organizer match
- date match
- title match
- source URL match

Organizer moderation fields:

- canonical organizer
- several sources for one organizer
- contacts
- website
- Telegram
- Instagram/VK
- verification status

## Callback contract

Source: `services/api/src/modules/telegram-admin/contracts.ts`

Prefix: `MTA1`

### Camp entity (контракт; runtime handler пока заглушка)

```text
MTA1|C|<ACTION>|<camp_id>
```

Actions:

- `APP` -> `approve`
- `PUB` -> `publish`
- `HID` -> `hide`
- `ARC` -> `archive`
- `RAL` -> `rights_allowed`
- `RUN` -> `rights_unknown`
- `RRS` -> `rights_restricted`
- `RQR` -> `rights_request`
- `DUP` -> `duplicate_review`

### Program entity (реализовано: check → preview → publish)

```text
MTA1|P|PRV|<program_id>   preview + publish gate
MTA1|P|PUB|<program_id>   confirm → Program.publishStatus=published
MTA1|P|NFX|<program_id>   → needs_fix
MTA1|P|CXL|<program_id>   dismiss keyboard
```

Команды в owner-chat (тот же webhook content-pipeline):

- `/check_publish`
- `/programs_review`

Поток: очередь будущих программ → «Проверить» → gate → «Опубликовать на сайте и в Telegram».

Единый apply-path с админкой: `setProgramPublishStatus` → notify только при переходе в `published`.

Политика: [PROGRAM_PUBLISH_POLICY.md](../PROGRAM_PUBLISH_POLICY.md).

**Не путать:** content-pipeline кнопка `Publish` (`P|<draftId>`) ставит decision `approved` у черновика контента, а не публикует каталогную Program.

### Операторский пульт `/menu` (реализовано)

Source: `services/api/src/modules/telegram-admin/operatorMenu.ts`. Работает только в owner-chat (`TELEGRAM_CONTENT_OWNER_CHAT_ID`).

Команды:

- `/menu` (`/start`, `/ops`) — пульт с кнопками; заодно регистрирует подсказки команд (`setMyCommands`, scope = owner-chat);
- `/status` — сводка: актуальные опубликованные программы, очередь публикации, кандидаты `needs_review`, последний сбор, ошибки сбора за 24 ч, протухшие фото Telegram;
- `/help` — список команд;
- `/check_publish`, `/programs_review` — очередь публикации (см. выше).

```text
MTA1|M|HOM|0   вернуться в меню
MTA1|M|QUE|0   очередь публикации (как /check_publish)
MTA1|M|STA|0   сводка /status
MTA1|M|SYN|0   экран подтверждения сбора
MTA1|M|SYY|0   ЗАПУСК: runDailySyncJob (источники, которым пора: collect → normalize → dedup → autopublish по гейту)
MTA1|M|MED|0   экран подтверждения ремонта фото
MTA1|M|MEY|0   ЗАПУСК: refreshTelegramProgramMedia (см. TIMEWEB_VPS_COMMANDS.md §12a)
MTA1|M|CXL|0   убрать клавиатуру
```

Сбор и ремонт фото запускаются **только через экран подтверждения** (второе нажатие = approve владельца). Выполняются в фоне: webhook отвечает сразу, итог приходит отдельным сообщением. Одновременно — не больше одной задачи на процесс API (повторное нажатие → «Уже выполняется»).

Кнопки-ссылки: админка (`ADMIN_PUBLIC_URL`, по умолчанию `https://admin.mywavetour.ru`) и сайт (`PUBLIC_SITE_URL`, по умолчанию `https://mywavetour.ru`).

The serialized `callback_data` must be <= 64 bytes. The prefix is intentionally
separate from existing content-pipeline callbacks (`P|...`) and outreach
callbacks.

## Required env names

- `TELEGRAM_BOT_API_BASE_URL`
- `TELEGRAM_ALERT_CHAT_ID`
- `TELEGRAM_CONTENT_OWNER_CHAT_ID` if the admin owner chat differs
- `CONTENT_PIPELINE_TELEGRAM_WEBHOOK_TOKEN` only for the existing content
  pipeline webhook
- `CAMP_API_TOKEN` for private Camp API monitoring/smoke
- `INTERNAL_ANALYTICS_TOKEN` for internal monitoring endpoints where needed

Do not log or print token values.

## API monitoring alerts

Telegram Admin should receive alerts for:

- Camp API unavailable
- feed generation failed
- auth errors
- stale data / no successful update
- invalid media
- content rights unknown
- Site sync failed if Site sends an explicit callback/status

Current repository-side implementation exposes private Camp API runtime status
at `GET /api/v1/camps/health` and logs Camp API auth failures through the safe
logger.

## Repository validation

```bash
pnpm --filter api test -- telegram-admin camp-feed
pnpm --filter api build
```

## Server commands

Project: MyWaveTour Telegram Admin / Program publish
Server: Tour VPS (`5.129.249.113`)
Path: **`/opt/mywave/tourism`** (Compose project name `toutism` via `.env.production`)
На VPS **нет `.git`** — код приезжает rsync/Actions, затем пересборка `api`.

### После выката кода (только API)

```bash
export MW=/opt/mywave/tourism
cd "$MW"
export DC='docker compose --env-file .env.production -f docker-compose.production.yml'
$DC up -d --build api
$DC ps
curl -fsS http://127.0.0.1:3001/health
```

### Env для Telegram publish (без печати токенов)

```bash
cd /opt/mywave/tourism
grep -E '^(TELEGRAM_BOT_API_BASE_URL|TELEGRAM_CONTENT_OWNER_CHAT_ID|TELEGRAM_ALERT_CHAT_ID|TELEGRAM_UPDATES_CHANNEL_CHAT_ID|CONTENT_PIPELINE_TELEGRAM_WEBHOOK_TOKEN)=' .env.production \
  | sed -E 's/=.*/=***set***/'
```

Ожидаемо: все пять строк `=***set***`. Канал должен быть `-1003491522243`.

### Аудит очереди (следующий этап — не массовый publish)

```bash
cd /opt/mywave/tourism
export DC='docker compose --env-file .env.production -f docker-compose.production.yml'
$DC exec -T api sh -c 'cd /app/services/api && pnpm run list:publish-queue'
```

### Smoke в Telegram (owner-chat, не канал)

В owner-chat бота:

```text
/check_publish
```

Далее: **Проверить** → при gate OK → **Опубликовать на сайте и в Telegram** (по одной карточке из `ready_ids`).

### Логи после публикации

```bash
cd /opt/mywave/tourism
export DC='docker compose --env-file .env.production -f docker-compose.production.yml'
$DC logs --tail=80 api | grep -E '\[subscriptions\]|telegram-admin|content-pipeline-telegram' || true
```

Production smoke (program publish via Telegram):

```bash
# In owner chat: /check_publish → Проверить → Опубликовать…
```

```bash
set -euo pipefail
cd /opt/mywave/tourism
docker compose --env-file .env.production -f docker-compose.production.yml ps
curl -fsS http://127.0.0.1:3001/health >/dev/null
```

Rollback:

- Revert only the Telegram Admin service/container or selected files from the
  deployment backup.
- Do not change `CAMP_API_TOKEN` during Telegram Admin rollback unless the
  incident is token leakage.
- Keep Camp API records status-based; do not silently delete Site records.