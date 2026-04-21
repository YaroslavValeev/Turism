# Idempotency Contract: Delivery + Finance Sync

Версия: 1.0  
Дата: 2026-04-17  
Статус: required before stage 2/5 implementation

## 1. Область применения

- Telegram delivery attempts для `Booking`/операторских уведомлений.
- Google Sheets sync для `Tourism_RUS.finance`.

## 2. Canonical idempotency key

Формат:

`<domain>:<event_type>:<entity_id>:<version_or_status>`

Примеры:
- `delivery:lead_delivered:booking_123:attempt_1`
- `finance:invoice_issued:invoice_777:status_invoiced`
- `finance:invoice_paid:invoice_777:status_paid`

Правило:
- один key = один side-effect в external system.
- повтор с тем же key должен завершаться `already_processed`.

## 3. Retry policy

- `max_attempts`: 5
- Backoff: `2s, 5s, 15s, 60s, 300s`
- Timeout одного вызова: 10s
- На 5-й неудаче запись уходит в DLQ.

## 4. Duplicate prevention

- Перед отправкой проверяем `delivery_log`/`sync_log` по `idempotency_key`.
- Если `status in (success, acknowledged)` -> не отправляем повторно.
- Если `status = failed_retryable` и attempts < max_attempts -> retry.

## 5. Dead-letter and reconciliation

- DLQ сущности:
  - `external_target` (`telegram` | `google_sheets`)
  - `idempotency_key`
  - `payload_hash`
  - `error_code`, `error_message`
  - `attempt_count`
  - `last_attempt_at`
- Manual reconciliation:
  - админ видит DLQ queue,
  - может запустить `replay`,
  - replay сохраняет новый `attempt_no`, но тот же `idempotency_key`.

## 6. Правила повторной отправки

- Запрещено отправлять "новое" событие без смены version/status в key.
- Для исправления payload используем:
  - `supersede` событие с новым ключом и ссылкой на старый.

## 7. Error logging и восстановление

- Логируем минимум:
  - `event_id`, `idempotency_key`, `target`, `payload_hash`,
  - `attempt_no`, `result`, `error_class`, `timestamp`.
- Recovery playbook:
  1. проверить причину отказа,
  2. исправить конфигурацию/данные,
  3. replay из DLQ,
  4. подтвердить отсутствие дублей в target.

## 8. Критерий готовности

- Для Telegram и Sheets есть единый idempotency middleware/utility.
- Есть integration tests на duplicate suppression.
- Есть DLQ UI/API + ручной replay.

