# Канон развёртывания (production)

Один источник правды по **что где лежит**, **кто кого читает** и **что куда проксируется** для контура **Docker Compose + nginx** на VPS (Timeweb и аналоги).

### Канон Timeweb production (зафиксировано по факту на VPS)

| Сущность | Значение |
|----------|----------|
| **Рабочий каталог** (где `docker-compose.production.yml`) | **`/opt/mywave/tourism`** — канон для **текущего** Timeweb production. |
| **Имя проекта Docker Compose** | **`toutism`** — задаётся в **`$MW/.env.production`** строкой **`COMPOSE_PROJECT_NAME=toutism`**. Префикс контейнеров: **`toutism-api-1`**, **`toutism-web-1`**, и т.д. |
| **Вызов CLI** | **`docker compose --env-file .env.production -f docker-compose.production.yml …`** — иначе **`COMPOSE_PROJECT_NAME`** не подхватится; имя проекта станет **`tourism`** (имя папки) → контейнеры **`tourism-*`** (два префикса на одном хосте — анти-паттерн). Так сделано в **Deploy production** и **`manual_rsync_deploy_timeweb.sh`**. |
| **Префикс контейнеров** | Смотрите **`docker compose --env-file .env.production … ps`**. На одном хосте **не должно** сосуществовать два полных набора **`tourism-*`** и **`toutism-*`**. |
| **Исторический путь** | **`/opt/mywave/toutism`** — только старая **папка** в заметках; **не** путать с именем проекта **`toutism`**. Код лежит в **`/opt/mywave/tourism`**. |
| **Репозиторий `.git` на VPS** | **Нет** — код только **Actions / rsync / manual deploy** |

Пошаговые клики в панели Timeweb + команды по одной строке: **[`TIMEWEB_CLICK_BY_CLICK.md`](./TIMEWEB_CLICK_BY_CLICK.md)**.

**Команды по умолчанию** (новая SSH-сессия → выполнить снова):

```bash
export MW=/opt/mywave/tourism
cd "$MW"
```

Проверка **рабочего каталога именно текущего** compose-проекта (из **`$MW`**, без угадывания имени контейнера вручную):

```bash
export MW=/opt/mywave/tourism
cd "$MW"
CID=$(docker compose --env-file .env.production -f docker-compose.production.yml ps -q api | head -n1)
docker inspect "$CID" --format '{{ index .Config.Labels "com.docker.compose.project.working_dir" }}'
```

**Важно:** имя контейнера (**`toutism-api-1`**, **`tourism-api-1`**) берите только из вывода **`docker compose --env-file .env.production -f docker-compose.production.yml ps`**. Не полагайтесь на шпаргалки: **`docker inspect toutism-api-1`** может указывать на **старый** контейнер с другим **`working_dir`**, если на хосте остались артефакты переименования.

В старых документах или секретах мог встречаться путь **`/opt/mywave/toutism`** как **отдельная папка** на диске — для **текущего** production каноническая **папка кода** — **`/opt/mywave/tourism`**. Имя **проекта Compose** (**`toutism`**) и имя **папки** (**`tourism`**) — разные вещи: **папка tourism, проект toutism**.

### Два префикса на одном сервере (`tourism-*` и `toutism-*`)

Если **`docker ps -a`** показывает **оба** набора контейнеров:

1. Это **не** целевое долгосрочное состояние — обычно два независимых **`docker compose`** (разные **`com.docker.compose.project`** и часто разные **`working_dir`**).
2. **Перед `docker compose down`** выясните, **какой Postgres** содержит актуальные данные (`docker volume ls` — тома вида **`…_postgres_data`** привязаны к **имени проекта**). Смена **`COMPOSE_PROJECT_NAME`** создаёт **новый** том; без дампа/восстановления база в новом проекте будет **пустой**.
3. Лишний стек снимайте **из каталога, где он был поднят** (например, если ещё существует **`/opt/mywave/toutism`**: `cd` туда → **`docker compose -f docker-compose.production.yml down`**) — только после **бэкапа** и явного решения, какой контур отключаете.
4. Чтобы при каталоге **`tourism`** префикс контейнеров был **`toutism-*`**, задайте в **`$MW/.env.production`** строку **`COMPOSE_PROJECT_NAME=toutism`** и пересоздайте сервисы из **`$MW`** (см. п.2 про тома).
5. **Снять только дубликат `tourism-*`**, когда боевой стек — **`toutism-*`** из того же **`$MW`** (один `docker-compose.production.yml`, два имени проекта): из **`$MW`** выполните **`docker compose -p tourism -f docker-compose.production.yml down`** **без** **`-v`**, чтобы контейнеры и сеть проекта **`tourism`** ушли, а **именованные тома** остались (на случай отката). Затем **`docker ps -a --filter "name=tourism-"`** — список должен быть пуст. Если **`down`** не сработал, в крайнем случае **`docker rm -f`** по именам контейнеров **`tourism-*`** (не трогая **`toutism-*`**).

Проверка **health внутри контейнера api** (в образе **нет `wget`** — используйте **`node`**, по той же идее, что healthcheck в compose):

```bash
export MW=/opt/mywave/tourism
cd "$MW"
docker compose --env-file .env.production -f docker-compose.production.yml exec -T api node -e \
  "require('http').get('http://127.0.0.1:3001/health',r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>{console.log(d);process.exit(r.statusCode===200?0:1)})}).on('error',e=>{console.error(e);process.exit(1)})"
```

---

## 1. Оценка готовности (снимки / логи на момент фиксации)

| Область | Состояние | Комментарий |
|--------|-----------|-------------|
| Сеть до **registry.npmjs.org** | Красный / жёлтый | `curl` с VPS даёт **timeout** — без **`NPM_CONFIG_REGISTRY`** (зеркало, см. §6) сборка **`pnpm install`** в Docker будет срываться или «висеть» на ретраях. |
| Зеркало **npmmirror** | Зелёный | Проверка **`HTTP 200`** — обходной путь для npm на сборке работает. |
| **binaries.prisma.sh** (Prisma) | Красный / жёлтый | Ошибка TLS/обрыв при **`pnpm exec prisma generate`** / **`db:generate`** — отдельный CDN. **Не** судить о доступности по **`curl` корня** `https://binaries.prisma.sh/` (часто **404** без тела); смотрите лог **`prisma`** на конкретный URL `…/schema-engine.gz…`. В **`.env.production`** можно задать **`PRISMA_ENGINES_MIRROR`** (build-arg в **`docker-compose.production.yml`** → **`services/api/Dockerfile`**), см. [переменные Prisma](https://www.prisma.io/docs/orm/reference/environment-variables-reference). Иначе — повторить сборку / стабилизировать исходящий HTTPS. |
| Контейнеры **api / web / admin / postgres** | Жёлтый | Могут быть **Up** на старых образах, пока новая сборка не прошла целиком. |
| **reverse-proxy** (nginx) | Красный при конфликте | **`Bind for 0.0.0.0:80 failed: port is already allocated`** — на хосте **80** уже занят (другой контейнер или nginx вне compose). Пока не снят конфликт, внешний вход через compose-nginx **не поднимется**. |
| **GitHub Actions → SSH :22** | Жёлтый | Периодические **Connection timed out** с раннера до VPS — файрвол/маршрут; обход: **ручной rsync** с ПК. |
| Пользовательский трафик | Жёлтый / зелёный | Если снаружи отвечает **другой** процесс на **80/443**, сайт может быть «ок» при **падшем** контейнере **`reverse-proxy`** (например `tourism-reverse-proxy-1`) — путаница при диагностике. |

**Итог:** контуру нужны **стабильная сборка** (npm + Prisma CDN), **один владелец порта 80**, предсказуемый **деплой** (Actions или скрипт). До этого статус **«частично готов / рискованный прод»**.

---

## 2. Где лежит код на VPS

| Путь | Назначение |
|------|------------|
| **`/opt/mywave/tourism`** | **Канонический** рабочий корень деплоя на текущем Timeweb production (здесь **`docker-compose.production.yml`**). |
| **`/opt/mywave/toutism`** | Историческое имя **папки** в старых заметках/секретах (не путать с **`/opt/mywave/tourism`**). Имя **Compose-проекта** смотрите по **`docker compose ps`** / labels, а не по орфографии в заметках. |
| **`…/tourism.backup-*`** | Резервные копии каталога; **не** активный compose, если вы из них не запускаете `docker compose`. |

**Важно:** при деплое через **rsync / Actions** каталог **`.git` на сервер не копируется** — **`git pull` на VPS не используется** для доставки кода.

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
| то же | `/api/*` (кроме `/api/media`) | **api:3001** (Express; в **`mywave.conf`** префикс снимает **`rewrite … break`**, затем **`proxy_pass $mw_api_pass`**) |
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
   Если менялся **`infra/nginx/mywave.conf`**, перед **`git push`** на **`main`**: **`bash scripts/verify_nginx_config.sh`** (синтаксис nginx + временные PEM; не требует **`infra/nginx/certs/`** в git).
4. **`prisma migrate deploy`** внутри контейнера **api** (если есть новые миграции).
5. **`bash scripts/prod_healthcheck.sh`** (корень репо определяется от расположения `scripts/` или **`MYWAVE_ROOT`**).
6. Проверка в браузере с **Ctrl+F5**.

Подробные команды: [TIMEWEB_DEPLOY_STEPS.md](./TIMEWEB_DEPLOY_STEPS.md), [TIMEWEB_VPS_TERMINAL_COMMANDS.md](./TIMEWEB_VPS_TERMINAL_COMMANDS.md).

---

## 8. Анти-паттерны (частые поломки)

1. **Два процесса на порту 80** — compose **reverse-proxy** не стартует; при этом старый nginx может продолжать отдавать сайт → ложное «всё ок».
2. **`git push` на VPS** без полноценного клона — не то место; push только с ПК / CI.
3. **Rsync с удалением сертификатов** — если не исключён **`infra/nginx/certs/`**, сломается HTTPS.
4. **Путаница «папка vs проект»** — каталог на диске **`/opt/mywave/tourism`**; имя **Compose-проекта** по умолчанию совпадает с именем каталога (**`tourism`** → **`tourism-*`**), если явно не задан **`COMPOSE_PROJECT_NAME`**. В командах всегда **`export MW=/opt/mywave/tourism`** и **`cd "$MW"`**; реальные имена контейнеров — из **`docker compose ps`**.
5. **`location /api/ { proxy_pass http://$variable/; }`** — nginx **не** снимает префикс `/api/` с URI; витрина получает **404** / **`Cannot GET /`** на **`/api/programs`**. Канон: **`rewrite` + `proxy_pass $mw_api_pass`** — см. **`infra/nginx/mywave.conf`**; локально **`bash scripts/verify_nginx_config.sh`**.
6. **Ручной nginx: `location /` на `api` или `proxy_pass …/api/health` на бэкенде** — ломают сайт и `/api/health`; см. §5b и канон **`infra/nginx/mywave.conf`** в репозитории.

---

## 9. Связанные документы

- [TIMEWEB_CLICK_BY_CLICK.md](./TIMEWEB_CLICK_BY_CLICK.md) — клики в панели Timeweb + команды по одной строке.
- [TIMEWEB_AND_ACTIONS_LINKS.md](./TIMEWEB_AND_ACTIONS_LINKS.md) — Actions, файрвол, SSH.
- [TIMEWEB_VPS_COMMANDS.md](./TIMEWEB_VPS_COMMANDS.md) — расширенная диагностика.
- [OWNER_QUICKSTART.md](./OWNER_QUICKSTART.md) — рестарт и логи для владельца.
