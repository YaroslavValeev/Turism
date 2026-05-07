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

---

## 1. Docker

Вставьте актуальный вывод после выката этого SHA:

```bash
docker compose -f docker-compose.production.yml ps
```

```text
(заполнить)
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

```bash
curl -sS "https://api.mywavetour.ru/health"
```

```text
(ожидаемо: {"status":"ok"})
```

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
