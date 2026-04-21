# ADR-003: Single Orchestrator

Статус: accepted  
Дата: 2026-04-17

## 1. Что обнаружено
- В текущей системе orchestration размазан между runtime jobs, API handlers и ручными ops-процессами.

## 2. Почему это важно
- Два независимых оркестратора создают гонки статусов, неполный аудит и policy bypass.

## 3. Какое решение предлагается
- Принять один orchestration owner: `Molt`.
- `Agents` предоставляет governance decisions, routing и approval gates.
- `Personal_Helper` не исполняет задачи напрямую, а отправляет intent в orchestration pipeline.
- Все critical actions проходят через `Approval` контракт и policy checks.

## 4. Какие файлы/модули/папки затрагиваются
- `docs/architecture/SYSTEM_CANON.md`
- `docs/architecture/DOMAIN_MODEL.md`
- `packages/shared-policy/`
- `services/api/src/modules/analytics/opsRunner.ts` (future integration bridge)

## 5. Что переносим как есть
- Existing ops runner и jobs как временный execution path.

## 6. Что рефакторим
- Вводим execution registry (`Run`, `ExecutionEvent`) и orchestration adapters.

## 7. Что откладываем
- Полное отключение legacy runners до стабилизации новых контрактов.

## 8. Риски
- Runtime drift между legacy opsRunner и новым orchestrator path.

## 9. Критерий готовности
- Для каждого запуска задачи существует `Run` запись и auditable цепочка событий.
