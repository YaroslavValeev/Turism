# Аудит записей `Booking.bookingStatus` (ADR-007)

Цель: перечислить **все** места, где в БД меняется поле `bookingStatus`, и классифицировать по контуру (operational / billing-derived / initial create).

## 1. Operational — `applyBookingStatusTransition`

| Вход | Файл / маршрут |
|------|----------------|
| Админский PATCH | `services/api/src/modules/bookings/routes.ts` — `PATCH /bookings/:id/status` |
| Авто после доставки лида | `services/api/src/modules/bookings/routes.ts` — `POST /bookings` → `applyBookingStatusTransition` → `sent_to_organizer` при успешной доставке |

Политика: `bookingTransitions` в `@mywave/shared-policy`, события через status-engine.

При переходах в статусы отмены / refund (см. `RECOVERY_TRIGGER_STATUSES` в коде) в **том же** `prisma.booking.update`, что и `bookingStatus`, могут записываться `cancellationKind` / `cancellationReason` — это **не** отдельный писатель статуса, а поля lifecycle внутри operational-контура.

## 2. Billing-derived — `deriveBookingStatus` + `booking_payment_derived_status`

| Операция | Файл |
|----------|------|
| Запись платежа | `services/api/src/modules/billing/service.ts` — `recordPayment` → `prisma.booking.update` + `recordDomainStatusEvent` (`booking_payment_derived_status`) |
| Запись возврата | `services/api/src/modules/billing/service.ts` — `recordRefund` → то же |

Канон: `services/api/src/modules/billing/deriveBookingStatus.ts`.

## 3. Начальное создание заявки (не engine, не billing)

| Операция | Файл |
|----------|------|
| Публичная заявка | `services/api/src/modules/bookings/routes.ts` — `POST /bookings` — `booking.create` с `bookingStatus: "new"` + доменное событие `lead_created` |

## 4. Не являются записями статуса

Запросы с `select` / `where` по `bookingStatus` (reviews, UGC, metrics и т.д.) — **чтение**, не писатели.

Дополнительно: в `bookings/routes.ts` есть `prisma.booking.update` без смены `bookingStatus`:

| Участок | Поля в `data` |
|---------|----------------|
| `POST /bookings` — скидка reward сразу после create | `originalAmountRub`, `discountAmountRub`, `finalAmountRub` |
| `PATCH /bookings/:id/pricing` | то же (admin pricing) |

Статус заявки этими маршрутами **не** меняется.

## 5. Результат полного прохода (2026-04-17)

**Метод:** поиск по репозиторию на `bookingStatus`, `prisma.booking.(update|create|upsert)`, все вхождения `bookingStatus` в объектах `data:` для Prisma.

**Вывод:** в **runtime API** (`services/api/src`) **нет** скрытых писателей `bookingStatus` кроме уже перечисленных в §1–3:

| Проверено | Результат |
|-----------|-----------|
| `prisma.booking.update` | Кроме `applyBookingStatusTransition`, `billing/service` (×2), встречаются `ugc/rewardService.ts` (**только** `appliedRewardId`), `scripts/backfill-traveler-key.ts` (**только** `travelerKeyHash`), `prisma/cleanup_dev_data.ts` (**только** `notes`) — поле `bookingStatus` **не** пишется. |
| `prisma.booking.create` | Только `bookings/routes.ts` (`POST /bookings`) с `"new"`. |
| Ingestion / seed | В актуальных путях ingestion для Booking нет альтернативного создания заявки с иным контуром статуса в рамках проверенного дерева. |
| Admin UI | Только вызывает уже учтённый `PATCH /bookings/:id/status` → engine. |

**Новых контуров** (четвёртого «тихого» писателя) **не обнаружено**. Любое будущее отклонение — сначала запись в этот документ + ADR + правило для `STAGE4_1_DIRECT_STATUS_WRITES.md`.

## Следующий шаг (не в рамках текущего спринта UI/ingestion)

Любое новое присвоение `bookingStatus` вне таблицы выше — только через ADR и обновление `STAGE4_1_DIRECT_STATUS_WRITES.md` (список только сужается).

План точечного среза по ADR-007: `STAGE4_1_ADR007_NEXT_SLICE.md`.

## 6. Повторный проход Stage 4.1 (2026-04-23)

Перепроверка после reward recovery: третий писатель `bookingStatus` **не** появился; `cancellation*` и pricing-updates согласованы с §1 и §4 выше.
