# Sources owner runbook (contract-driven ingestion)

Операционный runbook для owner/admin: как работает связка **договорный организатор → auto onboarding источников → ingestion run → результат в raw/candidates**.

---

## 1. Базовая модель

- Договорный триггер: `OrganizerContract.status = signed`.
- Внешние каналы организатора хранятся отдельно: `OrganizerExternalChannel`.
- Реестр для парсинга: `Source` (с `sourceOrigin`, `lifecycleState`, schedule/error полями).
- Импорт XLSX/CSV/JSON: `SourceImportSession` + `SourceImportRow`.

Важно: внутренние сущности (`Program`, `Booking`) не заменяют внешние source-каналы.

---

## 2. Жизненный цикл источников

Статусы `lifecycleState`:

- `active` — обычный активный источник.
- `inactive` — вручную выключен owner/admin.
- `paused_by_policy` — выключен политикой (например, потеря contract-signed).
- `manual_override` — ручное исключение из policy-автоматик.

`sourceOrigin`:

- `manual`
- `organizer_contract_auto`
- `batch_import`
- `legacy`

---

## 3. Контрактный auto-onboarding

При переходе `OrganizerContract` в `signed`:

1. Берутся `OrganizerExternalChannel` (и `telegramChatId` организатора как fallback канал).
2. Выполняется upsert в `Source` с дедупом по `type + urlOrHandle`.
3. `sourceOrigin` проставляется как `organizer_contract_auto`, `autoPublish=false` по умолчанию.
4. Для строк из реальных каналов в `Source` заполняется **`externalChannelId`** (FK на `OrganizerExternalChannel`); synthetic Telegram из `telegramChatId` — без FK.

**Ручная пересборка (admin / API):** `POST /sources/contract-auto-sync` с телом `{ "organizerId": "<id>" }` — то же, что авто-onboarding, без ожидания события контракта. В админке: страница **Источники** → блок «Договорные источники». При смене **`telegramChatId`** организатора (`PATCH /organizers/:id`) синк вызывается автоматически.

Если contract больше не `signed`:

- источники не удаляются;
- переводятся в `paused_by_policy` и `isActive=false` (кроме `manual_override`).

---

## 4. Owner UI: ежедневные действия

Экран: `/sources`.

### 4.1 Смотреть и фильтровать

Фильтры:

- `type`
- `isActive`
- `sourceOrigin`
- `organizerId`
- `parserProfile`
- `needs_attention` (ошибки/policy pause)
- `lifecycleState` (ADR-009: active, inactive, paused_by_policy, manual_override, archived)

В таблице важные поля:

- name, organizer, type, urlOrHandle
- parserProfile, fetchIntervalMinutes
- sourceOrigin, lifecycleState
- `lastCheckedAt`, `nextScheduledAt`, `lastSuccessAt`, `lastErrorAt`, `lastErrorSnippet`
- `createdAt`

### 4.2 Ручное управление

- `Создать источник`
- `Сохранить`
- `Deactivate`
- `Delete` (только для явных ошибочных/тестовых записей)
- `Прогнать источник`

**Rate limits (ручной прогон, защита API):**

- `POST /sources/:id/run` — минимальный интервал между запусками **одного и того же источника** одним админом: `INGESTION_MANUAL_RUN_MIN_INTERVAL_MS` (по умолчанию 30 с). Ответ **429** с текстом «Повтор через N с».
- `POST /sources/run` (массовый: all / by_type / by_import_session) — интервал между массовыми запусками **одного админа**: `INGESTION_MANUAL_BULK_MIN_INTERVAL_MS` (по умолчанию 90 с), **429** при слишком частых вызовах.
- При `mode=all`, если активных источников больше `INGESTION_MANUAL_BULK_MAX_SOURCES` (по умолчанию 40) — **400** `too_many_active_sources_for_manual_run` (сузить выборку или поднять лимит в env).
- Реализация — in-memory в процессе API; при горизонтальном масштабе лимиты не общие между инстансами (при необходимости — Redis).

### 4.3 Batch import

- `Import sources` (xlsx path + dry-run).
- Отчёт в `SourceImportSession`:
  - created
  - updated
  - skipped
  - duplicates
  - errors

### 4.4 Принудительный run

- `Run all active sources`
- `Run by type`
- `Run imported batch` (по `importSessionId`)

---

## 5. XLSX mapping (mywave_v5_real_only.xlsx)

Файл: `c:/Users/X230/Downloads/mywave_v5_real_only.xlsx`

Импортируемые листы:

- `PROJECTS_DB`
- `TG_VK_SOURCES`
- `TOP_30_PRIORITY`
- `KIDS_FAMILY`
- `PREMIUM_EXPEDITIONS`

Политика:

- URL/handle нормализуются (`t.me`, `@handle`, instagram/vk/site).
- Дедуп: `type + urlOrHandle`.
- Новые источники пишутся в `Source`, enrichment уходит в `metaJson`.
- `autoPublish` по умолчанию `false`.

### Поля в `Source`

- `type`, `name`, `urlOrHandle`
- `parserProfile`, `fetchIntervalMinutes`, `isActive`
- `sourceOrigin = batch_import`
- `lifecycleState = active`
- `discipline`, `country`, `region` (если есть)

### Поля в `metaJson`

- `source_sheet`, `source_row`, `source_column`
- `project_name`, `cluster`, `subtype`
- `kids_flag`, `family_flag`, `premium_flag`
- `focus`, `signal`, `why_useful`
- `evidence_url`, `evidence_note`

---

## 6. API/CLI (операторские команды)

- API:
  - `GET /sources` (+ фильтры)
  - `POST /sources`, `PATCH /sources/:id`
  - `POST /sources/:id/deactivate`, `DELETE /sources/:id`
  - `POST /sources/:id/run`
  - `POST /sources/run` (`all|by_type|by_import_session`)
  - `POST /sources/import/xlsx`
  - `GET /sources/import/sessions`
- CLI:
  - `pnpm --filter api db:import-sources-xlsx -- <xlsx-path> --dry-run`
  - `pnpm --filter api db:import-sources-xlsx -- <xlsx-path>`

---

## 7. Фактический импорт текущей партии

По `mywave_v5_real_only.xlsx`:

- Dry-run: `sessionId = cmo7b5vfb0000wpy93nm18x0w`
- Write-run: `sessionId = cmo7b5v4d00003p0cgvvn0img`
- Итог write-run:
  - created: `110`
  - updated: `0`
  - duplicates: `307`
  - errors: `0`
  - totalCandidates: `417`
  - uniqueCandidates: `110`

---

## 8. Acceptance smoke

1. Перевести контракт организатора в `signed`.
2. Добавить 1-2 `OrganizerExternalChannel`.
3. Проверить появление/обновление записей в `/sources` (`sourceOrigin=organizer_contract_auto`).
4. Выполнить `Run selected source` и `Run by type`.
5. Проверить результаты в `/raw-items` и `/event-candidates`.

---

Если источник не стартует:

- проверить `isActive`, `lifecycleState`, `fetchIntervalMinutes`;
- проверить `lastErrorSnippet` и `SourceRun.errorMessage`;
- для batch-пакета открыть `import session` и строки с `action=error`.
