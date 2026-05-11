# Owner Quickstart

## Где смотреть заявки
- Админка: `https://admin.mywavetour.ru`
- Разделы:
  - `Bookings` — входящие заявки/статусы
  - `Programs` — карточки программ и публикация
  - `Reviews` — модерация отзывов

## Где смотреть логи
- API: `./logs/api`
- Reverse proxy: `./logs/nginx`
- Telegram bot: отдельный сервис (`journalctl -u mywave-bot` или отдельный docker logs). Справочник chat_id бота для прод-конфига: [../reference/TELEGRAM_MYWAVETOUR.md](../reference/TELEGRAM_MYWAVETOUR.md).

## Локальная разработка (витрина + API)
- Краткая инструкция: [../development/LOCAL_WEB_API.md](../development/LOCAL_WEB_API.md) (`pnpm local:bootstrap`, порты 3000 / 3001 / 3002, `WEB_DEV_PORT`).

## Деплой на Timeweb (последовательность команд)
- [TIMEWEB_DEPLOY_STEPS.md](./TIMEWEB_DEPLOY_STEPS.md) — Actions, rsync, Postgres, миграции, проверки.
- [TIMEWEB_VPS_TERMINAL_COMMANDS.md](./TIMEWEB_VPS_TERMINAL_COMMANDS.md) — копипаст-блоки для SSH-консоли VPS.

## Как перезапустить сервисы
- Полный стек:
  - `docker compose -f docker-compose.production.yml up -d --build`
- Только API:
  - `docker compose -f docker-compose.production.yml restart api`
- Только web/admin:
  - `docker compose -f docker-compose.production.yml restart web admin`

## Быстрые проверки после рестарта
- `https://mywavetour.ru` открывается.
- `https://api.mywavetour.ru/health` возвращает `{"status":"ok"}` (или эквивалент с префиксом `/api`, если API за reverse proxy).
- Открытие корня API в браузере (`/api/` или корень хоста API) после деплоя даёт краткий JSON с подсказкой; для мониторинга используйте **`GET /health`**.
- Вход в админку работает.
