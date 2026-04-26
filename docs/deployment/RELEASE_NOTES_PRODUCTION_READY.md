# Release Notes — Production Readiness

## Backend
- Добавлены `helmet` + `rate limit` для публичного контура API.
- CORS переведен на allowlist через `CORS_ALLOWED_ORIGINS`.
- Ошибки API унифицированы: без утечки внутренних сообщений.
- Логирование PII в subscriptions notifier заменено на безопасные структурные логи.
- Авторизация admin переведена на `bcrypt` (с авто-upgrade legacy hash при входе).
- Добавлена защита от дублей заявок (окно 2 минуты на одинаковый `programId + guestContact`).
- Добавлена миграция check constraints для `bookingStatus` и `leadStatus`.

## Frontend
- Убраны placeholder/dev контакты (`mywave.local`) из публичного контента.
- Убрана dev-ссылка `localhost` в админке; используется `NEXT_PUBLIC_WEB_URL`.
- Добавлены SEO-артефакты: `robots.ts`, `sitemap.ts`, canonical в metadata.
- Для карточки программы добавлена генерация metadata/canonical.

## Infrastructure/DevOps
- Добавлены Dockerfile для `api`, `web`, `admin`.
- Добавлен `docker-compose.production.yml` для production-контура.
- Добавлен nginx reverse-proxy конфиг с HTTPS маршрутизацией.
- Подготовлены отдельные `*.env.production` файлы для root/api/web/admin.
- Зафиксирован production baseline для Timeweb в отдельной документации.

## QA/Gate
- API unit tests: успешно.
- Build config/api/admin/web: успешно до финализации next build стадий.
- Добавлен файл evidence для staging gate с обязательными ручными проверками.
