# Source / organizer inventory — production snapshot

**Дата открытия файла:** 2026-05-06  
**Зафиксированный git SHA (документация + примеры env):** `068038f83d37ecbaee63ff9ceb98d8f4b62b4521` — см. также [`DEPLOY_EVIDENCE_2026-05-06.md`](./DEPLOY_EVIDENCE_2026-05-06.md).

## Подтверждённый факт импорта (Timeweb / контейнер API)

После `pnpm exec tsx prisma/import_sources.ts` с файлом `mywave_v5_prisma_sources_site_canonical.json`:

```json
{ "total": 68, "created": 68, "updated": 0 }
```

Типы в JSON приведены к канону `site` | `instagram` | `telegram` (не `website`).

---

## SQL-снимок (выполнить на production Postgres)

Имена колонок у Prisma для `sources` — **camelCase** (`isActive`, `urlOrHandle`), в сыром SQL их нужно брать в **двойные кавычки**. Иначе Postgres ищет `is_active` / `url_or_handle` и падает с `does not exist`.

Минимальный набор:

```sql
SELECT COUNT(*) AS organizers_total FROM organizers;
SELECT COUNT(*) AS sources_total FROM sources;

SELECT type, "isActive", COUNT(*) AS cnt
FROM sources
GROUP BY type, "isActive"
ORDER BY type, "isActive";
```

Дубликаты источников по паре type + URL:

```sql
SELECT type, "urlOrHandle", COUNT(*) AS cnt
FROM sources
GROUP BY type, "urlOrHandle"
HAVING COUNT(*) > 1;
```

Невалидный URL (нет префикса http):

```sql
SELECT COUNT(*) AS invalid_url_sources
FROM sources
WHERE "urlOrHandle" IS NULL
   OR TRIM("urlOrHandle") = ''
   OR "urlOrHandle" NOT LIKE 'http%';
```

Записи с устаревшим типом:

```sql
SELECT COUNT(*) AS type_website_sources FROM sources WHERE type = 'website';
```

Сырые результаты production SQL (Timeweb, подтверждено скрином терминала):

```text
organizers_total:     17
sources_total:        86

GROUP BY type, "isActive":
  instagram | isActive=t | 20
  site      | isActive=t | 56
  telegram  | isActive=t | 10

type = 'website':      0
дубликаты (type + "urlOrHandle"): 0 строк
```

Примечание: **86** источников = ранее импортированные **68** из реестра + **18** других записей в таблице (история/другие импорты); все **86** сейчас с **`isActive = true`**.

---

## Снимок evidence с Timeweb (ручной прогон, ~2026-05-06)

Зафиксировано по скринам терминала (уточните дату/время в `DEPLOY_EVIDENCE_*`):

| Проверка | Факт |
|----------|------|
| Docker stack | `api`, `web`, `admin`, `postgres`, `reverse-proxy` подняты |
| `prisma migrate deploy` | 28 миграций, БД `mywave` |
| `organizers` COUNT | **17** |
| `sources` COUNT | **86** |
| Разбивка `sources` по типу (все активны) | **site 56**, **instagram 20**, **telegram 10** |
| `type = 'website'` | **0** |
| Дубликаты `(type, urlOrHandle)` | **0** |
| Повторный импорт JSON (68 строк) | `{ "total": 68, "created": 0, "updated": 68 }` — записи уже были |
| `GET https://api.mywavetour.ru/health` или `GET https://mywavetour.ru/api/health` | `{"status":"ok"}` |
| `ingest:cycle-all` | в логе: scope sources:**86**, этапы collect/normalize/dedup отработали; `autoPublish`: часть кандидатов `notEligible` |
| `env \| grep PILOT…` в контейнере `api` | виден только **`APP_ENV=production`** — флаги `PILOT_MODE_ENABLED`, `LEGAL_CONSENT_*`, `AI_*`, `INGESTION_AUTOPUBLISH_*` **не попали в процесс**, если их нет в реальных `env_file` на сервере (проверьте корневой `.env.production` и `services/api/.env.production`, затем `compose up` заново) |

---

## Итоговая таблица (production snapshot)

```text
organizers_total (БД):           17
sources_total (БД):              86
active_sources:                  86   (все isActive=true)
paused_sources:                  0
duplicate_sources:               0    (по паре type + urlOrHandle)
type_website_rows:               0
invalid_sources (URL без http):  (не прогоняли в этом evidence — см. SQL выше)

real_organizers_total:           17   (развод real/demo по орг. — при необходимости отдельным SQL по verificationStatus / имени)
demo_organizers_total:           (не классифицировано без правила владельца)
real_sources_total:              86   (или меньше, если часть помечена как demo в meta — уточнить фильтром)
demo_sources_total:              (не классифицировано без фильтра по metaJson / имени)
canonical_organizers:            17   (= строк в organizers)
contact_channels_total:          N/A — см. модель Organizer + Source
```

---

## Production env guardrails — что реально читает код

Ниже — соответствие списку из управленческого решения и `@mywave/config` (`packages/config/src/env.ts`) + Next-приложения.

| Переменная (желаемое значение) | Поддержка в коде | Примечание |
|-------------------------------|------------------|------------|
| `PILOT_MODE_ENABLED=1` | Да | API `optionalBoolean("PILOT_MODE_ENABLED", false)` |
| `NEXT_PUBLIC_PILOT_MODE=1` | Да (web/admin) | Читает фронт из env сборки; не часть `loadEnv()` API |
| `LEGAL_CONSENT_POLICY_VERSION=pilot-v1` | Да | API: `process.env` в `bookings/routes.ts`, fallback `pilot-v1` |
| `SEED_DEMO_CATALOG=0` | Да (семантика seed) | `services/api/prisma/seed.ts` — не ставить `1` на проде без осознанной нужды |
| `AI_ENABLED=1` | Да | `optionalBoolean("AI_ENABLED", false)` |
| `AI_OWNER_APPROVAL_REQUIRED=true` | Да | default в коде уже **true** |
| `AI_AUTOPUBLISH_ENABLED=false` | Да | default **false** |
| `INGESTION_AUTOPUBLISH_ENABLED=false` | Да | **Важно:** в `loadEnv()` default сейчас **true** — на проде задать явно `false`, если так решено |
| `PAYMENTS_ENABLED=false` | **Нет в env.ts** | Выключение платежей — продуктовая политика / отсутствие потоков в UI; отдельного флага в `loadEnv` нет |
| `INVOICES_ENABLED=false` | **Нет в env.ts** | Аналогично |
| `COMMISSION_RATE=0` | **Нет** | Комиссия задаётся в модели: `Organizer.commissionRateBps` default **300** (3%), см. `schema.prisma`; константа `DEFAULT_COMMISSION_RATE_BPS` в `packages/shared-types/src/billing.ts` |
| `SHADOW_COMMISSION_RATE=0.03` | **Нет как env** | Shadow KPI считается в метриках отдельно; ставку задавать документированно в KPI/evidence, не через этот env |

**Вывод:** перед деплоем явно выставить все **поддерживаемые** флаги в `.env.production` / `services/api/.env.production`. Строки `PAYMENTS_*` / `INVOICES_*` / `*_COMMISSION_RATE` без поддержки в `loadEnv` не будут иметь эффекта, пока не добавлены в код — трактовать как **операционная договорённость** и контроль через процесс и данные (например `commissionRateBps=0` у организаторов — отдельная SQL/админ-задача).

---

## Ingestion / parser guardrails (чек перед GO)

1. **`INGESTION_AUTOPUBLISH_ENABLED`** — выставить в проде согласно политике (см. таблицу выше).
2. **Двойной запуск** — не держать одновременно встроенный `INGESTION_DAILY_ENABLED` в API и cron с тем же циклом без координации; зафиксировать один источник в `DEPLOY_EVIDENCE`.
3. **Owner approval** — автопубликация программ из ingestion зависит от политики `autoPublish` у источника и гейтов публикации; при `INGESTION_AUTOPUBLISH_ENABLED=false` риск массового автопаблиша снижается, но пайплайн контента/Telegram — по отдельным runbook.
4. **Demo/synthetic в каталоге** — публичный API отфильтровывает синтетику по правилам в `programs/routes.ts`; всё равно держать демо-данные вне прод-БД или помечать и чистить SQL.

---

## Source runs triage (checkpoint 2026-05-07)

Фактический snapshot с VPS (psql в контейнере `postgres`):

```text
status summary:
  success = 239
  failed  = 231
  running = 2

failed categories (уточнённая декомпозиция):
  fetch_failed = 162
  http_429     = 42
  invalid_url  = 27
```

### Важно по схеме `source_runs`

В этой БД таблица `source_runs` использует поля:

- `startedAt`, `finishedAt`
- `errorMessage`
- `sourceId`, `runType`, `status`

Колонок `createdAt` / `updatedAt` в `source_runs` нет. Для сортировки последних запусков использовать `startedAt`.

Пример корректного SQL для последних failed:

```sql
SELECT id, "sourceId", "runType", status, "errorMessage", "startedAt", "finishedAt"
FROM source_runs
WHERE status = 'failed'
ORDER BY "startedAt" DESC
LIMIT 100;
```

Первичные наблюдения по `failed`:

- доминируют `fetch_failed` (162) и `http_429` (42), плюс `invalid_url` (27);
- `running = 2` выглядят stale: старые `startedAt` (2026-05-05), `finishedAt` не заполнен;
- для controlled pilot нужен отдельный action-list по top источникам (`keep/retry/fix_parser/pause/disable/manual_review`).

Рекомендуемые действия по источникам (рабочая таксономия):

- `keep`: источник работает/ошибки эпизодические;
- `retry`: сетевые/временные фейлы;
- `fix_parser`: устойчивые parser ошибки;
- `pause`: источник шумный/нестабильный;
- `disable`: источник невалиден/неподдерживаем;
- `manual_review`: пограничные кейсы и бизнес-решение владельца.

### Controlled pilot P0 (checkpoint 2026-05-08)

Owner snapshot:

```text
success: 239
failed: 231
running: 2
failed categories:
- other: 204
- invalid_url: 27
```

Для закрытия P0 `other` декомпозируется на:

```text
http_429
fetch_failed
timeout
http_404
http_403
parser_error
media_fetch_failed
unsupported_source
empty_response
network_error
unknown
```

Целевой формат таблицы triage (для обновления этого файла после прогона):

```text
source_id | type | url_or_handle | is_active | failed_count | last_error | category | recommended_action | reason
```

Где `recommended_action` ∈ `keep | retry | fix_parser | pause | disable | manual_review`.

---

## Security: ротация PAT (evidence)

- Утечённый классический/Fine-grained PAT: **Revoke** в GitHub → Developer settings → Personal access tokens.
- Новый токен: минимальные права (для чтения приватного файла через API — только **Contents: Read** на репозиторий `Turism`).
- Не хранить в markdown, не коммитить в `.env` в git, не светить в скринах; на VPS — только в интерактивном вводе или файле с `chmod 600`.
- Строка для evidence: «Старый PAT отозван _дата_; новый создан _дата_; не закоммичен».

Полный чеклист выката с пустыми полями под заполнение на VPS: [`DEPLOY_EVIDENCE_2026-05-06.md`](./DEPLOY_EVIDENCE_2026-05-06.md).
