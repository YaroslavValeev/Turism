# Timeweb Production Baseline

Стратегия двух треков (локальный пилот vs evidence на Timeweb) и критерии готовности: [`../MYWAVE_STRATEGY_TWOTRACKS.md`](../MYWAVE_STRATEGY_TWOTRACKS.md). Шаблон пакета evidence: [`DEPLOY_EVIDENCE_TEMPLATE.md`](DEPLOY_EVIDENCE_TEMPLATE.md).

## Что обнаружено
- До этого в репозитории не было production compose, reverse proxy конфигов и формализованных env для prod.
- Отсутствовали единые инструкции по разделению сервисов сайта и Telegram-бота.

## Почему это важно
- Без формального baseline высокий риск портовых конфликтов, невалидного TLS, потери media и неподготовленного rollback.

## Какое решение внедрено
- Добавлен production-контур:
  - `docker-compose.production.yml`
  - `infra/nginx/mywave.conf`
  - `.env.production`, `services/api/.env.production`, `apps/web/.env.production`, `apps/admin/.env.production`
  - Dockerfile для `api`, `web`, `admin`

## Портовая матрица (без конфликта с Telegram-ботом)
- `reverse-proxy` слушает только `80/443`.
- `web` внутренний `3000`.
- `api` внутренний `3001`.
- `admin` внутренний `3002`.
- Telegram-бот должен работать отдельным сервисом (`bot.service` или отдельный контейнер), без захвата `80/443`.

## Разделение сервисов
- Сайт: `reverse-proxy`, `web`, `api`, `admin`, `postgres`.
- Бот: отдельный unit/контейнер (`mywave-bot`) с отдельным логом и restart policy.

## Persistent storage
- Postgres: volume `postgres_data`.
- Медиа ingestion: volume `ingestion_media` (примонтирован в API контейнер).

## Логи
- `./logs/api` — backend
- `./logs/nginx` — reverse proxy/frontend ingress
- Бот: отдельный лог (`journalctl -u mywave-bot` или `./logs/bot` при контейнеризации)
- DB: docker logs postgres + backup отчёты

## Backup / Restore
- Backup:
  - `docker compose -f docker-compose.production.yml exec -T postgres pg_dump -U $POSTGRES_USER $POSTGRES_DB > backups/mywave_$(date +%F_%H%M).sql`
- Restore (staging rehearsal обязателен):
  - `cat backups/<file>.sql | docker compose -f docker-compose.production.yml exec -T postgres psql -U $POSTGRES_USER -d $POSTGRES_DB`
- Минимум: ежедневный backup + еженедельный тест восстановления.

## Мониторинг минимум
- Uptime: `/health` (api) и главная web.
- Ошибки: доля HTTP 5xx по nginx и API.
- Инфраструктура: CPU/RAM/disk.
- Alert каналы: Telegram owner chat + email.

## DNS и TLS
- `mywavetour.ru` -> reverse proxy.
- `admin.mywavetour.ru` -> reverse proxy.
- `api.mywavetour.ru` -> reverse proxy.
- Сертификаты: положить в `infra/nginx/certs` (или заменить на certbot/caddy в инфраструктуре).

## Rollback
1. Остановить rollout: `docker compose -f docker-compose.production.yml down`.
2. Поднять предыдущие образы (теги фиксировать перед релизом).
3. Если затронута БД: откат миграции или restore из последнего backup.
4. Прогнать smoke: `/health`, каталог, карточка, отправка заявки, админ-вход.
