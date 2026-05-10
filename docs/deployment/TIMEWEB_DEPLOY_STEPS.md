# Timeweb: выкат в логичной последовательности

Каталог на VPS по умолчанию: **`/opt/mywave/toutism`** (проверьте `DEPLOY_PATH` / орфографию **toutism**).

Файлы **`.env` / `.env.production`** на сервер **rsync не затирает** — секреты задаются один раз на VPS вручную.

---

## 0. Один раз перед первым деплоем (VPS)

```bash
sudo apt-get update && sudo apt-get install -y docker.io docker-compose-plugin
# или Docker по инструкции Timeweb

sudo mkdir -p /opt/mywave/toutism
cd /opt/mywave/toutism
```

Создайте на сервере (не в git):

- **Корень:** `.env.production` — для `docker-compose.production.yml` (postgres и т.д.)
- **`services/api/.env.production`**, **`apps/web/.env.production`**, **`apps/admin/.env.production`**

Образцы полей — в соответствующих `.env.example` в репозитории.

SSL: каталог **`infra/nginx/certs/`** на сервере не копируется из git/rsync (PEM только на VPS). См. [TIMEWEB_VPS_COMMANDS.md](./TIMEWEB_VPS_COMMANDS.md) §5.

---

## 1. Локально (ваш ПК): зафиксировать код

```bash
cd /path/to/Toutism
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
cd /path/to/Toutism

export DEPLOY_HOST="ВАШ_IP_ИЛИ_HOST"
export DEPLOY_USER="root"   # или deploy
export DEPLOY_KEY_FILE="$HOME/.ssh/id_ed25519_timeweb"
# опционально:
# export DEPLOY_PATH="/opt/mywave/toutism"
# export DEPLOY_PORT="22"
# export BUILD_MODE="full"   # полная пересборка без кэша образов

bash scripts/manual_rsync_deploy_timeweb.sh
```

Скрипт: rsync кода → на сервере `docker compose -f docker-compose.production.yml up -d --build …` (или `build --no-cache` при `BUILD_MODE=full`).

---

## 3. На VPS: поднять Postgres, если ещё не запущен

Первый запуск или после `docker compose down`:

```bash
cd /opt/mywave/toutism
docker compose -f docker-compose.production.yml up -d postgres
docker compose -f docker-compose.production.yml ps
```

Дождитесь `healthy` у `postgres` (healthcheck в compose).

---

## 4. Миграции Prisma (если в `main` появились новые миграции)

Выполняйте **после** того, как контейнер **api** поднят с актуальным образом:

```bash
cd /opt/mywave/toutism
docker compose -f docker-compose.production.yml exec -T api sh -c \
  "cd /app/services/api && pnpm exec prisma migrate deploy"
```

Если контейнер api ещё не стартует — сначала исправьте логи (`docker compose ... logs api`), БД и `.env`.

---

## 5. Проверки после деплоя

```bash
cd /opt/mywave/toutism
docker compose -f docker-compose.production.yml ps
bash scripts/prod_healthcheck.sh
```

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
cd /opt/mywave/toutism

docker compose -f docker-compose.production.yml up -d postgres
docker compose -f docker-compose.production.yml up -d --build api web admin reverse-proxy

docker compose -f docker-compose.production.yml exec -T api sh -c \
  "cd /app/services/api && pnpm exec prisma migrate deploy"

bash scripts/prod_healthcheck.sh
```

---

## См. также

- [TIMEWEB_AND_ACTIONS_LINKS.md](./TIMEWEB_AND_ACTIONS_LINKS.md) — ссылки на панель Timeweb и workflow.
- [TIMEWEB_VPS_COMMANDS.md](./TIMEWEB_VPS_COMMANDS.md) — диагностика SSH, fail2ban, nginx, SSL, media.
- [OWNER_QUICKSTART.md](./OWNER_QUICKSTART.md) — рестарт сервисов и логи.
