# First Technical Changes (No Mass Breakage)

Дата: 2026-04-17  
Режим: feature-flag + warn-only

## 1. Что обнаружено
- Базовые trust/rating цепочки уже работают и не должны ломаться.

## 2. Почему это важно
- Первый пакет изменений должен добавлять управляемость без остановки текущей системы.

## 3. Какое решение предлагается
- Внедрять изменения только additive-first и с rollback для каждого шага.

## 4. Какие файлы/модули/папки затрагиваются
- `docs/RATING_POLICY.md`
- `packages/shared-schema/*`
- `packages/shared-policy/*`
- `services/api/src/modules/analytics/scoreEngine.ts`
- `services/api/src/modules/programs/routes.ts`
- `apps/admin/src/app/reviews/page.tsx`
- `apps/admin/src/app/incidents/page.tsx`

## 5. Что переносим как есть
- Existing review/incidents moderation flow.
- Existing score snapshots.

## 6. Что рефакторим
1. Добавить policy mode: `dry-run -> warn-only -> enforce`.
2. Ввести `catalog_rank` read-model как отдельный endpoint.
3. Подключить advisory warnings в админке по freeze conflicts.
4. Централизовать параметры `m`, `rGlobal`, recency weights в `shared-policy`.

## 7. Что откладываем
- Hard enforcement до прохождения периода наблюдения.
- Advanced fraud detection как blocking gate.

## 8. Риски
- Неполное покрытие edge-cases в adapter layer.

## 9. Критерий готовности
- Все четыре шага задеплоены в dry-run/warn-only без breaking behavior.
