# Локальная разработка: Web + API + Postgres

Сводка по контуру, закреплённому в репозитории (скрипты в корневом `package.json`, `docker-compose.yml`, `services/api/.env.example`).

## Порты

| Сервис | Порт | Команда |
|--------|------|---------|
| Витрина (Next) | **3000** | `pnpm dev:web` |
| API (Express) | **3001** | `pnpm dev:api` |
| Админка (Next) | **3002** | `pnpm dev:admin` |
| Postgres (Docker) | **5432** | `docker compose up -d` |

Без API на **3001** главная страница не загрузит каталог (`GET /programs`).

## Быстрый старт

1. **Docker Desktop** запущен.
2. Из корня репозитория:
   ```bash
   pnpm local:bootstrap
   ```
   Выполняет: `local:ensure-env` (копирует `services/api/.env` и `apps/web/.env.local` из примеров, если файлов ещё нет) → `docker compose up -d` → `db:generate` → `db:deploy`.
3. Данные (по желанию):
   ```bash
   pnpm db:seed
   pnpm db:seed:demo
   ```
4. Два терминала:
   ```bash
   pnpm dev:api
   pnpm dev:web
   ```
5. Админка: `pnpm dev:admin` → `http://localhost:3002/login` (нужен API на 3001). Учётка после seed: см. `services/api/prisma/seed.ts` (`admin@mywave.local` / `admin123` в non-production).

## Полезные скрипты

| Скрипт | Назначение |
|--------|------------|
| `pnpm local:ensure-env` | только создание `.env` из `.env.example` |
| `pnpm local:bootstrap` | compose + prisma generate + `migrate deploy` |
| `pnpm db:deploy` | неинтерактивные миграции (`prisma migrate deploy`) |
| `pnpm db:seed` / `pnpm db:seed:demo` | сид админа и опционально демо-каталог |

## Порт 3000 занят

- Остановить старый `next dev` или задать другой порт для витрины:
  ```powershell
  $env:WEB_DEV_PORT=3002; pnpm dev:web
  ```
  Тогда открывайте `http://localhost:3002` (не путать с админкой на 3002 по умолчанию — выберите свободный порт, например **3010**).

## CORS

В `services/api/.env` должны быть разрешены origin витрины и админки, например:
`CORS_ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3002`

## Витрина: единый фон и подсказка при падении API

- Визуальный холст лендинга унифицирован в `apps/web/src/app/globals.css` (переменная `--mw-bg`, секции без «полос»).
- При недоступном API на главной в герое показывается предупреждение с подсказкой запустить `pnpm dev:api` и `pnpm local:bootstrap` (`apps/web/src/app/home-page.tsx`).

## Сбой Next.js: `Cannot find module './NNN.js'` или `__webpack_modules__[moduleId] is not a function`

Чаще всего это **рассинхрон кэша** в `apps/web/.next` (смена ветки, обновление зависимостей, прерванная сборка). Не запускайте **`next build`** параллельно с **`next dev`** на одной копии `apps/web` — см. подсказку скрипта `clean:web-cache`.

**С корня репозитория (предпочтительно):**

1. Остановите `pnpm dev:web`.
2. `pnpm clean:web-cache` — удаляет `apps/web/.next`, при наличии также `.turbo` и `node_modules/.cache`.
3. Снова: `pnpm dev:web`.

Одной командой «чистый dev»: `pnpm dev:web:clean` (кэш + обычный старт витрины).

Вручную: `Remove-Item -Recurse -Force "apps/web/.next"` или из каталога `apps/web`: `pnpm clean` (только `.next`).

## Прод: открыли `…/api/` в браузере — текст «Cannot GET /»

Раньше у приложения не было обработчика `GET /` на корне API (есть `GET /health`). После деплоя актуальной версии корень отдаёт краткий JSON с подсказкой; для мониторинга по-прежнему используйте **`GET /health`** (или `…/api/health`, если так настроен reverse proxy).

## См. также

- Письма с просьбой об отзыве после `completed`: [AUTO_REVIEW_PROD_ROLLOUT_PLAN.md](../analytics/runtime/AUTO_REVIEW_PROD_ROLLOUT_PLAN.md), [REVIEW_FLOW_MANUAL_VALIDATION_STAGE.md](../analytics/runtime/REVIEW_FLOW_MANUAL_VALIDATION_STAGE.md).
- Telegram chat_id для прод-конфига: [reference/TELEGRAM_MYWAVETOUR.md](../reference/TELEGRAM_MYWAVETOUR.md).
