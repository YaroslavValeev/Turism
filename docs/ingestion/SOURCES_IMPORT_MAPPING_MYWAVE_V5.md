# Sources import mapping: `mywave_v5_real_only.xlsx`

Технический mapping для импорта источников в `Source` из файла:

- `c:/Users/X230/Downloads/mywave_v5_real_only.xlsx`

Импорт реализован в backend (`/sources/import`) и CLI (`db:import-sources-xlsx`).

---

## 1. Листы, которые импортируются

Обрабатываются все релевантные листы:

- `PROJECTS_DB`
- `TG_VK_SOURCES`
- `TOP_30_PRIORITY`
- `KIDS_FAMILY`
- `PREMIUM_EXPEDITIONS`

Листы `README`, `GEO_HEATMAP`, `PATTERNS`, `OUTREACH_QUEUE` не используются как прямой источник `Source`, только аналитический контекст.

---

## 2. Нормализация каналов

Перед upsert:

- `telegram`: `@handle`, `t.me/...`, `https://t.me/...` → `https://t.me/<handle>`
- `instagram`: handle/URL → `https://www.instagram.com/<handle>/`
- `vk`: handle/URL → `https://vk.com/<handle>`
- `site`/`rss`: канонизация URL (`https://...`, без `www`-шумов где применимо)

Определение `type`:

- явные колонки (`telegram`, `instagram`, `vk`, `website`) имеют приоритет;
- для универсального `url` используется `platform` (если есть), иначе auto-detect.

---

## 3. Дедуп и idempotency

Уникальность на уровне импорта:

- ключ: `type + urlOrHandle` (после нормализации).

Правило:

- если источник уже есть в `Source` по ключу — `updated`;
- если не найден — `created`;
- повтор в одной партии — `duplicate` (идёт в `duplicateCount`, в `Source` не дублируется).

---

## 4. Mapping в `Source`

### 4.1 Прямые поля

- `type`
- `name` (`project_name` или `source_name`)
- `urlOrHandle`
- `parserProfile` (по type)
- `fetchIntervalMinutes = 1440` (baseline)
- `isActive = true`
- `sourceOrigin = batch_import`
- `lifecycleState = active`
- `discipline`, `country`, `region` (если есть в строке)

### 4.2 `metaJson`

Пишутся поля источника строки:

- `source_sheet`, `source_row`, `source_column`
- `project_name`, `cluster`, `subtype`
- `kids_flag`, `family_flag`, `premium_flag`
- `focus`, `signal`, `why_useful`
- `evidence_url`, `evidence_note`
- `importSessionId`, `importedAt`

---

## 5. Mapping по листам

### `PROJECTS_DB`

- каналы: `website`, `telegram`, `vk`, `instagram`, `booking_entry_point`, `evidence_url`
- enrichment: `cluster`, `discipline`, `subtype`, `region`, флаги kids/family, scoring-поля.

### `TG_VK_SOURCES`

- канал: `url` + `platform`
- `source_name` → `name`
- `focus`, `why_useful`, `signal` → `metaJson`.

### `TOP_30_PRIORITY`

- канал: `website`, `booking_entry_point`, `evidence_url`
- `priority_tier`, `platform_fit_score` → `priority` + `metaJson`.

### `KIDS_FAMILY`

- канал: `website`, `booking_entry_point`, `evidence_url`
- `kids_flag`, `family_flag`, `formats` → `metaJson`.

### `PREMIUM_EXPEDITIONS`

- канал: `website`, `booking_entry_point`, `evidence_url`
- `premium_flag`, `platform_fit_score` → `priority` + `metaJson`.

---

## 6. Результаты текущего импорта

- Dry-run session: `cmo7b5vfb0000wpy93nm18x0w`
- Write-run session: `cmo7b5v4d00003p0cgvvn0img`

Write-run summary:

- `created = 110`
- `updated = 0`
- `duplicates = 307`
- `errors = 0`
- `totalCandidates = 417`
- `uniqueCandidates = 110`

---

## 7. Команды

```bash
# Dry-run
pnpm --filter api db:import-sources-xlsx -- "c:/Users/X230/Downloads/mywave_v5_real_only.xlsx" --dry-run

# Write-run
pnpm --filter api db:import-sources-xlsx -- "c:/Users/X230/Downloads/mywave_v5_real_only.xlsx"
```

API-вариант:

`POST /sources/import` с body `{ filePath, dryRun }` (поддерживаются `.xlsx`, `.csv`, `.json`).
