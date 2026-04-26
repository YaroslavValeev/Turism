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
- Telegram bot: отдельный сервис (`journalctl -u mywave-bot` или отдельный docker logs)

## Как перезапустить сервисы
- Полный стек:
  - `docker compose -f docker-compose.production.yml up -d --build`
- Только API:
  - `docker compose -f docker-compose.production.yml restart api`
- Только web/admin:
  - `docker compose -f docker-compose.production.yml restart web admin`

## Быстрые проверки после рестарта
- `https://mywavetour.ru` открывается.
- `https://api.mywavetour.ru/health` возвращает `{"status":"ok"}`.
- Вход в админку работает.
