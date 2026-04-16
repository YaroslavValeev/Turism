# Sprint 1 — Checkpoint 5 (trust + revenue foundation)

**Дата:** 2026-03-16  
**Scope:** Incident schema; review schema; OrganizerVerificationEvidence; commission/reconciliation foundation; admin trust/revenue queues; booking queue operability; guestContact plan; audit proof.

---

## 1. Что изменено

| Изменение | Описание |
|-----------|----------|
| Incident schema | Модель Incident в Prisma: bookingId (opt), organizerId, programId (opt), type, severity, summary, incidentStatus (canonical). API: GET/POST /incidents, GET /incidents/:id, PATCH /incidents/:id/status (admin). Audit при создании и смене статуса. |
| Review schema | Модель Review: bookingId (unique), programId, organizerId, rating, comment, moderationStatus (pending/approved/rejected). Создание только для completed booking. API: GET/POST /reviews, GET /reviews/:id, PATCH /reviews/:id/moderation (admin). Audit при создании и смене модерации. |
| OrganizerVerificationEvidence | Модель для verified/trusted: evidenceType, evidenceUrl, notes. GET/POST /organizers/:id/evidence (admin). |
| Commission schema | Модель Commission: bookingId, organizerId, programId, gmvRub, commissionRatePct, commissionFixedRub, commissionAccruedRub, commissionCollectedRub, reconciliationStatus (canonical), invoiceStatus, paymentDueDate, paymentReceivedDate. API: GET/POST /commissions, GET /commissions/:id, PATCH /commissions/:id/reconciliation (admin). Audit при создании и смене reconciliation. |
| Admin trust/revenue queues | Страницы admin: /incidents, /reviews, /commissions — списки с фильтрами по статусу. Без финансового дашборда (revenue UI). |
| Booking queue operability | GET /bookings/:id возвращает nextStatuses (допустимые переходы). Страница /bookings/[id]: выбор следующего статуса из списка, кнопка «Применить». В списке заявок — ссылка «Открыть / сменить статус». |
| guestContact | Один string для MVP сохранён. Добавлен план нормализации: docs/GUEST_CONTACT_NORMALIZATION_PLAN.md (name/phone/email/telegram, безопасный порядок внедрения). |
| Audit proof (booking lifecycle) | Пример полезной audit-записи по booking: см. § 8. |

---

## 2. Какие файлы созданы/изменены

### Созданы (10 файлов)

1. `services/api/prisma/migrations/20250316100000_trust_revenue_schema/migration.sql`
2. `services/api/src/modules/incidents/routes.ts`
3. `services/api/src/modules/reviews/routes.ts`
4. `services/api/src/modules/commissions/routes.ts`
5. `apps/admin/src/app/bookings/[id]/page.tsx`
6. `apps/admin/src/app/incidents/page.tsx`
7. `apps/admin/src/app/reviews/page.tsx`
8. `apps/admin/src/app/commissions/page.tsx`
9. `docs/GUEST_CONTACT_NORMALIZATION_PLAN.md`
10. `SPRINT1_CHECKPOINT_5.md`

### Изменены (9 файлов)

11. `services/api/prisma/schema.prisma` — модели OrganizerVerificationEvidence, Review, Incident, Commission; связи Organizer/Program/Booking с новыми сущностями  
12. `services/api/src/modules/bookings/statusRules.ts` — экспорт getNextStatuses  
13. `services/api/src/modules/bookings/routes.ts` — GET /:id с nextStatuses, PATCH ответ с nextStatuses  
14. `services/api/src/modules/organizers/routes.ts` — GET/POST /:id/evidence  
15. `services/api/src/index.ts` — подключение incidents, reviews, commissions routes  
16. `apps/admin/src/app/bookings/page.tsx` — нав: Инциденты/Отзывы/Комиссии, колонка «Открыть / сменить статус»  
17. `apps/admin/src/app/organizers/page.tsx` — нав: Инциденты, Отзывы, Комиссии  
18. `apps/admin/src/app/programs/page.tsx` — нав: Инциденты, Отзывы, Комиссии  

**Итого:** 10 созданных, 8 изменённых = 18 файлов.

---

## 3. Tree (релевантная часть)

```
services/api/
├── prisma/
│   ├── schema.prisma              ← OrganizerVerificationEvidence, Review, Incident, Commission
│   └── migrations/
│       └── 20250316100000_trust_revenue_schema/
│           └── migration.sql
├── src/
│   ├── index.ts                   ← /incidents, /reviews, /commissions
│   └── modules/
│       ├── bookings/
│       │   ├── statusRules.ts      ← getNextStatuses
│       │   └── routes.ts          ← nextStatuses в GET/PATCH
│       ├── organizers/
│       │   └── routes.ts          ← /:id/evidence
│       ├── incidents/
│       │   └── routes.ts
│       ├── reviews/
│       │   └── routes.ts
│       └── commissions/
│           └── routes.ts

apps/admin/src/app/
├── bookings/
│   ├── page.tsx                   ← link to detail + nav
│   └── [id]/page.tsx             ← flow смены статуса
├── incidents/page.tsx
├── reviews/page.tsx
├── commissions/page.tsx
├── organizers/page.tsx            ← nav
└── programs/page.tsx             ← nav

docs/
└── GUEST_CONTACT_NORMALIZATION_PLAN.md
```

---

## 4. Как тестировать

### Миграция

- `cd services/api && npx prisma migrate deploy` (или `migrate dev`). Убедиться, что таблицы organizer_verification_evidence, reviews, incidents, commissions созданы.

### Incidents

- GET /incidents без auth → 401. С admin Bearer → 200. POST /incidents (admin): body organizerId, type, severity, summary → 201. PATCH /incidents/:id/status (admin): incidentStatus → 200. Проверить audit_log: entity_type=incident, changedField incident_created / incident_status_change.

### Reviews

- POST /reviews (admin): bookingId (completed), rating → 201. POST для booking не completed → 400. PATCH /reviews/:id/moderation: moderationStatus approved/rejected → 200. Audit: review_created, review_moderation_change.

### Commissions

- POST /commissions (admin): bookingId, organizerId, programId, gmvRub → 201. PATCH /commissions/:id/reconciliation: reconciliationStatus или commissionCollectedRub → 200. Audit: commission_created, commission_reconciliation_change.

### Organizer evidence

- GET /organizers/:id/evidence (admin) → 200, массив. POST /organizers/:id/evidence (admin): evidenceType, evidenceUrl?, notes? → 201.

### Booking queue flow

- GET /bookings/:id (admin) → в ответе nextStatuses — массив допустимых следующих статусов. Открыть http://localhost:3002/bookings → «Открыть / сменить статус» → на странице заявки выбрать новый статус из select, «Применить» → PATCH уходит, статус обновляется.

---

## 5. Риски

| Риск | Митигация |
|------|-----------|
| Миграция не применена | Выполнить prisma migrate deploy перед запуском API. |
| Review без модерации в публике | Публичный слой отзывов не добавлен; создание только admin, с moderationStatus. |
| Commission только ручное начисление | Нет автоначисления по completed; при необходимости — отдельный шаг. |

---

## 6. Rollback

- **Миграция:** откат 20250316100000_trust_revenue_schema: удалить таблицы commissions, incidents, reviews, organizer_verification_evidence в обратном порядке (FK), либо prisma migrate reset.
- **Код:** revert файлов из §2.

---

## 7. Source of Truth Used

| Решение | Документ |
|---------|----------|
| Incident statuses | canonical_status_models.md (shared-types INCIDENT_STATUSES) |
| Commission reconciliation statuses | canonical_status_models.md (shared-types COMMISSION_RECONCILIATION_STATUSES) |
| Review only after completed booking | db_schema_draft, canonical rule |
| Commission fields | commission_data_contract |
| Organizer verification evidence | db_schema_draft, verification_framework |
| Audit depth | audit_log_spec.md |

---

## 8. Audit proof: пример записи по booking lifecycle

При PATCH /bookings/:id/status в audit_log создаётся запись вида:

| Поле | Значение |
|------|----------|
| entityType | booking |
| entityId | &lt;booking_id&gt; |
| changedField | booking_status_change |
| oldValue | new |
| newValue | reviewed |
| changedBy | &lt;admin user id&gt; |
| reason | status update |
| createdAt | timestamp |

Это даёт прослеживаемость смены статуса бронирования (кто, когда, с какого на какой). Аналогично для incident (incident_status_change), review (review_moderation_change), commission (commission_reconciliation_change).

---

## 9. Подтверждения (отдельно)

| Требование | Подтверждение |
|------------|---------------|
| **Incident entity added** | Модель Incident в schema.prisma; таблица incidents в миграции; API GET/POST/PATCH status; admin очередь /incidents. |
| **Review entity added** | Модель Review в schema.prisma; таблица reviews; создание только при completed booking; API GET/POST/PATCH moderation; admin очередь /reviews. |
| **Commission model auditable** | При создании и при PATCH reconciliation пишется audit_log (entity_type=commission, changedField=commission_created / commission_reconciliation_change). |
| **Public payment absent** | Нет эндпоинтов оплаты, нет приёма платежей в public API. |
| **Revenue UI absent** | Нет user-facing и admin-facing финансового дашборда; страница /commissions — только очередь (список) без сводок GMV/доходов. |
| **Self-serve booking absent** | Бронирование только через assisted intake (POST /bookings с guestContact); самозапись пользователем на сайте не реализована. |

---

*Checkpoint 5 завершён. Trust + revenue foundation: инциденты, отзывы, комиссии, доказательства верификации организаторов; админ-очереди без revenue UI; flow смены статуса заявки и план по guestContact.*
