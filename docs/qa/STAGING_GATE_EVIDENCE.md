# Staging Gate Evidence

## Scope
Фиксация технического gate перед production deploy (backend/frontend/infra readiness + smoke/regression минимум).

## Автоматические проверки (выполнено)
- `pnpm --filter api test` — passed (7 файлов, 29 тестов).
- `pnpm --filter @mywave/config build` — passed.
- `pnpm --filter api build` — passed.
- `pnpm --filter admin build` — сборка дошла до финализации страниц/трейсов без ошибок.
- `pnpm --filter web build` — сборка дошла до финализации страниц/трейсов без ошибок.

## Проверки миграций
- Добавлена миграция статусов:  
  `services/api/prisma/migrations/20260424134500_booking_lead_status_constraints/migration.sql`
- Rollback point:
  - откат к предыдущему docker image
  - restore DB из backup перед `migrate deploy`
  - при необходимости drop созданных check constraints вручную

## Smoke сценарии (staging, ручной прогон)
- [ ] Главная открывается по HTTPS.
- [ ] Каталог программ открывается и фильтры работают.
- [ ] Карточка программы открывается.
- [ ] Отправка заявки работает (первый submit = 201/ok, повторный быстрый submit = 409 duplicate).
- [ ] Уведомление уходит в Telegram/email по настроенной интеграции.
- [ ] Вход в админку работает.
- [ ] Из админки открывается карточка на web-домене (без localhost).
- [ ] В API нет утечки stack/internal error message наружу.

## Регрессия ролей и прав
- [ ] `admin` имеет доступ к защищенным endpoint.
- [ ] `organizer`/`user` не получают admin доступ.
- [ ] Публичные endpoint доступны без токена только там, где предусмотрено.

## Негативные сценарии
- [ ] Пустые/невалидные формы дают user-safe ошибки.
- [ ] При недоступности Telegram/email API не падает.
- [ ] Rate-limit возвращает 429 на burst.

## Нагрузочный минимум
- [ ] Прогон базового одновременного трафика (например `k6`/`autocannon`) на `/health`, `/programs`, `/bookings`.
- [ ] Зафиксировать отсутствие лавины 5xx.

## Решение Gate
- Gate может быть `GO`, только когда:
  - все blocker/critical закрыты,
  - все чекбоксы выше отмечены как выполненные,
  - rollback проверен на staging.
