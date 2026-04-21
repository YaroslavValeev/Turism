# MyWave Travel: статусная и событийная модель

Версия: 1.0  
Дата: 2026-04-17  
Статус: proposed for implementation

## 1) Что обнаружено

- Статусы уже есть в отдельных модулях (`programs`, `bookings`, `commissions`, `billing`), но нет единой матрицы переходов по всем ключевым сущностям.
- Автоматические переходы частично реализованы, но не стандартизированы как общая policy-модель.

## 2) Почему это важно

- Без единой матрицы невозможно сделать предсказуемую автоматизацию и корректную аналитику воронки.
- Event-first подход нужен для интеграций (Telegram, Google Sheets, уведомления, отчеты).

## 3) Какое решение предлагается

## A. Матрица статусов

### A1. Organizer

- Статусы: `draft` -> `submitted` -> `under_review` -> (`corrections_required` | `verified` | `rejected`) -> (`suspended` | `archived`)
- Auto transitions:
  - `submitted -> under_review` при создании review task.
  - `verified -> suspended` при критическом policy событии.
- Manual transitions:
  - `under_review -> corrections_required|verified|rejected`
  - `suspended -> verified|archived`

### A2. Program

- Статусы: `draft` -> `submitted` -> `moderation` -> (`changes_requested` | `approved`) -> `published` -> (`unpublished` | `archived`)
- Auto transitions:
  - `submitted -> moderation` после валидации обязательных полей.
  - `approved -> published` по policy (если allow_auto_publish=true) или manual publish.
  - `published -> unpublished` при блокирующем событии (например, organizer suspended).
- Manual transitions:
  - `moderation -> changes_requested|approved`
  - `published -> unpublished|archived`

### A3. Lead

- Статусы: `new` -> `delivered` -> `viewed` -> `contacted` -> `in_negotiation` -> (`booked` | `lost` | `cancelled`) -> `completed`
- Auto transitions:
  - `new -> delivered` при успешной доставке в primary или fallback канал.
  - `delivered -> viewed` при подтверждении просмотра (если канал поддерживает read receipt).
  - `booked -> completed` по завершению сделки.
- Manual transitions:
  - `contacted -> in_negotiation|lost|cancelled`
  - `in_negotiation -> booked|lost|cancelled`

### A4. Commission / Payment

- Статусы: `not_applicable` -> `pending_calculation` -> `invoice_issued` -> `awaiting_payment` -> (`paid` | `overdue` | `written_off`)
- Auto transitions:
  - `pending_calculation -> invoice_issued` при генерации счета.
  - `invoice_issued -> awaiting_payment` при отправке счета.
  - `awaiting_payment -> paid` при событии подтвержденной оплаты.
  - `awaiting_payment -> overdue` по истечении due date.
- Manual transitions:
  - `awaiting_payment|overdue -> paid|written_off`

## B. Событийная модель (MVP minimum)

- `organizer_submitted`
- `organizer_verified`
- `program_submitted`
- `program_changes_requested`
- `program_published`
- `lead_created`
- `lead_delivered`
- `lead_contacted`
- `deal_booked`
- `invoice_issued`
- `invoice_paid`
- `organizer_suspended`

Каждое событие содержит минимум:
- `event_id` (uuid)
- `event_type`
- `entity_type`
- `entity_id`
- `occurred_at`
- `trigger_mode` (`auto` | `manual`)
- `actor_id` (nullable для system events)
- `payload_json`
- `idempotency_key`

## C. Триггеры интеграций

- Telegram уведомления:
  - `lead_created`, `lead_delivered`, `invoice_issued`, `invoice_paid`, `organizer_suspended`
- Google Sheets sync (`Tourism_RUS.finance`):
  - `invoice_issued`
  - `invoice_paid`
  - manual payment status correction
  - `deal_booked`/`deal_cancelled`
- Внутренние статусные обновления:
  - `organizer_verified` может снимать ограничения публикации
  - `organizer_suspended` скрывает программы из витрины (auto unpublish)

## D. Контракт finance sync (минимальный)

- `organizer_id`, `organizer_name`
- `program_id`, `program_name`
- `lead_id` или `deal_id`
- `deal_status`
- `gross_amount`
- `commission_model`
- `commission_amount`
- `invoice_id`
- `invoice_status`
- `payment_date`
- `updated_at`

## 4) Какие файлы/модули/папки затрагиваются

- `services/api/src/modules/bookings/*`
- `services/api/src/modules/programs/*`
- `services/api/src/modules/organizers/*`
- `services/api/src/modules/commissions/*`
- `services/api/src/modules/billing/*`
- `services/api/src/modules/payments/*`
- `packages/shared-policy/*` (status transitions + event contracts)
- `packages/shared-schema/*` (status/event entities)

## 5) Что переносим как есть

- Текущие статусы publish/booking/commission как исходный baseline.
- Existing audit logging.

## 6) Что рефакторим

- Нейминг lead/booking и переходы приводим к единому контракту.
- Разводим ручные и автоматические переходы в явную матрицу.
- Добавляем idempotency и delivery/sync event logging.

## 7) Что откладываем

- Расширенные статусы для edge-cases после прохождения MVP QA.

## 8) Риски

- Конфликт старых enum и новых статус-контрактов.
- Дубли при синхронизации finance без idempotency.
- Ручные overrides, обходящие policy transitions.

## 9) Критерий готовности

- Есть status-matrix document и реализованный enforcement в API.
- Минимум 10 e2e сценариев переходов проходит стабильно.
- Все автоматические переходы оставляют event/audit след.

