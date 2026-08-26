# Timeweb: выкат в логичной последовательности

### Канон на production VPS (Timeweb)

| Сущность | Значение |
|----------|----------|
| **Рабочий каталог** | **`/opt/mywave/tourism`** — здесь `docker-compose.production.yml` |
| **Имя Docker Compose project** | **`toutism`** — из **`COMPOSE_PROJECT_NAME=toutism`** в **`$MW/.env.production`**. Контейнеры: **`toutism-api-1`**, **`toutism-web-1`**, … |
| **Команды compose** | **`docker compose --env-file .env.production -f docker-compose.production.yml …`** — без **`--env-file`** имя проекта станет **`tourism`** (имя папки) → **`tourism-*`** (путаница с целевым **`toutism-*`**). |
| **Секрет `DEPLOY_PATH` в GitHub** | **`/opt/mywave/tourism`** (по умолчанию в workflow). Путь **`/opt/mywave/toutism`** — только **историческая папка** в старых заметках, не смешивать с именем проекта **`toutism`**. |

**Короткая формула:** папка на диске **`tourism`**, проект Compose **`toutism`**, префикс контейнеров **`toutism-*`**.

**В каждой новой SSH-сессии на VPS:**

```bash
export MW=/opt/mywave/tourism
cd "$MW"
```

Проверка каталога compose **без угадывания имени контейнера** (из **`$MW`**):

```bash
export MW=/opt/mywave/tourism
cd "$MW"
export DC='docker compose --env-file .env.production -f docker-compose.production.yml'
CID=$($DC ps -q api | head -n1)
docker inspect "$CID" --format '{{ index .Config.Labels "com.docker.compose.project.working_dir" }}'
```

Ожидается **`/opt/mywave/tourism`**. Имя контейнера (**`toutism-api-1`**) смотрите в **`$DC ps`** — не подставляйте имя «с памяти», если на сервере когда-то был второй стек.

Файлы **`.env` / `.env.production`** на сервер **rsync не затирает** — секреты задаются один раз на VPS вручную. **`.git` на VPS нет** — **`git pull` не используется** для обновления кода.

---

## Где что запускать

| Где | Что делать |
|-----|------------|
| **Ваш ПК** (или WSL на ПК) | `git push`, запуск `manual_rsync_deploy_timeweb.sh`, кнопка **Deploy** в GitHub Actions |
| **VPS (SSH root@…)** | `export MW=/opt/mywave/tourism`, `cd "$MW"`, затем `docker compose …`, `curl` — **без** `git push` |

- В **§1** и **§2b** на ПК укажите **реальный** путь к **клону** репозитория (например WSL: `cd "/mnt/f/Проекты MyWave/NEW2026/Toutism"`). Это **не** путь на VPS.
- Если не уверены в каталоге на сервере: `find /opt/mywave -maxdepth 4 -name 'docker-compose.production.yml'`.

---

## 0. Один раз перед первым деплоем (VPS)

```bash
sudo apt-get update && sudo apt-get install -y docker.io docker-compose-plugin
# или Docker по инструкции Timeweb

sudo mkdir -p /opt/mywave/tourism
export MW=/opt/mywave/tourism
cd "$MW"
```

Создайте на сервере (не в git):

- **Корень:** `.env.production` — для `docker-compose.production.yml` (postgres и т.д.)
- **`services/api/.env.production`**, **`apps/web/.env.production`**, **`apps/admin/.env.production`**

Образцы полей — в соответствующих `.env.example` в репозитории.

SSL: каталог **`infra/nginx/certs/`** на сервере не копируется из git/rsync (PEM только на VPS). См. [TIMEWEB_VPS_COMMANDS.md](./TIMEWEB_VPS_COMMANDS.md) §5.

---

## 1. Локально (ваш ПК или WSL — **не на VPS**): зафиксировать код

```bash
# Подставьте свой путь к клону репозитория (примеры):
#   WSL:    cd "/mnt/f/Проекты MyWave/NEW2026/Toutism"
#   macOS:  cd ~/Projects/Toutism
cd "ВАШ/РЕАЛЬНЫЙ/ПУТЬ/К/РЕПОЗИТОРИЮ"

git status
git add -A && git commit -m "…"   # если есть изменения
git push origin main
```

---

## 2a. Выкат через GitHub Actions (предпочтительно)

1. Откройте [Deploy production](https://github.com/YaroslavValeev/Turism/actions/workflows/deploy-production.yml) → **Run workflow**.
2. Параметры:
   - **`deploy_mode`: `full`** — rsync + пересборка/рестарт **api, web, admin, reverse-proxy** (нормальный релиз витрины и бэкенда).
   - **`build_mode`: `incremental`** — быстрее (`up -d --build` с кэшем слоёв).
   - **`build_mode`: `full`** — если подозреваете битый кэш Docker: `build --no-cache` для api/web/admin.

Подробности режимов: [TIMEWEB_AND_ACTIONS_LINKS.md](./TIMEWEB_AND_ACTIONS_LINKS.md).

После зелёного workflow переходите к **шагу 4** (миграции при необходимости) и **шагу 5** (проверки).

---

## 2b. Выкат с вашего ПК (rsync + SSH), если Actions недоступен

Нужны **WSL**, **Git Bash** или Linux/macOS (на чистом PowerShell без `rsync` скрипт не заработает).

```bash
cd "ВАШ/РЕАЛЬНЫЙ/ПУТЬ/К/РЕПОЗИТОРИЮ"   # тот же каталог, что в §1 (WSL/Git Bash)

export DEPLOY_HOST="ВАШ_IP_ИЛИ_HOST"
export DEPLOY_USER="root"   # или deploy
export DEPLOY_KEY_FILE="$HOME/.ssh/id_ed25519_timeweb"
# опционально:
# export DEPLOY_PATH="/opt/mywave/tourism"
# export DEPLOY_PORT="22"
# export BUILD_MODE="full"   # полная пересборка без кэша образов

bash scripts/manual_rsync_deploy_timeweb.sh
```

Скрипт: rsync кода → на сервере **`docker compose --env-file .env.production -f docker-compose.production.yml up -d --build …`** (или `build --no-cache` при `BUILD_MODE=full`).

---

## 3. На VPS: поднять Postgres, если ещё не запущен

Первый запуск или после `docker compose down`:

```bash
export MW=/opt/mywave/tourism
cd "$MW"
export DC='docker compose --env-file .env.production -f docker-compose.production.yml'
$DC up -d postgres
$DC ps
```

Дождитесь `healthy` у `postgres` (healthcheck в compose).

---

## 4. Миграции Prisma (если в `main` появились новые миграции)

Выполняйте **после** того, как контейнер **api** поднят с актуальным образом:

```bash
export MW=/opt/mywave/tourism
cd "$MW"
export DC='docker compose --env-file .env.production -f docker-compose.production.yml'
$DC exec -T api sh -c \
  "cd /app/services/api && pnpm exec prisma migrate deploy"
```

Если контейнер api ещё не стартует — сначала исправьте логи (`$DC logs api`), БД и `.env`.

---

## 5. Проверки после деплоя

```bash
export MW=/opt/mywave/tourism
cd "$MW"
export DC='docker compose --env-file .env.production -f docker-compose.production.yml'
$DC ps
bash scripts/prod_healthcheck.sh
pnpm --filter api audit:ingestion-trace
pnpm --filter api audit:pilot-readiness
```

Скрипт сам переходит в **корень репозитория** (родитель каталога `scripts/`). Канон каталога на VPS — **`/opt/mywave/tourism`**. Префикс контейнеров — **`toutism-*`** при **`COMPOSE_PROJECT_NAME=toutism`** и вызове compose с **`--env-file .env.production`**. При необходимости вручную: `MYWAVE_ROOT=/opt/mywave/tourism bash scripts/prod_healthcheck.sh`.

По умолчанию `prod_healthcheck.sh` проверяет booking intake без создания заявки: `POST /api/bookings` без legal consent должен вернуть **400**. Для полного production E2E с реальной тестовой заявкой укажите id опубликованной программы или `auto`, чтобы взять первую программу из `/api/programs`:

```bash
export PROD_HEALTHCHECK_CREATE_BOOKING=1
export PROD_HEALTHCHECK_BOOKING_PROGRAM_ID="auto"
MYWAVE_ROOT=/opt/mywave/tourism bash scripts/prod_healthcheck.sh
```

Ожидание: первая заявка возвращает **201** и `legalConsentAt`, повтор того же payload в duplicate window возвращает **409**. Созданную строку с `sourceChannel=prod_healthcheck` после evidence можно архивировать/пометить как тестовую в админке.

Trace audit:

```bash
pnpm --filter api audit:ingestion-trace
INGESTION_TRACE_AUDIT_STRICT=1 pnpm --filter api audit:ingestion-trace
```

Обычный режим печатает счётчики lineage. Strict mode должен использоваться как release gate после того, как текущие опубликованные программы имеют полный `SourceRun → RawItem → NormalizedItem → EventCandidate → PublishedProgram` trace; исторические записи без `sourceRunId` будут явно показаны в `publishedProgramsWithoutFullTrace`.

Business pilot readiness audit:

```bash
pnpm --filter api audit:pilot-readiness
PILOT_READINESS_AUDIT_STRICT=1 pnpm --filter api audit:pilot-readiness
```

Gate v1 controlled pilot: 10–20 опубликованных программ, минимум 3 организатора с опубликованными программами, минимум 5 completed bookings и минимум 1 approved review. Обычный режим печатает PASS/FAIL без остановки деплоя; strict mode завершится с ошибкой, если business pilot ещё не доказан.

Вручную:

```bash
curl -sS https://mywavetour.ru/api/health
curl -sS -o /dev/null -w "главная HTTP %{http_code}\n" https://mywavetour.ru/
```

В браузере: жёсткое обновление (**Ctrl+F5**), чтобы не тянуть старый кэш.

---

## 6. Быстрая шпаргалка «всё на уже настроенном сервере» (после доставки кода)

Если код уже на диске VPS (GitHub Actions или `manual_rsync_deploy_timeweb.sh`), **git pull не нужен** — в rsync-деплое каталог `.git` на сервер не копируется.

```bash
export MW=/opt/mywave/tourism
cd "$MW"
export DC='docker compose --env-file .env.production -f docker-compose.production.yml'

$DC up -d postgres
$DC up -d --build api web admin reverse-proxy

$DC exec -T api sh -c \
  "cd /app/services/api && pnpm exec prisma migrate deploy"

bash scripts/prod_healthcheck.sh
```

---

## 7. Сборка падает: `TLS handshake timeout` / не тянется `node:20-alpine` с Docker Hub

Так бывает на части VPS: сеть до **registry-1.docker.io** нестабильна. Это **не ошибка вашего Dockerfile**; миграции и уже запущенные контейнеры при этом могут быть в порядке.

**Проверка с VPS:**

```bash
curl -sS -o /dev/null -w "Docker Hub HEAD %{http_code}\n" --max-time 25 \
  -I https://registry-1.docker.io/v2/
```

**Попробуйте заранее стянуть базовые образы (несколько раз с паузой):**

```bash
docker pull node:20-alpine
docker pull node:20-bookworm-slim
docker pull postgres:16-alpine
docker pull nginx:1.27-alpine
```

Затем снова из каталога проекта:

```bash
export MW=/opt/mywave/tourism
cd "$MW"
export DC='docker compose --env-file .env.production -f docker-compose.production.yml'

$DC build api web admin
$DC up -d api web admin reverse-proxy
```

**GitHub Actions «Deploy production»** на шаге сборки выполняет **ту же** `docker compose build` **на вашем VPS** по SSH — если Hub «тупит», workflow упадёт с тем же текстом. Имеет смысл **Re-run job** позже или после успешного ручного `docker pull`.

Если таймауты повторяются постоянно — уточните у поддержки Timeweb рекомендуемый **registry mirror** или DNS для Docker и пропишите в `/etc/docker/daemon.json` (осторожно: бэкап файла перед правкой, затем `systemctl restart docker`).

### 7a. `curl` к Hub даёт timeout / HTTP `000` — Hub с VPS недоступен

Если даже **`curl --max-time 30`** к `registry-1.docker.io` **не получает байт**, проблема не в Docker как таковом, а в **маршруте/блокировке** до Docker Hub. Тогда повторные `docker pull` с паузой часто **не помогут**.

**Вариант A — зеркало через Docker (часто помогает):** зеркало Google для Hub (перед правкой сохраните копию `daemon.json`, если он уже есть):

```bash
sudo test -f /etc/docker/daemon.json && sudo cp -a /etc/docker/daemon.json /etc/docker/daemon.json.bak.$(date +%Y%m%d%H%M) || true
echo '{"registry-mirrors":["https://mirror.gcr.io"]}' | sudo tee /etc/docker/daemon.json
sudo systemctl restart docker
docker pull node:20-alpine
```

Если после рестарта Docker другие настройки в `daemon.json` нужны — **слейте JSON вручную** (один объект с несколькими ключами), не затирайте файл вслепую.

**Вариант B:** тикет в **поддержку Timeweb** — исходящий HTTPS к `registry-1.docker.io` или официальное зеркало/прокси для Docker на их сети.

**Вариант C:** собирать образы **на другой машине**, где Hub доступен, затем `docker save` → перенос на VPS → `docker load` (громоздко, но надёжно при жёсткой блокировке).

### 7b. Недоступен **registry.npmjs.org** (pnpm внутри Docker build)

Если **`curl`** к `https://registry.npmjs.org/` с VPS **таймаутится**, а базовые образы `node` уже тянутся — в репозитории добавлена переменная **`NPM_CONFIG_REGISTRY`** (build-arg в Dockerfile + `docker-compose.production.yml`). На VPS перед сборкой:

```bash
export NPM_CONFIG_REGISTRY="https://registry.npmmirror.com"
```

Подробнее: [TIMEWEB_VPS_TERMINAL_COMMANDS.md](./TIMEWEB_VPS_TERMINAL_COMMANDS.md) §7b.

---

## 8. `reverse-proxy` не стартует: `Bind for 0.0.0.0:80 failed: port is already allocated`

На хосте **уже занят порт 80** (часто второй контейнер, **nginx на хосте** или панель). Пока конфликт не снят, контейнер **`toutism-reverse-proxy-1`** (или тот **`…-reverse-proxy-1`**, что показывает **`docker compose --env-file .env.production … ps`**) не поднимется; при этом **healthcheck может быть OK**, если снаружи отвечает **другой** процесс на 80/443.

**Кто слушает 80/443:**

```bash
ss -tlnp | grep -E ':80 |:443 ' || true
docker ps -a --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' | grep -E '80|443|NAME' || docker ps -a
```

**Дальше — осознанно:** либо остановить лишний сервис/контейнер, который держит **80**, либо не поднимать второй nginx на том же порту. **Не останавливайте** тот nginx, через который реально ходят пользователи, пока не поймёте схему (хостовый nginx → docker backend **без** публикации 80 из compose — отдельная архитектура).

---

## См. также

- [DEPLOYMENT_CANON.md](./DEPLOYMENT_CANON.md) — канон развёртывания: пути, env, nginx, compose.
- [TIMEWEB_VPS_TERMINAL_COMMANDS.md](./TIMEWEB_VPS_TERMINAL_COMMANDS.md) — готовые блоки команд для вставки в SSH-консоль VPS.
- [TIMEWEB_AND_ACTIONS_LINKS.md](./TIMEWEB_AND_ACTIONS_LINKS.md) — ссылки на панель Timeweb и workflow.
- [TIMEWEB_VPS_COMMANDS.md](./TIMEWEB_VPS_COMMANDS.md) — диагностика SSH, fail2ban, nginx, SSL, media.
- [OWNER_QUICKSTART.md](./OWNER_QUICKSTART.md) — рестарт сервисов и логи.
