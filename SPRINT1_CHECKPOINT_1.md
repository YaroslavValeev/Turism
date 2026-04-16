# Sprint 1 — Checkpoint 1 (repo skeleton, shared types, DB schema)

**Дата:** 2025-03-14  
**Scope:** repo skeleton, shared canonical enums/types, DB schema.

---

## 1. Что изменено

| Изменение | Описание |
|-----------|----------|
| Repo skeleton | Добавлен pnpm workspace: apps/web, apps/admin, services/api, packages/shared-types, packages/config. Корневой package.json, pnpm-workspace.yaml, .gitignore, .env.example. |
| Shared types | Пакет `@mywave/shared-types`: все канонические статусы из canonical_status_models (Booking, OrganizerVerification, ProgramPublish, Incident, CommissionReconciliation) + type guards. |
| DB schema | Prisma schema в services/api/prisma: модели User, Organizer, AuditLog. Миграция 20250314000000_init_sprint1. |
| Config | Пакет `@mywave/config`: loadEnv() по config_and_secrets_map (APP_ENV, DATABASE_URL, JWT_SECRET, ADMIN_JWT_SECRET). |
| Apps | Next.js 14 (App Router) для web и admin — минимальные layout + page. |
| API | Express-сервер в services/api, health endpoint; Prisma в api. |

---

## 2. Какие файлы созданы/изменены

### Созданы

```
package.json
pnpm-workspace.yaml
.gitignore
.env.example

packages/shared-types/package.json
packages/shared-types/tsconfig.json
packages/shared-types/src/statuses.ts
packages/shared-types/src/index.ts

packages/config/package.json
packages/config/tsconfig.json
packages/config/src/env.ts
packages/config/src/index.ts

services/api/package.json
services/api/tsconfig.json
services/api/prisma/schema.prisma
services/api/prisma/migrations/20250314000000_init_sprint1/migration.sql
services/api/src/index.ts

apps/web/package.json
apps/web/tsconfig.json
apps/web/next.config.js
apps/web/src/app/layout.tsx
apps/web/src/app/page.tsx

apps/admin/package.json
apps/admin/tsconfig.json
apps/admin/next.config.js
apps/admin/src/app/layout.tsx
apps/admin/src/app/page.tsx

SPRINT1_CHECKPOINT_1.md
```

### Изменены

- Нет (новый код в существующем репозитории документов).

---

## 3. Как тестировать

1. **Установка**
   ```bash
   cd "e:\Проекты MyWave\NEW2026\Toutism"
   pnpm install
   ```

2. **Env**
   ```bash
   cp .env.example .env
   # Заполнить DATABASE_URL (PostgreSQL), JWT_SECRET, ADMIN_JWT_SECRET, APP_ENV=local
   ```

3. **Миграции**
   ```bash
   pnpm db:migrate
   ```
   Ожидание: миграция применяется без ошибок (или сообщение, что БД уже в актуальном состоянии).

4. **Shared types**
   ```bash
   pnpm --filter @mywave/shared-types build
   ```
   Ожидание: `dist/` с index.js и statuses.js.

5. **API**
   ```bash
   pnpm dev:api
   ```
   В другом терминале: `curl http://localhost:3001/health` → `{"status":"ok"}`.

6. **Admin**
   ```bash
   pnpm dev:admin
   ```
   Открыть http://localhost:3002 — заголовок «MyWave Admin».

7. **Web**
   ```bash
   pnpm --filter web dev
   ```
   Открыть http://localhost:3000 — заголовок «MyWave Travel».

---

## 4. Риски

| Риск | Вероятность | Митигация |
|------|-------------|-----------|
| Нет установленного PostgreSQL | Средняя | DATABASE_URL на локальную БД или Docker; при отсутствии — миграции не запускать, остальное проверить без DB. |
| pnpm не установлен | Низкая | Установить: `npm install -g pnpm` или использовать npm workspaces (потребуется правка скриптов). |
| Разные версии Node | Низкая | В package.json указано engines.node >= 18. |

---

## 5. Rollback

- **Откат миграций:** в каталоге `services/api` выполнить:
  ```bash
  pnpm prisma migrate reset
  ```
  (полная пересоздача БД по миграциям; данные теряются.)

- **Откат кода:** удалить добавленные файлы и каталоги (см. список в §2). Репозиторий без git — откат только вручную по списку созданных файлов.

- **Rollback note по migration_strategy:** миграция additive (только CREATE TABLE); откат — DROP TABLE в обратном порядке: audit_logs, organizers, User.

---

## 6. Source of Truth Used

| Решение | Документ |
|---------|----------|
| Canonical statuses | canonical_status_models.md |
| Commission reconciliation statuses | commission_data_contract.md |
| DB tables/columns | db_schema_draft.csv |
| Audit log fields | audit_log_spec.md |
| Env vars | config_and_secrets_map.csv |
| Repo structure | repo_structure.md, file_tree_template.txt |
| Stack (Next.js, Prisma, Node) | BLUEPRINT_ADDENDUM_V1.md §3, DERIVED_TECHNICAL_SPEC.md |

---

*Checkpoint 1 завершён. Следующий шаг: env/config, audit log foundation, organizers CRUD, admin organizers queue, admin/internal auth.*
