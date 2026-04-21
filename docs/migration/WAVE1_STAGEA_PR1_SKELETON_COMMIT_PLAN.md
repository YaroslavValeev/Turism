# PR1 Skeleton Commit Plan — Stage A (Sources)

Назначение: практический шаблон для исполнителя PR1 без выхода за scope.

---

## 1) PR title (выбрать один)

1. `feat(sources): harden source-external-channel linkage`
2. `chore(stage-a): schema and linkage hardening for contract-auto sources`

Рекомендация: использовать вариант 1.

---

## 2) PR description template

```md
## Goal
Зафиксировать schema/linkage контракт для Stage A PR1:
Source <-> OrganizerExternalChannel, без изменения policy поведения и без UI.

## In scope
- Prisma schema hardening для linkage
- DDL migration (структурная)
- Минимальный type/service alignment (если нужен для компиляции)
- Документация PR1 чеклиста

## Out of scope (explicitly)
- Backfill/reconciliation/dedupe write (PR2)
- Contract-status enforcement/hooks behavior changes (PR3)
- Любые admin UI изменения (Stage B/C)
- Массовые data writes

## Migration
- [описать migration file и DDL]
- No UPDATE/DELETE bulk statements

## Risks
- Возможная регрессия linkage-типов/nullable contract
- Некорректные индексы для owner-операций

## Rollback
- Откат релиза API до PR1
- DB rollback по стандартному процессу среды (до PR2 write-backfill)

## Validation
- pnpm --filter @mywave/config build
- pnpm --filter api db:generate
- pnpm --filter api exec tsc --noEmit
- pnpm --filter admin exec tsc --noEmit
- pnpm --filter api test

## Reviewer stop rule
Если в diff появились hooks, lifecycle transitions, `/sources` UI, массовые data updates
или новая runtime-policy логика — PR режется обратно до PR1 scope.

## Acceptance criteria
- [ ] Scope = schema/linkage only
- [ ] DDL-only migration, без data-write side effects
- [ ] No policy-enforcement changes
- [ ] No UI changes
- [ ] Typecheck green (api/admin)
- [ ] Tests green
```

---

## 3) Commit order (по шагам)

1. **Schema / Prisma changes**
   - `schema.prisma` linkage/relations/index/comments.
2. **Migration**
   - новый migration.sql (DDL-only).
3. **Minimal service/type alignment**
   - только compile-safe правки в `sourceRegistry`/`autoOnboardingService` при необходимости.
4. **Tests / docs touch**
   - корректировка/добавление минимальных тестов и ссылка в docs.
5. **Final cleanup**
   - удалить шум, проверить diff на scope creep.

---

## 4) Exact command order

Выполнять строго в этом порядке:

1. `pnpm --filter @mywave/config build`
2. `pnpm --filter api db:generate`
3. `pnpm --filter api exec tsc --noEmit`
4. `pnpm --filter admin exec tsc --noEmit`
5. `pnpm --filter api test`
6. (при необходимости локальной проверки миграции) `pnpm --filter api db:migrate`

---

## 5) Pre-merge acceptance checklist

- [ ] Изменения только в PR1 scope (schema/linkage hardening)
- [ ] Нет backfill write-логики
- [ ] Нет UI-изменений
- [ ] Нет включения prod-enforcement
- [ ] Миграция DDL-only и обратима по процессу среды
- [ ] `@mywave/config build` зелёный
- [ ] `api/admin tsc --noEmit` зелёный
- [ ] `api test` зелёный

---

## 6) Reviewer notes (на что смотреть)

1. Не появился ли скрытый policy logic (hooks/enforcement) в PR1.
2. Не “утек” ли scope в PR2/PR3 (backfill/hook behavior/UI).
3. Нет ли в migration.sql скрытых data side effects.
4. Корректны ли FK/индексы/nullable правила linkage.
5. Сохранён ли rollback point “до PR2 write-backfill”.

---

## 7) Быстрый handoff исполнителю

1. Открыть:
   - `WAVE1_STAGEA_PR1_CHECKLIST.md`
   - этот файл (`...PR1_SKELETON_COMMIT_PLAN.md`)
2. Выполнить commit order.
3. Заполнить PR template из раздела 2.
4. Отдать на ревью с обязательным checklist из раздела 5.
