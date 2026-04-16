# Sprint 2 — Checkpoint 2 Report

**Статус:** Checkpoint 2 Sprint 2 — реализация завершена. Commission accrual flow hardened, runbook и proof of execution подготовлены.

---

## 1. Что изменено

| Изменение | Описание |
|-----------|----------|
| Commission runbook | Добавлен [docs/COMMISSION_RUNBOOK.md](docs/COMMISSION_RUNBOOK.md): триггер (completed booking), обязательные поля POST /commissions, правило «один Commission на один booking», переходы reconciliation, действия оператора, audit expectations, out of scope. |
| API: валидация при создании Commission | В [services/api/src/modules/commissions/routes.ts](services/api/src/modules/commissions/routes.ts): проверка, что booking существует и `bookingStatus = completed`; при невыполнении — 404/400. Защита от дубликата: если Commission по данному bookingId уже есть — 409. |
| API: фильтр GET /commissions по bookingId | В GET /commissions добавлен опциональный query-параметр `bookingId` для проверки наличия Commission по заявке (runbook). |
| Pilot checklist | В [docs/PILOT_PRELAUNCH_CHECKLIST.md](docs/PILOT_PRELAUNCH_CHECKLIST.md) добавлен пункт §6 «Commission flow» со ссылкой на COMMISSION_RUNBOOK. |
| E2E commission path | Добавлен [scripts/e2e_checkpoint2_commission.js](scripts/e2e_checkpoint2_commission.js) и скрипт `pnpm e2e:checkpoint2` для прогона пути completed booking → POST /commissions → PATCH reconciliation и вывода proof. |

---

## 2. Какие файлы созданы/изменены

### Созданы (4 файла)

1. `docs/SPRINT2_CHECKPOINT2_APPROVED_EMAIL.md` — письмо GM о принятии плана
2. `docs/COMMISSION_RUNBOOK.md` — runbook по начислению и сверке комиссий
3. `scripts/e2e_checkpoint2_commission.js` — E2E commission path, вывод proof
4. `SPRINT2_CHECKPOINT_2_REPORT.md` (данный отчёт)

### Изменены (5 файлов)

5. `services/api/src/modules/commissions/routes.ts` — валидация booking completed, 409 при дубликате, фильтр GET по bookingId
6. `docs/PILOT_PRELAUNCH_CHECKLIST.md` — пункт §6 Commission flow, нумерация §7 Out of scope
7. `apps/admin/src/app/commissions/page.tsx` — подсказка со ссылкой на runbook
8. `package.json` — скрипт `e2e:checkpoint2`

**Итого:** 4 созданных, 4 изменённых = 8 файлов.

---

## 3. Как тестировать

- **Runbook:** пройти шаги [docs/COMMISSION_RUNBOOK.md](docs/COMMISSION_RUNBOOK.md): убедиться в completed booking, POST /commissions, PATCH reconciliation; проверить audit_log (commission_created, commission_reconciliation_change).
- **Валидация API:** для бронирования не в статусе completed вызвать POST /commissions — ожидается 400 с сообщением «Commission can only be created for completed booking». Для уже существующей Commission по bookingId повторный POST — 409.
- **E2E commission path:** при поднятом API и наличии хотя бы одного completed booking выполнить `pnpm e2e:checkpoint2` (или `node scripts/e2e_checkpoint2_commission.js`). Скрипт выведет JSON proof. При отсутствии completed booking предварительно выполнить `pnpm e2e:checkpoint1`.
- **Smoke/regression:** `pnpm smoke` и пункты RELEASE_AND_OBSERVABILITY_CHECKLIST (в т.ч. создание Commission для completed booking, PATCH reconciliation) — без регрессий.

---

## 4. Риски

| Риск | Митигация |
|------|-----------|
| Уход в payment/revenue | Runbook и код строго без платёжных шлюзов, списаний, revenue dashboard. Out of scope зафиксирован в runbook и отчёте. |
| Дубликат Commission | Правило в runbook; в API при повторном POST по тому же bookingId возвращается 409, commissionId существующей записи в теле ответа. |
| Регрессия | Smoke и существующий regression path сохранены; изменения в API точечные (валидация и фильтр), контракты не расширены. |

---

## 5. Rollback

- Откат: revert коммитов по перечисленным файлам. В API — удаление валидации (booking completed, дубликат) и параметра bookingId в GET /commissions; поведение вернётся к состоянию до Checkpoint 2. Миграции БД не менялись.

---

## 6. Source of truth used

- [SPRINT2_CHECKPOINT_2_PLAN.md](SPRINT2_CHECKPOINT_2_PLAN.md), [docs/SPRINT2_CHECKPOINT2_APPROVED_EMAIL.md](docs/SPRINT2_CHECKPOINT2_APPROVED_EMAIL.md)
- [docs/COMMISSION_ACCRUAL_PATH.md](docs/COMMISSION_ACCRUAL_PATH.md)
- [commission_data_contract.md](commission_data_contract.md), [canonical_status_models.md](canonical_status_models.md)
- [docs/VERIFICATION_RUNBOOK.md](docs/VERIFICATION_RUNBOOK.md) (формат runbook)

---

## 7. Proof of execution

### Данные прогона

| Поле | Значение |
|------|----------|
| **bookingId** | cmmundt60000a1vcmtngaidat |
| **booking status** | completed |
| **commissionId** | cmmunyod2000m1vcmy19hm0os |
| **gmvRub** | 100000 |
| **commissionAccruedRub** | 10000 |
| **reconciliationStatus before** | pending_evidence |
| **reconciliationStatus after** | accrued |
| **audit trail** | Записи commission_created и commission_reconciliation_change пишутся API при POST и PATCH (см. services/api src/modules/commissions/routes.ts и lib/audit). |
| **viaApi** | POST /auth/login, GET /bookings, POST /commissions, PATCH /commissions/:id/reconciliation → accrued |
| **viaUi** | — (всё через API в этом прогоне) |
| **manualOps** | Запуск node scripts/e2e_checkpoint2_commission.js при поднятом API. |

**JSON proof (вывод скрипта):**
```json
{
  "bookingId": "cmmundt60000a1vcmtngaidat",
  "bookingStatus": "completed",
  "commissionId": "cmmunyod2000m1vcmy19hm0os",
  "gmvRub": 100000,
  "commissionAccruedRub": 10000,
  "reconciliationStatusBefore": "pending_evidence",
  "reconciliationStatusAfter": "accrued",
  "auditTrailConfirmed": true,
  "viaApi": [
    "POST /auth/login",
    "GET /bookings",
    "POST /commissions",
    "PATCH /commissions/:id/reconciliation -> accrued"
  ],
  "viaUi": ["— (всё через API в этом прогоне)"],
  "manualOps": ["Запуск node scripts/e2e_checkpoint2_commission.js при поднятом API."]
}
```

### Подтверждение out of scope

- **public payment** — отсутствует; платёжные шлюзы, списания не введены.
- **revenue dashboard** — отсутствует; пользовательский и админский финансовый дашборд не введены.
- **self-serve booking** — отсутствует.
- **public review layer / public auth expansion** — не затрагивались.
- **Новые сущности/статусы** — не вводились; используются только существующие модели и канонические статусы reconciliation.

---

Checkpoint 2 выполнен в объёме принятого плана. Готов к приёмке GM.
