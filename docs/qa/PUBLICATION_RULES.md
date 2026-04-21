# Правила публикации программы (MVP)

## Статусы

- Канонический набор: см. `PROGRAM_PUBLISH_STATUSES` в `@mywave/shared-types` и `canonical_status_models.md`.
- Переход в **`published`** разрешён только если проходит **publish gate** (`canPublish` в `services/api/src/modules/programs/publishGate.ts`).

## Обязательные поля (checklist)

- Список правил — массив **`PUBLISH_GATE_RULES`**: для каждого правила есть `missingToken`, `hintTitleRu`, `hintBodyRu`, `tier` (`baseline` | `verified`).
- Слой **`verified`** применяется только если организатор в статусе **`verified`** или **`trusted_by_platform`**.
- Согласованность дат: токен **`duration_days_calendar`** — `durationDays` в БД должен совпадать с расчётом по `startDate`/`endDate`.

## Ответ API при неуспехе

- **`PATCH /programs/:id/publish-status`** с `publishStatus: "published"` при провале gate:
  - HTTP **400**
  - JSON: `error`, массив `missing` (токены), массив **`missingFields`**: `{ field, titleRu }[]` для связки с UI/чеклистом.

## Черновик

- В статусе **`draft`** карточка может быть неполной; gate не требуется до попытки публикации.
