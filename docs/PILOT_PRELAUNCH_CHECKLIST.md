# Pilot pre-launch checklist

Проверки перед запуском пилота. После выполнения всех пунктов — решение о go-live за GM.

**Rehearsal path и go/no-go:** один полный прогон и критерии блокеров описаны в [PILOT_GO_NOGO.md](PILOT_GO_NOGO.md). Операторская сводка по сценариям — [PILOT_OPERATOR_RUNBOOK.md](PILOT_OPERATOR_RUNBOOK.md).

---

## 1. Pilot config

- [ ] Pilot wedge и anchor locations зафиксированы в [startup_config.md](../startup_config.md) (§2). Текущий pilot: **Wakesurf-first**, anchor locations **Krasnodar, Dubai, Bodrum**.
- [ ] Pilot pre-launch preconditions (§3 startup_config) прочитаны и приняты.

---

## 2. Organizers and programs

- [ ] В системе 1–2 организатора в статусе **checked** или выше (верификация по [VERIFICATION_RUNBOOK.md](VERIFICATION_RUNBOOK.md)).
- [ ] В системе 3–10 программ в статусе **published** (admin: очередь программ, фильтр по publish_status).

---

## 3. Smoke

- [ ] Выполнен полный smoke по [RELEASE_AND_OBSERVABILITY_CHECKLIST.md](RELEASE_AND_OBSERVABILITY_CHECKLIST.md): GET /health, POST /auth/login, GET /organizers, GET /programs?all=1, GET /bookings, GET /incidents, GET /reviews, GET /commissions, GET /metrics/admin/funnel — все с Bearer, ответы 200 (или запуск `pnpm smoke` при поднятом API).

---

## 4. E2E path (organizer → program → publish → booking → completed)

- [ ] Создан организатор (POST /organizers или admin); сохранён organizer id.
- [ ] Создана программа (draft) с обязательными полями; добавлено минимум 1 медиа (POST /programs/:id/media).
- [ ] Заполнены все поля publish gate; PATCH /programs/:id/publish-status → publishStatus=published успешен.
- [ ] Создано бронирование (POST /bookings без auth): programId опубликованной программы, guestContact.
- [ ] Бронирование переведено в completed серией PATCH /bookings/:id/status по допустимым переходам (new → reviewed → … → completed).
- [ ] Итог: один полный E2E-path доказан; в отчёте Checkpoint 1 заполнен блок **Proof of execution** (organizer id, program id, publish status before/after, booking id, booking status progression).

---

## 5. Verification flow

- [ ] Выполнен минимум один раз по [VERIFICATION_RUNBOOK.md](VERIFICATION_RUNBOOK.md): добавлен evidence для организатора, выполнен переход listed → checked (или checked → verified при наличии отзывов); в audit_log есть запись verification_status.

---

## 6. Commission flow

- [ ] Выполнен минимум один раз по [COMMISSION_RUNBOOK.md](COMMISSION_RUNBOOK.md): для одного completed booking создана Commission (POST /commissions), при необходимости выполнен PATCH /commissions/:id/reconciliation; в audit_log есть записи commission_created и при смене статуса — commission_reconciliation_change.

---

## 7. Out of scope (не должно появиться)

- [ ] Нет public payment, self-serve booking, revenue UI, public review layer, public auth expansion.
- [ ] Новые сущности/статусы не вводились без согласования.

---

После прохождения всех пунктов — пилот считается готовым к go-live с точки зрения Checkpoint 1–3. Решение о запуске (go/no-go) — за GM; критерии и блокеры см. [PILOT_GO_NOGO.md](PILOT_GO_NOGO.md).
