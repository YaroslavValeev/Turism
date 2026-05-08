# DEPLOY EVIDENCE — 2026-05-06

**Окружение:** production (Timeweb VPS, проект MyWaveTour)  
**Версия / git SHA:** указать коммит из GitHub (`main`) **после** успешного «Deploy production» — на самом VPS **нет** каталога `.git`, `git pull` там не работает.  
**Ответственный:** owner  

### Важно: на Timeweb в `/opt/mywave/toutism` нет репозитория Git

Деплой идёт **rsync** из Actions ([`deploy-production.yml`](../../.github/workflows/deploy-production.yml), список исключений включает **`.git/`**). Обновить код на сервере можно так:

1. Запушить нужный коммит в `main`.
2. GitHub → **Actions** → **Deploy production** → **Run workflow** (вручную).
3. На VPS выполнять только проверки (`docker compose`, `curl`, `grep` по уже скопированным файлам) — **не** `git fetch` / `git reset`.

### Если в контейнере `reverse-proxy`: `grep api/media … MISSING`, а `curl` к сайту — `Connection refused`

Контейнер читает **`./infra/nginx/mywave.conf` с диска VPS** (см. `docker-compose.production.yml`). **`MISSING`** значит: в **этом** файле на сервере **нет** строки про `/api/media` — чаще всего **ещё не был успешный Deploy production** с актуальным `main` (rsync не обновил дерево).

**`curl: … port 443 … Connection refused`** — на хосте **ничего не слушает 443** (nginx в Docker не поднялся, упал после старта, или контейнер в рестарте). Смотрите логи и `nginx -t`, не перезагружайте всю VM, пока не проверите контейнер.

Диагностика по порядку на VPS:

```bash
cd /opt/mywave/toutism
COMPOSE="docker compose -f docker-compose.production.yml"

# 1) Файл на ХОСТЕ (источник монтирования) — должен содержать api/media:
grep -n 'api/media' infra/nginx/mywave.conf || echo 'НА ДИСКЕ СТАРЫЙ КОНФИГ — запустите Deploy production из GitHub'

# 2) Реальное состояние reverse-proxy (не только "Started"):
$COMPOSE ps -a reverse-proxy
$COMPOSE logs --tail=100 reverse-proxy

# 3) Синтаксис nginx внутри контейнера (если контейнер не в CrashLoop — выполнится):
$COMPOSE exec -T reverse-proxy nginx -t 2>&1

# 4) Кто слушает 443 на хосте:
ss -tlnp | grep -E ':443|:80' || true
```

Если п.1 пустой — **только** выкат через Actions обновит `infra/nginx/mywave.conf`. После зелёного job снова: `$COMPOSE up -d --force-recreate reverse-proxy` и проверка `curl -I https://mywavetour.ru/`.

### Если в GitHub Actions падает шаг **«Rsync codebase to VPS»** (SSH probe 20/20, `Timeout, server … not responding`, exit **255**)

Это **не** ошибка Prisma/Docker на сервере: раннер **не смог открыть SSH :22** до VPS за отведённое число попыток. Шаг **«Build and restart …»** даже **не запускается** — на диск **ничего не копируется**, прод остаётся на последнем **успешном** деплое.

**Что проверить на стороне Timeweb / сети**

- Файрвол / «защита от DDoS» / списки доступа: **разрешён входящий TCP 22** с интернета (или с подсетей, с которых реально ходит `ubuntu-latest`; проще временно **22 для всех** на время деплоя, потом ужесточить).
- Не сменился ли **IP VPS** или **порт SSH** — секреты `DEPLOY_HOST` / ключ в GitHub должны совпадать с реальностью.
- **Fail2ban** / rate-limit по SSH: после серии неудачных попыток IP раннера мог быть временно забанен — разбан или пауза, затем **Re-run** workflow.
- Повторить деплой **в другое время** (иногда блокируется транзит Azure → ваш регион).

**Обходы, если GitHub → VPS стабильно не коннектится**

- [Self-hosted runner](https://docs.github.com/en/actions/hosting-your-own-runners) **на этом же VPS** (или в той же сети) — тогда rsync/ssh идут локально, без «лотереи» Azure→Timeweb (это уже заложено в комментарии [`deploy-production.yml`](../../.github/workflows/deploy-production.yml)).
- Разовый **ручной выкат** с ПК, где SSH до VPS уже открыт: скрипт **[`scripts/manual_rsync_deploy_timeweb.sh`](../../scripts/manual_rsync_deploy_timeweb.sh)** (`DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_KEY_FILE`, опционально `BUILD_MODE=full|incremental`).
- В **Deploy production** при запуске workflow можно выбрать **`build_mode`**: по умолчанию **`incremental`** (`docker compose up -d --build` — быстрее); **`full`** — прежний холодный `build --no-cache` + `up`.

## Связанные артефакты

- Источники и SQL: [`SOURCE_INVENTORY_2026-05-06.md`](./SOURCE_INVENTORY_2026-05-06.md)
- Gates: [`../gates/GATE1_LOCAL_GREEN_SMOKE.md`](../gates/GATE1_LOCAL_GREEN_SMOKE.md), [`../gates/P1_CHECKPOINT.md`](../gates/P1_CHECKPOINT.md)
- CI: деплой только **`workflow_dispatch`** — [`.github/workflows/deploy-production.yml`](../../.github/workflows/deploy-production.yml)
- Health URL на основном домене: [`ADR_PUBLIC_HEALTH_ENDPOINT.md`](./ADR_PUBLIC_HEALTH_ENDPOINT.md)
- Раннер / SSH-риск: [`ADR_TIMEWEB_DEPLOY_RUNNER.md`](./ADR_TIMEWEB_DEPLOY_RUNNER.md)

---

## 0. Production runtime — ручная проверка VPS (2026-05-08)

**Статус:**

```text
Production runtime: GREEN
Deploy transport: improved, still monitored (SSH/rsync остаётся зоной внимания)
Launch mode: GO WITH GUARDRAILS / controlled pilot
Health endpoint: PASSED
/api/health: PASSED
/health: PASSED
nginx alias location = /health: present
Deploy run: #22
SHA: d3d503e
Runtime status: GREEN
```

| Проверка | Результат |
|----------|-----------|
| Runtime | **PASSED** |
| Home page | **PASSED** |
| API health | **PASSED** (`GET https://mywavetour.ru/api/health` → `{"status":"ok"}`) |
| Media | **PASSED** |
| Placeholder | **PASSED** |
| Containers | **PASSED** |

Контейнеры на сервере `/opt/mywave/toutism` (фактические имена):

| Контейнер | Состояние |
|-----------|-----------|
| `toutism-admin-1` | Up |
| `toutism-api-1` | Up / healthy |
| `toutism-postgres-1` | Up / healthy |
| `toutism-reverse-proxy-1` | Up |
| `toutism-web-1` | Up |

**Зафиксированные команды и ответы:**

```bash
curl -sS -I https://mywavetour.ru/ | head -n 8
# HTTP/2 200

curl -sS https://mywavetour.ru/api/health
# {"status":"ok"}

curl -sS -I 'https://mywavetour.ru/api/media?url=https%3A%2F%2Fimages.unsplash.com%2Fphoto-1506905925346-21bda4d32df4%3Fw%3D200' | head -n 12
# HTTP/2 200

curl -sS -I https://mywavetour.ru/images/placeholders/program-card.svg | head -n 12
# HTTP/2 200
# content-type: image/svg+xml

docker compose -f docker-compose.production.yml exec -T reverse-proxy sh -lc 'wget -qO- http://api:3001/health'
# {"status":"ok"}
```

### Сверка Deploy #20, SHA и alias `/health` (история, закрыто Deploy #22)

| Факт | Значение |
|------|----------|
| Успешный **Deploy production #20** | В логах Actions указан SHA **`88eb91b`** |
| Коммит с nginx **`location = /health`** | **`813fac3`** (документация — **`bb813e4`** и далее по `main`) — **позже**, чем `88eb91b` |
| Вывод | #20 **не доставлял** alias; хвост закрыт в **Deploy #22** (SHA `d3d503e`) |

**Проверка с интернета (внешний curl, без SSH на VPS):**

| URL | Результат |
|-----|-----------|
| `GET https://mywavetour.ru/api/health` | **200** `{"status":"ok"}` — **PASSED** |
| `GET https://mywavetour.ru/health` | **200** `{"status":"ok"}` — alias применён |

Итоговая строка после подтверждённого выката **Deploy #22 / SHA d3d503e**:

```text
/api/health: PASSED
/health: PASSED
nginx alias location = /health: present
Production runtime: GREEN
Deploy transport: improved, still monitored
Health alias from 813fac3: applied
```

**На VPS после выката актуального `main`:**

```bash
cd /opt/mywave/toutism
git rev-parse --short HEAD 2>/dev/null || echo "No .git in deploy path"
grep -n "location = /health" infra/nginx/mywave.conf || echo "NO /health alias in current VPS file"
docker compose -f docker-compose.production.yml up -d --force-recreate reverse-proxy
curl -sS https://mywavetour.ru/api/health && echo
curl -sS https://mywavetour.ru/health && echo
```

Результат Deploy #22: `reverse-proxy` пересоздан, алиас применён, оба endpoint (`/api/health` и `/health`) возвращают `{"status":"ok"}`.

**Health endpoint:** публичный JSON с API на основном домене канонически доступен как **`GET https://mywavetour.ru/api/health`**. Короткий путь **`GET https://mywavetour.ru/health`** теперь тоже PASSED благодаря alias в nginx (**`location = /health` → `api:3001/health`**, коммит **`813fac3`**, выкат подтверждён в Deploy #22 SHA `d3d503e`). Подробности: [`ADR_PUBLIC_HEALTH_ENDPOINT.md`](./ADR_PUBLIC_HEALTH_ENDPOINT.md).

## 0b. P0 checkpoint hardening (2026-05-08)

### Source runs triage

Snapshot (owner-provided):

```text
success: 239
failed: 231
running: 2
failed categories:
- other: 204
- invalid_url: 27
```

Требуемая декомпозиция `other`:

```text
http_429
fetch_failed
timeout
http_404
http_403
parser_error
media_fetch_failed
unsupported_source
empty_response
network_error
unknown
```

Таблица результата (для owner checkpoint):

```text
source_id
type
url_or_handle
is_active
failed_count
last_error
category
recommended_action: keep / retry / fix_parser / pause / disable / manual_review
reason
```

### Prod healthcheck

`scripts/prod_healthcheck.sh` обновлён под обязательные проверки:

- `GET /`
- `GET /api/health`
- `GET /health`
- `GET /api/media`
- `GET placeholder`
- `docker compose ps`
- `df -h`
- `free -m`
- recent `5xx` logs

### Safe Docker cleanup (policy)

Before/after фиксируются командами:

```bash
docker system df
df -h
```

Разрешено:

```bash
docker image prune -f
docker builder prune -f --filter "until=168h"
```

Запрещено без отдельного owner confirmation:

```bash
docker volume prune
docker system prune --volumes
```

### Owner decisions (unchanged)

```text
Scheduler policy: external cron only
Deploy policy: manual workflow_dispatch only
Autodeploy on push: disabled
Self-hosted runner: deferred, requires ADR
Auto-publish ingestion: disabled
Payments/invoices: disabled for pilot
```

**Следующий фокус команды:** triage `source_runs failed` (in progress); safe Docker cleanup по политике; мониторинг — [`scripts/prod_healthcheck.sh`](../../scripts/prod_healthcheck.sh) (обновлён под `/api/health` + опционально `/health`).

**Единый пакет артефактов и регламентов (controlled pilot — всё входит в один контур evidence):**

| Область | Репозиторий / статус |
|---------|----------------------|
| Runtime | §0, таблица PASSED |
| Деплой | [`deploy-production.yml`](../../.github/workflows/deploy-production.yml): `workflow_dispatch`, `deploy_mode`; транспорт **улучшен (#20 зелёный)**, риск SSH **под мониторингом** — [`ADR_TIMEWEB_DEPLOY_RUNNER.md`](./ADR_TIMEWEB_DEPLOY_RUNNER.md), обход [`manual_rsync_deploy_timeweb.sh`](../../scripts/manual_rsync_deploy_timeweb.sh) |
| Nginx | [`infra/nginx/mywave.conf`](../../infra/nginx/mywave.conf): `/api/media` → web, `/api/` → api, `location = /health` → api |
| Health | [`ADR_PUBLIC_HEALTH_ENDPOINT.md`](./ADR_PUBLIC_HEALTH_ENDPOINT.md) |
| Мониторинг / smoke | [`prod_healthcheck.sh`](../../scripts/prod_healthcheck.sh), [`smoke_media.sh`](../../scripts/smoke_media.sh) |
| Источники | [`triage_source_runs.sh`](../../scripts/triage_source_runs.sh), [`SOURCE_INVENTORY_2026-05-06.md`](./SOURCE_INVENTORY_2026-05-06.md) — triage **in progress** |
| TLS sync | [`le-deploy-sync.sh`](../../scripts/le-deploy-sync.sh) |
| Runbook | [`TIMEWEB_VPS_COMMANDS.md`](./TIMEWEB_VPS_COMMANDS.md) |
| Витрина | Плейсхолдер [`apps/web/public/images/placeholders/program-card.svg`](../../apps/web/public/images/placeholders/program-card.svg); кинолента [`toursFilmstripModel.ts`](../../apps/web/src/components/toursFilmstripModel.ts) |
| Данные | Снимок импортов [`services/api/prisma/source_imports_all_2026-05-05.json`](../../services/api/prisma/source_imports_all_2026-05-05.json) |
| Docker cleanup | Политика — §13 в [`TIMEWEB_VPS_COMMANDS.md`](./TIMEWEB_VPS_COMMANDS.md); выполнение по окну владельца |

---

## 1. Docker

Актуальный снимок контейнеров: **§0** (2026-05-08). Повторная проверка:

```bash
cd /opt/mywave/toutism
docker compose -f docker-compose.production.yml ps
```

---

## 2. DNS / TLS

| Хост | Назначение | Проверено |
|------|------------|-----------|
| `mywavetour.ru` | web | |
| `admin.mywavetour.ru` | admin | |
| `api.mywavetour.ru` | api | |

---

## 3. Health

**Основной домен (витрина):**

| Метод | URL | Примечание |
|-------|-----|------------|
| GET | `https://mywavetour.ru/api/health` | Канон для smoke/monitoring; **PASSED** на runtime-проверке 2026-05-08 |
| GET | `https://mywavetour.ru/health` | **PASSED** после Deploy #22 (SHA `d3d503e`), alias `location = /health` применён |

**Хост API:**

```bash
curl -sS "https://api.mywavetour.ru/health"
```

```text
{"status":"ok"}
```

ADR: [`ADR_PUBLIC_HEALTH_ENDPOINT.md`](./ADR_PUBLIC_HEALTH_ENDPOINT.md).

---

## 4. Миграции

```bash
docker compose -f docker-compose.production.yml exec api sh -lc \
  'cd /app/services/api && pnpm exec prisma migrate deploy'
```

```text
(вставить последнюю строку статуса; ожидаемо: нет pending)
```

---

## 5. БД — inventory (зафиксировано SQL)

Сводка из [`SOURCE_INVENTORY_2026-05-06.md`](./SOURCE_INVENTORY_2026-05-06.md):

| Метрика | Значение |
|---------|----------|
| `organizers` | 17 |
| `sources` | 86 |
| по типам (все `isActive`) | site **56**, instagram **20**, telegram **10** |
| `type = website` | 0 |
| дубликаты `(type, urlOrHandle)` | 0 |

Импорт реестра v5 (повторный прогон): `{ "total": 68, "created": 0, "updated": 68 }`.

---

## 6. Prod env guardrails

Проверить, что переменные реально попадают в процесс API (не только в файл на хосте):

```bash
docker compose -f docker-compose.production.yml exec api sh -lc \
  'env | sort | grep -E "^(APP_ENV|PILOT_MODE|LEGAL_CONSENT|SEED_DEMO|AI_|INGESTION_AUTOPUBLISH)="'
```

Чеклист имён см. в `services/api/.env.example` (блок Timeweb guardrails) и в SOURCE_INVENTORY.

```text
(вставить вывод; если виден только APP_ENV — перезапустить api после правки env_file)
```

---

## 7. Security

- [ ] Утечённый GitHub PAT отозван; новый токен не в git / скринах / markdown с секретами.

---

## 8. Smoke (публичный API + админ)

- [ ] `POST /bookings` без `legalConsent` → **400**
- [ ] `legalConsent: true` → **201**, есть `legalConsentAt`
- [ ] повтор в окне дубликата → **409**
- [ ] `GET /metrics/pilot-kpi` без JWT → **401**
- [ ] Web / Admin открываются по HTTPS

Команды: см. [`../gates/GATE3_TIMEWEB_EVIDENCE.md`](../gates/GATE3_TIMEWEB_EVIDENCE.md).

---

## 9. Images / media (P1 UX blocker)

Симптом до фикса: карточки загружались, но часть изображений в каталоге была broken (массовые ошибки во вкладке Network → Img).

### Инфраструктурный фикс (Docker + Nginx)

- `docker-compose.production.yml` — сервис **`web`** должен монтировать named volume `ingestion_media` на **`/app/apps/web/public/ingestion-media`** (как **api**). Иначе файлы лежат только в контейнере API, а запросы к `https://mywavetour.ru/ingestion-media/...` идут в **Next** → **404**.
- `infra/nginx/mywave.conf` — префикс **`/api/media`** должен проксироваться на **`web:3000`** (Next), а не на **`api:3001`**. Иначе прокси внешних картинок (`/api/media?url=...`) даёт **404** на REST-бэкенде.

### Кодовый фикс в релиз-кандидате

- `apps/web/src/components/ProgramCard.tsx` — `onError` fallback на placeholder.
- `apps/web/src/components/ProgramRailCard.tsx` — `onError` fallback на placeholder.
- `apps/web/src/lib/programCardCover.ts` — фильтр битых literal URL; `normalizeProgramCardCoverSrc` — плейсхолдер для ложных путей вида `/api/...` (кроме **`/api/media`**).
- `apps/web/public/images/placeholders/program-card.svg` — production-safe placeholder.

### Проверка на сервере

**Не использовать `git`** в `/opt/mywave/toutism`. Сначала дождаться выката через **Deploy production**, затем:

```bash
cd /opt/mywave/toutism
COMPOSE="docker compose -f docker-compose.production.yml"

# 0) /ingestion-media — готовая проверка без ручной подстановки имени файла:
# берём первый файл из каталога в контейнере web и делаем curl -I по публичному URL.
F=$($COMPOSE exec -T web sh -lc 'ls -1 /app/apps/web/public/ingestion-media 2>/dev/null | head -n1')
if [ -z "$F" ]; then echo "Нет файлов в ingestion-media (volume пуст или путь другой)"; else echo "Проверяем: $F"; curl -sS -I "https://mywavetour.ru/ingestion-media/${F}"; fi

# 0b) Next image proxy — должен идти на web (nginx), ответ 200 (не HTML-404 от backend):
curl -sS -I 'https://mywavetour.ru/api/media?url=https%3A%2F%2Fimages.unsplash.com%2Fphoto-1506905925346-21bda4d32df4%3Fw%3D200'

# Если здесь 404 + content-type: text/html — на сервере НЕ задеплоен блок `location ^~ /api/media` → web.
# Проверка на хосте и внутри контейнера nginx:
grep -n 'api/media' infra/nginx/mywave.conf || true
$COMPOSE exec -T reverse-proxy sh -lc 'grep -n api/media /etc/nginx/conf.d/default.conf || echo MISSING'

# 1) GET /api/programs — это JSON-массив программ; обложки в `.media[]`, не в `imageUrl`.
curl -fsS https://mywavetour.ru/api/programs | head -c 3000

# 2) Корректный jq: первая картинка из media (иначе везде «NO_IMAGE» по ошибке):
curl -fsS https://mywavetour.ru/api/programs | jq -r '.[] | [ (.title // "NO_TITLE"), ((.media // []) | map(select(.mediaType == "image")) | .[0].url // "NO_MEDIA") ] | @tsv' | head -50

# Устаревший запрос (даёт ложные NO_IMAGE — полей imageUrl у нас в выдаче нет):
# curl ... | jq '.. | objects | select(.title?) | ... imageUrl ...'

# Альтернатива: явное имя (подставьте своё из ls на сервере):
# curl -sS -I "https://mywavetour.ru/ingestion-media/bonus-summer-camp-2024-example-hash.jpg"

# 3) Полный дамп nginx (по желанию):
$COMPOSE exec -T reverse-proxy nginx -T | grep -Ei "uploads|media|images|static|_next|api/media" -n || true
```

### Acceptance criteria

- [ ] На главной/каталоге нет broken image icon.
- [ ] Карточка показывает либо реальную картинку, либо `/images/placeholders/program-card.svg`.
- [ ] В DevTools Network → Img нет массовых 404/400.
- [ ] API не отдаёт image URL вида `/undefined`, `/null`, `null`, `undefined`.
- [ ] После `docker compose up -d --build web api reverse-proxy` поведение подтверждено (включая **один** `ingestion_media` у **web** и **api**).

---

## 10. Final incident close (2026-05-07)

### Что было

- После деплоя периодически получали `502 Bad Gateway` на `https://mywavetour.ru/`.
- В логах `reverse-proxy`: недоступен upstream `web:3000` и/или отсутствовали TLS-файлы в `infra/nginx/certs/`.
- Отдельно зафиксирован нестабильный SSH из GitHub Actions к VPS (`Rsync codebase to VPS`, exit 255).

### Что сделали

- Восстановили сертификаты в `infra/nginx/certs/` на VPS (валидные `fullchain.pem` и `privkey.pem`).
- Применили runtime-правки и пересоздали `web` + `reverse-proxy`.
- В репозитории внесли защитные изменения:
  - `deploy-production.yml`: `rsync` исключает `infra/nginx/certs/` (чтобы не стирать PEM на VPS).
  - Добавлены диагностические команды и инструкции в deployment docs.
  - Уточнён порядок деплоя: на VPS без `.git`, выкаты через `workflow_dispatch`.

### Подтверждение

- `GET /` → `HTTP/2 200`
- `GET /api/media?url=...` → `HTTP/2 200`
- `docker compose -f docker-compose.production.yml ps`:
  - `reverse-proxy` — Up
  - `web` — Up
  - `api` — Up
  - `admin` — Up
  - `postgres` — healthy

### CI / Deploy

- `Deploy production #14` — Success (базовая стабилизация).
- `Deploy production #15` — Success (SHA `8d2f560`), быстрый rsync+restart.
- Актуальный фикс сети upstream в compose: SHA `1ecd736`.
- Актуальный фикс `le-deploy-sync`: SHA `8d2f560`.
- Актуальный фикс `rsync exclude infra/nginx/certs/`: SHA `8e6dd0d`.

### Статус

- Инцидент 502 закрыт.
- P1 по доступности web/media закрыт.

---

## 11. GM checkpoint update (2026-05-07)

### Runtime

**2026-05-08:** ручная проверка на VPS — **GREEN**, таблица PASSED и команды — в **§0**. Канон health на витрине: **`GET https://mywavetour.ru/api/health`**. Короткий **`GET /health`** на том же домене — после выката nginx alias ([`ADR_PUBLIC_HEALTH_ENDPOINT.md`](./ADR_PUBLIC_HEALTH_ENDPOINT.md)).

Снимок **2026-05-07**:

- `GET /` → `HTTP/2 200`
- `GET /api/media?url=...` → `HTTP/2 200`
- `GET /images/placeholders/program-card.svg` → `HTTP/2 200`
- `docker compose -f docker-compose.production.yml ps`: `reverse-proxy`, `web`, `api`, `admin`, `postgres` в состоянии Up (postgres healthy)

### Env (api container)

Факт: env-выгрузка внутри `api` получена; guardrails проверяются через:

```bash
docker compose -f docker-compose.production.yml exec -T api sh -lc \
'env | grep -E "APP_ENV|PILOT_MODE_ENABLED|LEGAL_CONSENT_POLICY_VERSION|AI_ENABLED|AI_OWNER_APPROVAL_REQUIRED|AI_AUTOPUBLISH_ENABLED|INGESTION_AUTOPUBLISH_ENABLED|SEED_DEMO_CATALOG"'
```

Критично для controlled pilot:

- `AI_AUTOPUBLISH_ENABLED=false`
- `INGESTION_AUTOPUBLISH_ENABLED=false`
- `SEED_DEMO_CATALOG=0`

### Backup

- Файл создан: `backups/mywavetour_20260507_085749.sql`
- Размер: ~`3.4M`
- Команда: `pg_dump` из контейнера `postgres` в каталог `backups/`

### Scheduler / deploy policy (owner accepted)

```text
Ingestion scheduler mode: external cron only
Internal scheduler: disabled / not used
Systemd timers/services: not detected
Owner decision: accepted
```

```text
Deploy policy: manual workflow_dispatch only
Autodeploy on push: disabled
Self-hosted runner: ADR required before implementation
```

### Source runs

Snapshot:

```text
success: 239
failed: 231
running: 2
```

Первичная декомпозиция failed:

```text
fetch_failed: 162
http_429: 42
invalid_url: 27
```

Triage status: **in progress** (первичная декомпозиция сделана; нужен action-list по источникам и закрытие stale running).

`running: 2` — классифицированы как вероятные stale (старые `startedAt`, без `finishedAt`), требуется controlled close по runbook.

### Docker resources

Before cleanup snapshot:

```text
disk usage: ~77%
docker build cache: ~21.1GB
```

Safe cleanup policy согласована: `docker image prune -f` + `docker builder prune -f --filter "until=168h"` без удаления volumes.

### Known issues

- Риск SSH/rsync timeout (GitHub Actions → VPS).
- Периодический `Prisma binary fetch ETIMEDOUT` при сборке `api` в deploy workflow.
- Высокий объём `source_runs failed`, большая категория `other`.

---

## 12. Follow-up: доступ без VPN, медиа, failed deploy (2026-05-08)

### Что произошло

- Скриншот Actions: шаг **«Rsync codebase to VPS»** завершился **SSH timeout :22** — выкат **не выполнен**, production остаётся на **последнем успешном** деплое, а не на «ожидаемом» коммите.
- В консоли браузера: **`GET /_next/image?url=%2Fapi%2Fmedia%3F... 400`** — блок «Туры и кемпы» (`ToursFilmstrip`) прокидывал URL вида `/api/media?url=...` в **`next/image`**; оптимизатор часто отвечает **400** на длинных query. **Исправление в коде:** для `/api/media` использовать обычный `<img>` (флаг `isRemote` в [`toursFilmstripModel.ts`](../../apps/web/src/components/toursFilmstripModel.ts), см. `coverUrl`).
- Карточки с подписью «Источник: scontent-…cdninstagram.com» — это **SVG-плейсхолдер** из [`app/api/media/route.ts`](../../apps/web/src/app/api/media/route.ts), когда **upstream (Instagram CDN) не отдал картинку** с сервера (429/403/срок ссылки). Это не баг разметки карточки «Ближайшие старты», а ограничение источника; обложки из других источников могут отображаться нормально.

### Доступ «без VPN не открывается, с VPN открывается»

Отдельная тема от Docker/Next: проверить **одинаковый ли IP** у `mywavetour.ru` и `www.mywavetour.ru`, нет ли **блокировки провайдера/региона**, в панели Timeweb — **файрвол: 80/443** для нужных сетей (не путать с **SSH :22**, который нужен только для деплоя).

### Что сделать операционно

1. Починить/обойти **SSH до VPS** (firewall, fail2ban, временно открыть 22) и повторить **Deploy production**, либо выкат вручную: [`scripts/manual_rsync_deploy_timeweb.sh`](../../scripts/manual_rsync_deploy_timeweb.sh).
2. После появления коммита с фиксом киноленты — **rebuild `web`** на сервере и проверка: в DevTools нет массовых **`/_next/image` 400** для `/api/media`.
