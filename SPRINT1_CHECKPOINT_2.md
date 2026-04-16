# Sprint 1 — Checkpoint 2 (env/config, audit, organizers CRUD, admin queue, admin auth)

**Дата:** 2025-03-14  
**Scope:** env/config foundation, audit log foundation, organizers CRUD, admin organizers queue, admin/internal auth only.

---

## 1. Что изменено

| Изменение | Описание |
|-----------|----------|
| Env/config foundation | API при старте вызывает `loadEnv()` из `@mywave/config`; обязательные APP_ENV, DATABASE_URL, JWT_SECRET, ADMIN_JWT_SECRET. |
| Audit log foundation | `writeAuditLog()` в `src/lib/audit.ts`; вызовы при создании организатора, PATCH организатора, PATCH verification-status. |
| Organizers CRUD | GET /organizers (public), GET /organizers/:id (public), POST /organizers (admin), PATCH /organizers/:id (admin), PATCH /organizers/:id/verification-status (admin). Валидация статусов через `@mywave/shared-types`. |
| Admin organizers queue | Страница /organizers в admin: список организаторов, фильтр по verification_status (select из ORGANIZER_VERIFICATION_STATUSES). |
| Admin/internal auth only | POST /auth/login (email + password), JWT с ADMIN_JWT_SECRET, роль admin. Middleware requireAdmin на POST/PATCH organizers. Seed: admin@mywave.local / admin123. |
| User model | Поле passwordHash добавлено; User используется только как admin/internal actor (логин в админку). |
| Миграция | 20250314100000_add_user_password_hash — добавление passwordHash в User. |

---

## 2. Какие файлы созданы/изменены

### Созданы (9 файлов)

```
services/api/src/lib/prisma.ts
services/api/src/lib/audit.ts
services/api/src/middleware/auth.ts
services/api/src/modules/auth/routes.ts
services/api/src/modules/organizers/routes.ts
services/api/prisma/migrations/20250314100000_add_user_password_hash/migration.sql
services/api/prisma/seed.ts
apps/admin/src/app/login/page.tsx
apps/admin/src/app/organizers/page.tsx
```

### Изменены (7 файлов)

```
services/api/package.json          (cors, jsonwebtoken, @types, prisma.seed, db:seed)
services/api/prisma/schema.prisma  (User.passwordHash, seed comment)
services/api/src/index.ts          (loadEnv, authRoutes, organizersRoutes)
apps/admin/src/app/page.tsx        (redirect to /organizers or /login)
package.json                       (dev:api: build shared-types + config before api)
SPRINT1_CHECKPOINT_2.md            (этот файл)
```

**Явный file list:** всего 15 файлов (9 созданы, 6 изменены).

---

## 3. Tree (релевантная часть)

```
Toutism/
├── package.json
├── pnpm-workspace.yaml
├── .env.example
├── apps/
│   ├── admin/
│   │   ├── src/app/
│   │   │   ├── layout.tsx
│   │   │   ├── page.tsx              → redirect /organizers | /login
│   │   │   ├── login/page.tsx        → admin login (no public register)
│   │   │   └── organizers/page.tsx   → organizers queue + filter
│   │   ├── package.json
│   │   └── ...
│   └── web/
│       └── src/app/
│           ├── page.tsx              → placeholder (no booking, no revenue UI)
│           └── layout.tsx
├── services/
│   └── api/
│       ├── prisma/
│       │   ├── schema.prisma
│       │   ├── seed.ts               → admin user for local
│       │   └── migrations/
│       │       ├── 20250314000000_init_sprint1/
│       │       └── 20250314100000_add_user_password_hash/
│       └── src/
│           ├── index.ts              → loadEnv, /auth, /organizers
│           ├── lib/prisma.ts
│           ├── lib/audit.ts
│           ├── middleware/auth.ts    → requireAdmin (JWT)
│           └── modules/
│               ├── auth/routes.ts    → POST /auth/login only
│               └── organizers/routes.ts
└── packages/
    ├── shared-types/                → единственный источник статусов
    └── config/
```

**Подтверждение по tree:**
- Нет маршрутов public auth: нет `/auth/register`, нет страницы регистрации пользователей. Есть только `POST /auth/login` для admin.
- Нет revenue UI: в `apps/web` и `apps/admin` нет страниц/роутов комиссий, платежей, GMV. Нет `/commissions`, нет финансовых экранов.
- User используется только для admin login (seed создаёт пользователя с role=admin; проверка в auth/routes и requireAdmin).

---

## 4. Как тестировать

1. **Сборка пакетов**
   ```bash
   pnpm install
   pnpm --filter @mywave/shared-types build
   pnpm --filter @mywave/config build
   ```

2. **Env**
   ```bash
   cp .env.example .env
   # Заполнить: APP_ENV=local, DATABASE_URL, JWT_SECRET, ADMIN_JWT_SECRET
   ```

3. **Миграции и seed**
   ```bash
   pnpm db:migrate
   pnpm --filter api db:seed
   ```

4. **API**
   ```bash
   pnpm dev:api
   ```
   - `curl http://localhost:3001/health` → `{"status":"ok"}`
   - `curl -X POST http://localhost:3001/auth/login -H "Content-Type: application/json" -d "{\"email\":\"admin@mywave.local\",\"password\":\"admin123\"}"` → `{"token":"...","userId":"..."}`

5. **Organizers CRUD**
   - Без токена: `curl http://localhost:3001/organizers` → 200, список (пустой или данные).
   - С токеном: сохранить token из шага 4, затем:
     - `curl -X POST http://localhost:3001/organizers -H "Authorization: Bearer <token>" -H "Content-Type: application/json" -d "{\"displayName\":\"Test Org\",\"contactEmail\":\"org@test.local\"}"` → 201.
     - `curl -X PATCH http://localhost:3001/organizers/<id>/verification-status -H "Authorization: Bearer <token>" -H "Content-Type: application/json" -d "{\"verificationStatus\":\"checked\"}"` → 200.

6. **Audit log**
   - После создания или смены verification-status: `SELECT * FROM audit_logs;` (через prisma studio или psql) — должны быть записи с entity_type=organizer.

7. **Admin UI**
   - `pnpm dev:admin` → http://localhost:3002
   - Редирект на /login → ввести admin@mywave.local / admin123 → редирект на /organizers.
   - Страница организаторов: таблица, фильтр по verification status. Если создали организатора через API — он отображается.

---

## 5. Риски

| Риск | Митигация |
|------|-----------|
| Пароль в seed только SHA-256 | Для production заменить на bcrypt и не хранить дефолтный пароль в коде. |
| Токен в localStorage | Стандартно для admin SPA; для production рассмотреть httpOnly cookie. |
| CORS | Включён `cors({ origin: true })` для запросов с admin (localhost:3002). |

---

## 6. Rollback

- **Миграции:** в `services/api`: `pnpm prisma migrate reset` (полный сброс БД) или откатить миграцию 20250314100000 вручную: `ALTER TABLE "User" DROP COLUMN IF EXISTS "passwordHash";`
- **Код:** revert перечисленных созданных/изменённых файлов (§2).

---

## 7. Source of Truth Used

| Решение | Документ |
|---------|----------|
| Env vars | config_and_secrets_map.csv |
| Audit log fields | audit_log_spec.md |
| Organizer verification statuses | canonical_status_models.md (через @mywave/shared-types) |
| Organizers API | endpoint_contracts.md, api_map.csv |
| Admin auth only | BLUEPRINT_ADDENDUM_V1 §3, §4 |
| User = admin/internal | DERIVED_PRD, handoff_to_dev_team |

---

## 8. Подтверждения (отдельно)

| Требование | Подтверждение |
|------------|---------------|
| **Admin auth only** | Реализован только POST /auth/login. JWT подписывается ADMIN_JWT_SECRET. Роль в payload — admin. Регистрации пользователей нет. |
| **Public auth absent** | Нет POST /auth/register. Нет страницы регистрации в web или admin. Нет эндпоинтов для создания пользовательских аккаунтов. |
| **Revenue UI absent** | Нет маршрутов /commissions, нет страниц GMV/комиссий в apps/web и apps/admin. Нет финансовых компонентов. |
| **Audit log writes enabled** | writeAuditLog вызывается при: создании организатора (POST /organizers), обновлении организатора (PATCH /organizers/:id), смене verification-status (PATCH /organizers/:id/verification-status). |
| **Organizers CRUD working** | GET /organizers (list + query verification_status), GET /organizers/:id, POST /organizers (admin), PATCH /organizers/:id (admin), PATCH /organizers/:id/verification-status (admin). Валидация статусов через shared-types. |

---

*Checkpoint 2 завершён. Готов к приёмке по SPRINT1_ACCEPTANCE_GATE.md.*
