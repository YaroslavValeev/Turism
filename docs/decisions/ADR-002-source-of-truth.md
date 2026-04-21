# ADR-002: Unified Source of Truth

Статус: accepted  
Дата: 2026-04-17

## 1. Что обнаружено
- Сущности trust/rating и execution частично распределены между модулями и документами.

## 2. Почему это важно
- Несколько owners для одной сущности ведут к рассинхрону id, lifecycle и audit trail.

## 3. Какое решение предлагается
- Утвердить единый owner сущностей в `shared-core` и `shared-schema`:
  - `Project`, `Task`, `Run`, `Decision`, `Approval`, `Artifact`, `MemoryEntry`, `ExecutionEvent`.
- `services/api` остается operational API, но опирается на единые контракты и lifecycle модели.
- Любой новый статус/поле в этих сущностях добавляется через ADR или policy change.

## 4. Какие файлы/модули/папки затрагиваются
- `docs/architecture/DOMAIN_MODEL.md`
- `packages/shared-schema/`
- `packages/shared-policy/`
- `services/api/prisma/schema.prisma` (адаптация позднее, additive-first)

## 5. Что переносим как есть
- Текущие booking/review/incident сущности как operational foundation.

## 6. Что рефакторим
- Добавляем mapping слои к новым контрактам без breaking changes.

## 7. Что откладываем
- Полный merge физических таблиц в один релиз.

## 8. Риски
- Dual write в transitional период.

## 9. Критерий готовности
- Для канонических сущностей определен один owner и единый контракт версионирования.
