# Stage 4 — Close Report (фиксация приёмки)

Дата: 2026-04-17. Статус: **этап закрыт** (архитектурно и по реализации), с осознанным хвостом Stage 4.1.

## 1. Что считается покрытым `shared-policy` + `status-engine`

| Контур | Policy (`@mywave/shared-policy`) | Исполнение + события + audit |
|--------|----------------------------------|------------------------------|
| **Program `publishStatus`** | `programPublish` (+ контекст `ingestionAutoPublish` для исключения) | `applyProgramPublishTransition` (`db` = Prisma или **транзакция**) |
| **Intake `processingStatus`** (ручной PATCH) | `intakeProcessing` | `applyIntakeProcessingTransition` |
| **Booking `bookingStatus`** (ручной PATCH, доставка intake) | `bookingTransitions` | `applyBookingStatusTransition` |
| **Organizer `verificationStatus`** | `organizerVerification` | `applyOrganizerVerificationTransition` |
| **Commission `reconciliationStatus` / поля PATCH** | `commissionReconciliation` (пермиссивный канон) | `applyCommissionReconciliationPatch` |
| **Ingestion auto-publish** | то же `programPublish` + явный контекст | `applyProgramPublishTransition` внутри `publishCandidateToDraft` (без обхода gate) |
| **Audit в транзакции** | — | `writeAuditLog(entry, db)` при операциях в `tx` |

Дополнительно зафиксировано отдельным типом доменного события (не подменяя граф booking):

| Контур | Механизм |
|--------|----------|
| **Billing → `bookingStatus`** | `deriveBookingStatus` + `prisma.booking.update` + **`DomainStatusEvent`** `booking_payment_derived_status` |

## 2. Что остаётся legacy / прямой записью (вне полного transition-engine)

Ниже — **намеренный остаток** после Stage 4; детальный список см. `STAGE4_1_DIRECT_STATUS_WRITES.md`.

Кратко по категориям:

- **Инициализация сущностей** (`create` с начальным статусом): публичный POST booking (`new`), POST program (`publishStatus`), intake→draft program, POST commission, создание review с `moderationStatus`, инцидент `open`, ingestion organizer/program/candidate/publishedProgram link.
- **Организатор — общий профиль**: `onboardingStatus`, `billingStatus` на `Organizer` и billing-profile upsert (не verification PATCH).
- **Биллинг — комиссия/акт**: `recalculateCommissionForBooking` (upsert `reconciliationStatus`), массовое `invoiced` при генерации statement, **PATCH статуса billing statement** (`billing/routes.ts`).
- **Не домен «программа/intake/booking» в том же смысле**: `event_candidate.status`, `review.moderationStatus`, `incident.incidentStatus`, статусы notification jobs (отдельная модель).

## 3. Обратная совместимость

- Сохранены контракты REST; новые поля и `idempotencyKey` — **опционально**.
- Графы **не ужесточались** там, где не было отдельного ADR и миграции данных (в т.ч. commission reconciliation — пермиссивный режим).

## 4. Осознанный технический долг → Stage 4.1

Зафиксировано в:

- `docs/decisions/ADR-007-booking-billing-status-strategy.md` (черновик решения),
- `docs/decisions/ADR-008-commission-reconciliation-strategy.md` (черновик решения),

и в плане агентов: `docs/migration/STAGE4_1_AGENT_PLAN.md`.

## 5. Критерий «этап закрыт»

- Policy и engine — **рабочий слой** для ключевых операторских и публикационных контуров.
- Ingestion **не обходит** единую логику публикации «молча».
- Остатки прямых записей **перечислены и управляемы**, а не «размазаны неизвестно где».

Оценка зафиксированная заказчиком: **9.5/10** до закрытия ADR по booking/billing и commission graph.

---

## Дополнение (2026-04-23): хвост Stage 4.1

Плановый хвост **Stage 4.1** (ADR-007/008, guard booking-status writers, platform mode, приёмка сборки и UI) зафиксирован как **выполненный**; детали и ссылка на эксплуатационную фазу — в [`STAGE4_1_START_EXECUTION_REPORT.md`](./STAGE4_1_START_EXECUTION_REPORT.md) (раздел «Закрытие разработческого этапа») и [`../PROJECT_SOURCEBOOK.md`](../PROJECT_SOURCEBOOK.md).
