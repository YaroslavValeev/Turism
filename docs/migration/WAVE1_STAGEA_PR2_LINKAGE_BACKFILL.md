# Wave 1 / Stage A / PR2 — Backfill, reconciliation, dedupe report

**Статус:** реализовано в API (dry-run по умолчанию, apply под env-флагом).

---

## 1. Цель PR2

Заполнить `Source.externalChannelId` для **legacy** записей, где FK ещё `null`, но в `metaJson` уже есть ссылка на канал (`channelId` или `channel_id`), с **обязательным dry-run**, **читаемым отчётом** и **записью только под явным guard**.

---

## 2. Файлы и эндпоинты

| Компонент | Путь |
|-----------|------|
| Логика отчёта / классификация | `services/api/src/modules/sources/sourceLinkageBackfill.ts` |
| Unit-тесты | `services/api/src/modules/sources/sourceLinkageBackfill.test.ts` |
| HTTP | `POST /sources/linkage-backfill` и `POST /api/sources/linkage-backfill` (admin JWT) |
| Admin UI | `apps/admin/src/app/sources/page.tsx` — блок «PR2 — linkage backfill»: dry-run / apply с явным `mode`, summary и превью строк |
| Env | `SOURCES_LINKAGE_BACKFILL_WRITE_ENABLED` в `packages/config/src/env.ts` |
| Реестр секретов | `config_and_secrets_map.csv` |
| Пример env | `services/api/.env.example` |

### Тело запроса

Для операций linkage backfill использовать только **явный `mode`**.

Dry-run:

```json
{ "mode": "dry_run" }
```

Apply:

```json
{ "mode": "apply" }
```

С узким scope (опционально):

```json
{
  "mode": "dry_run",
  "organizerId": "optional-cuid-scope"
}
```

- **`mode`:** обязателен в **owner/ops**-сценариях (`dry_run` или `apply`). Пустое тело API допускается **только** для обратной совместимости (ведёт себя как `dry_run`) и **не должно** использоваться в ежедневных прогонах.
- **`organizerId`:** опционально ограничить выборку `Source` с `externalChannelId: null` одним организатором.

### Канон `sourceRegistry.ts` (не дублировать)

- **`sourceRegistry.ts`** — каноническая точка linkage/upsert-логики: `services/api/src/modules/sources/sourceRegistry.ts`.
- **Не дублировать** `upsertSourceByTypeAndHandle` и связанную linkage-логику в других модулях.
- Все будущие хуки (`syncOrganizerContractAutoSources`, organizer routes и т.д.) должны использовать **именно этот** модуль.
- **Единственная точка** для `SOURCE_ORIGIN` / `SOURCE_LIFECYCLE`, нормализации handle/url, `upsertSourceByTypeAndHandle`, `pauseContractAutoSources`.
- Импорты runtime и тестов должны ссылаться **только** на этот модуль; отдельной «теневой» реализации upsert в другом файле в репозитории нет (проверка: поиск по `upsertSourceByTypeAndHandle` / `pauseContractAutoSources`).
- Исторически в одной рабочей копии файл мог отсутствовать при наличии только тестов PR1 — при восстановлении сверяйте содержимое с этим путём и с Prisma-моделью `Source`.

### Рекомендуемый порядок выполнения (owner/ops)

1. Сначала выполнить **dry-run** на staging с телом `{ "mode": "dry_run" }`.
2. Затем при необходимости — **dry-run** в узком scope: `{ "mode": "dry_run", "organizerId": "<id>" }`.
3. Проверить:
   - `summary`;
   - проблемные `rows`;
   - конфликты `organizer_mismatch`;
   - `duplicate_would_link`;
   - `channel_already_linked_elsewhere`.
4. Только после этого включить на API: **`SOURCES_LINKAGE_BACKFILL_WRITE_ENABLED=1`**.
5. Выполнить **apply** сначала на одном организаторе: `{ "mode": "apply", "organizerId": "<id>" }`.
6. Проверить:
   - audit с полем `changedField: external_channel_linkage_backfill`;
   - что FK выставлены ожидаемо;
   - что нет неожиданных side effects.
7. Лишь после точечной проверки — **полный apply** (`{ "mode": "apply" }` без `organizerId`, если среда готова).

### Ответ (кратко)

- `summary`: счётчики по статусам строк (`scanned`, `would_link`, `duplicate_would_link`, `channel_not_found`, `organizer_mismatch`, `channel_already_linked_elsewhere`, `no_meta_channel_id`, `applyable`).
- `rows[]`: по каждому source — `status`, `metaChannelId`, `proposedExternalChannelId`, при необходимости `detail` (например id держателей FK).
- `writeEnabled`: отражает env-флаг.
- При **`mode: apply`** и успешной записи: `appliedCount` — число выполненных `update` (только строки со статусом `would_link` после reconciliation).

---

## 3. Backfill

- Источник данных в meta: **`metaJson.channelId`** или **`metaJson.channel_id`** (строка).
- Выборка: только `externalChannelId IS NULL` (+ опциональный `organizerId`).
- Сопоставление: `OrganizerExternalChannel.id === metaChannelId`.
- **Write:** только `externalChannelId := proposed`; `organizerId` и `metaJson` не трогаем в PR2.

---

## 4. Reconciliation (правила)

| Ситуация | Статус | Действие apply |
|----------|--------|----------------|
| Нет channel id в meta | `no_meta_channel_id` | нет |
| Канал не найден в БД | `channel_not_found` (orphaned meta) | нет; ручная чистка meta или заведение канала |
| У source задан `organizerId` и он ≠ у канала | `organizer_mismatch` | нет; manual review |
| Несколько source с null FK на один и тот же канал | `duplicate_would_link` | нет; слияние/ручной выбор |
| Уже другой `Source` с тем же `externalChannelId` | `channel_already_linked_elsewhere` | нет; ручное слияние |
| Однозначно один кандидат, конфликтов нет | `would_link` | да (только при `apply` + флаг) |

---

## 5. Dedupe / отчёт (acceptance)

- **Совпало и готово к записи:** `summary.would_link` / `applyable`.
- **Ambiguous / дубли:** `summary.duplicate_would_link`.
- **Не удалось связать:** `channel_not_found`, `organizer_mismatch`, `no_meta_channel_id`.
- **Конфликт с уже существующим FK у другой строки:** `channel_already_linked_elsewhere`.

Детализация по строкам — в `rows` и поле `detail` где применимо.

---

## 6. Feature / write guard

- **`SOURCES_LINKAGE_BACKFILL_WRITE_ENABLED`** — по умолчанию `false`.
- Без флага: `mode: apply` → **HTTP 403**, тело `{ "error": "apply_disabled", ... }`.
- **Dry-run** всегда доступен админу (без записи в БД).

### Rollback point

- После PR2: откат — вернуть затронутые `Source.externalChannelId` в `NULL` точечно по audit (`changedField: external_channel_linkage_backfill`) или из бэкапа БД до следующего массового изменения (PR3+).

---

## 7. Команды проверки

```bash
pnpm --filter @mywave/config build
pnpm --filter api exec tsc --noEmit
pnpm --filter api exec vitest run src/modules/sources/sourceLinkageBackfill.test.ts
```

Проверка API вручную (после логина админа): `POST /sources/linkage-backfill` с **`{ "mode": "dry_run" }`** (явный `mode`, без пустого тела в ops).

---

## 8. Acceptance PR2

1. Dry-run отрабатывает без env-флага и без записи.
2. Отчёт структурирован (`summary` + `rows`).
3. `apply` без флага — 403, без side effects.
4. С флагом `SOURCES_LINKAGE_BACKFILL_WRITE_ENABLED=1` и `mode: apply` — обновляются только строки `would_link`; на каждую запись пишется audit.

---

## 9. Следующий шаг (PR3+)

Хуки/policy, массовый UI, автоматический cron backfill — **вне PR2**; при необходимости отдельный флаг окружения и согласование с owner-runbook.
