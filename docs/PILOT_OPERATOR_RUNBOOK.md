# Pilot operator runbook (сводка)

Единая точка входа для оператора пилота: сценарии обработки заявок, верификации, отзывов, инцидентов и комиссий. Детали — в указанных runbook и политиках.

---

## 1. Обработка заявок (booking handling)

- **Очередь:** Admin → Заявки (или GET /bookings с Bearer).
- **Жизненный цикл:** new → reviewed → sent_to_organizer → contacted → offer_sent → booked → paid_off_platform → completed (см. [canonical_status_models.md](../canonical_status_models.md)).
- **Действия:** Для каждой заявки доступны допустимые следующие статусы (nextStatuses). Смена через PATCH /bookings/:id/status с телом `{ "bookingStatus": "..." }`. Каждая смена пишется в audit_log.
- **Когда эскалировать:** Зависание в статусе (организатор не отвечает), гость отменил, спор по оплате — завести Incident и при необходимости перевести заявку в cancelled_* или оставить в текущем статусе по решению ops.
- **Детали:** E2E path описан в [PILOT_PRELAUNCH_CHECKLIST.md](PILOT_PRELAUNCH_CHECKLIST.md) §4; правила статусов — в [canonical_status_models.md](../canonical_status_models.md).

---

## 2. Verification gap (верификация организатора)

- **Проблема:** Нет evidence → нельзя перевести listed → checked. Организатор не присылает документы или отказ.
- **Действия:** Запросить evidence по каналу коммуникации; добавить в систему через POST /organizers/:id/evidence при получении. Если отказ или нет ответа — оставить в listed или перевести в paused/rejected по решению ops (PATCH /organizers/:id/verification-status). В audit фиксируется смена.
- **Детали:** [VERIFICATION_RUNBOOK.md](VERIFICATION_RUNBOOK.md) — evidence requirements, переходы listed→checked→verified→trusted_by_platform, missing evidence logic.

---

## 3. Обработка отзывов (review) и исключения

- **После тура:** при переводе заявки в `completed` создаётся запись `review_requests` (очередь просьбы об отзыве). Реальная отправка письма гостю — после вызова **`POST /reviews/requests/process`** или **`POST /jobs/run-review-reminders`** (admin Bearer); нужны SMTP и **`PUBLIC_WEB_BASE_URL`**; e-mail берётся из строки контакта заявки (`guestContact`). Подробности: [REVIEW_FLOW_MANUAL_VALIDATION_STAGE.md](analytics/runtime/REVIEW_FLOW_MANUAL_VALIDATION_STAGE.md), [AUTO_REVIEW_PROD_ROLLOUT_PLAN.md](analytics/runtime/AUTO_REVIEW_PROD_ROLLOUT_PLAN.md).
- **Очередь модерации:** Admin → Отзывы (GET /reviews). Модерация: PATCH /reviews/:id/moderation, body `{ "moderationStatus": "approved" | "rejected" }`.
- **Исключения:** Оскорбления, персональные данные третьих лиц, спам → rejected. Сомнения → оставить pending или rejected. Approved не течёт в публичный слой (публичного слоя отзывов пока нет).
- **Детали:** [REVIEW_PUBLISH_POLICY.md](REVIEW_PUBLISH_POLICY.md).

---

## 4. Инциденты (incident) и эскалация

- **Очередь:** Admin → Инциденты (GET /incidents). Статусы: open → triaged → investigating → waiting_on_organizer | waiting_on_user → resolved | escalated | closed (см. [canonical_status_models.md](../canonical_status_models.md)).
- **Действия:** Создать инцидент при жалобе/споре; переводить статусы по мере разбора. При severity high/critical — не переводить организатора в verified до resolved/closed. Эскалация — по решению ops (статус escalated или отдельный процесс).
- **Исключения:** Зависание в waiting_* — напомнить стороне, при необходимости эскалировать или закрыть с пометкой.

---

## 5. Комиссии (commission) и исключения

- **Правило:** Одна Commission на один completed booking. Создание только для бронирований со статусом completed.
- **Очередь:** Admin → Комиссии (GET /commissions). Создание: POST /commissions (bookingId, organizerId, programId, gmvRub, при необходимости rate/fixed). Смена сверки: PATCH /commissions/:id/reconciliation.
- **Исключения:** Дубликат по bookingId — API вернёт 409, не создавать вторую запись. Оспаривание комиссии — перевести в disputed; безнадёжное взыскание — written_off. Детали переходов — в [COMMISSION_RUNBOOK.md](COMMISSION_RUNBOOK.md), [canonical_status_models.md](../canonical_status_models.md) §5.

---

## 6. Где что искать

| Область | Документ |
|---------|----------|
| Верификация организатора | [VERIFICATION_RUNBOOK.md](VERIFICATION_RUNBOOK.md), [VERIFICATION_LADDER.md](VERIFICATION_LADDER.md) |
| Комиссии и сверка | [COMMISSION_RUNBOOK.md](COMMISSION_RUNBOOK.md), [COMMISSION_ACCRUAL_PATH.md](COMMISSION_ACCRUAL_PATH.md) |
| Отзывы, модерация | [REVIEW_PUBLISH_POLICY.md](REVIEW_PUBLISH_POLICY.md), [REVIEW_FLOW_MANUAL_VALIDATION_STAGE.md](analytics/runtime/REVIEW_FLOW_MANUAL_VALIDATION_STAGE.md) |
| Локальная разработка (web + API + Postgres) | [development/LOCAL_WEB_API.md](development/LOCAL_WEB_API.md) |
| Статусы (booking, organizer, program, incident, commission) | [canonical_status_models.md](../canonical_status_models.md) |
| Pre-launch проверки и go/no-go | [PILOT_PRELAUNCH_CHECKLIST.md](PILOT_PRELAUNCH_CHECKLIST.md), [PILOT_GO_NOGO.md](PILOT_GO_NOGO.md) |
| Конфиг пилота | [startup_config.md](../startup_config.md) |
