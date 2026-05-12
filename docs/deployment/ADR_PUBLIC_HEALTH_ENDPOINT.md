# ADR: публичный health-endpoint на основном домене

**Статус:** accepted  
**Дата:** 2026-05-08  

## Контекст

- Backend отдаёт **`GET /health`** → `{"status":"ok"}` на порте API (`api:3001`).
- На `https://mywavetour.ru` запрос **`GET /health`** попадал в **`location /`** → Next.js и мог возвращать **404**, хотя **`GET /api/health`** уже шёл в API через `location /api/` и работал.

Нужен предсказуемый короткий URL для мониторинга и runbook без привязки к префиксу `/api`.

## Решение

1. Канонический ответ API по-прежнему **`/health`** внутри сервиса и на **`https://api.mywavetour.ru/health`**.
2. На основном домене **`https://mywavetour.ru/api/health`** — через **`location /api/`** и дублирующий явный блок **`location = /api/health`** в **`infra/nginx/mywave.conf`** (если старый порядок `location` отдавал 404 в Next).
3. В **`infra/nginx/mywave.conf`** для `server_name mywavetour.ru www.mywavetour.ru` добавлено **`location = /health`** с **`proxy_pass http://api:3001/health`**, чтобы **`https://mywavetour.ru/health`** совпадал с телом API.

## Последствия

- Скрипты и алерты могут использовать **`/health`** или **`/api/health`** на основном домене; оба допустимы после выката nginx.
- При смене только web-контейнера без reverse-proxy убедиться, что конфиг nginx на VPS актуален.

## Откат

Удалить блок `location = /health` из nginx и перезагрузить `reverse-proxy`; для проверок использовать **`/api/health`** или прямой хост **`api.mywavetour.ru`**.
