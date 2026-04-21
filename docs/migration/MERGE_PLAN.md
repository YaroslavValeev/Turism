# Repository Merge Plan (GM)

Версия: 1.0  
Дата: 2026-04-17  
Статус: executable migration sequence

## 1. Что обнаружено
- Текущий репозиторий уже содержит operational trust/rating базу.
- Формальные слои Product/Governance/Runtime и shared contracts пока не выделены полностью.

## 2. Почему это важно
- Нужна управляемая миграция без взрывного рефакторинга и без остановки текущего MVP потока.

## 3. Какое решение предлагается
- Использовать phased merge с additive-first стратегией.
- Вводить новые контракты через adapter layer и feature flags.
- Политику включать по схеме `dry-run -> warn-only -> soft-gate -> hard-gate`.

## 4. Какие файлы/модули/папки затрагиваются
- `docs/architecture/*`
- `docs/decisions/*`
- `docs/migration/COMPATIBILITY_MATRIX.md`
- `docs/RATING_POLICY.md`
- `packages/shared-schema/`
- `packages/shared-policy/`
- `services/api/src/modules/{reviews,incidents,analytics,programs}/`

## 5. Что переносим как есть
- Existing booking/review/incident/score snapshot flows.
- Existing admin moderation queues.

## 6. Что рефакторим
- Общие contracts/policy в пакетах.
- Единый read-model каталожного ранжирования.
- Инцидентные freeze правила для публичного рейтинга.

## 7. Что откладываем
- Full rewrite legacy модулей.
- Полный anti-fraud automation в first wave.

## 8. Риски
- Дублирование task/run/rating owners.
- Конфликт старых и новых policy checks.
- Stale score snapshots при новом ranking read-model.

## 9. Критерий готовности
- Документы, ADR, shared contracts приняты.
- Первая волна интеграции активируется без breaking changes.

## Последовательность шагов
1. **Docs + contracts freeze**  
   Зависимости: none  
   Rollback point: revert docs-only PR.
2. **Shared schema draft (`packages/shared-schema`)**  
   Зависимости: step 1  
   Rollback point: stop imports, fallback to local types.
3. **Shared policy draft (`packages/shared-policy`)**  
   Зависимости: step 1  
   Rollback point: disable policy package bindings.
4. **Shared store contract mapping**  
   Зависимости: steps 2-3  
   Rollback point: keep snapshots as read-only truth.
5. **Adapter layer for legacy statuses/entities**  
   Зависимости: step 4  
   Rollback point: feature flag off for adapters.
6. **Governance integration (Agents policy checks)**  
   Зависимости: step 5  
   Rollback point: warn-only mode.
7. **Runtime integration (Molt orchestration hooks)**  
   Зависимости: step 6  
   Rollback point: legacy opsRunner fallback.
8. **Telegram channel unification**  
   Зависимости: steps 6-7  
   Rollback point: current ops/manual approval path.
9. **Cursor executor integration**  
   Зависимости: step 8  
   Rollback point: manual execution path.
10. **Cleanup and deprecation**  
   Зависимости: 2 stable cycles on new pipeline  
   Rollback point: keep compatibility adapters alive.

## Совместимость со старым кодом
- API и Prisma migration подход только additive на этапах 1-7.
- Старые маршруты и очереди работают параллельно до окончательной валидации метрик.
- Любые destructive changes после подтверждения parity.

## Что можно сделать через Cursor Agents автоматически
- Генерация черновиков контрактов в `shared-schema` и `shared-policy`.
- Авто-аудит usage local enums/types против shared contracts.
- Подготовка migration checklists, regression matrix, unit test scaffolds.

## Где нужен ручной контроль владельца
- Утверждение policy diff для critical actions.
- Утверждение весов ranking formula и порогов `m`, `R_global`, recency.
- Утверждение hard-gate включения incident freeze.

## Первые технические изменения без массовой ломки
1. Добавить `docs/RATING_POLICY.md` как policy source-of-truth.
2. Создать `packages/shared-schema` (контракты сущностей и lifecycle).
3. Создать `packages/shared-policy` (approval, routing, rating config).
4. Добавить флаг `RATING_POLICY_MODE=dry-run|warn-only|enforce`.
5. Добавить read-only endpoint `catalog_rank` поверх текущих snapshot данных.
6. Подключить admin warning panel по конфликтам review/incident до hard enforcement.
