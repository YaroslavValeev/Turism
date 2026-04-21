# ADR-005: Lead vs Booking Canonical Terminology

Дата: 2026-04-17  
Статус: accepted (for implementation)

## Контекст

В документах и коде использовались оба термина: `Lead` и `Booking`.  
Это создает риск расхождения между UI/API/аналитикой и статусной моделью.

## Решение

Принять **`Booking` как каноническую доменную сущность lifecycle заявки/сделки**.

- `Lead` остается только как продуктовый/аналитический ярлык ранней стадии.
- На уровне API, БД, статусов, событий и audit используется `Booking`.

## Каноническая схема

- `Booking.new` + `Booking.reviewed` + `Booking.sent_to_organizer` == Lead stage.
- Дальше: `contacted` -> `offer_sent` -> `booked` -> `paid_off_platform` -> `completed`.

## Последствия

- Убираем двусмысленность в техническом контуре.
- Analytics может строить воронки "lead funnel", но source entity = `Booking`.
- UI тексты могут показывать слово "заявка/лид" для понятности, но mapping обязателен.

## Затрагиваемые области

- `docs/*` где встречается Lead/Booking
- `services/api/src/modules/bookings/*`
- `apps/admin/src/app/bookings/*`
- `packages/shared-schema/*` и `packages/shared-policy/*` (contract naming)

## Проверка соответствия

- В новых endpoint contracts нет отдельной доменной сущности `Lead`.
- Все status transitions и event payload используют `booking_id`.

