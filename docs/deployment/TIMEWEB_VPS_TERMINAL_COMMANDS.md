# Команды для терминала VPS (Timeweb / SSH)

Вставляйте блоки **по порядку** в консоль сервера (пользователь с правами **root** или **docker**). Путь к проекту подставьте свой: чаще **`/opt/mywave/tourism`** или **`/opt/mywave/toutism`**.

---

## 1. Каталог проекта и compose

```bash
ls -la /opt/mywave/
find /opt/mywave -maxdepth 4 -name 'docker-compose.production.yml' 2>/dev/null
```

Дальше везде (если файл нашёлся в `tourism`):

```bash
export MW=/opt/mywave/tourism
cd "$MW" && pwd && test -f docker-compose.production.yml && echo "compose: ok"
```

---

## 2. Сеть и порты (22, 80, 443)

```bash
ss -tlnp | grep -E ':22 |:80 |:443 ' || ss -tlnp | head -n 30
```

Кто слушает SSH:

```bash
systemctl is-active ssh 2>/dev/null || systemctl is-active sshd
```

---

## 3. Docker: контейнеры и логи

```bash
cd "$MW"
docker compose -f docker-compose.production.yml ps -a
docker compose -f docker-compose.production.yml logs --tail=40 reverse-proxy
docker compose -f docker-compose.production.yml logs --tail=40 api
```

---

## 4. Поднять / пересобрать стек

```bash
cd "$MW"
docker compose -f docker-compose.production.yml up -d postgres
docker compose -f docker-compose.production.yml up -d --build api web admin reverse-proxy
docker compose -f docker-compose.production.yml ps
```

### 4a. «Зависание» на этом шаге — часто нормально

Команда **`up -d --build`** долго крутится на этапах **`RUN pnpm install`** / **`npm config`** в Dockerfile. Если в логе сборки видно **`ERR_SOCKET_TIMEOUT`** и **`registry.npmjs.org`**, а ниже — **«Will retry in 2 minutes… N retries left»**, процесс **живой**: pnpm ждёт таймаут и **повторяет** скачивание. На плохом канале это легко **15–45+ минут** на один сервис, суммарно дольше по **api + web + admin**.

Проверка доступа к npm с VPS:

```bash
curl -sS -o /dev/null -w "npmjs HTTP %{http_code}\n" --max-time 25 https://registry.npmjs.org/ || echo "npmjs: timeout"
```

**Можно подождать**, пока не закончатся ретраи или сборка не завершится. Если через **час+** без прогресса — **Ctrl+C**, снова `up -d --build` в другое время или тикет в Timeweb про исходящий HTTPS к **registry.npmjs.org** (это **не** то же самое, что зеркало Docker Hub `mirror.gcr.io`).

Если **`reverse-proxy`** остаётся в статусе **`Created`** после сборки — отдельно:

```bash
cd "$MW"
docker compose -f docker-compose.production.yml up -d reverse-proxy
docker compose -f docker-compose.production.yml logs --tail=60 reverse-proxy
```

Если в логах **api** видно **`ELIFECYCLE Command failed`** — полный хвост ошибки:

```bash
cd "$MW"
docker compose -f docker-compose.production.yml logs --tail=120 api
```

---

## 5. Миграции БД

```bash
cd "$MW"
docker compose -f docker-compose.production.yml exec -T api sh -c \
  "cd /app/services/api && pnpm exec prisma migrate deploy"
```

---

## 6. Проверка сайта и скрипт healthcheck

```bash
cd "$MW"
curl -sS -o /dev/null -w "локально api HTTP %{http_code}\n" http://127.0.0.1:3001/health || true
curl -sS --max-time 15 https://mywavetour.ru/api/health || true
MYWAVE_ROOT="$MW" bash scripts/prod_healthcheck.sh
```

---

## 7. Доступ к Docker Hub / зеркало (если сборка таймаутится)

```bash
curl -sS -o /dev/null -w "Hub HEAD %{http_code}\n" --max-time 25 -I https://registry-1.docker.io/v2/ || echo "Hub: timeout/fail"
```

Зеркало (если ещё не настраивали; **бэкап** существующего `daemon.json` делайте вручную, если файл не пустой):

```bash
sudo test -f /etc/docker/daemon.json && sudo cp -a /etc/docker/daemon.json "/etc/docker/daemon.json.bak.$(date +%Y%m%d%H%M)" || true
echo '{"registry-mirrors":["https://mirror.gcr.io"]}' | sudo tee /etc/docker/daemon.json
sudo systemctl restart docker
docker pull node:20-alpine
docker pull node:20-bookworm-slim
```

### 7b. Таймаут к **registry.npmjs.org** при `pnpm install` (сборка образов)

Если **`curl https://registry.npmjs.org/`** с VPS даёт **timeout**, а Docker Hub уже тянется через зеркало — задайте **другой npm registry** только на время **сборки** (переменная читается из окружения хоста / файла `.env` рядом с `docker-compose.production.yml`):

```bash
cd "$MW"
export NPM_CONFIG_REGISTRY="https://registry.npmmirror.com"
docker compose -f docker-compose.production.yml build api web admin
docker compose -f docker-compose.production.yml up -d api web admin reverse-proxy
```

Либо одной строкой без `export`:

```bash
NPM_CONFIG_REGISTRY="https://registry.npmmirror.com" \
  docker compose -f docker-compose.production.yml up -d --build api web admin reverse-proxy
```

По умолчанию в compose и Dockerfile остаётся **`https://registry.npmjs.org/`**. Зеркало — компромисс при недоступности официального реестра; политику пакетов соблюдайте сами.

---

## 8. Локальный файрвол и fail2ban (если SSH «снаружи» нестабилен)

```bash
command -v ufw >/dev/null && ufw status verbose || echo "ufw: нет"
command -v fail2ban-client >/dev/null && fail2ban-client status sshd 2>/dev/null || echo "fail2ban: нет или нет sshd jail"
```

---

## 9. Место и память

```bash
df -h /
free -m
docker system df
```

---

## 10. Убрать «зависшие» остановленные контейнеры (осторожно)

Только если уверены, что лишние контейнеры не нужны:

```bash
docker container prune -f
```

---

## См. также

- [DEPLOYMENT_CANON.md](./DEPLOYMENT_CANON.md) — канон: роли сервисов, конфиги, маршруты HTTP.
- [TIMEWEB_DEPLOY_STEPS.md](./TIMEWEB_DEPLOY_STEPS.md) — полный сценарий выката.
- [TIMEWEB_VPS_COMMANDS.md](./TIMEWEB_VPS_COMMANDS.md) — длинный чеклист диагностики.
- [TIMEWEB_AND_ACTIONS_LINKS.md](./TIMEWEB_AND_ACTIONS_LINKS.md) — GitHub Actions и файрвол.
