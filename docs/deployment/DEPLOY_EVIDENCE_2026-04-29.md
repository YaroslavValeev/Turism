# DEPLOY EVIDENCE — 2026-04-29

**Окружение:** production (Timeweb VPS `5.129.249.113`)  
**Версия / git SHA:** `258e2ba`  
**Ответственный:** owner

---

## 1. Docker

```text
NAME                      IMAGE                COMMAND                  SERVICE         STATUS
toutism-admin-1           toutism-admin        "docker-entrypoint..."   admin           Up
toutism-api-1             toutism-api          "docker-entrypoint..."   api             Up (healthy)
toutism-postgres-1        postgres:16-alpine   "docker-entrypoint..."   postgres        Up (healthy)
toutism-reverse-proxy-1   nginx:1.27-alpine    "/docker-entrypoint..."  reverse-proxy   Up
toutism-web-1             toutism-web          "docker-entrypoint..."   web             Up
```

Сервисы `api`, `web`, `admin`, `postgres`, `reverse-proxy`: **да**.

---

## 2. DNS / TLS

| Хост | Назначение | Проверено |
|------|------------|-----------|
| `mywavetour.ru` | web | да |
| `admin.mywavetour.ru` | admin | да |
| `api.mywavetour.ru` | api | да |

- DNS в NS Timeweb (`ns1.timeweb.ru`, `ns2.timeweb.ru`, `ns3.timeweb.org`, `ns4.timeweb.org`).
- A-записи переведены на `5.129.249.113`.
- Let's Encrypt выпущен для `mywavetour.ru`, `www.mywavetour.ru`, `api.mywavetour.ru`, `admin.mywavetour.ru`.
- Сертификаты скопированы в `infra/nginx/certs` и `reverse-proxy` перезапущен.

---

## 3. Health

```text
curl -k https://api.mywavetour.ru/health
{"status":"ok"}
```

---

## 4. Миграции

- Команда: `docker compose -f docker-compose.production.yml --env-file .env.production exec api sh -c "cd /app/services/api && npx prisma@5.22.0 migrate deploy"`
- Статус: `success` (`No pending migrations to apply`, 28 migrations found).

---

## 5. Nginx

- Конфиг: `infra/nginx/mywave.conf`
- Контейнер `reverse-proxy` запущен, HTTP/HTTPS порты опубликованы (`80/443`).
- В репозитории устранено предупреждение nginx 1.27: вместо `listen 443 ssl http2` используется `listen 443 ssl;` + `http2 on;` (три HTTPS-блока). После выката на VPS — перезапуск `reverse-proxy`, предупреждения в логах должны исчезнуть.

---

## 6. Telegram

**Выбранный режим:** `TODO (webhook/polling)`  
Подтверждение доставки updates: `TODO`.

---

## 7. Smoke API

| Проверка | Ожидание | Факт |
|----------|----------|------|
| `GET /health` | 200 + ok body | 200 + `{"status":"ok"}` |
| `GET /` (web) | 200 + HTML | 200 |
| `GET /` (admin) | 200 + HTML | 200 (контент страницы 404, инфраструктурно доступен) |
| Остальные smoke (`programs`, `bookings`, duplicate window`) | согласованный контракт | `TODO` |

---

## 8. Admin

- URL: `https://admin.mywavetour.ru/`
- Доступность домена подтверждена после обновления DNS.
- Проверка `GET /login`: `HTTP/2 200`.
- Проверка root `/`: требуется уточнение контента (в одном из ранних smoke наблюдался 404 shell).

---

## 9. Logs

| Источник | Команда | Redaction |
|----------|---------|-----------|
| API | `docker compose ... logs --tail=60 api` | да |
| Nginx | `docker compose ... logs --tail=60 reverse-proxy` | да |
| DB | `docker compose ... logs --tail=60 postgres` | да |

Ключевой факт: API стартует (`API listening on 3001`), health отвечает `ok`.

---

## 10. Backup

- Backup БД: выполнен через `pg_dump` в файл `backups/mywave_2026-04-29_1014.sql`.
- Размер файла: `114K`.
- Restore rehearsal: `TODO`.

---

## 11. Rollback

- Runbook: `docs/deployment/ROLLBACK_RUNBOOK.md`
- Репетиция rollback: `TODO`.

---

## 12. Итоговое решение

- [x] Инфраструктурный запуск production-контура на новом VPS завершен.
- [ ] Закрыть post-deploy: functional smoke admin root route, backup/restore rehearsal.

**Подпись / дата:** owner / `2026-04-29`
