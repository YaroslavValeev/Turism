# ADR-006: Словарь Stage 4 vs фактические enum в БД

## Контекст

Внешний документ Stage 4 использует названия вроде `submitted`, `moderation`, `unpublished`. В репозитории канон БД и `shared-types` уже зафиксированы в **`PROGRAM_PUBLISH_STATUSES`**, **`BOOKING_STATUSES`**, **`ORGANIZER_VERIFICATION_STATUSES`**.

## Решение

1. **Источник правды по значениям в БД** — без изменения строк enum в PostgreSQL на этом этапе.
2. **Сопоставление (compatibility mapping)** Stage 4 ↔ DB:

| Stage 4 (концепт) | Значение в БД (`Program.publishStatus`) |
|-------------------|----------------------------------------|
| draft | `draft` |
| submitted | `internal_review` |
| moderation | `internal_review` или `needs_fix` (уточняется процессом: «на доработке» = `needs_fix`) |
| approved | `approved` |
| published | `published` |
| unpublished | `paused` или возврат в `approved` (продуктово уточняется; технически используем `paused` / `archived`) |
| archived | `archived` |

3. **Lead**: доменная сущность заявок гостя — **`Booking`**; события вида `lead_*` в analytics при необходимости отражают ранние стадии booking, без отдельной таблицы Lead в MVP.

## Последствия

- Policy engine оперирует **реальными** строками статусов из `shared-types`.
- Документация Stage 4 внешнего вида ссылается на этот ADR для читателей.
