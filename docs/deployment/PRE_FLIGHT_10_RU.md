# Pre-flight: 10 шагов перед выкатом в прод

Чеклист **перед** `docker compose up` / Timeweb / CI на боевом сервере. См. также [ROLLBACK_RUNBOOK.md](./ROLLBACK_RUNBOOK.md), [POST_RELEASE_24H_CHECKLIST.md](./POST_RELEASE_24H_CHECKLIST.md).

1. **Ветка и образ**  
   В прод идёт **`main`**, тег/SHA образа **зафиксирован** (не «latest» без записи). Локально: `pnpm --filter api build && pnpm --filter api test`, `pnpm --filter web build`, `pnpm --filter admin build`.

2. **Секреты не в git**  
   Файлы **`.env` / `.env.production`** только на сервере (или в секрет-хранилище). Сверка с `services/api/.env.example`, `apps/web/.env.example`, `apps/admin/.env.example` — **все обязательные переменные заданы**.

3. **База: миграции**  
   На **пустой** БД: `pnpm --filter api exec prisma migrate deploy` (в контейнере API — тот же шаг в `CMD`/entrypoint). **Бэкап** снимается **до** миграции, если БД не пустая.

4. **URL и CORS**  
   `NEXT_PUBLIC_SITE_URL` (web) — **публичный https** сайта без хвостового `/`.  
   **`NEXT_PUBLIC_API_URL` (web):** либо отдельный хост API (`https://api.mywavetour.ru`), либо same-origin **`/api`** или **`https://mywavetour.ru/api`**. Нельзя задавать только **`https://mywavetour.ru`** без пути `/api`: иначе браузер запросит `…/programs` у Next.js и получит **404** (в свежих сборках это подправлено в `getPublicApiBase`, но в env лучше сразу канон).  
   Для admin: **`NEXT_PUBLIC_API_URL`** — публичный base API (часто `https://api.mywavetour.ru`).  
   Для `web` в Docker межсервисно: **`API_INTERNAL_BASE_URL`** (например `http://api:3001`), если RSC стучится к API **по внутреннему** имени.

5. **Postgres**  
   `POSTGRES_*` в `.env.production` совпадает с DSN `DATABASE_URL` в API. Health `postgres` в `docker-compose.production.yml` зелёный **до** старта `api`.

6. **Reverse proxy / SSL**  
   Nginx/Traefik: проксирование на `web:3000`, `admin:3002`, `api:3001`; сертификаты **Let's Encrypt** (или внешний) валидны. Проверка: `curl -sI https://<домен>/` → **200/301** без циклов.

7. **Смоук сразу после up**  
   - `GET /health` API  
   - Главная витрина и **`/public/blog`** (публичная лента)  
   - Логин **админки** (тестовый пароль **не** дефолтный `admin123` в проде)

8. **Контент-конвейер (если используется)**  
   `POST /jobs/run-content-pipeline` с **admin JWT** на стенде, Telegram `TELEGRAM_CONTENT_*` — см. [TELEGRAM_CONTENT_WEBHOOK_RUNBOOK.md](./TELEGRAM_CONTENT_WEBHOOK_RUNBOOK.md), [../CONTENT_PIPELINE_PRODUCTION.md](../CONTENT_PIPELINE_PRODUCTION.md).

9. **Наблюдение**  
   Логи: `api`, `web`, `nginx` (ротация, диск). Минимум: алерт на **5xx** и **недоступность** `/health`.

10. **План отката**  
    Предыдущий **образ/том БД (если миграция ломающая)**. Кто **останавливает** трафик и **восстанавливает** релиз — [ROLLBACK_RUNBOOK.md](./ROLLBACK_RUNBOOK.md).

---
**Быстрые команды (после деплоя, с хоста или bastion):**

```bash
curl -sS "https://<API_HOST>/health"
curl -sS "https://<WEB_HOST>/" -o /dev/null -w "%{http_code}\n"
```

**Примечание (web `next build`):** RSC-запросы к публичному API идут через `safeServerFetch` (сетевой сбой → пустые данные, не падение). Если API **не запущен**, в логе сборки Node может печатать `TypeError: fetch failed` / `ECONNREFUSED` — при **успешном** завершении `next build` (exit 0) это **не блокер**; для «тихой» сборки поднимайте API на `localhost:3001` или укажите рабочий `API_INTERNAL_BASE_URL` в env билда. HTML при офлайн API может быть **беднее**; в рантайме данные обновляются (ISR/revalidate/SSR).
