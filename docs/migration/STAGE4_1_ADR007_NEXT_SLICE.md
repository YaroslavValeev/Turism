# Следующий implementation slice — ADR-007 (контроль писателей `bookingStatus`)

Канон списка писателей: `STAGE4_1_BOOKING_STATUS_WRITERS_AUDIT.md` (после полного прохода 2026-04-17).

## Цель среза

Закрепить **наблюдаемость и дисциплину** вокруг двух контуров + create, **без** объединения графов booking/billing и **без** новых записей статуса вне канона.

## Файлы для проверки (read-only / точечные правки)

| Файл | Что проверяете |
|------|----------------|
| `services/api/src/modules/bookings/routes.ts` | Единственное `booking.create` с `bookingStatus: "new"`; переходы статуса только через `applyBookingStatusTransition`. |
| `services/api/src/modules/status-engine/applyBookingStatusTransition.ts` | Единственная точка `prisma.booking.update` с полем `bookingStatus` для operational-контура. |
| `services/api/src/modules/billing/service.ts` | Единственные `prisma.booking.update` с `bookingStatus` в `recordPayment` / `recordRefund`; событие `booking_payment_derived_status`. |
| `services/api/src/modules/billing/deriveBookingStatus.ts` | Маркеры ADR-007; нет побочных эффектов на БД. |

## Что можно изменить (минимально)

- Точечные **комментарии-якоря** `// ADR-007: …` рядом с `booking.create` / первым `booking.update` в billing (если ещё не хватает навигации для ревью).
- Синхронизация одной строки в `docs/migration/STAGE4_1_DIRECT_STATUS_WRITES.md`, если формулировка расходится с аудитом (список только **сужать**).

## Что сознательно не трогаем в этом срезе

- `services/api/src/modules/ingestion/**` — по запрету этапа.
- `apps/admin/**`, `apps/web/**` — UI не меняем.
- Объединение operational и billing в **один** граф переходов — не делаем.
- Новые эндпоинты, меняющие `bookingStatus` в обход engine/billing — не добавляем.
- Скрипты `prisma/cleanup_dev_data.ts`, `scripts/backfill-traveler-key.ts`, `ugc/rewardService.ts` — не классифицируем как писатели статуса (см. аудит: там **нет** записи `bookingStatus`).

## Опционально позже (не обязательный минимум среза)

- CI / pre-commit: `rg` по репозиторию с allowlist путей для `bookingStatus` в `data:` у `booking.update` — только после стабилизации списка.

---

## Статус среза (2026-04-17)

- Якоря ADR-007 внесены в `bookings/routes.ts`, `applyBookingStatusTransition.ts`, `billing/service.ts` (как в таблице выше).
- Регрессия: `ADR007_BOOKING_STATUS_WRITE_MODULE_SUFFIXES` + `bookingStatusCanonical.test.ts`.
- Прямой список `STAGE4_1_DIRECT_STATUS_WRITES.md` **не менялся** (новых writers нет).

**Re-audit 2026-04-23:** повторная проверка после reward recovery — канон писателей `bookingStatus` сохранён; уточнения в `STAGE4_1_BOOKING_STATUS_WRITERS_AUDIT.md` (pricing / cancellation), guard-комменты в `bookings/routes.ts`.
