# Event Taxonomy (MyWave Analytics) — v1

Цель: единый **allowlist** имён событий + минимальный контракт полей.

## Общий envelope (все события)

Обязательные поля на ingestion:

- `event_name` (string, allowlist)
- `event_version` (int, default 1)
- `event_source` (`frontend` | `backend` | `system`)
- `event_time` (ISO-8601)
- `idempotency_key` (string, unique)

Рекомендуемые поля (если применимо):

- `session_id`
- `user_role` (`traveler` | `organizer` | `admin` | `system`)
- `page_type` (для web)
- `program_id`, `organizer_id`, `discipline`, `region`
- `verified_status` (для organizer-scoped событий)
- `traffic_source` (utm/referrer классификация; без raw URL если содержит PII)
- `lead_id`, `booking_id`, `statement_id`, `payment_id`, `refund_id`, `commission_id`
- `contract_version` (например `v1`)
- `payment_status`
- `gross_amount`, `net_amount`, `refund_amount`, `commission_rate`, `commission_amount` (int rub / bps по правилам ниже)

`properties_json`:

- только **не-PII** ключи
- запрещено: email/phone/full name/raw guest contact/free text с PII

### Нормализация денег

- суммы в **целых рублях** (`Int`)
- `commission_rate` в **bps** (например 300 = 3%)

## Allowlist: Frontend events

События отправляются **только при consent** (см. privacy doc).

- `page_view`
- `view_item_list`
- `select_item`
- `view_item`
- `search`
- `apply_filter`
- `save_program`
- `share_program`
- `open_chat`
- `send_chat_message`
- `contract_view_block`
- `contract_download_pdf`
- `contract_download_docx`
- `contract_acknowledged`
- `organizer_apply_started`
- `organizer_apply_submitted`
- `organizer_contract_downloaded`
- `organizer_profile_completed`
- `program_submit_started`
- `program_submitted`

### Примеры (frontend)

`page_view`:

```json
{
  "event_name": "page_view",
  "event_version": 1,
  "event_source": "frontend",
  "event_time": "2026-04-15T12:34:56.000Z",
  "idempotency_key": "fe:page_view:session_abc:/organizers/program:2026041512",
  "session_id": "session_abc",
  "user_role": "organizer",
  "page_type": "organizers_program",
  "traffic_source": "organic"
}
```

`contract_view_block` / `contract_download_*` / `contract_acknowledged` (воронка договора):

Обязательно: `session_id`, `user_role`, `contract_version`, `properties_json` с полями `area` (`organizers`), `page` (`program`|`verification`), `file_type` (`none` для view/ack, `pdf`|`docx` для скачивания), `component` (например `ContractDownloadBlock`). `idempotency_key`: для view — один на сессию+page+version; для каждого скачивания — уникальный UUID на клик; для ack — один на успешный клик (клиент также блокирует повтор по sessionStorage).

`contract_download_pdf`:

```json
{
  "event_name": "contract_download_pdf",
  "event_version": 1,
  "event_source": "frontend",
  "event_time": "2026-04-15T12:34:56.000Z",
  "idempotency_key": "fe:contract_download_pdf:uuid-per-click",
  "session_id": "session_abc",
  "user_role": "organizer",
  "contract_version": "v1",
  "properties_json": {
    "area": "organizers",
    "page": "verification",
    "file_type": "pdf",
    "component": "ContractDownloadBlock"
  }
}
```

## Allowlist: Backend / system events

Эти события **обязаны** эмититься на сервере (источник истины).

- `lead_created`
- `lead_qualified`
- `lead_disqualified`
- `organizer_contacted_lead`
- `booking_created`
- `booking_confirmed`
- `booking_canceled`
- `payment_recorded`
- `refund_recorded`
- `commission_accrued`
- `commission_reversed`
- `statement_generated`
- `invoice_paid`
- `organizer_verified`
- `organizer_trusted`
- `contract_signed`
- `billing_connected`
- `complaint_created`
- `complaint_resolved`
- `review_submitted`
- `nps_submitted`

### Примеры (backend)

`payment_recorded`:

```json
{
  "event_name": "payment_recorded",
  "event_version": 1,
  "event_source": "backend",
  "event_time": "2026-04-15T12:34:56.000Z",
  "idempotency_key": "be:payment_recorded:pay_123",
  "booking_id": "bkg_123",
  "organizer_id": "org_456",
  "program_id": "prg_789",
  "payment_id": "pay_123",
  "payment_status": "confirmed",
  "gross_amount": 100000,
  "net_amount": 100000,
  "commission_rate": 300
}
```

`commission_reversed`:

```json
{
  "event_name": "commission_reversed",
  "event_version": 1,
  "event_source": "backend",
  "event_time": "2026-04-15T12:40:00.000Z",
  "idempotency_key": "be:commission_reversed:cm_999:reversed",
  "booking_id": "bkg_123",
  "organizer_id": "org_456",
  "program_id": "prg_789",
  "commission_id": "cm_999",
  "net_amount": 0,
  "commission_amount": 0,
  "commission_rate": 300
}
```

## Правила эволюции

- Любое изменение семантики → **увеличить `event_version`**
- Запрещено переиспользовать `event_name` под другую семантику
- Новые события добавляются только через PR + обновление этого файла
