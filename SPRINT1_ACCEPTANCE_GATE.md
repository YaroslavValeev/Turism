# Sprint 1 Acceptance Gate

Шаблон приёмки первого кодового пакета. Заполняет разработчик по факту delivery; проверяет GM/Founder.

**Статус:** Green light for Sprint 1 coding выдан.  
**Scope:** Только P0 foundation + organizers.

---

## 1. Delivery Package Checklist

### 1.1 Что изменено

| Изменение | Описание |
|-----------|----------|
| | |
| | |

### 1.2 Файлы созданы/изменены

**Созданы:**
```
packages/shared-types/src/statuses.ts
packages/shared-types/src/entities.ts
packages/config/src/env.ts
prisma/schema.prisma
prisma/migrations/...
services/api/src/modules/auth/...
services/api/src/modules/organizers/...
services/api/src/middleware/audit.ts
apps/admin/...
.env.example
```

**Изменены:**
```
(список)
```

### 1.3 Tree структуры (актуальная)

```
/
├── apps/
│   ├── web/
│   └── admin/
├── services/
│   └── api/
├── packages/
│   ├── shared-types/
│   └── config/
├── prisma/
│   ├── schema.prisma
│   └── migrations/
├── .env.example
└── ...
```

### 1.4 Diff summary / commit hash

```
(если git: commit hash, краткое описание)
(если нет git: список файлов по модулям)
```

---

## 2. Functional Acceptance

| # | Критерий | Статус | Примечание |
|---|----------|--------|------------|
| 1 | Repo skeleton создан | ☐ | Структура по repo_structure |
| 2 | shared-types экспортирует canonical enums | ☐ | canonical_status_models |
| 3 | Prisma schema: users, organizers, audit_logs | ☐ | db_schema_draft |
| 4 | prisma migrate dev выполняется | ☐ | Rollback note есть |
| 5 | Env/config: APP_ENV, DATABASE_URL, JWT_SECRET, ADMIN_JWT_SECRET | ☐ | .env.example |
| 6 | Audit middleware пишет в audit_logs | ☐ | При мутациях |
| 7 | POST /organizers создаёт запись | ☐ | |
| 8 | PATCH /organizers/:id/verification-status работает | ☐ | Пишет в audit |
| 9 | Admin UI: список организаторов | ☐ | Фильтр по verification_status |
| 10 | Admin login: JWT с ADMIN_JWT_SECRET | ☐ | POST /auth/login |
| 11 | Public user auth отсутствует | ☐ | Не должно быть |
| 12 | Revenue UI отсутствует | ☐ | Не должно быть |

---

## 3. Тестирование

### 3.1 Как тестировать

```
1. pnpm install (или npm)
2. cp .env.example .env && заполнить DATABASE_URL, JWT_SECRET, ADMIN_JWT_SECRET
3. pnpm prisma migrate dev
4. pnpm dev (или старт api + admin)
5. POST /auth/login с admin credentials → JWT
6. POST /organizers с admin JWT → 201
7. PATCH /organizers/:id/verification-status → 200
8. SELECT * FROM audit_logs → запись есть
9. Admin UI: логин → список организаторов
```

### 3.2 Test steps (чеклист)

- [ ] Миграции применяются без ошибок
- [ ] Organizer создаётся через API
- [ ] Verification status меняется
- [ ] Audit log содержит запись
- [ ] Admin показывает список организаторов
- [ ] Admin login работает

---

## 4. Риски

| Риск | Вероятность | Митигация |
|------|-------------|-----------|
| | | |
| | | |

---

## 5. Rollback

```
(команды для отката: prisma migrate reset, revert коммитов, etc.)
```

---

## 6. Source of Truth Used

| Решение | Документ |
|---------|----------|
| Canonical statuses | canonical_status_models.md |
| DB schema | db_schema_draft.csv, db_relationship_notes.md |
| Audit log | audit_log_spec.md |
| Config | config_and_secrets_map.csv |
| Organizers | canonical_entity_model.md |
| Sprint scope | BLUEPRINT_ADDENDUM_V1.md §4 |

---

## 7. Верификация GM/Founder

| Пункт | ✓ / ✗ |
|-------|-------|
| Все 12 functional criteria пройдены | |
| Нет scope creep (public auth, revenue UI) | |
| Схема соответствует канону | |
| Audit работает | |
| Rollback задокументирован | |

**Решение:** ☐ Accepted | ☐ Accepted with corrections | ☐ Rejected

**Подпись / дата:** _______________

---

*После Acceptance — переход к Sprint 2 (programs schema + publish workflow).*
