# Sprint 1 — Checkpoint 4 (publish gate expanded, booking foundation)

**Дата:** 2025-03-15  
**Scope:** Publish gate expanded; booking schema; canonical booking statuses; assisted booking intake; admin bookings queue; audit on booking status changes; public visibility tests.

---

## 1. Что изменено

| Изменение | Описание |
|-----------|----------|
| Publish gate expanded | Проверки: title, organizer, category/discipline, location (region), date (start/end), level (levelRequired), risk_level, gear_requirements, medical_limitations, cancellation_rules, program summary/structure (itinerary_day_by_day или audience_fit или inclusions), at least 1 media. |
| Booking schema | Модель Booking в Prisma по booking_data_contract: programId, organizerId, guestContact, sourceChannel, bookingStatus, firstResponseAt, bookedAt, completedAt, cancellationReason, refundAmountRub, gmvRub, commission fields, proofOfCompletion, notes. Связи с Program и Organizer. |
| Canonical booking statuses | Только статусы из shared-types (BOOKING_STATUSES). Валидация переходов: new не переходит в completed; правила в statusRules.ts. |
| Assisted booking intake | POST /bookings (public): programId, guestContact, sourceChannel. organizerId берётся из программы. Создаётся запись со статусом new. Только для опубликованных программ. |
| Admin bookings queue | GET /bookings (admin), GET /bookings/:id (admin), PATCH /bookings/:id/status (admin). Фильтр ?booking_status=. |
| Audit on booking status | При PATCH /bookings/:id/status пишется audit_log: entity_type=booking, changedField=booking_status_change, oldValue/newValue, changedBy. |
| Public visibility | GET /programs без admin: только publishStatus=published. GET /programs/:id без admin: 404 для draft/internal. GET /programs?all=1: 403 без валидного admin Bearer. |
| Catalog read-only | Web catalog без изменений: только список и карточка программы. Public booking flow не добавлен (нет формы брони на сайте в этом пакете — только API intake). |

---

## 2. Какие файлы созданы/изменены

### Созданы (7 файлов)

1. `services/api/prisma/migrations/20250315100000_bookings/migration.sql`
2. `services/api/src/modules/bookings/statusRules.ts`
3. `services/api/src/modules/bookings/routes.ts`
4. `apps/admin/src/app/bookings/page.tsx`
5. `SPRINT1_CHECKPOINT_4.md`

### Изменены (7 файлов)

6. `services/api/prisma/schema.prisma` (Booking, связи Program/Organizer ↔ Booking)
7. `services/api/src/modules/programs/publishGate.ts` (расширенный gate)
8. `services/api/src/index.ts` (bookingsRoutes)
9. `apps/admin/src/app/organizers/page.tsx` (ссылка на /bookings)
10. `apps/admin/src/app/programs/page.tsx` (ссылка на /bookings)

**Итого:** 5 созданных, 5 изменённых = 10 файлов.

---

## 3. Tree (релевантная часть)

```
services/api/
├── prisma/
│   ├── schema.prisma           ← Booking, Program.bookings, Organizer.bookings
│   └── migrations/
│       └── 20250315100000_bookings/
├── src/
│   ├── index.ts                ← /bookings
│   └── modules/
│       ├── programs/
│       │   └── publishGate.ts  ← expanded checks
│       └── bookings/
│           ├── statusRules.ts  ← canonical transitions
│           └── routes.ts

apps/admin/src/app/
├── organizers/page.tsx         ← link to bookings
├── programs/page.tsx           ← link to bookings
└── bookings/page.tsx           ← NEW: queue
```

---

## 4. Как тестировать

### Publish gate expanded

- Создать программу без title / discipline / levelRequired / gearRequirements / itinerary или audience_fit или inclusions. PATCH publish-status → published → 400, в missing перечислены недостающие поля.
- Заполнить все поля по gate + 1 медиа → PATCH publish-status → published → 200.

### Public visibility

- **GET /programs** без заголовка Authorization → в ответе только программы с publishStatus=published. (Создать draft, убедиться, что его нет в списке.)
- **GET /programs/:id** для программы в статусе draft → 404. Для published → 200.
- **GET /programs?all=1** без Bearer → 403. С валидным admin Bearer → 200, в ответе все статусы.

### Booking

- **POST /bookings** без auth: body `{ "programId": "<published_program_id>", "guestContact": "Name, +7..., email@test.ru" }` → 201, bookingStatus=new.
- **POST /bookings** с programId неопубликованной программы → 404.
- **GET /bookings** без auth → 401. С admin Bearer → 200, список.
- **PATCH /bookings/:id/status** с admin, body `{ "bookingStatus": "reviewed" }` → 200. Затем проверить audit_logs: запись с entity_type=booking, changedField=booking_status_change.
- Переход new → completed одним PATCH → 400 (invalid transition).

### Admin bookings queue

- Открыть http://localhost:3002/bookings после логина → таблица заявок, фильтр по статусу.

---

## 5. Риски

| Риск | Митигация |
|------|-----------|
| guestContact один string | Для MVP достаточно; при необходимости позже разнести на name/phone/email. |
| Нет UI смены статуса в admin | Смена через API (curl/Postman); при необходимости кнопки в следующем цикле. |

---

## 6. Rollback

- **Миграция bookings:** откат 20250315100000: DROP TABLE bookings; либо prisma migrate reset.
- **Код:** revert перечисленных файлов (§2).

---

## 7. Source of Truth Used

| Решение | Документ |
|---------|----------|
| Publish gate fields | program_card_schema.md (Required for publish) + расширение по corrections |
| Booking fields | booking_data_contract.md |
| Booking statuses | canonical_status_models.md (shared-types) |
| Status transition | canonical_status_models (new не в completed) |
| API | endpoint_contracts.md |

---

## 8. Подтверждения (отдельно)

| Требование | Подтверждение |
|------------|---------------|
| **Publish gate expanded** | В canPublish проверяются: title, organizer, category/discipline, location (region), date (startDate, endDate), level (levelRequired), risk_level, gear_requirements, medical_limitations, cancellation_rules, program summary/structure (itinerary_day_by_day или audience_fit или inclusions), at least 1 media. |
| **Public GET /programs returns only published** | В programs/routes.ts: where.publishStatus = "published" если не allowAll. allowAll только при ?all=1 и валидном admin JWT. |
| **Public GET /programs/:id does not leak draft** | Для GET /programs/:id если p.publishStatus !== "published" возвращается 404. |
| **Admin ?all=1 works only with admin auth** | isAdminRequest(req, env) проверяет Bearer JWT через ADMIN_JWT_SECRET; при ?all=1 без валидного токена — 403. |
| **Booking entity canonical** | Одна сущность Booking в schema; статусы только из canonical_status_models (shared-types); связь booking ↔ organizer ↔ program через programId, organizerId. |
| **Public payment absent** | Нет эндпоинтов оплаты, нет полей/логики приёма платежей в public flow. |
| **Revenue UI absent** | Нет страниц/компонентов GMV, комиссий, revenue в web и admin (только поля в модели для последующего этапа). |

---

*Checkpoint 4 завершён. Catalog остаётся read-only; public booking flow не расширен (только API intake).*
