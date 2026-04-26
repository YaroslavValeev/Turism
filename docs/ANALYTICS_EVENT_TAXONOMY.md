# Канон имён аналитических событий (MyWave)

**Источник истины (allowlist):** `services/api/src/modules/analytics/validators.ts` — константа `ALLOWED_EVENT_NAMES`.

События, которых **нет** в allowlist, при ingest в БД **отклоняются** (см. `NOT_ON_ALLOWLIST`).

## Категории

| Группа | События (примеры) | Источник |
|--------|-------------------|----------|
| Навигация/каталог | `page_view`, `view_item`, `view_item_list`, `search`, `apply_filter`, `select_item` | frontend |
| Мосты/программа | `share_program`, `open_chat`, `send_chat_message` | frontend |
| Заявки | `program_submitted`, `program_submit_started` | frontend |
| Орг. онбординг | `organizer_apply_started`, `organizer_apply_submitted`, `organizer_profile_completed`, `organizer_contract_downloaded` | frontend |
| Договоры/контракт (UI) | `contract_view_block`, `contract_download_pdf`, `contract_download_docx`, `contract_acknowledged` | frontend / тесты |
| Лиды | `lead_created`, `lead_qualified`, `lead_disqualified`, `organizer_contacted_lead` | backend / система |
| Брони | `booking_created`, `booking_confirmed`, `booking_canceled` | backend |
| Платежи/комиссии | `payment_recorded`, `refund_recorded`, `commission_accrued`, `commission_reversed` | backend |
| Биллинг | `statement_generated`, `invoice_paid` | backend |
| Доверие/верификация | `organizer_verified`, `organizer_trusted`, `contract_signed`, `billing_connected` | backend |
| Качество | `complaint_*`, `review_submitted`, `nps_submitted` | mixed |

## Версионирование

- Поле `event_version` (целое) в теле события — **обязательно** при смене схемы properties.
- Новый тип события: сначала PR в `ALLOWED_EVENT_NAMES` + обновление этого документа.

## Согласованность web ↔ API

- Клиент: `apps/web/src/lib/analytics/client.ts` (`trackProductEvent`).
- Сервер: `emitBackendAnalyticsEventBestEffort` в модулях `bookings`, `billing`, `organizers` и т.д.

**Полный перечень** смотрите в коде `ALLOWED_EVENT_NAMES` (не дублируем длинные списки, чтобы не расходиться с allowlist).
