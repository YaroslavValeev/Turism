# Остаток прямых записей статусов (актуализация после Stage 4)

**Правило Stage 4.1:** этот список — **закрытый контур**: допускается **только уменьшение** (перенос в engine/policy), **не** расширение без ADR и явного решения владельца.

Назначение: список мест, где **поле статуса** в БД всё ещё выставляется **вне** `applyProgramPublishTransition` / `applyBookingStatusTransition` / `applyIntakeProcessingTransition` / `applyOrganizerVerificationTransition` / `applyCommissionReconciliationPatch` (или где это **намеренно** другой контур — см. billing).

Исключено из списка: **чистые SELECT/WHERE** по статусу, статусы **не доменных** сущностей (например `notificationJob.status`), если не относятся к travel-домену.

## Через engine (не считается «размазанной» логикой)

- `status-engine/applyProgramPublishTransition.ts` — `publishStatus`
- `status-engine/applyBookingStatusTransition.ts` — `bookingStatus`
- `status-engine/applyIntakeProcessingTransition.ts` — `processingStatus`
- `status-engine/applyOrganizerVerificationTransition.ts` — `verificationStatus`
- `status-engine/applyCommissionReconciliationPatch.ts` — `reconciliationStatus` / связанные поля PATCH

## Прямые записи (остаток)

### Booking

| Файл | Что пишется |
|------|-------------|
| `services/api/src/modules/bookings/routes.ts` | `POST /bookings`: `booking.create` — начальное `bookingStatus: "new"` |
| `services/api/src/modules/billing/service.ts` | `recordPayment` / `recordRefund`: `booking.update` — `bookingStatus` из `deriveBookingStatus` + суммы; доменное событие `booking_payment_derived_status` |

### Program

| Файл | Что пишется |
|------|-------------|
| `services/api/src/modules/programs/routes.ts` | `POST /programs`: начальный `publishStatus` из тела |
| `services/api/src/modules/organizer-intakes/draftProgramFromIntake.ts` | `program.create` — `publishStatus: "draft"`; `intake.update` — `processingStatus: "draft_created"` (+ `DomainStatusEvent` в той же транзакции) |
| `services/api/src/modules/ingestion/service.ts` | `program.create` — `publishStatus: "draft"`; `publishedProgram.create` — `publishStatus` link-строка; `eventCandidate.update` — `status` кандидата (не `Program.publishStatus`, но lifecycle ingestion) |

### Organizer

| Файл | Что пишется |
|------|-------------|
| `services/api/src/modules/organizers/routes.ts` | `POST` / общий `PATCH`: `verificationStatus`, `onboardingStatus`, `billingStatus` (не путь `PATCH .../verification-status`) |
| `services/api/src/modules/organizers/routes.ts` | `PATCH .../billing-profile` + sync: `organizer.update` — `billingStatus` / `commissionRateBps` |
| `services/api/src/modules/ingestion/service.ts` | `organizer.create` — `verificationStatus: "listed"` |

### Commission

| Файл | Что пишется |
|------|-------------|
| `services/api/src/modules/commissions/routes.ts` | `POST /commissions`: начальный `reconciliationStatus` |
| `services/api/src/modules/billing/service.ts` | `recalculateCommissionForBooking`: `commission.upsert` — `reconciliationStatus` и служебные даты |
| `services/api/src/modules/billing/service.ts` | генерация statement: массовое `commission.update` — `reconciliationStatus: "invoiced"` |

### Billing statement

| Файл | Что пишется |
|------|-------------|
| `services/api/src/modules/billing/routes.ts` | `PATCH /billing/statements/:id/status` — `BillingStatement.status` |

### Reviews / Incidents

| Файл | Что пишется |
|------|-------------|
| `services/api/src/modules/reviews/routes.ts` | `moderationStatus` (создание/модерация) |
| `services/api/src/modules/incidents/routes.ts` | `incidentStatus` |

---

Обновлять этот файл при каждом merge, затрагивающем статусные поля.
