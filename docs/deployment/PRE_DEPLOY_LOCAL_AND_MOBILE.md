# Локальная приёмка, мобильный просмотр, затем домен

## Порты по умолчанию

| Сервис | URL |
|--------|-----|
| Публичный каталог (Next.js `web`) | http://localhost:3000 |
| API | http://localhost:3001 |
| Админка (Next.js `admin`) | http://localhost:3002 |

Запуск из корня репозитория (после `docker compose up` для Postgres и настроенного `DATABASE_URL`):

- API: `pnpm run dev:api`
- Каталог: `pnpm run dev:web:clean`
- Админка: `pnpm --filter admin dev`

Проверка: API на `:3001` — обычно `200` на корне/health; админка на `:3002` — `200` после редиректа с `/`.

### Порт `:3000` и ответ `404` на `/`

**Ожидаемое поведение этого репозитория:** приложение [`apps/web`](../../apps/web) с [`apps/web/src/app/page.tsx`](../../apps/web/src/app/page.tsx) отдаёт **главную страницу** на **`GET /`** (лендинг + каталог). В [`apps/web/next.config.js`](../../apps/web/next.config.js) нет `basePath`; отдельного middleware с `notFound` для `/` нет.

**Если вы видите `404` на `http://localhost:3000/`**, чаще всего на порту **3000** слушает **не** этот `web` (другой процесс / старый dev-сервер / другой проект). Типичный симптом при запуске: `Error: listen EADDRINUSE :::3000` — значит, «наш» Next не поднялся, а запросы уходят в чужой сервис.

**Что сделать:**

1. Найти PID процесса на 3000 (Windows): `netstat -ano | findstr :3000`, затем `tasklist /FI "PID eq <pid>"`.
2. Остановить лишний процесс **или** временно запустить каталог на другом порту, например: `pnpm --filter web exec next dev -p 3010` и проверять `http://localhost:3010/`.
3. Убедиться, что в HTML/title виден ожидаемый контент MyWave (см. metadata в [`apps/web/src/app/layout.tsx`](../../apps/web/src/app/layout.tsx)).

Чеклисты URL для ручной приёмки: [`docs/qa/BROWSER_CHECK_ROUTES.md`](../qa/BROWSER_CHECK_ROUTES.md), для телефона — [`docs/qa/MOBILE_CHECK_ROUTES.md`](../qa/MOBILE_CHECK_ROUTES.md).

## Android / телефон в той же Wi‑Fi сети

1. Узнайте IPv4 ПК в LAN (например `ipconfig` → «Адаптер беспроводной сети» → IPv4).
2. На телефоне откройте `http://<IPv4_ПК>:3000` (каталог) и при необходимости `http://<IPv4_ПК>:3002` (админка).
3. Если страница не грузится: разрешите входящие подключения для Node/Next в брандмауэре Windows; убедитесь, что dev-сервер слушает `0.0.0.0` (при необходимости задайте `hostname` в конфиге Next или используйте туннель ниже).

## Альтернатива: туннель (без LAN)

Поднимите туннель к `:3000` (например ngrok, Cloudflare Tunnel, localtunnel) и откройте выданный HTTPS URL с телефона. Домен для этого не нужен.

## Гейт перед доменом и деплоем

**Домен, staging/production и любой публичный деплой — только после явного owner sign-off по двум пунктам:**

1. **Browser review** — пройден чеклист [`docs/qa/BROWSER_CHECK_ROUTES.md`](../qa/BROWSER_CHECK_ROUTES.md), подтверждено что на используемом порту запущен именно `apps/web` и главная `/` ведёт себя ожидаемо.
2. **Android review** — пройден [`docs/qa/MOBILE_CHECK_ROUTES.md`](../qa/MOBILE_CHECK_ROUTES.md) (LAN или туннель), учтены `NEXT_PUBLIC_API_URL` и доступность API с телефона.

До этого момента расширять продакшен-инфраструктуру не требуется.

## После приёмки: домен и деплой

1. Зафиксировать те же переменные окружения, что и локально (`DATABASE_URL`, секреты API, JWT админа и т.д.).
2. Импорт источников: см. [`docs/ingestion/OWNER_SOURCES_2026-04-16.md`](../ingestion/OWNER_SOURCES_2026-04-16.md) и `pnpm run ingest:import-owner-sources`.
3. Ингест только owner-batch (без остальных активных источников): `pnpm run ingest:owner-sources-only`.
4. Проверка данных: `pnpm run ingest:count-owner-sources`.
5. Политика публикации: [`docs/INGESTION_POLICY.md`](../INGESTION_POLICY.md) — discovery не публикует в прод без гейта.
6. Настроить reverse proxy (TLS), процесс миграций БД (`pnpm run db:migrate`), health checks на API.
