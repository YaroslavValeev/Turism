# Server 10-minute checklist (Timeweb VPS)

Цель: быстро понять, жив ли прод-контур, отвечает ли API, и двигаются ли данные после ingestion.

## Шаг 1. Базовое состояние контейнеров

```bash
cd /opt/mywave/tourism
docker compose --env-file .env.production -f docker-compose.production.yml ps
```

Ожидание: `api`, `web`, `admin`, `db` в статусе `Up`.

## Шаг 2. Health API внутри VPS

```bash
curl -sS http://localhost:3001/health
curl -sS -k https://localhost/api/health
```

Ожидание: JSON/OK без timeout.

## Шаг 3. Логи последних ошибок

```bash
docker compose --env-file .env.production -f docker-compose.production.yml logs --tail 120 api web admin
```

Ищем: `error`, `timeout`, `ECONNREFUSED`, `Prisma`.

## Шаг 4. Принудительный ingestion (ручная проверка автообновления)

```bash
docker compose --env-file .env.production -f docker-compose.production.yml exec -T api pnpm exec tsx prisma/run_ingestion_cycle.ts --auto-publish
```

Ожидание: цикл завершается без падения.

## Шаг 5. Подтверждение, что данные реально обновились

```bash
docker compose --env-file .env.production -f docker-compose.production.yml exec -T db psql -U postgres -d mywave -c "\
SELECT id, status, started_at, finished_at\
FROM source_runs\
ORDER BY started_at DESC\
LIMIT 10;"

docker compose --env-file .env.production -f docker-compose.production.yml exec -T db psql -U postgres -d mywave -c "\
SELECT id, title, updated_at\
FROM programs\
ORDER BY updated_at DESC\
LIMIT 20;"
```

Ожидание:
- в `source_runs` появился новый запуск,
- у части `programs` изменился `updated_at`.

## Шаг 6. Публичная проверка с VPS

```bash
curl -sS https://mywavetour.ru/api/health
curl -sS https://mywavetour.ru/api/programs?limit=5
```

Ожидание: ответы приходят, JSON валиден.

## Быстрый вывод (GO/NO-GO)

- **GO:** контейнеры `Up`, health OK, ingestion завершился, в БД появились свежие записи, публичные API-ответы есть.
- **NO-GO:** timeout/5xx/падение ingestion/нет новых `source_runs`.
