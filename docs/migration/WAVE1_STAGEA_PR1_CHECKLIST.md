# Wave 1 / Stage A / PR1 — Checklist (Schema + Linkage Hardening)

Статус: ready-to-execute.  
Принцип PR1: **маленький, обратимый, без policy-enforcement и без UI**.

---

## 1) Scope PR1 (что входит)

Только:

1. Prisma schema / linkage hardening.
2. Структурная миграция (DDL), без массового data-write.
3. Минимальные обновления helper-кода, если требуются для компиляции/контракта linkage.

Не входит:

- backfill/reconciliation/dedupe (это PR2),
- hooks/policy enforcement (это PR3),
- любые UI-изменения (Stage B/C).

---

## 2) Файлы PR1 (конкретно)

## Обязательные

1. `services/api/prisma/schema.prisma`
   - Проверить/зафиксировать linkage-поля:
     - `Source.externalChannelId` (nullable),
     - relation `Source -> OrganizerExternalChannel`,
     - relation `OrganizerExternalChannel -> Source[]`.
   - Проверить индексы под owner-операции:
     - `@@index([externalChannelId])`,
     - существующие `sourceOrigin/isActive`, `organizerId/sourceOrigin`.
   - Проверить комментарии канона (ADR-009) рядом с lifecycle/linkage.

2. `services/api/prisma/migrations/<timestamp>_stagea_pr1_linkage_hardening/migration.sql`
   - Только DDL:
     - add/adjust index,
     - add/adjust FK (если нужно),
     - **без UPDATE/DELETE массовых данных**.

3. `services/api/src/modules/sources/sourceRegistry.ts`
   - Убедиться, что `UpsertSourceInput` имеет `externalChannelId?: string | null`.
   - В create/update path linkage пишется предсказуемо.
   - Никакого policy-поведения в PR1.

## Опционально (только если нужно для целостности компиляции)

4. `services/api/src/modules/sources/autoOnboardingService.ts`
   - Только техническая правка linkage-передачи (без изменения бизнес-правил).

5. `docs/architecture/SOURCES_PARSING_OWNER_OPS_WAVE.md`
   - Короткая отметка, что PR1 = schema/linkage hardening completed.

---

## 3) Конкретные изменения (что добавить/изменить/не трогать)

## Добавить/изменить

- Явный и проверяемый schema-контракт связи канала с source.
- Индекс(ы) для linkage-запросов.
- DDL-миграцию без data backfill.
- Минимальный compile-safe update helper’ов linkage.

## Не трогать

- `organizers/routes.ts` hooks и contract transitions.
- `/sources` UI, admin страницы, e2e.
- policy pause enforcement / feature rollout.
- backfill scripts и dedupe write logic.

---

## 4) Команды исполнения PR1

Выполнять в таком порядке:

1. Генерация/проверка Prisma после изменений schema:
   - `pnpm --filter api db:generate`
2. Build-дисциплина для shared env/types:
   - `pnpm --filter @mywave/config build`
3. Typecheck backend:
   - `pnpm --filter api exec tsc --noEmit`
4. Typecheck admin (регрессионный baseline):
   - `pnpm --filter admin exec tsc --noEmit`
5. Базовый тест-проход (быстрый smoke unit):
   - `pnpm --filter api test`

Если миграция новая и нужна локальная проверка DDL:

- `pnpm --filter api db:migrate` (локальная dev-база)  
  или эквивалентный локальный прогон миграции в изолированной среде.

---

## 5) Проверки перед merge (PR1 gate)

1. Prisma schema валидна, `db:generate` проходит.
2. DDL-миграция применима и обратима стандартным rollback-процессом.
3. `api/admin` typecheck зелёный.
4. Нет изменений Stage B/C (UI, массовые ops действия, policy enforcement).
5. Нет массовых data side effects в migration.sql.
6. Нет автовключения поведения в production.

---

## 6) Rollback point PR1

Точка отката: **после merge PR1 и до запуска PR2 write-backfill**.

Варианты:

1. Откат релиза API к предыдущему тэгу/коммиту.
2. Если миграция не несёт data writes — откат структуры по стандартному DB rollback плану среды.
3. Feature guards остаются в safe-default (ничего нового не включено принудительно).

---

## 7) Done criteria для PR1 (строго)

PR1 считается завершённым, если:

1. Schema/linkage контракт зафиксирован и проходит `db:generate`.
2. FK/индексы присутствуют в миграции и применяются без ошибок.
3. Компиляция `api/admin` зелёная.
4. Нет policy enforcement, нет UI-изменений, нет backfill write логики.
5. PR маленький и изолированный: только “опора”, без изменения поведения прод-контура.

---

## 8) Быстрый self-check перед открытием PR

- [ ] Изменены только файлы PR1 scope.  
- [ ] В migration.sql нет UPDATE/DELETE bulk statements.  
- [ ] Все команды из раздела "Команды исполнения PR1" отработали успешно.  
- [ ] В описании PR явно указано: “No policy-enforcement, no UI, no backfill writes”.  

Операционная карточка PR (title/template/commit order): [`WAVE1_STAGEA_PR1_SKELETON_COMMIT_PLAN.md`](./WAVE1_STAGEA_PR1_SKELETON_COMMIT_PLAN.md).
