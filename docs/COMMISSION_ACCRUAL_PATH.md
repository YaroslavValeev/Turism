# Commission accrual path (от completed booking)

**Source of truth:** бронирование с `bookingStatus = completed` и фактический GMV (руб).

## Правило начисления

Комиссия начисляется **только** после того, как бронирование переведено в статус **completed**. Никакой payment flow, никаких автоматических списаний с гостя или организатора в этом пакете не предусмотрено.

## Auditable путь

1. **Триггер:** смена статуса бронирования на `completed` (через admin: PATCH /bookings/:id/status).
2. **Audit:** в `audit_log` фиксируется запись `entity_type=booking`, `changedField=booking_status_change`, `oldValue`/`newValue`, `changedBy`.
3. **Создание Commission (ручной шаг):**
   - ops/admin создаёт запись Commission через POST /commissions (admin), передавая:
     - `bookingId` (id завершённой заявки),
     - `organizerId`, `programId`,
     - `gmvRub` (фактический объём сделки),
     - при необходимости `commissionRatePct`, `commissionFixedRub`;
   - API при создании может рассчитать `commissionAccruedRub` по rate/fixed;
   - запись Commission создаётся с `reconciliationStatus = pending_evidence` (или accrued по договорённости).
4. **Audit:** при создании Commission пишется audit_log: `entity_type=commission`, `changedField=commission_created`, `newValue=reconciliationStatus`, `changedBy`.

Итог: от completed booking к Commission ведёт **явный, прослеживаемый путь** через ручное создание записи и audit. Автоматический cron/worker для создания Commission из completed booking в будущем может опираться на этот же контракт (проверка `bookingStatus === 'completed'`, отсутствие уже созданной Commission по этому bookingId).

## Что не входит

- Платёжные шлюзы, списания, refund flow.
- Revenue dashboard / пользовательский или админский финансовый дашборд.
- Публичное отображение сумм комиссий.

## Source of truth (итог)

| Элемент | Источник истины |
|--------|------------------|
| Факт завершения сделки | `Booking.bookingStatus = completed` |
| GMV | поле в Booking или ввод при создании Commission (по процессу) |
| Начисленная комиссия | запись `Commission`, поле `commissionAccruedRub` |
| Прослеживаемость | `audit_log` по entity_type booking и commission |
