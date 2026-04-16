# Sprint 1 — Checkpoint 3 (programs schema, publish workflow, catalog foundation)

**Дата:** 2025-03-15  
**Scope:** programs schema, publish workflow / publish gate, safety/trust fields in domain model, catalog foundation.

---

## 1. Что изменено

| Изменение | Описание |
|-----------|----------|
| Programs schema | Модели Program и ProgramMedia в Prisma по program_card_schema.md и db_schema_draft.csv. Поля: title, discipline, region, exact_location, start/end date, duration_days, format_type, audience_fit, level_required, risk_level, price_from_rub, inclusions, exclusions, gear_requirements, medical_limitations, itinerary_day_by_day, organizer_name, trust_reason, reviews_summary, cancellation_rules, what_happens_after_booking, cta, publish_status. |
| Program media | Таблица program_media (program_id, media_type, url, caption). Связь Program 1:N ProgramMedia. |
| Publish workflow | PATCH /programs/:id/publish-status с каноническими статусами (draft → internal_review → needs_fix → approved → published | paused | archived). Валидация через @mywave/shared-types. |
| Publish gate | Переход в published разрешён только если: есть organizer_id, заполнены risk_level, medical_limitations, cancellation_rules, есть минимум 1 медиа. Логика в publishGate.ts. |
| Safety/trust в модели | risk_level, medical_limitations, gear_requirements, cancellation_rules в схеме Program. |
| Programs API | GET /programs (public — только published; admin с ?all=1 + Bearer — все, опционально ?publish_status=), GET /programs/:id (public — только если published), POST /programs (admin), PATCH /programs/:id (admin), PATCH /programs/:id/publish-status (admin), POST /programs/:id/media (admin). |
| Audit log depth | В audit.ts зафиксировано: actor = changedBy, entity_type = entityType, entity_id = entityId, action = changedField, timestamp = createdAt, metadata/diff = oldValue, newValue. Запись при создании/обновлении программы и при publish_status_change. |
| Catalog (web) | Главная — список GET /programs (только опубликованные). Страница /program/[id] — карточка программы по GET /programs/:id. |
| Admin programs | Страница /programs: список всех программ с фильтром по publish_status (запрос с ?all=1 + Authorization). |

---

## 2. Какие файлы созданы/изменены

### Созданы (10 файлов)

```
services/api/prisma/migrations/20250315000000_programs_and_media/migration.sql
services/api/src/modules/programs/publishGate.ts
services/api/src/modules/programs/routes.ts
apps/web/src/app/page.tsx
apps/web/src/app/program/[id]/page.tsx
apps/admin/src/app/programs/page.tsx
SPRINT1_CHECKPOINT_3.md
```

(Итого создано в этом checkpoint: 7 уникальных путей; 1 миграция в папке — считаем как 1 файл миграции + 6 остальных = 7 новых файлов. Явный список путей ниже.)

**Полный явный file list:**

**Созданы:**
1. `services/api/prisma/migrations/20250315000000_programs_and_media/migration.sql`
2. `services/api/src/modules/programs/publishGate.ts`
3. `services/api/src/modules/programs/routes.ts`
4. `apps/web/src/app/page.tsx` (переписан под каталог)
5. `apps/web/src/app/program/[id]/page.tsx`
6. `apps/admin/src/app/programs/page.tsx`
7. `SPRINT1_CHECKPOINT_3.md`

**Изменены:**
8. `services/api/prisma/schema.prisma` (Program, ProgramMedia; комментарий audit_log)
9. `services/api/src/lib/audit.ts` (комментарий depth: actor, action, timestamp, metadata/diff)
10. `services/api/src/index.ts` (подключение programsRoutes)
11. `apps/admin/src/app/page.tsx` (комментарий)
12. `apps/admin/src/app/organizers/page.tsx` (ссылка на /programs)

**Итого:** 7 созданных, 5 изменённых = 12 файлов.

---

## 3. Tree (релевантная часть)

```
Toutism/
├── apps/
│   ├── admin/src/app/
│   │   ├── login/page.tsx
│   │   ├── organizers/page.tsx
│   │   ├── programs/page.tsx    ← NEW: список программ, фильтр publish_status
│   │   └── page.tsx
│   └── web/src/app/
│       ├── page.tsx             ← CHANGED: каталог (GET /programs)
│       ├── program/[id]/page.tsx ← NEW: карточка программы
│       └── layout.tsx
├── services/api/
│   ├── prisma/
│   │   ├── schema.prisma        ← Program, ProgramMedia
│   │   └── migrations/
│   │       ├── 20250314000000_init_sprint1/
│   │       ├── 20250314100000_add_user_password_hash/
│   │       └── 20250315000000_programs_and_media/  ← NEW
│   └── src/
│       ├── index.ts             ← programsRoutes
│       ├── lib/audit.ts         ← depth comment
│       └── modules/
│           ├── auth/
│           ├── organizers/
│           └── programs/        ← NEW
│               ├── publishGate.ts
│               └── routes.ts
└── packages/shared-types/       ← статусы без дублирования (ProgramPublishStatus)
```

---

## 4. Как тестировать

1. **Миграции**
   ```bash
   pnpm db:migrate
   ```

2. **API**
   ```bash
   pnpm dev:api
   ```
   - GET http://localhost:3001/programs → только published (пусто, если нет).
   - POST http://localhost:3001/programs с Bearer token, body: organizerId, title, discipline, region, startDate, endDate, durationDays (и при необходимости risk_level, medical_limitations, cancellation_rules) → 201.
   - POST http://localhost:3001/programs/:id/media с Bearer, body: mediaType, url → 201.
   - PATCH http://localhost:3001/programs/:id/publish-status с Bearer, body: publishStatus: "published" → 200 если gate пройден; 400 с missing[] если нет.

3. **Publish gate**
   - Создать программу без risk_level/cancellation_rules/медиа → PATCH publish-status на published → 400, в ответе missing.
   - Добавить risk_level, medical_limitations, cancellation_rules и минимум 1 медиа → PATCH publish-status на published → 200.

4. **Каталог (web)**
   ```bash
   pnpm --filter web dev
   ```
   - http://localhost:3000 — список опубликованных программ.
   - http://localhost:3000/program/:id — карточка (только для published).

5. **Admin**
   - http://localhost:3002/programs с логином — список всех программ, фильтр по publish_status.

---

## 5. Риски

| Риск | Митигация |
|------|-----------|
| Нет UI создания программы в admin | Создание через API (curl/Postman); при необходимости добавить форму в следующем цикле. |
| medical_limitations обязателен для publish | В gate допускается пустая строка (явное «N/A»). |

---

## 6. Rollback

- **Миграция:** откат 20250315000000: удалить таблицы program_media и programs (в обратном порядке), либо `prisma migrate reset` (полный сброс).
- **Код:** revert перечисленных созданных/изменённых файлов (§2).

---

## 7. Source of Truth Used

| Решение | Документ |
|---------|----------|
| Поля программы | program_card_schema.md |
| Required for publish | program_card_schema.md (safety, organizer, cancellation, media) |
| Publish statuses | canonical_status_models.md (через shared-types) |
| Таблицы | db_schema_draft.csv |
| API | endpoint_contracts.md, api_map.csv |
| Audit depth | audit_log_spec.md; явно: actor, entity_type, entity_id, action, timestamp, metadata/diff |

---

## 8. Audit log depth (явно)

В каждой записи audit_log присутствуют:

| Поле в коде | Роль в отчёте |
|-------------|----------------|
| changedBy | **actor** |
| entityType | **entity type** |
| entityId | **entity id** |
| changedField | **action** (например verification_status_change, publish_status_change, created) |
| createdAt | **timestamp** |
| oldValue, newValue | **metadata/diff** |

Дублирования статусов вне `packages/shared-types` нет; publish_status и остальные статусы импортируются из shared-types.

---

*Checkpoint 3 завершён. Готов к приёмке.*
