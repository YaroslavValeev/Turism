# Канон развёртывания (production)

Один источник правды по **что где лежит**, **кто кого читает** и **что куда проксируется** для контура **Docker Compose + nginx** на VPS (Timeweb и аналоги).

---

## 1. Оценка готовности (снимки / логи на момент фиксации)

| Область | Состояние | Комментарий |
|--------|-----------|-------------|
| Сеть до **registry.npmjs.org** | Красный / жёлтый | `curl` с VPS даёт **timeout** — без **`NPM_CONFIG_REGISTRY`** (зеркало, см. §6) сборка **`pnpm install`** в Docker будет срываться или «висеть» на ретраях. |
| Зеркало **npmmirror** | Зелёный | Проверка **`HTTP 200`** — обходной путь для npm на сборке работает. |
| **binaries.prisma.sh** (Prisma) | Красный / жёлтый | Ошибка TLS/обрыв при **`pnpm exec prisma generate`** в образе **api** — отдельный исходящий хост; при блокировке нужны зеркало/прокси по доке Prisma или стабильный маршрут с VPS. |
| Контейнеры **api / web / admin / postgres** | Жёлтый | Могут быть **Up** на старых образах, пока новая сборка не прошла целиком. |
| **reverse-proxy** (nginx) | Красный при конфликте | **`Bind for 0.0.0.0:80 failed: port is already allocated`** — на хосте **80** уже занят (другой контейнер или nginx вне compose). Пока не снят конфликт, внешний вход через compose-nginx **не поднимется**. |
| **GitHub Actions → SSH :22** | Жёлтый | Периодические **Connection timed out** с раннера до VPS — файрвол/маршрут; обход: **ручной rsync** с ПК. |
| Пользовательский трафик | Жёлтый / зелёный | Если снаружи отвечает **другой** процесс на **80/443**, сайт может быть «ок» при **падшем** `tourism-reverse-proxy-1` — путаница при диагностике. |

**Итог:** контуру нужны **стабильная сборка** (npm + Prisma CDN), **один владелец порта 80**, предсказуемый **деплой** (Actions или скрипт). До этого статус **«частично готов / рискованный прод»**.

---

## 2. Где лежит код на VPS

| Путь | Назначение |
|------|------------|
| **`/opt/mywave/tourism`** или **`/opt/mywave/toutism`** | Рабочий корень деплоя (в репозитории канон по умолчанию — **`toutism`** в доках; на вашей ВМ допустимо **`tourism`** — главное, чтобы здесь лежал **`docker-compose.production.yml`**). |
| **`…/tourism.backup-*`** | Резервные копии каталога; **не** активный compose, если вы из них не запускаете `docker compose`. |

**Важно:** при деплое через **rsync / Actions** каталог **`.git` на сервер не копируется** — `git pull` на VPS для обновления кода **не используется**.

---

## 3. Кто что читает (конфигурация)

### 3.1 Docker Compose

| Файл | Кто читает | Назначение |
|------|------------|------------|
| **`docker-compose.production.yml`** | `docker compose` из каталога проекта | Сервисы, **build** (api/web/admin), **ports**, **volumes**, **depends_on**. |
| **`.env.production`** (корень проекта на VPS) | Compose: подстановка **`${…}`**, сервис **postgres** | Общие секреты/URL (в т.ч. **`NPM_CONFIG_REGISTRY`** для build-args, если задан). |
| **`services/api/.env.production`** | Контейнер **api** в runtime | `DATABASE_URL`, JWT, SMTP, CORS, флаги приложения. |
| **`apps/web/.env.production`** | Контейнер **web** | `NEXT_PUBLIC_*`, базовые URL для браузера. |
| **`apps/admin/.env.production`** | Контейнер **admin** | Аналогично для админки. |

Файлы **`.env*`** в git **не коммитятся**; на VPS создаются вручную один раз (rsync их **не затирает** при исключениях в скрипте деплоя).

### 3.2 Nginx внутри **reverse-proxy**

| Источник | Кто читает |
|----------|------------|
| **`infra/nginx/mywave.conf`** (смонтирован в контейнер) | Процесс **nginx** в **`reverse-proxy`** |

Содержимое — см. §5 (маршрутизация по `server_name` и `location`).

### 3.3 TLS

| Путь на хосте (рядом с compose) | Кто читает |
|----------------------------------|------------|
| **`infra/nginx/certs/*.pem`** | Только контейнер **reverse-proxy** (volume **read-only** в compose). |

В **git** PEM **не хранятся**; в **rsync** каталог **`infra/nginx/certs/`** исключён, чтобы не стереть сертификаты на сервере.

---

## 4. Сервисы Compose: роли и зависимости

```
                    ┌─────────────┐
                    │  postgres   │
                    └──────┬──────┘
                           │
         ┌─────────────────┼─────────────────┐
         ▼                 ▼                 ▼
   ┌──────────┐      ┌──────────┐      ┌──────────┐
   │   api    │◄─────│   web    │      │  admin   │
   │  :3001   │      │  :3000   │      │  :3002   │
   └────┬─────┘      └────┬─────┘      └────┬─────┘
        │                 │                 │
        └────────────┬────┴─────────────────┘
                     ▼
              ┌──────────────┐
              │reverse-proxy │
              │  :80 :443    │
              └──────────────┘
```

| Сервис | Образ / сборка | Порт внутри сети compose | Зависимости |
|--------|----------------|---------------------------|-------------|
| **postgres** | `postgres:16-alpine` | 5432 | — |
| **api** | build `services/api/Dockerfile` | 3001 | postgres healthy |
| **web** | build `apps/web/Dockerfile` | 3000 | api (порядок старта) |
| **admin** | build `apps/admin/Dockerfile` | 3002 | api |
| **reverse-proxy** | `nginx:1.27-alpine` | **80, 443** на хост | web, admin, api |

**Сеть:** у **api / web / admin** в compose указано **`network: host`** только на этапе **build** (доступ к registry); в **runtime** контейнеры в общей bridge-сети стека, имена **`api`**, **`web`**, **`admin`** — это хостнеймы для **nginx** (`resolver 127.0.0.11`).

---

## 5. Кто кому что передаёт (HTTP снаружи → внутрь)

Запрос браузера попадает на **IP VPS:443** (или :80 → редирект на https). Слушает контейнер **reverse-proxy** с конфигом **`mywave.conf`**.

| `server_name` | Путь | Куда `proxy_pass` |
|---------------|------|-------------------|
| **mywavetour.ru**, **www** | `/` | **web:3000** (Next, витрина) |
| то же | `/api/media` | **web:3000** (Next API route) |
| то же | `/api/*` | **api:3001** (Express; префикс `/api/` снимается при прокси) |
| то же | `=/health` | **api:3001/health** |
| **admin.mywavetour.ru** | `/` | **admin:3002** |
| **api.mywavetour.ru** | `/` | **api:3001** |

Заголовки **`X-Forwarded-Proto`**, **`X-Forwarded-For`** пробрасываются — бэкенд знает HTTPS и цепочку клиента.

---

## 6. Сборка образов: откуда качаются артефакты

| Этап | Ресурс | Управление |
|------|--------|------------|
| Базовый образ | **Docker Hub** (`node:20-*`) | На проблемных VPS — **`registry-mirrors`** в `/etc/docker/daemon.json` (например `mirror.gcr.io`). |
| **npm / pnpm** пакеты | по умолчанию **registry.npmjs.org** | Переменная **`NPM_CONFIG_REGISTRY`** (build-arg + compose) — при таймауте до npmjs, например зеркало **npmmirror**. |
| Движки Prisma | **binaries.prisma.sh** | Отдельный CDN; при ошибках TLS — политика сети VPS или переменные окружения Prisma для зеркал/офлайн (см. [Environment variables | Prisma](https://www.prisma.io/docs/orm/reference/environment-variables)). |

Сборка **на VPS** выполняется и при **GitHub Actions** (SSH + `docker compose build`), и при **`manual_rsync_deploy_timeweb.sh`**.

---

## 7. Порядок выката (канон операций)

1. **Код в `main`** на GitHub (`git push` с ПК разработчика).
2. **Доставка на VPS:** Actions (**Deploy production**) или **`bash scripts/manual_rsync_deploy_timeweb.sh`**.
3. **`docker compose -f docker-compose.production.yml up -d --build …`** (или поэтапно: postgres → build → up).
4. **`prisma migrate deploy`** внутри контейнера **api** (если есть новые миграции).
5. **`bash scripts/prod_healthcheck.sh`** (корень репо определяется от расположения `scripts/` или **`MYWAVE_ROOT`**).
6. Проверка в браузере с **Ctrl+F5**.

Подробные команды: [TIMEWEB_DEPLOY_STEPS.md](./TIMEWEB_DEPLOY_STEPS.md), [TIMEWEB_VPS_TERMINAL_COMMANDS.md](./TIMEWEB_VPS_TERMINAL_COMMANDS.md).

---

## 8. Анти-паттерны (частые поломки)

1. **Два процесса на порту 80** — compose **reverse-proxy** не стартует; при этом старый nginx может продолжать отдавать сайт → ложное «всё ок».
2. **`git push` на VPS** без полноценного клона — не то место; push только с ПК / CI.
3. **Rsync с удалением сертификатов** — если не исключён **`infra/nginx/certs/`**, сломается HTTPS.
4. **Путаница `tourism` / `toutism`** — разные имена каталогов; канон в доках **`toutism`**, на сервере допустимо другое имя при условии единого **`cd`** для compose.

---

## 9. Связанные документы

- [TIMEWEB_AND_ACTIONS_LINKS.md](./TIMEWEB_AND_ACTIONS_LINKS.md) — Actions, файрвол, SSH.
- [TIMEWEB_VPS_COMMANDS.md](./TIMEWEB_VPS_COMMANDS.md) — расширенная диагностика.
- [OWNER_QUICKSTART.md](./OWNER_QUICKSTART.md) — рестарт и логи для владельца.
