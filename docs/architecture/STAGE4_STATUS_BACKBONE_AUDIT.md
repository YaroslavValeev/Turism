# Stage 4 — аудит текущей статусной логики (кратко)

Дата: 2026-04-17. Цель: зафиксировать факты до внедрения `status-engine` и `DomainStatusEvent`.

## Где логика размазана

| Область | Где правила | Где запись |
|---------|-------------|------------|
| **Booking** | `@mywave/shared-policy` → `bookingTransitions.ts` (`isValidBookingTransition`, `getNextBookingStatuses`) | `bookings/routes.ts` → `applyBookingStatusTransition` + `writeAuditLog` (доставка) |
| **Program publish** | `publishGate.ts` + `@mywave/shared-policy/programPublish` | `applyProgramPublishTransition` (+ ingestion с контекстом `ingestionAutoPublish`) |
| **Intake** | `@mywave/shared-policy/intakeProcessing` | `applyIntakeProcessingTransition` |
| **Organizer verification** | `@mywave/shared-policy/organizerVerification` | `applyOrganizerVerificationTransition` |
| **Commission** | `@mywave/shared-policy/commissionReconciliation` | `applyCommissionReconciliationPatch` |
| **Billing → booking** | `deriveBookingStatus` в `billing/service.ts` | прямой `booking.update` + доменное событие `booking_payment_derived_status` (не граф `bookingTransitions`) |

## Прямые смены статусов (остатки вне полного transition-engine)

- `programs/routes.ts` — `POST /programs` задаёт начальный `publishStatus` (не переход).
- `organizer-intakes/draftProgramFromIntake.ts` — создание `program` + `processingStatus: draft_created` в транзакции (рядом с `DomainStatusEvent`).
- `billing/service.ts` — пересчёт `bookingStatus` из сумм оплат/возвратов + доменное событие (см. таблицу).
- `organizers/routes.ts` — общий `PATCH /organizers/:id` (onboarding и др.) без единого engine.
- `ingestion/service.ts` — статусы `event_candidate` и др. вне scope программы/intake/booking.

## Рискованные зоны

1. **Program PATCH общий** (`PATCH /programs/:id`) всё ещё может менять поля пакетом, включая косвенные нарушения консистентности дат — не статусный движок; трогать только publish-status в рамках Stage 4 slice.
2. **Дублирование**: booking graph централизован в `@mywave/shared-policy` (`bookingTransitions`) — API только вызывает policy + engine.
3. **Терминология Lead vs Booking**: канон — **Booking** (`ADR-005` / sourcebook); отдельные `LEAD_STATUSES` в shared-types для legacy/UI — не смешивать с intake pipeline.

## UI

- Админка программ: для booking — `nextStatuses` с API; для program publish — `nextPublishStatuses` + таймлайн по `DomainStatusEvent` (раскрывающийся блок).

## Вывод

Вводим **единый слой записи переходов** (`DomainStatusEvent` + обёртка `apply*Transition`) для **program publish**, **intake processing**, **booking status** в первом slice; остальные сущности — последующие PR без ломки контрактов.
