# Wave 1 / Stage A / A1 — Execution-Ready Task List

Статус: ready for implementation sequencing.  
Принцип: **schema + linkage first**, без premature UI, без массовых side effects, без авто-включения в prod.

---

## 0) Текущее состояние (честный baseline)

### Уже реализовано
- `Source.externalChannelId` и FK на `OrganizerExternalChannel` (в схеме и миграции).
- Sync path `syncOrganizerContractAutoSources` с поддержкой связи канала.
- Ручной API `POST /sources/contract-auto-sync`.
- Lifecycle/filter базового уровня в `/sources`.
- Базовая дисциплина сборки (`@mywave/config build` в CI).

### Нужно добить в A1 до DoD
- Backfill legacy связей (`metaJson.channelId` -> `externalChannelId`) с dry-run и отчётом.
- Reconciliation/dedupe для legacy source-строк.
- Явный guarded enable для contract-status hooks (без внезапного prod enforcement).
- Полный минимальный тест-пак (unit/integration/smoke) под A1.

### Переносим в Stage B/C (не делать в A1)
- UX-polish экранов и массовые UI-рефакторы.
- Расширение owner-dashboard beyond текущего operational блока.
- Любые growth/AI/social фичи.

---

## 1) Операционные определения для A1

## 1.1 Как определяем contracted organizer
- Канонично: `OrganizerContract.status === "signed"` (последняя актуальная запись по `updatedAt`).
- Для A1 считаем только это условие, без дополнительных inferred-правил.
- Любые другие статусы (`generated/sent/rejected/expired/...`) считаются non-contracted для auto-onboarding.

## 1.2 Какие данные нужны для backfill
- `sources`: `id`, `type`, `urlOrHandle`, `organizerId`, `sourceOrigin`, `externalChannelId`, `metaJson`, `lifecycleState`, `isActive`.
- `organizer_external_channels`: `id`, `organizerId`, `type`, `urlOrHandle`, `isActive`, `lifecycleState`.
- `organizer_contracts`: `organizerId`, `status`, `updatedAt`.

## 1.3 Как не плодим дубль `Source`
- Канонический ключ дедупа: `(type, normalize(urlOrHandle))`.
- Upsert только через общий helper (`upsertSourceByTypeAndHandle`), без прямых create в обход.
- Backfill и reconciliation должны сначала считать потенциальные конфликты, потом писать.

## 1.4 Как связываем `OrganizerExternalChannel -> Source`
- Для реальных каналов: `Source.externalChannelId = OrganizerExternalChannel.id`.
- Для synthetic telegram (из `Organizer.telegramChatId`): `externalChannelId = null`.
- В `metaJson.channelId` оставляем временно как legacy trace, но source of truth связи = FK.

---

## 2) Порядок PR

## PR1 — Schema + linkage hardening

**Цель**
- Зафиксировать schema-контракт A1 и подготовить безопасную основу для backfill.

**Что меняем**
- Prisma schema/comments/индексы (если нужно уточнение контрактов).
- Миграция(и) только структурные (без массовой перезаписи данных).
- Точки в коде, где linkage используется/валидируется.

**Файлы (ожидаемо)**
- `services/api/prisma/schema.prisma`
- `services/api/prisma/migrations/<new>_stagea_linkage_hardening/migration.sql`
- `services/api/src/modules/sources/sourceRegistry.ts`
- `services/api/src/modules/sources/autoOnboardingService.ts`
- (опц.) `services/api/src/modules/sources/routes.ts` — только для безопасного контракта чтения, без новой бизнес-логики.

**API изменения**
- Только backward-compatible (если нужны): read-поля/валидации linkage.
- Никакого нового enforcement поведения на prod по умолчанию.

**Обязательные тесты**
- Unit: normalize + uniqueness key behavior.
- Unit: upsert path не создаёт дубль при эквивалентных handle.

**Rollback point**
- После применения структурной миграции, до запуска любого backfill.

**Feature flag / guard**
- Если меняется поведение sync-пути: `SOURCES_STAGEA_LINKAGE_ENFORCE=0/1` (по умолчанию `0`).

Чеклист исполнения PR1 (диффы/команды/приёмка): [`WAVE1_STAGEA_PR1_CHECKLIST.md`](./WAVE1_STAGEA_PR1_CHECKLIST.md).

---

## PR2 — Backfill + reconciliation + dedupe report (dry-run first)

**Цель**
- Привести legacy данные к FK-связям без массовых побочных эффектов.

**Что меняем**
- Скрипт backfill (dry-run/write режимы).
- Reconciliation отчёт: matched/unmatched/duplicates/conflicts/skipped.
- Дедуп-правила и стратегия разрешения конфликтов (консервативно, без hard delete по умолчанию).

**Файлы (ожидаемо)**
- `services/api/scripts/backfill-source-external-channel-link.ts` (новый)
- `services/api/scripts/reconcile-sources-dedupe-report.ts` (новый/или объединённый)
- `services/api/package.json` (скрипты запуска)
- `docs/operations/SOURCES_OWNER_INGESTION_RUNBOOK.md` (раздел dry-run / write-run)

**Миграции**
- Нет новых structural migration; только data backfill через скрипты.

**API изменения**
- Нет обязательных API изменений.
- Опционально: read endpoint/параметр для выгрузки reconciliation summary (если удобно ops).

**Обязательные тесты**
- Unit: resolver дедупа (приоритеты выбора canonical source).
- Integration (DB): dry-run ничего не пишет; write-run пишет ожидаемые связи.
- Smoke: на staging отчёт по реальным данным без разрушительных действий.

**Rollback point**
- До write-run (после dry-run отчёта и ревью owner).

**Feature flag / guard**
- `SOURCES_STAGEA_BACKFILL_WRITE_ENABLED=0/1` (в prod по умолчанию `0`).

---

## PR3 — Contract-status hook + guarded enable + validation gate

**Цель**
- Закрыть A1 по DoD: корректный hook-контур, policy согласованность, тесты и release gate.

**Что меняем**
- Hooks на contract/channel/profile changes (если где-то ещё неполно).
- Guarded enable: переключатели на enforcement вместо “включили всем”.
- Финальные проверки policy pause по non-signed.
- Документация rollout/rollback.

**Файлы (ожидаемо)**
- `services/api/src/modules/organizers/routes.ts`
- `services/api/src/modules/sources/autoOnboardingService.ts`
- `services/api/src/modules/sources/routes.ts`
- `services/api/src/modules/sources/*.test.ts`
- `docs/architecture/SOURCES_PARSING_OWNER_OPS_WAVE.md`
- `docs/operations/SOURCES_OWNER_INGESTION_RUNBOOK.md`
- `.github/workflows/ci.yml` (если нужен дополнительный explicit gate шаг)

**Миграции**
- Нет (только код + tests + docs).

**API изменения**
- Контракт existing endpoints стабилен.
- Ошибки/ответы sync endpoint формализованы и задокументированы.

**Обязательные тесты**
- Unit: idempotent sync (`N` повторов -> тот же state).
- Integration: contract signed/non-signed transitions меняют lifecycle ожидаемо.
- Smoke: post-sync sanity checklist на staging.

**Rollback point**
- До включения enforcement flags в prod.

**Feature flag / guard**
- `SOURCES_STAGEA_POLICY_ENFORCE=0/1` (default `0`).
- Включение только после успешного soak на staging.

---

## 3) Минимальный тестовый набор A1

## Unit (must)
- normalize/kanonize `urlOrHandle`.
- dedupe key generation.
- upsert idempotency.
- policy pause exclusion (`manual_override`, `archived`).

## Integration (must)
- contract signed -> sources active.
- contract non-signed -> contract_auto sources paused_by_policy.
- backfill dry-run/write behavior.

## Smoke (must)
- staging сценарий:
  1) выбрать contracted organizer с каналами;
  2) выполнить manual sync;
  3) проверить linkage (`externalChannelId`) и отсутствие дублей;
  4) проверить, что API/tsc baseline зелёный.

---

## 4) Gate после A1 (переход к A2 разрешён, если выполнено всё)

1. Backfill отчёт утверждён (dry-run + write-run), конфликтные кейсы разобраны.
2. Дубликаты в критичных organizer cohorts не выходят за согласованный порог.
3. Hook-пути идемпотентны и покрыты тестами.
4. Enforcement flags остаются controlled (нет “авто-включили всем”).
5. CI/локальный gate зелёный:
   - `pnpm --filter @mywave/config build`
   - `pnpm --filter api db:generate`
   - `pnpm --filter api exec tsc --noEmit`
   - `pnpm --filter admin exec tsc --noEmit`
   - `pnpm --filter api test`
6. Runbook содержит rollback-процедуру по каждому PR.

---

## 5) Execution notes (дисциплина)

- Каждый PR маленький и внятный, без смешивания A1/B/C.
- Никакого массового UI и “магического прод-включения” в A1.
- Сначала связь и валидация данных, потом enforcement.
