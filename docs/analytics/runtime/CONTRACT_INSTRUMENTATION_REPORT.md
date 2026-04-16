# Contract instrumentation — краткий отчёт (runtime)

## Где стоят события

| Событие | Компонент | Триггер |
|---------|-----------|---------|
| `contract_view_block` | [`apps/web/src/components/organizers/ContractDownloadBlock.tsx`](../../apps/web/src/components/organizers/ContractDownloadBlock.tsx) | `IntersectionObserver`, порог видимости ≥ 0.4 |
| `contract_download_pdf` | тот же блок | кнопка «Скачать договор PDF» |
| `contract_download_docx` | тот же блок | кнопка «Скачать договор DOCX» |
| `contract_acknowledged` | тот же блок | кнопка «Ознакомился с условиями» (отдельно от скачивания) |

Страницы с одинаковым поведением:

- [`apps/web/src/app/organizers/program/page.tsx`](../../apps/web/src/app/organizers/program/page.tsx) — `page="program"`
- [`apps/web/src/app/organizers/verification/page.tsx`](../../apps/web/src/app/organizers/verification/page.tsx) — `page="verification"`

## Параметры

**Топ-уровень ingestion:** `event_name`, `event_version`, `event_source`=`frontend`, `event_time`, `idempotency_key`, `session_id`, `user_role`, `contract_version`, опционально `organizer_id`.

**`properties_json`:** `area`=`organizers`, `page` (`program`|`verification`), `file_type` (`none`|`pdf`|`docx`), `component`=`ContractDownloadBlock`.

Персональные данные не передаются. Валидация на API: [`services/api/src/modules/analytics/validators.ts`](../../../services/api/src/modules/analytics/validators.ts) — `validateContractInstrumentationEvent`.

## Dedupe / отсутствие двойного fire

1. **View:** `sessionStorage` ключ `mw_contract_view_block:{page}:{contractVersion}` до отправки; серверный `idempotency_key` = `fe:contract_view_block:{sessionId}:{page}:{contractVersion}`.
2. **Скачивание:** уникальный `idempotency_key` на клик (`crypto.randomUUID()`); `useRef` блокирует параллельный второй вызов обработчика на время одной операции.
3. **Ack:** `sessionStorage` `mw_contract_acknowledged:{page}:{contractVersion}` + уникальный idempotency на успешный клик; кнопка disabled после отправки.

Клиентская отправка только при consent: [`apps/web/src/lib/analytics/client.ts`](../../apps/web/src/lib/analytics/client.ts) (`getAnalyticsConsent() === "accepted"`).

## Проверка ingestion

- Прокси: [`apps/web/src/app/api/analytics/events/route.ts`](../../apps/web/src/app/api/analytics/events/route.ts) → `POST /internal/analytics/events` с `INTERNAL_ANALYTICS_TOKEN`.
- Ручная проверка: включить аналитику и токен в `.env`, принять cookies/consent на web, открыть блок → в БД `analytics_events` появляются строки с ожидаемыми `eventName` и `propertiesJson`.
