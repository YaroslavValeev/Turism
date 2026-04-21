# UGC → Reward → Billing (Model A)

Статус: реализовано. Reward реально уменьшает сумму booking; комиссия считается с уменьшенной (`final`) суммы.

## 1. Выбранная модель: A (discount уменьшает цену пользователя)

- `original` — заявленная цена (например, `program.priceFromRub` или указанная админом).
- `discount` — скидка, рассчитанная по `user_rewards.{valueType, value}`.
- `final = original − discount` — то, что реально платит гость.
- `commission = net × rate`, где `net = paidAmount − refundedAmount`. Поскольку гость платит `final`, комиссия платформы автоматически считается от уменьшенной суммы. Платформа и организатор **делят стоимость growth-loop пропорционально** (вариант B — «скидка за счёт комиссии» — отклонён как MVP; зафиксировано в `calculationJson`).

## 2. Где встроено

| Точка | Файл |
|-------|------|
| Расчёт скидки (pure function) | `services/api/src/modules/billing/rewardDiscount.ts` |
| Применение при создании booking | `services/api/src/modules/bookings/routes.ts` → `POST /bookings` (после `applyAvailableReward`) |
| Админ: ручная фиксация цены | `PATCH /bookings/:id/pricing` |
| Commission calculationJson | `services/api/src/modules/billing/service.ts` → `recalculateCommissionForBooking` |
| Admin overview | `GET /admin/ugc/overview` → `discount: { total_discount_rub, top_programs, top_referral_codes }` |

## 3. Алгоритм `computeRewardDiscount`

```
original = max(0, floor(input.originalAmountRub))
if original <= 0 → { applied:false, reason:"zero_original" }
if original < minOrderRub → { applied:false, reason:"below_min_order" }

percent: raw = floor(original * clamp(value, 0..100) / 100)
amount:  raw = max(0, floor(value))
other:   { applied:false, reason:"invalid_type" }

discount = min(raw, original)    // clamp не превышает original
if discount <= 0 → { applied:false, reason:"zero_discount" }

final = max(0, original - discount)
```

Все суммы — целые рубли. Правило округления: **floor** (в пользу платформы, гость теряет максимум 1₽ от формулы; инвариант `final ≥ 0` соблюдается всегда).

## 4. Ограничения (реализованы)

- `discount ≤ original` (clamp): невозможна скидка больше цены.
- `final ≥ 0`: нет отрицательных сумм.
- `original < minOrderRub` → скидка не применяется, reward **остаётся `used`** (уже помечен при `applyAvailableReward`). Это сознательный выбор MVP: reward одноразовый; если гость нарушил min order, второй попытки нет.
- Неизвестный `valueType` → скидка 0, booking создаётся без дисконта.

Настройка: `REFERRAL_REWARD_MIN_ORDER_RUB` (по умолчанию `0`).

## 5. Поля в `bookings`

Миграция `20260422090000_reward_billing_amounts`:

- `originalAmountRub INT?` — заявленная цена.
- `discountAmountRub INT?` — рассчитанная скидка.
- `finalAmountRub INT?` — то, что должен заплатить гость.

Все три nullable, потому что:
- reward не применялся → все `null`;
- reward применялся, но `original` неизвестен на этапе `POST /bookings` → `appliedRewardId` установлен, amounts пусты до `PATCH /bookings/:id/pricing`.

## 6. Flow при `POST /bookings`

1. Attribution: `body.referralCode` > `cookie.mw_ref` > none.
2. Abuse-guard (`canUseReferralCode`): self-use / duplicate / rate-limit. Блок → `referral_abuse_events` + `attributedReferralCode=null`.
3. `booking.create` с `referralCode=attributed`.
4. `applyAvailableReward`: атомарно помечает `user_rewards.status='used'`, пишет `booking.appliedRewardId`.
5. Если reward применён и известна `originalAmountRub` (из `body.originalAmountRub` или `program.priceFromRub`): `computeRewardDiscount` → обновление `original/discount/final` + audit_log `changedField="discountAmountRub"`.
6. `booking_created` → `sent_to_organizer` (delivery).

## 7. Admin: `PATCH /bookings/:id/pricing`

Позволяет админу зафиксировать `originalAmountRub` post-factum (например, когда цена индивидуальная, а не `priceFromRub`).

Поведение:
- проверяет `originalAmountRub` (целое > 0);
- если `booking.appliedRewardId` есть → пересчитывает `computeRewardDiscount` и сохраняет discount/final;
- если нет → просто фиксирует `original = final`;
- вызывает `recalculateCommissionForBooking` (если commission уже есть — обновляется `calculationJson`, сама сумма commission не меняется, т.к. зависит от `paidAmountRub`);
- пишет audit_log `changedField="pricing"` с прежним snapshot'ом.

## 8. Commission: что изменилось

- Формула `commission = (paid − refunded) × rate_bps / 10000` **не изменилась**.
- `calculationJson` теперь содержит поле `reward`:

```json
{
  "paidAmountRub": 28500,
  "refundedAmountRub": 0,
  "netAmountRub": 28500,
  "rateBps": 1000,
  "reward": {
    "appliedRewardId": "clx…",
    "originalAmountRub": 30000,
    "discountAmountRub": 1500,
    "finalAmountRub": 28500
  }
}
```

Это даёт финотделу и аналитике прозрачность: откуда взялась уменьшенная база. Отклонения `paid ≠ final` — сигнал о расхождении (гость доплатил/недоплатил).

## 9. Влияние на commission / organizer payout

Model A означает: **платформа и организатор делят стоимость growth-loop**. Пример:

- `original = 30 000 ₽`, `reward = 5%` → `discount = 1 500 ₽`, `final = 28 500 ₽`.
- `rate = 10%` → `commission = 2 850 ₽` (вместо 3 000 без скидки → `-150 ₽`).
- `organizer payout = final − commission = 25 650 ₽` (вместо 27 000 → `-1 350 ₽`).
- Итого: организатор «платит» 1350, платформа «платит» 150 за привлечение гостя через UGC. Пропорция соответствует rate.

Это осознанный выбор MVP: нам не нужны переговоры с организатором по каждому дисконту. Если потребуется модель B (вся скидка за счёт платформы — комиссия уменьшается не пропорционально), заводим отдельный контракт и флаг `discountAbsorbedBy='platform'`.

## 10. Admin visibility

`GET /admin/ugc/overview` теперь возвращает секцию `discount`:

```json
{
  "discount": {
    "total_discount_rub": 12500,
    "total_original_rub": 250000,
    "total_final_rub": 237500,
    "bookings_with_discount": 8,
    "top_programs": [{ "programId": "…", "discount_rub": 3000, "bookings": 2 }],
    "top_referral_codes": [{ "referralCode": "abc123", "discount_rub": 4500, "bookings": 3 }]
  }
}
```

## 11. Acceptance Criteria

- [x] reward реально уменьшает сумму booking (поля `original/discount/final` заполняются).
- [x] расчёт консистентный: `final = original − discount`, `discount ≤ original`, `final ≥ 0`.
- [x] commission считается от `paid − refunded` (с финальной суммы, т.к. гость платит `final`).
- [x] calculationJson содержит reward-снимок.
- [x] admin видит `total_discount_rub`, `top_programs`, `top_referral_codes` в overview.

## 12. Не сделано сознательно (out of scope)

- Multi-reward stacking (несколько reward на один booking).
- Cashback / возвраты reward при cancel.
- Wallet UI.
- Split payments.
- Отдельная модель B (discount absorbs commission).
- Автоматическая проверка `paidAmount == finalAmount` при `recordPayment` (можно вывести в post-merge runbook, сейчас — только прозрачность в calculationJson).

## 13. Runbook

**Scenario A: reward применился, но цена неизвестна на момент booking**
→ `booking.appliedRewardId` установлен, `original/discount/final = null`.
→ Админ делает `PATCH /bookings/:id/pricing { originalAmountRub: N }`.
→ Amounts пересчитываются, commission `calculationJson` обновляется.

**Scenario B: гость заплатил больше/меньше `finalAmountRub`**
→ commission считается от `paid`, не от `final`.
→ В `calculationJson.reward` видно расхождение.
→ Разбирается вручную через audit_log.

**Scenario C: reward применился ниже min_order**
→ `computeRewardDiscount` возвращает `applied:false, reason:"below_min_order"`.
→ Amounts остаются null. Reward **уже помечен used** — это by design (один-shot).
→ Если нужен откат — ручное восстановление в БД (не автоматизировано).

## 14. Env

```env
REFERRAL_REWARD_VALUE=5              # значение (5 для percent = 5%, или 1000 для amount в рублях)
REFERRAL_REWARD_VALUE_TYPE=percent   # percent | amount
REFERRAL_REWARD_CURRENCY=RUB
REFERRAL_MAX_BOOKINGS_PER_DAY=20
REFERRAL_REWARD_MIN_ORDER_RUB=0      # по умолчанию без минимума
```
