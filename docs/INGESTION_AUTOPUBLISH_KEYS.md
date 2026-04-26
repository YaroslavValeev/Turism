# Ingestion Autopublish Keys (Canonical)

Канонический reference для Sprint 2: anti-duplicate, idempotency и наблюдаемость negative-cases в autopublish.

## 1. `programMergeKey` (канон)

В ingestion используется dedup-ключ программы:

`discipline | startDate(YYYY-MM-DD) | endDate(YYYY-MM-DD) | region | exactLocation | normalizedTitleWithoutDateFragments`

- Реализация: `services/api/src/modules/programs/dedup.ts` (`buildProgramDedupKey`).
- Ключ применяется при duplicate-поиске в `publishCandidateToDraft` через `buildProgramDedupProbe` + `findExistingPublishedProgramDuplicate`.
- При совпадении ключа новый `Program` не создаётся: выполняется merge/update в существующую программу.

## 2. Publish/Idempotency key

Для autopublish-цепочки канонический idempotency anchor:

- `PublishedProgram.candidateId` (один candidate не публикуется повторно как новая связь).
- В `publishCandidateToDraft` есть ранний выход, если `candidate.publishedProgram` уже существует.

Практический publish trace key для отчётов:

- `candidateId + sourceId + programId + path(create|duplicate_merge)`.

## 3. Duplicate merge behaviour

При duplicate match:

1. Обновляется существующий `Program` (merge-патч).
2. Кандидат переводится в `status=merged`.
3. Пишется лог `event=ingestion_autopublish`, `kind=duplicate_merged`.
4. Если запрошен autopublish и gate пройден — статус усиливается до `published`.

## 4. Source opt-out behaviour (`metaJson.autoPublish=false`)

Если на активном источнике выставлено `metaJson.autoPublish=false`:

- кандидат пропускается в `autoPublishReadyCandidates`;
- autopublish для этого кандидата не выполняется;
- в лог пишется `kind=source_disabled`;
- счётчик `sourceOptOut` увеличивается.

## 5. Gate skip behaviour

Если autopublish запрошен, но `canPublishAutopilot` вернул missing fields:

- публикация в `published` не выполняется;
- пишется `kind=autopublish_skipped`, `reason=gate`, `missing=[...]`;
- счётчик `gateSkipped` увеличивается.

Дополнительно для create-path ведётся `autoCreatedGateSkipped`.

## 6. `AutopilotBatchStats` mapping

Канонические поля и смысл:

- `autoCreated` — создано новых программ по create-path.
- `autoUpdated` — обновлено существующих программ по duplicate merge-path.
- `duplicateMerged` — кандидаты, обработанные как duplicate merge.
- `gateSkipped` — autopublish пропущен из-за gate (включая duplicate/create path).
- `sourceOptOut` — пропущено из-за `metaJson.autoPublish=false`.
- `publishFailed` — исключение в процессе `publishCandidateToDraft`.

Сохраняются производные поля: `autoCreatedPublished`, `autoCreatedGateSkipped`, `duplicatePublishedOrRetained`, `duplicateRetainedOnly`, `notEligible`, `checked`, `published`.

## 7. E2E observability contract

Скрипт `services/api/prisma/verify_ingestion_autopublish_e2e.ts` должен в режиме прогона (`INGESTION_AUTOPUBLISH_E2E_RUN=1`) печатать:

- `verify_e2e_batch_result` с полным `batch`;
- `verify_e2e_assertions` с явными флагами:
  - `duplicate_merged.observed`
  - `autopublish_skipped_gate.observed`
  - `source_opt_out_not_published.observed`

Это фиксирует anti-duplicate и negative-cases не только в коде, но и в отчёте запуска.

## 8. Known caveat / next-step consideration

Текущий `programMergeKey` **не включает `organizerId`**.

Риск: события с очень похожими атрибутами (одинаковые даты/регион/тайтл-паттерн) у разных организаторов могут схлопываться в duplicate merge.

Статус: **осознанный компромисс Sprint 2** для стабильности текущего канона.

Next-step для оценки:

1. добавить `organizerId` в dedup-probe фильтр или ключ;
2. прогнать обратную совместимость на существующих merge-кейсах;
3. согласовать миграцию ключа отдельно, чтобы не сломать текущие dedup-метрики.

## 9. Sprint 2.1 — deterministic proof fixtures

Скрипт: `services/api/prisma/ingestion_e2e_proof_fixtures.ts`

Запуск: `pnpm --filter api exec tsx prisma/ingestion_e2e_proof_fixtures.ts`

| Переменная | Назначение |
|------------|------------|
| `MODE` | `duplicate` \| `gate` \| `optout` \| `all` (по умолчанию `all`) |
| `INGESTION_E2E_FORCE_GATE` | выставляется внутри ветки `gate` / `all` (non-production) в `1` — **детерминированный** fail `canPublishAutopilot` с `missing: ["e2e_forced_gate"]` (см. `publishGate.ts`) |
| `E2E_CLEANUP` | `0` — не удалять созданные строки (для ручного осмотра) |

- **duplicate:** два кандидата с одним `programMergeKey` → второй путь `duplicate_merge`, в JSON `assertions.duplicate_merged.observed: true`.
- **gate:** один кандидат, `autopublish` включён, принудительный fail гейта → в логе `kind=autopublish_skipped`, `reason=gate`, `missing` содержит `e2e_forced_gate`; `assertions.autopublish_skipped_gate.observed: true`.
- **opt-out:** источник с `metaJson.autoPublish: false` и кандидат в очереди `autoPublishReadyCandidates` → `source_disabled` для этого кандидата, `PublishedProgram` не создаётся; `assertions.source_opt_out_not_published.observed: true`.

`MODE=all` в `NODE_ENV=production` **не** запускает ветку `gate` (только `duplicate` + `optout` + предупреждение в консоль); `MODE=gate` в production — выход с ошибкой.

**Поведенческий gate (без env):** в текущем `createDraftProgramPayload` поля обычно заполняются так, что «настоящий» fail `canPublishAutopilot` на create-path встречается редко; env-фикстура — контролируемый и воспроизводимый способ получить `autopublish_skipped`+gate в отчёте.
