# Wave 1 / Stage A — Execution Board (Sources / Parsing Owner Ops)

Статус: Ready for implementation review (без массового UI-кодинга).

---

## 1) Цель Stage A

Сделать правило **`contracted organizer -> auto source onboarding`** жёстким, наблюдаемым и идемпотентным:

1. подписанный договор включает организатора в managed ingestion-контур;
2. внешние каналы организатора отражаются в `Source` без дублей;
3. lifecycle `Source` синхронизирован с policy по контракту/привилегиям;
4. нет смешения `Program` (внутренний продуктовый контур) и `Source` (внешний discovery).

---

## 2) Scope / Out of scope

**In scope (Stage A):**

- schema/linkage для `OrganizerExternalChannel -> Source`;
- hooks синка при изменении contract/channel/profile signals;
- lifecycle policy enforcement (`active`, `paused_by_policy`, ...);
- API для ручной пересинхронизации и проверки состояния;
- audit и базовая наблюдаемость.

**Out of scope (Stage A):**

- UI-polish `/sources` как owner dashboard (это Stage B/C);
- новые social connectors/AI ingestion;
- глубокая BI-визуализация.

---

## 3) Рабочий план (итерации)

Детальный порядок PR для A1: [`WAVE1_STAGEA_A1_TASKLIST.md`](./WAVE1_STAGEA_A1_TASKLIST.md).

## A1. Schema + linkage hardening

**Задачи**
- Убедиться, что `Source.externalChannelId` заполнен для всех contract-auto записей, где это возможно.
- Backfill для legacy `metaJson.channelId` -> FK `externalChannelId`.
- Проверка уникальности и дедупа по `(type, normalized urlOrHandle)`.

**Файлы/модули**
- `services/api/prisma/schema.prisma`
- `services/api/prisma/migrations/*` (новая backfill миграция/скрипт при необходимости)
- `services/api/src/modules/sources/sourceRegistry.ts`
- `services/api/src/modules/sources/autoOnboardingService.ts`

**Rollback point**
- До выполнения backfill на prod (миграция применена, данные не переписаны).

## A2. Hooks and policy sync

**Задачи**
- Единый триггер синка: contract create/update, external channel CRUD, `telegramChatId` update.
- Явная проверка policy: при не-signed договоре `contract_auto` не остаются активными (кроме protected lifecycle).
- Ручной endpoint пересинхронизации для ops уже есть; закрепить контракт ответа и ошибки.

**Файлы/модули**
- `services/api/src/modules/organizers/routes.ts`
- `services/api/src/modules/sources/routes.ts`
- `services/api/src/modules/sources/autoOnboardingService.ts`
- `docs/operations/SOURCES_OWNER_INGESTION_RUNBOOK.md`

**Rollback point**
- Отключение вызовов sync hooks (feature toggle/rollback API release) без отката БД.

## A3. DoD validation + guardrails

**Задачи**
- Тесты идемпотентности sync (`N` повторов -> тот же набор `Source`).
- Тест policy pause (signed -> paused/rejected/suspended paths).
- Проверки build discipline и baseline:
  - `pnpm --filter @mywave/config build`
  - `pnpm --filter api db:generate`
  - `pnpm --filter api exec tsc --noEmit`
  - `pnpm --filter admin exec tsc --noEmit`

**Файлы/модули**
- `services/api/src/modules/sources/*.test.ts` (добавить/расширить)
- `.github/workflows/ci.yml` (дисциплина уже закреплена)
- `docs/architecture/SOURCES_PARSING_OWNER_OPS_WAVE.md`

**Rollback point**
- До включения enforcement в production (staging soak завершен, prod flag off).

---

## 4) API contract checklist (Stage A)

1. `POST /sources/contract-auto-sync`
   - Input: `{ organizerId }`
   - Output: `{ createdOrUpdated, paused }`
   - Ошибки: `organizer_not_found`, `400 organizerId required`.
2. `GET /sources?includeExternalChannel=1&lifecycleState=...`
   - Возвращает связь с внешним каналом для owner-операций.
3. Hooks из organizer/contract routes
   - Не меняют доменный смысл `Program`; работают только по discovery-контуру.

---

## 5) Риски и контрмеры

1. **Дубли source при нестабильной нормализации**
   - Контрмера: канонический normalize + тест-кейсы на URL/handle вариации.
2. **Гонки между import и auto-sync**
   - Контрмера: идемпотентный upsert + пост-операционный дедуп отчёт.
3. **Ложные pauses при временных статусах**
   - Контрмера: чёткая таблица policy transitions в runbook + audit trail.
4. **Регрессия baseline**
   - Контрмера: CI gate и обязательный `@mywave/config build`.

---

## 6) Definition of Done (жёсткая)

Stage A закрыт, когда:

1. Для test-набора договорных организаторов sync создаёт/обновляет ожидаемые `Source` без дублей.
2. При уходе договора из `signed` источники `organizer_contract_auto` уходят в policy pause корректно.
3. Для реальных каналов заполнен `externalChannelId`; synthetic канал явно без FK.
4. Ключевые действия отражены в audit (`contract_auto_sources_*`), без PII в payload.
5. Build/typecheck gates зелёные и воспроизводимы локально/в CI.
6. Runbook обновлён, есть шаги проверки post-sync и rollback.

---

## 7) Что делаем сразу после Stage A

1. Stage B: owner UI улучшения `/sources` (импорт preview quality, действия, таблицы на scale).
2. Stage C: manual ingestion controls + visibility (schedule/health/ops feedback loops).
