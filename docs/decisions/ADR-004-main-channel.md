# ADR-004: Main MVP Channel

Статус: accepted  
Дата: 2026-04-17

## 1. Что обнаружено
- Каналы управления и исполнения разнородны, при этом Telegram и Cursor уже используются как реальные операционные поверхности.

## 2. Почему это важно
- Для MVP требуется один главный поток команд и approve, иначе governance становится непрозрачным.

## 3. Какое решение предлагается
- MVP channel strategy:
  - `Telegram` = command, notification, approval.
  - `Cursor` = executor for code/content/docs/tasks.
- Desktop/web интерфейсы остаются вторичными для MVP управления.
- Любые critical approvals фиксируются с channel метаданными в audit trail.

## 4. Какие файлы/модули/папки затрагиваются
- `docs/migration/MERGE_PLAN.md`
- `docs/RATING_POLICY.md`
- `packages/shared-policy/`

## 5. Что переносим как есть
- Текущие admin/UI поверхности как наблюдение и ручные fallback процессы.

## 6. Что рефакторим
- Явный channel contract и approval routing.

## 7. Что откладываем
- Полнофункциональный desktop-first control center.

## 8. Риски
- Divergence между Telegram approvals и ручными действиями в admin UI.

## 9. Критерий готовности
- Для каждого approval события есть зафиксированный channel и policy rule.
