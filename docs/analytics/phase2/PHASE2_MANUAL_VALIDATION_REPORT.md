# Manual Validation Report — Analytics MVP spine (Phase 1→2 bridge)

**Дата:** 2026-04-15  
**Среда:** локальный прогон репозитория; API smoke (`pnpm smoke`) против поднятого `BASE_URL` (по умолчанию `http://localhost:3001`).  
**Важно:** полный E2E с реальной БД/миграциями на машине валидатора может отличаться — ниже зафиксированы **ожидаемое поведение по коду** и **наблюдения**, где инфраструктура неполная.

---

## Сценарий 1 — card view → lead → booking

| Шаг | Ожидаемое поведение | Фактически (по коду/инструментированию) | Gaps / caveats |
|-----|---------------------|----------------------------------------|-----------------|
| Открытие `/program/[id]` | При analytics consent: `page_view` + `view_item` (GA/YM + опционально ingest через `/api/analytics/events`) | Реализовано в `apps/web/src/app/program/[id]/page.tsx` + `trackProductEvent` | Без consent — no-op; без `INTERNAL_ANALYTICS_TOKEN` на Next сервере — ingest не уйдёт в API (503 прокси) |
| Lead | Публичный intake → `public_organizer_intakes` (не analytics) | Отдельный поток | Связка lead↔program для атрибуции пока не в analytics store |
| Booking | `POST /bookings` → `booking_created` emit (если `ANALYTICS_ENABLED=1`) | Реализовано в `bookings/routes.ts` | `guestContact` не эмитится (правильно), но нет `traveler_id` для когорт |

**Итог:** продуктовая воронка **частично наблюдаема** (views + booking_created), но **сквозная атрибуция view→booking** требует Phase 2 attribution + lead linkage.

---

## Сценарий 2 — payment → commission → marts → admin dashboard

| Шаг | Ожидаемое | Фактически | Gaps |
|-----|-----------|------------|------|
| Payment | `payment_recorded` + пересчёт комиссии | `billing/service.ts` | Нужен `ANALYTICS_ENABLED=1` |
| Commission | `commission_accrued/reversed` | `billing/service.ts` | Диспуты/промежуточные статусы — расширять словарём |
| Marts refresh | `POST /internal/analytics/refresh` | SQL функция в миграции | Если миграции не применены — marts отсутствуют |
| Admin dashboard | `GET /metrics/founder|billing/daily` | Реализовано | **Исправление:** если MV нет в БД, API возвращает `200` с `rows=[]` и `warning=analytics_marts_missing` (раньше был 500 и падал smoke) |

**Итог:** цепочка корректна при включённой аналитике и применённых миграциях; без миграций UI должен показывать empty state + warning (теперь поддержано на API).

---

## Сценарий 3 — partial refund → commission correction

| Шаг | Ожидаемое | Фактически | Gaps |
|-----|-----------|------------|------|
| Refund | `refund_recorded` | `billing/service.ts` | — |
| Commission | пересчёт + `commission_reversed/accrued` | `recalculateCommissionForBooking` | Нужно следить, чтобы статус `disputed` не давал ложных «reversed» сигналов в аналитике (см. metric caveats) |

---

## Сценарий 4 — contract download → signed → billing connected

| Шаг | Ожидаемое | Фактически | Gaps |
|-----|-----------|------------|------|
| Download | frontend `contract_download_*` (taxonomy) | **planned** в продуктовых экранах (не весь UI инструментирован) | Нужно добавить emit на реальные кнопки скачивания |
| Signed | `contract_signed` | `organizers/routes.ts` на PATCH контракта | `contract_version` сейчас константа `v1` — улучшить, когда появится версионирование |
| Billing connected | `billing_connected` | PATCH billing-profile | Срабатывает на переход в connected |

---

## Сценарий 5 — analytics disabled → no writes

| Шаг | Ожидаемое | Фактически | Gaps |
|-----|-----------|------------|------|
| `ANALYTICS_ENABLED=0` | Ingestion: `skipped`; backend emit: no-op | `ingestSingleEvent` returns skipped; `emitBackendAnalyticsEventBestEffort` returns early | Важно: web всё ещё может слать в GA4 при consent — это ожидаемо (маркетинговый контур) |

---

## Smoke / автоматические проверки

- `pnpm --filter api test` (vitest) — зелёный на момент подготовки Phase 2 docs.
- `pnpm smoke` — после фикса отсутствующих MV должен проходить даже без marts (с предупреждением в JSON).

---

## Рекомендованные next checks (ручные)

1. Применить миграции на staging → убедиться, что `warning` исчезает и строки marts непустые.
2. Прогнать `pnpm smoke:analytics` с `INTERNAL_ANALYTICS_TOKEN`.
3. Пройти UI админки `/analytics/founder` и `/analytics/billing` с реальным токеном.
