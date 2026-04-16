# Commission runbook (accrual & reconciliation)

Пошаговая инструкция для ops: начисление комиссии от completed booking и сверка. Source of truth: [COMMISSION_ACCRUAL_PATH.md](COMMISSION_ACCRUAL_PATH.md), [commission_data_contract](../commission_data_contract.md).

---

## 1. Триггер начисления

Комиссия начисляется **только** после того, как бронирование переведено в статус **completed**.

- Триггер: наличие бронирования с `bookingStatus = completed`.
- Перед созданием Commission оператор убеждается, что сделка завершена (в admin или через GET /bookings/:id — поле `bookingStatus` = completed).
- Никакой payment flow, списаний, автоматических расчётов с гостя/организатора в этом потоке нет.

---

## 2. Обязательные поля при создании Commission (POST /commissions)

| Поле | Обязательность | Описание |
|------|----------------|----------|
| bookingId | обязательно | id бронирования в статусе completed |
| organizerId | обязательно | id организатора |
| programId | обязательно | id программы |
| gmvRub | обязательно | фактический объём сделки (руб) |
| commissionRatePct | опционально | процент комиссии; если задан, API считает accrued из gmvRub |
| commissionFixedRub | опционально | фиксированная часть; добавляется к расчёту |
| commissionAccruedRub | опционально | можно передать явно; иначе API считает: round(gmvRub * rate/100) + fixed |
| reconciliationStatus | опционально | по умолчанию `pending_evidence`; допустимо сразу `accrued` по процессу |

**Правило (один Commission на один booking):** на один и тот же `bookingId` не создавать вторую запись Commission. При попытке создать дубликат API возвращает 409 (см. контракт API). Операционно: перед POST проверить GET /commissions?bookingId=… или очередь комиссий в admin.

---

## 3. Reconciliation status (допустимые переходы)

Канонические статусы сверки (источник: `packages/shared-types`, `canonical_status_models`):  
`pending_evidence` | `accrued` | `invoiced` | `partially_paid` | `paid` | `disputed` | `written_off`.

### Допустимые переходы (canonical)

Любой переход только на один из перечисленных статусов. Рекомендуемый линейный путь:  
`pending_evidence` → `accrued` → `invoiced` → `partially_paid` → `paid`.  
Из любого статуса допустимы переходы в `disputed` или `written_off` по решению ops.

| Из | Допустимо в |
|----|-------------|
| pending_evidence | accrued, disputed, written_off |
| accrued | invoiced, disputed, written_off |
| invoiced | partially_paid, paid, disputed, written_off |
| partially_paid | paid, disputed, written_off |
| paid | — (финальный) |
| disputed | — (требует отдельного процесса) |
| written_off | — (финальный) |

API не проверяет цепочку переходов жёстко; оператор руководствуется runbook и канонической моделью.

| Статус | Смысл |
|--------|--------|
| pending_evidence | Создана запись, доказательства/подтверждение ещё собираются |
| accrued | Комиссия начислена, учтена |
| invoiced | Счёт выставлен организатору |
| partially_paid | Частичная оплата получена |
| paid | Оплата получена |
| disputed | Оспорена |
| written_off | Списана (безнадёжная) |

Смена статуса: **PATCH /commissions/:id/reconciliation** с телом `{ "reconciliationStatus": "accrued" }` (или другой допустимый статус). Дополнительно можно передать `commissionCollectedRub`, `invoiceStatus`, `paymentReceivedDate` при необходимости. Только с admin Bearer.

---

## 4. Operator actions (пошагово)

### Создание Commission (completed booking → Commission)

1. Убедиться, что бронирование в статусе **completed**: GET /bookings (или очередь в admin), найти заявку с `bookingStatus: "completed"`. Записать `bookingId`, `organizerId`, `programId`.
2. Проверить, что по этому `bookingId` ещё нет Commission: GET /commissions и фильтр по booking или просмотр очереди в admin.
3. Подготовить данные: gmvRub (фактическая сумма сделки), при необходимости commissionRatePct / commissionFixedRub.
4. Выполнить **POST /commissions** (admin Bearer), body:
   ```json
   {
     "bookingId": "<id>",
     "organizerId": "<id>",
     "programId": "<id>",
     "gmvRub": 100000,
     "commissionRatePct": 10
   }
   ```
5. Ответ 201: запись Commission создана, `reconciliationStatus` = pending_evidence (или переданный). В audit_log пишется запись `commission_created`.
6. Проверить audit_log: entityType=commission, changedField=commission_created, newValue=reconciliationStatus.

### Смена reconciliation (pending_evidence → accrued и далее)

1. Открыть Commission в admin (очередь комиссий или GET /commissions/:id).
2. Выполнить **PATCH /commissions/:id/reconciliation**, body например: `{ "reconciliationStatus": "accrued" }`.
3. Проверить audit_log: entityType=commission, changedField=commission_reconciliation_change, oldValue/newValue.

---

## 5. Audit expectations

При создании Commission в audit_log должна появиться запись:

| Поле | Ожидание |
|------|----------|
| entityType | commission |
| entityId | id созданной Commission |
| changedField | commission_created |
| newValue | reconciliationStatus (например pending_evidence) |
| changedBy | id admin-пользователя |
| reason | commission accrual |

При смене reconciliation status:

| Поле | Ожидание |
|------|----------|
| entityType | commission |
| entityId | id Commission |
| changedField | commission_reconciliation_change |
| oldValue | предыдущий reconciliationStatus |
| newValue | новый reconciliationStatus |
| changedBy | id admin-пользователя |
| reason | reconciliation update |

Просмотр: Prisma Studio (audit_log) или запрос к БД. Без записей в audit операция считается несоответствующей runbook.

---

## 6. Что не входит (out of scope)

- Платёжные шлюзы, списания, приём оплаты от пользователей.
- Revenue dashboard (пользовательский или админский финансовый дашборд).
- Публичное отображение сумм комиссий.
- Автоматический cron/worker для создания Commission (контракт и runbook готовы для его добавления позже).
- Новые сущности, новые статусы reconciliation.

---

## 7. Где выполнять

- **API:** все запросы с заголовком Authorization: Bearer &lt;token&gt; (токен через POST /auth/login).
- **Admin UI:** очередь комиссий (/commissions); создание Commission и PATCH reconciliation через API (curl/Postman или при необходимости кнопка/форма в admin со ссылкой на runbook).
- **Ссылка для ops:** данный документ — [docs/COMMISSION_RUNBOOK.md](COMMISSION_RUNBOOK.md).
