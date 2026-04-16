# Traveler key policy (MVP)

## Цель

Дать MyWave **устойчивый не-PII идентификатор клиента** (`travelerKeyHash`) для связки шагов воронки (lead → booking → payment → repeat) без передачи персональных данных в слой `analytics_events` и без хранения «сырого» контакта в аналитике.

## Где живёт

| Слой | Поле / артефакт |
|------|------------------|
| Бизнес-БД | `leads.travelerKeyHash`, `bookings.travelerKeyHash` (nullable до появления соли/контакта) |
| Аналитические события | **не** дублировать хеш в payload фронта; при необходимости агрегаты строятся join’ом к `bookings` / `leads` |
| Секрет | `TRAVELER_KEY_SALT` (только сервер, `packages/config` → `Env`) |

## Исторические данные (backfill)

После включения соли для уже существующих строк в БД выполните одноразовый backfill: см. [`BACKFILL_RUNBOOK.md`](./BACKFILL_RUNBOOK.md) и скрипт `pnpm run backfill:traveler-key` в `services/api`.

## Генерация

1. Нормализация текста контакта: trim, lower-case, схлопывание пробелов (`normalizeGuestContact`).
2. `travelerKeyHash = HMAC-SHA256(TRAVELER_KEY_SALT, normalizedContact)` — реализация: [`services/api/src/lib/travelerKey.ts`](../../../services/api/src/lib/travelerKey.ts).
3. Если соль не задана — **хеш не вычисляется** (поле остаётся `null`), чтобы не хранить слабые детерминированные отпечатки.

## Связь с сущностями

- **Lead:** при появлении API создания лида — записать тот же хеш от `guestContact`, что и у связанного booking при конверсии.
- **Booking:** заполняется при публичном создании booking (см. [`bookings/routes.ts`](../../../services/api/src/modules/bookings/routes.ts)).
- **Payment / repeat:** платежи и возвраты уже привязаны к `bookingId` / `organizerId`; повторные покупки одного человека ищутся по **одинаковому** `travelerKeyHash` у нескольких `bookings`.

## Анонимный / авторизованный / повтор

| Сценарий | Поведение MVP |
|----------|----------------|
| Анонимный гость (только контакт в форме) | Один хеш на нормализованный контакт; несколько заявок с одним контактом → один ключ |
| Авторизованный пользователь (будущее) | Отдельная таблица mapping `userIdHash → travelerKeyHash` (не в этом MVP) |
| Повторная покупка | Тот же контакт → тот же `travelerKeyHash` → учёт в repeat / LTV-прокси |

## Метрики (как считать)

- **Repeat customer rate (прокси):** число `travelerKeyHash`, у которых `count(distinct booking_id) > 1` за окно, / число уникальных хешей с ≥1 бронированием.
- **Когорты:** группировка по неделе первого `min(createdAt)` booking (или lead) на хеш.
- **LTV (прокси):** сумма `gmvRub` (или `paidAmountRub`) по всем booking с одним `travelerKeyHash`.
- **Несколько bookings одного человека:** join по равному `travelerKeyHash`.

## Ограничения и caveats

- **Ложный merge:** общий семейный email/телефон в `guestContact` даёт один хеш на разных людей.
- **Ложный split:** разный ввод того же контакта («+7…» vs «8…», опечатки) → разные хеши до появления нормализации телефонов (в MVP только trim/lower/пробелы).
- **Дедупликация:** на уровне БД уникальность по хешу не навязывается (несколько booking допустимы); дедуп в метриках — аналитическое правило окна.
- **PII:** сырой `guestContact` остаётся в бизнес-таблице под отдельными политиками доступа; в аналитические события не копировать.

## Следующий шаг (вне MVP)

- Нормализация телефона E.164, отдельный optional `travelerKeySource` (email vs phone).
- Связка с account id после введения публичной авторизации.
