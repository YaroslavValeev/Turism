# ADR-001: System Boundaries

Статус: accepted  
Дата: 2026-04-17

## 1. Что обнаружено
- Текущая система содержит продуктовые, governance и runtime функции, но boundaries оформлены частично.

## 2. Почему это важно
- Без строгих границ растет риск дублирования логики и конфликтующих потоков принятия решений.

## 3. Какое решение предлагается
- Принять трехслойные границы:
  - `Personal_Helper` = Product Layer.
  - `Agents` = Governance Layer.
  - `Molt` = Runtime Layer.
- Запреты:
  - Molt не становится user product.
  - Agents не становится UI продуктом.
  - Product layer не реализует собственный orchestration engine.

## 4. Какие файлы/модули/папки затрагиваются
- `docs/architecture/SYSTEM_CANON.md`
- `docs/architecture/DOMAIN_MODEL.md`
- `docs/migration/MERGE_PLAN.md`
- `packages/shared-schema/`
- `packages/shared-policy/`

## 5. Что переносим как есть
- Existing product surfaces (`apps/web`, `apps/admin`) и operational API модули.

## 6. Что рефакторим
- Выносим cross-layer контракты в shared packages.

## 7. Что откладываем
- Глубокий runtime рефакторинг legacy сервисов.

## 8. Риски
- Shadow implementations policy/orchestration в старых модулях.

## 9. Критерий готовности
- Любой новый модуль явно маркирован как Product, Governance или Runtime.
