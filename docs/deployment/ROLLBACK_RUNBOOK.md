# Rollback Runbook

## Preconditions
- Есть последний успешный backup БД.
- Есть предыдущие теги docker-образов `api`, `web`, `admin`.
- Есть доступ к Timeweb серверу и DNS/proxy.

## Порядок отката
1. Зафиксировать инцидент и переключить релиз в `NO-GO`.
2. Остановить текущий стек:
   - `docker compose -f docker-compose.production.yml down`
3. Поднять предыдущие образы:
   - обновить теги в `docker-compose.production.yml`
   - `docker compose -f docker-compose.production.yml up -d`
4. Если проблема в данных:
   - восстановить БД из backup (`pg_restore`/`psql`), затем перезапустить API.
5. Выполнить smoke:
   - `/health`
   - каталог
   - карточка программы
   - заявка
   - админ-вход

## Откат миграций
- Если миграция только constraints:
  - drop конкретные constraints вручную.
- Если миграция с изменением данных:
  - только restore из backup (предпочтительно).

## Коммуникация
- Уведомить владельца о причине отката.
- Зафиксировать postmortem: root cause, impact, corrective actions.
