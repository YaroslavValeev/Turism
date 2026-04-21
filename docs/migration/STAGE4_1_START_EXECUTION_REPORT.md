# Stage 4.1 — Start execution report

**Дата:** 2026-04-17  
**Статус:** **GO принят**; исполнение **начато** этим коммитом.

## 1. Старт

- Stage **4.1** переведён из «план/ADR» в **реализацию**: зафиксированы ADR-007 и ADR-008 как **Accepted**, добавлены первые изменения кода и тесты политики.
- Первичные модули: `packages/shared-policy` (commission), `services/api/src/modules/billing` (`deriveBookingStatus`, валидация billing-переходов комиссии), `services/api/src/modules/status-engine/transitionPolicy.test.ts`.

## 2. Первый implementation slice

**Сначала:** **commission / ADR-008** (зоны + раздельный billing-контур + проверки в `recalculate` / statement).

**Затем (следующий слайс):** углубление **ADR-007** — аудит отсутствия третьих писателей `bookingStatus`, при необходимости тонкая шлифовка доков/тестов конфликта operational vs billing-derived (без расширения списка direct writes).

## 3. Риск деградации (главный)

Наибольший риск — **legacy-данные комиссии** vs зональная policy: при **strict** PATCH вернёт 400; при soft — наблюдаемость через доменное событие и analytics. **Billing** не прерывает critical path (mismatch логируется, событие пишется, upsert продолжается). Регрессия: тесты policy + `bookingStatusCanonical`, QA по `STAGE4_1_QA_SCENARIOS.md`.

## Ссылки

- ADR-007, ADR-008 (`docs/decisions/`)
- `STAGE4_1_IMPLEMENTATION_PLAN.md`, `STAGE4_1_CODING_GUARDRAILS.md`, `STAGE4_1_DIRECT_STATUS_WRITES.md`

---

## Срез 2026-04-17 (controlled hardening, без расширения direct writes)

- Подтверждён аудит писателей `bookingStatus` (см. `STAGE4_1_BOOKING_STATUS_WRITERS_AUDIT.md`); список в `STAGE4_1_DIRECT_STATUS_WRITES.md` **не расширялся**.
- Добавлены **якоря ADR-007** в `bookings/routes` (bootstrap `new`), `applyBookingStatusTransition`, `billing/service` (payment/refund).
- Commission soft-mode: дублирование наблюдаемости в **analytics** (`commission_transition_violation_detected` в allowlist + `emitCommissionPolicyViolationAnalyticsBestEffort`), без смены default strict и без остановки billing.
- Регрессия: `bookingStatusCanonical.test.ts` (allowlist файлов + `deriveBookingStatus`).

---

## Re-audit 2026-04-23 (после reward recovery, без новых writers)

- Повторная сверка docs ↔ код: третий писатель `bookingStatus` **не** обнаружен; `STAGE4_1_DIRECT_STATUS_WRITES.md` без расширений.
- Уточнён аудит: `cancellationKind` / `cancellationReason` и `PATCH .../pricing` (и reward-amount update при create) — см. `STAGE4_1_BOOKING_STATUS_WRITERS_AUDIT.md` §4, §6.
- Guard-комментарии ADR-007 у нестатусных `booking.update` в `bookings/routes.ts` (pricing + post-create discount).

---

## Закрытие разработческого этапа (2026-04-23)

**Статус:** реализация и приёмка по контуру Stage 4.1 **завершены**; дальнейшая работа — **эксплуатация** (трафик, аналитика, наблюдение), а не доработка кода до нового scope.

**Зафиксировано в коде и документах:**

| Тема | Факт |
|------|------|
| Статусный backbone + ADR-007 / ADR-008 | Как в отчётах и ADR; прямые записи под контролем guard и аудитов |
| ADR-007 guard | `scripts/check-booking-status-writers.mjs`, npm `check:booking-status-adr007` |
| Platform mode | `PLATFORM_MODE` (`launch` \| `monetization`) в `@mywave/config`; billing сохраняет расчёты, в launch финансовое требование к комиссии = 0; `GET /public/platform` |
| UI | `apps/web`: `/organizers/analytics` (views / clicks / leads / leadAttribution), `/organizers/billing` (launch copy), `/admin/platform` (режим по admin JWT) |
| Сборка | `pnpm --filter api build`, `pnpm --filter web build` — зелёные |
| QA | [`../qa/PLATFORM_MODE_QA.md`](../qa/PLATFORM_MODE_QA.md), маршруты в [`../qa/BROWSER_CHECK_ROUTES.md`](../qa/BROWSER_CHECK_ROUTES.md) |

**Не делать без отдельного решения:** включать `COMMISSION_RECONCILIATION_STRICT_MODE` в проде; менять policy/billing/статусную систему «по ходу» — решение по strict после периода наблюдения и [`STAGE4_1_COMMISSION_VIOLATION_SNAPSHOT.md`](./STAGE4_1_COMMISSION_VIOLATION_SNAPSHOT.md).

**Навигатор:** [`../PROJECT_SOURCEBOOK.md`](../PROJECT_SOURCEBOOK.md) (версия от 2026-04-23).
