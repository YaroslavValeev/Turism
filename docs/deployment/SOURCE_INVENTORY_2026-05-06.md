# Source / organizer inventory — production snapshot

**Дата открытия файла:** 2026-05-06  
**Deploy candidate SHA:** заполнить после чистого релиз-коммита (должен совпадать с `DEPLOY_EVIDENCE_*`).

## Подтверждённый факт импорта (Timeweb / контейнер API)

После `pnpm exec tsx prisma/import_sources.ts` с файлом `mywave_v5_prisma_sources_site_canonical.json`:

```json
{ "total": 68, "created": 68, "updated": 0 }
```

Типы в JSON приведены к канону `site` | `instagram` | `telegram` (не `website`).

---

## SQL-снимок (выполнить на production Postgres)

Минимальный набор из управленческого решения:

```sql
SELECT COUNT(*) AS organizers_total FROM organizers;
SELECT COUNT(*) AS sources_total FROM sources;
SELECT type, is_active, COUNT(*) AS cnt
FROM sources
GROUP BY type, is_active
ORDER BY type, is_active;
```

Дополнительно (дубликаты источников по ключу ingestion):

```sql
SELECT type, url_or_handle, COUNT(*) AS cnt
FROM sources
GROUP BY type, url_or_handle
HAVING COUNT(*) > 1;
```

Невалидный URL (нет префикса http):

```sql
SELECT COUNT(*) AS invalid_url_sources
FROM sources
WHERE url_or_handle IS NULL
   OR TRIM(url_or_handle) = ''
   OR url_or_handle NOT LIKE 'http%';
```

Записи с устаревшим типом:

```sql
SELECT COUNT(*) AS type_website_sources FROM sources WHERE type = 'website';
```

Вставьте сюда сырые результаты (или приложите как отдельный блок в `DEPLOY_EVIDENCE_*`):

```text
-- organizers_total:
-- sources_total:
-- GROUP BY type, is_active: (вставить таблицу)
```

---

## Итоговая таблица (заполнить после SQL)

```text
real_organizers_total:          (правило отделения real/demo — зафиксировать: имена, verificationStatus, seed-маркеры)
demo_organizers_total:          (если есть только через SEED_DEMO_CATALOG — обычно 0 при SEED_DEMO_CATALOG=0)
real_sources_total:
demo_sources_total:
active_sources:
paused_sources:
invalid_sources:
duplicate_sources:
canonical_organizers:           (есть ли явный mapping в коде: нет отдельной таблицы; «канон» = строки в organizers)
contact_channels_total:         N/A — в Prisma нет сущности OrganizerContactChannel; контакты на модели Organizer (email/phone) и привязанные Source
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

## Security: ротация PAT (evidence)

- Утечённый классический/Fine-grained PAT: **Revoke** в GitHub → Developer settings → Personal access tokens.
- Новый токен: минимальные права (для чтения приватного файла через API — только **Contents: Read** на репозиторий `Turism`).
- Не хранить в markdown, не коммитить в `.env` в git, не светить в скринах; на VPS — только в интерактивном вводе или файле с `chmod 600`.
- Строка для evidence: «Старый PAT отозван _дата_; новый создан _дата_; не закоммичен».
