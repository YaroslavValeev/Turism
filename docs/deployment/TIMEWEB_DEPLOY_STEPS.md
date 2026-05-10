# Timeweb: выкат в логичной последовательности

Каталог на VPS по умолчанию: **`/opt/mywave/toutism`** (проверьте `DEPLOY_PATH` / орфографию **toutism**, не **`tourism`**).

Файлы **`.env` / `.env.production`** на сервер **rsync не затирает** — секреты задаются один раз на VPS вручную.

---

## Где что запускать (частая путаница)

| Где | Что делать |
|-----|------------|
| **Ваш ПК** (или WSL на ПК) | `git push`, запуск `manual_rsync_deploy_timeweb.sh`, кнопка **Deploy** в GitHub Actions |
| **VPS (SSH root@…)** | Только `cd /opt/mywave/toutism` (или ваш реальный путь), `docker compose …`, `curl`, **без** `git push` |

- В **§1** и **§2b** вместо абстрактного пути укажите **реальный** каталог клона на ПК (например WSL: `cd "/mnt/f/Проекты MyWave/NEW2026/Toutism"`). На сервере такого пути **не будет** — это нормально.
- После rsync/Actions на VPS **нет каталога `.git`**, поэтому `git push` там выдаёт `fatal: not a git repository` — так и должно быть.
- Если вы в **`/opt/mywave/tourism`** (с «ur»), а в инструкциях **`toutism`**: проверьте, где лежит `docker-compose.production.yml`:
  ```bash
  ls -la /opt/mywave/
  find /opt/mywave -maxdepth 3 -name 'docker-compose.production.yml' 2>/dev/null
  ```
  Работайте из того каталога, где найден файл.

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
cd /opt/mywave/toutism
# или /opt/mywave/tourism — где лежит docker-compose.production.yml

docker compose -f docker-compose.production.yml build api web admin
docker compose -f docker-compose.production.yml up -d api web admin reverse-proxy
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

---

## 8. `reverse-proxy` не стартует: `Bind for 0.0.0.0:80 failed: port is already allocated`

На хосте **уже занят порт 80** (часто второй контейнер, **nginx на хосте** или панель). Пока конфликт не снят, контейнер **`tourism-reverse-proxy-1`** не поднимется; при этом **healthcheck может быть OK**, если снаружи отвечает **другой** процесс на 80/443.

**Кто слушает 80/443:**

```bash
ss -tlnp | grep -E ':80 |:443 ' || true
docker ps -a --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' | grep -E '80|443|NAME' || docker ps -a
```

**Дальше — осознанно:** либо остановить лишний сервис/контейнер, который держит **80**, либо не поднимать второй nginx на том же порту. **Не останавливайте** тот nginx, через который реально ходят пользователи, пока не поймёте схему (хостовый nginx → docker backend **без** публикации 80 из compose — отдельная архитектура).

---

## См. также

- [TIMEWEB_AND_ACTIONS_LINKS.md](./TIMEWEB_AND_ACTIONS_LINKS.md) — ссылки на панель Timeweb и workflow.
- [TIMEWEB_VPS_COMMANDS.md](./TIMEWEB_VPS_COMMANDS.md) — диагностика SSH, fail2ban, nginx, SSL, media.
- [OWNER_QUICKSTART.md](./OWNER_QUICKSTART.md) — рестарт сервисов и логи.
