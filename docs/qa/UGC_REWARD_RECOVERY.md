# UGC Reward Recovery (cancel / refund lifecycle)

Статус: реализовано. Trust-retention policy: reward возвращается гостю, если booking
не дошёл до `completed` и не классифицирован как no-show/fraud.

## 1. Policy (зафиксирована в коде)

**Возвращать reward → `available` при переходе booking в одно из:**

- `cancelled_user`
- `cancelled_organizer`
- `refund_done`

**при одновременном выполнении всех условий:**

1. `booking.appliedRewardId` ≠ null;
2. `booking.completedAt` == null (booking не был завершён);
3. `cancellationKind` ∉ `{no_show, fraud}` (гость не виноват);
4. `reward.status == "used"` и `reward.usedBookingId == booking.id` (привязан именно к этому booking).

**НЕ возвращать reward**, если:

- booking дошёл до `completed` до отмены (reward отработал честно);
- `cancellationKind` ∈ `{no_show, fraud}`;
- reward уже `available` (idempotent no-op);
- reward привязан к другому booking (защитный кейс, recovery запрещён).

## 2. Где встроен recovery

| Слой | Файл |
|------|------|
| Pure policy + атомарный update | `services/api/src/modules/ugc/recoveryService.ts` → `recoverRewardOnCancellation` |
| Автоматический триггер при переходе статуса | `services/api/src/modules/status-engine/applyBookingStatusTransition.ts` |
| Приём cancellationKind/Reason | `PATCH /bookings/:id/status` (admin) |
| Admin visibility | `GET /admin/ugc/overview` → секция `recovery` |

**Recovery происходит в той же транзакции-цепочке, что и переход статуса**, а не
в отдельной ручной логике. Это гарантирует консистентность: нельзя «забыть» вернуть
reward, если переход прошёл.

## 3. Классификация причин отмены

Новое поле `bookings.cancellationKind` (nullable string, enum):

| kind | Recovery | Семантика |
|------|----------|-----------|
| `organizer_cancelled` | ✅ | Организатор отменил |
| `platform_cancelled`  | ✅ | Платформа отменила |
| `user_cancelled`      | ✅ | Гость отменил по обычной причине |
| `no_show`             | ❌ | Гость не пришёл |
| `fraud`               | ❌ | Мошенничество |
| `other`               | ✅ | По умолчанию trust (даёт выгоду сомнения) |
| `null`                | ✅ | Не указано → trust по умолчанию |

Валидация на API: `PATCH /bookings/:id/status` принимает `cancellationKind`
(пропускается только из enum; всё остальное игнорируется как `null`).

## 4. Идемпотентность

Реализована на двух уровнях:

**Логический guard (ранний выход):**

```ts
if (reward.status === "available") return { reason: "already_available" };
if (reward.usedBookingId && reward.usedBookingId !== booking.id)
  return { reason: "bound_to_other_booking" };
```

**Атомарный SQL-match:**

```ts
await prisma.userReward.updateMany({
  where: { id, status: "used", usedBookingId: bookingId },
  data: { status: "available", usedBookingId: null, usedAt: null, recoveredAt: now, ... },
});
if (res.count === 0) return { reason: "race_or_changed" };
```

Повторный вызов `recoverRewardOnCancellation`:
1. Первый успех → `recovered: true`.
2. Второй вызов → `status === "available"` → `recovered: false, reason: "already_available"`.
3. Никогда не происходит второй возврат / двойной audit.

Transition сам по себе тоже идемпотентен через `idempotencyKey` → `domain_status_events`.

## 5. Влияние на billing / transparency

Это **lifecycle-событие reward**, а не переписывание истории booking:

- `booking.originalAmountRub / discountAmountRub / finalAmountRub` **не меняются** после recovery.
- `appliedRewardId` **сохраняется** на booking (история, кто когда применил).
- `commission.calculationJson.reward` продолжает отражать исторический снимок.
- Возвращённый reward может быть использован гостем на новое бронирование — это
  новое событие, новый `applyAvailableReward`, новые amounts.

Если booking должен финансово «разморозиться» (refund), это делается отдельно через
существующий `recordRefund` (payments flow) — он не связан с reward lifecycle.

## 6. Admin visibility

`GET /admin/ugc/overview` теперь возвращает секцию `recovery`:

```json
{
  "recovery": {
    "rewards_recovered": 12,
    "rewards_not_recovered": 3,
    "by_reason": [
      { "kind": "organizer_cancelled", "count": 7 },
      { "kind": "user_cancelled", "count": 4 },
      { "kind": "other", "count": 1 }
    ]
  }
}
```

- `rewards_recovered` — `UserReward` с `recoveredAt != null`.
- `rewards_not_recovered` — booking в `cancelled_user|cancelled_organizer|refund_done` с `appliedRewardId`, у которого `reward.status === "used"` (recovery не сработал: policy-блок, completed, или bound_to_other).
- `by_reason` — group by `recoveredCancellationKind` среди возвращённых reward.

## 7. Audit trail

При успешном recovery создаётся **два** audit-записи:

1. `entityType="user_reward"`, `changedField="status"`, `old="used"`, `new="available"`,
   `reason="reward recovered on cancel (kind=..., bookingId=...)"`.
2. `entityType="booking"`, `changedField="rewardRecovered"`, `newValue=JSON({rewardId, cancellationKind})`,
   `reason="reward recovery lifecycle event"`.

Это позволяет восстановить картину и со стороны reward, и со стороны booking.

## 8. Схема БД

Миграция `20260423090000_reward_recovery_on_cancel`:

```sql
ALTER TABLE "bookings" ADD COLUMN "cancellationKind" TEXT;
ALTER TABLE "user_rewards" ADD COLUMN "recoveredAt" TIMESTAMP(3);
ALTER TABLE "user_rewards" ADD COLUMN "recoveredCancellationKind" TEXT;
```

Индексы — частичные (`WHERE NOT NULL`) чтобы не раздувать их, т.к. в обычном режиме
большинство booking/reward этих полей не имеют.

## 9. Acceptance Criteria

- [x] reward возвращается при `cancelled_user|cancelled_organizer|refund_done` + `kind ∉ {no_show, fraud}`.
- [x] reward НЕ возвращается при `no_show`/`fraud`/уже `completed`.
- [x] recovery идемпотентен (не второй раз возвращает).
- [x] booking history не переписывается — `original/discount/final/appliedRewardId` сохраняются.
- [x] audit создаётся по user_reward и по booking.
- [x] admin overview показывает `rewards_recovered`, `rewards_not_recovered`, `by_reason`.

## 10. Не сделано сознательно (out of scope)

- Частичный возврат reward (например, 50% при late cancel). Reward — one-shot.
- Split recovery между несколькими booking.
- Автоматическая классификация `cancellationKind` через AI/rules (сейчас — явно задаёт админ в `PATCH`).
- Arbitration flow (спор «это был no_show или болезнь?») — ручной admin.
- UI кошелёк с историей recovery для гостя (backend-only, пока).

## 11. Runbook

**Scenario A: обычная отмена гостя**
`PATCH /bookings/:id/status { bookingStatus: "cancelled_user", cancellationKind: "user_cancelled", cancellationReason: "не получается в эти даты" }`
→ reward возвращается, доступен для следующего booking.

**Scenario B: no-show**
`PATCH /bookings/:id/status { bookingStatus: "cancelled_user", cancellationKind: "no_show" }`
→ reward остаётся `used`, в overview зачтётся в `rewards_not_recovered`.

**Scenario C: организатор отменил поездку**
`PATCH /bookings/:id/status { bookingStatus: "cancelled_organizer", cancellationKind: "organizer_cancelled" }`
→ reward возвращается (не вина гостя).

**Scenario D: fraud обнаружен после completed**
Если booking уже `completed` — recovery не сработает (`was_completed`). Reward удерживается.
Если надо вручную отозвать reward — отдельный admin-флоу (не в MVP).

**Scenario E: случайный дубликат PATCH**
Повторный `PATCH /bookings/:id/status` с тем же `idempotencyKey` → `replayed: true`, recovery не повторится.
Без idempotencyKey, но reward уже `available` → `recoverRewardOnCancellation` вернёт `already_available`.

## 12. Связанные документы

- [`UGC_AFTER_COMPLETED.md`](./UGC_AFTER_COMPLETED.md) — базовый UGC flow.
- [`UGC_REWARD_HARDENING.md`](./UGC_REWARD_HARDENING.md) — self-use / duplicate / rate-limit.
- [`UGC_REWARD_BILLING.md`](./UGC_REWARD_BILLING.md) — Model A discount → final → commission.
