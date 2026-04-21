# Compatibility Matrix: Personal_Helper / Agents / Molt

Дата: 2026-04-17  
Статус: migration reference

## 1. Что обнаружено
- Сильные куски логики уже есть, но распределены по разным стилям и контрактам.

## 2. Почему это важно
- Без матрицы совместимости merge превращается в неуправляемый перенос модулей.

## 3. Какое решение предлагается
- Принять матрицу ниже как обязательный reference для PR в `trust/rating`.

## 4. Какие файлы/модули/папки затрагиваются
- `docs/architecture/*`
- `docs/decisions/*`
- `docs/migration/MERGE_PLAN.md`
- `packages/shared-schema/*`
- `packages/shared-policy/*`

## 5. Что переносим как есть
- Product shell patterns (user interactions, context handling).
- Governance patterns (pipeline, gates, audit discipline).
- Runtime orchestration patterns (execution sequencing).

## 6. Что рефакторим
- Общие сущности в unified schema.
- Policy/routing/approval в shared policy contracts.

## 7. Что откладываем
- Полная нормализация всех legacy edge-cases в первой волне.

## 8. Риски
- Compatibility drift и скрытые обходы policy.

## 9. Критерий готовности
- Каждый модуль из legacy картирован в `keep/adapt/archive` и имеет owner.

## Матрица переноса
- `Personal_Helper`
  - Keep: UX модель задач/контекста и user-facing interaction.
  - Adapt: desktop-first assumptions и internal prompt-routing.
  - Archive: неканоничные локальные lifecycle, дублирующие shared contracts.
- `Agents`
  - Keep: governance pipeline, roundtable/court, policy gates, audit trail.
  - Adapt: ввод `Run`, `Project`, формализация `Approval` как отдельной сущности.
  - Archive: локальные routing rules вне shared-policy.
- `Molt`
  - Keep: orchestration and integrations runtime model.
  - Adapt: storage ownership и связь с shared-core contracts.
  - Archive: любые user-facing функции, дублирующие product layer.

## Совместимость по ключевым сущностям
- `Task`: unified id contract, owner `shared-core`, adapters required.
- `Run`: вводится как новая canonical сущность, backward adapter required.
- `Decision`: governance-owned contract, direct mapping from existing decision flows.
- `Approval`: выделяется как first-class entity, legacy decision flags map via adapter.
- `MemoryEntry`: unified memory contract, legacy context stores map incrementally.

## Rollback guidance
- Каждый adapter вводится под флагом и может быть отключен независимо.
- Legacy path удаляется только после двух стабильных циклов наблюдения.
