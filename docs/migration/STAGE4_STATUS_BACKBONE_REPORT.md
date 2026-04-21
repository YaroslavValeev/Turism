# Stage 4 — Status & Automation Backbone: отчёт

Дата: 2026-04-17.

## 1. Что сделано

- Проведён аудит размазанной статусной логики: `docs/architecture/STAGE4_STATUS_BACKBONE_AUDIT.md`.
- Зафиксировано сопоставление терминов Stage 4 ↔ enum БД: `docs/decisions/ADR-006-stage4-canonical-vocabulary-vs-db-enums.md`.
- Добавлена модель Prisma **`DomainStatusEvent`** и миграция `20260417193000_domain_status_events` (отдельно от `analytics_events`).
- Вынесена **единая policy-матрица** в `@mywave/shared-policy`: `programPublish`, `intakeProcessing`, `bookingTransitions` (перенос бывшего `bookings/statusRules.ts` без дублирования).
- Реализован **слой исполнения переходов** в API: `services/api/src/modules/status-engine/` (`applyProgramPublishTransition`, `applyIntakeProcessingTransition`, `applyBookingStatusTransition`, `recordDomainStatusEvent`).
- Подключены потоки: **program publish-status**, **intake PATCH** (без `draft_created` в PATCH), **intake → draft program** (события в транзакции), **booking POST delivery**, **booking PATCH**, **replay доставки**.
- Добавлен **GET** `/admin/domain-status-events` для таймлайна.
- Админка: **ограниченный select** статусов программы по `nextPublishStatuses`, **кнопки intake** по `nextProcessingStatuses`, **таймлайн** на intake/booking/program (раскрываемый блок для программ).

## 2. Что в работе / вынесено на следующий slice

- Организатор: **onboarding / billing profile** (не только `verificationStatus`) — пока без единого engine.
- **Строгий граф** `reconciliationStatus` комиссии (сейчас policy допускает любой канонический переход, как раньше PATCH); отдельные доменные имена `invoice_*` только для `invoiced` / `paid`.
- Явный фасад `applyTransition({ entityType, action })` — по желанию поверх текущих `apply*`.
- Сделано дополнительно после первого отчёта: `PATCH /organizers/:id/verification-status` → engine + `DomainStatusEvent`; `PATCH /commissions/:id/reconciliation` → engine + события; **ingestion** auto-publish через `applyProgramPublishTransition` + контекст `ingestionAutoPublish`; **billing** `recordPayment` / `recordRefund` пишут `booking_payment_derived_status`; `writeAuditLog` может писаться в тот же **transaction client**, что и переход программы (ingestion).

## 3. Что требует решения

- Нужна ли **админ-override** ветка для `archived → draft` (сейчас запрещено policy).
- Уточнение продуктового смысла **`paused` vs возврат в `internal_review`** после `published`.

## 4. Что заблокировано

- Нет блокеров на уровне репозитория; требуется **`pnpm --filter api exec prisma migrate deploy`** (или `migrate dev`) на окружении с БД.

## 5. Затронутые файлы (основные)

- `services/api/prisma/schema.prisma`, `services/api/prisma/migrations/20260417193000_domain_status_events/migration.sql`
- `packages/shared-policy/src/*`, `packages/shared-policy/package.json`
- `services/api/package.json`, `services/api/src/index.ts`
- `services/api/src/modules/programs/routes.ts`
- `services/api/src/modules/organizer-intakes/routes.ts`, `draftProgramFromIntake.ts`
- `services/api/src/modules/bookings/routes.ts` (удалён `statusRules.ts`)
- `services/api/src/modules/status-engine/*`, `services/api/src/modules/domain-status-events/routes.ts`
- `apps/admin/src/app/programs/page.tsx`, `organizer-intakes/[id]/page.tsx`, `bookings/[id]/page.tsx`
- `apps/admin/src/components/DomainStatusTimeline.tsx`, `ProgramStatusTimelineBlock.tsx`
- `services/api/src/modules/status-engine/transitionPolicy.test.ts`

## 6. Что протестировано

- `pnpm --filter @mywave/shared-policy build`
- `pnpm --filter api exec prisma generate` + `pnpm --filter api build`
- `pnpm --filter api test` (Vitest: сценарии policy ≥ 10)
- `pnpm --filter admin build`

## 7. Риски

- **Ужесточение** графа `publishStatus`: раньше PATCH допускал любой канонический статус (кроме gate на `published`); теперь нелегальные прыжки дадут **400** — возможны скрытые зависимости в данных/скриптах.
- **Двойной audit** на публичном intake booking: остаётся `booking_delivery` + запись от `applyBookingStatusTransition` (`booking_status_change`) — намеренно для трассировки.

## 8. Что готово к демонстрации

- Смена статуса программы через policy + запись в `domain_status_events` + таймлайн в админке (раскрывающийся блок).
- Intake: только допустимые кнопки + таймлайн; `draft_created` только через **Создать черновик**.
- Booking: таймлайн + переходы через engine; публичный intake пишет `lead_created` и авто-переход `new → sent_to_organizer` при успешной доставке.

## Как проверить вручную

1. Миграции БД применены, API и admin запущены.
2. Админка → программы: попробовать недопустимый переход в select (если обойти UI — PATCH вернёт 400).
3. Intake: кнопки недоступны, если переход не из policy.
4. `GET /admin/domain-status-events?entity_type=program&entity_id=<id>` — непустой список после смены статуса.
