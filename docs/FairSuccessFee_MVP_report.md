# Fair Success Fee 3% — MVP billing contour implemented

## Что реализовано

- Введен централизованный billing flow для ручной фиксации оплат и возвратов.
- Добавлены API контуры: `POST /payments`, `POST /refunds`, `POST /commissions/:id/recalculate`, `POST /billing/statements/generate`, `PATCH /billing/statements/:id/status`.
- Расширены organizer billing endpoints: `GET/PATCH /organizers/:id/billing-profile`, `GET/POST/PATCH /organizers/:id/contracts`, `GET /organizers/:id/privileges`.
- Добавлены админские экраны для платежей, возвратов и statements, а также обновлена витрина комиссий под net-модель.
- Добавлен organizer read-only MVP экран по договору, реквизитам и статусу привилегий.

## Как считается комиссия

- База комиссии: `commissionBaseRub = paidAmountRub - refundedAmountRub`, не меньше 0.
- Ставка по умолчанию: `commissionRateBps = 300` (3%).
- Сумма комиссии: `commissionAmountRub = round(commissionBaseRub * commissionRateBps / 10000)`.
- При полном возврате комиссия переводится в `reversed` и становится `0`.

## Какие сценарии проверены

- Оплата 100 000 ₽ -> комиссия 3 000 ₽.
- Доп. частичная оплата 50 000 ₽ -> комиссия 4 500 ₽.
- Частичный возврат 20 000 ₽ -> комиссия 3 900 ₽.
- Полный возврат остатка -> `reversed` + комиссия `0`.
- Ручной пересчет через `POST /commissions/:id/recalculate`.
- Генерация statement по eligible комиссиям (`accrued/approved`) до возвратов, чтобы зафиксировать снимок net/комиссии на момент начисления.

## Что видно админу

- Раздел `Комиссии`: net-база, ставка, сумма комиссии, статус сверки.
- Раздел `Платежи`: список ручных оплат.
- Раздел `Возвраты`: список ручных возвратов.
- Раздел `Statements`: месячные отчеты и текущий invoice статус.
- Карточка организатора: onboarding/billing/privilege статусы и billing-contract endpoints.

## Что видно организатору

- MVP read-only страница по ID организатора:
  - статус onboarding;
  - статус billing;
  - статус привилегий;
  - статус договора;
  - основные реквизиты billing профиля.

## Ограничения MVP

- Комиссия начисляется только с `paid_amount - refunded_amount`.
- `Booking` сохранен для совместимости и не переименован.
- Оплаты/возвраты фиксируются вручную админом как off-platform факт.
- Auto-publish, online-payment и subscriptions не внедрялись.
- Attribution window по умолчанию: `60` дней.

## Следующие шаги

- Добавить защищенный organizer auth для read-only billing кабинета.
- Ввести idempotency key для `POST /payments` и `POST /refunds`.
- Добавить инвариантные интеграционные тесты на конкурентные обновления booking/commission.
- Подключить уведомления организатора по статусам `statement -> invoiced/paid/disputed`.
