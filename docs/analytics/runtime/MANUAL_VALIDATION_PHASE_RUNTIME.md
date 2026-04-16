# Manual validation — runtime analytics phase

Дата: 2026-04-15  
Окружение: local / CI (без prod данных).

## 1. Contract instrumentation

- [ ] Web: страницы `/organizers/program`, `/organizers/verification` — при **accepted** consent появляется блок договора.
- [ ] Скролл до блока → одно событие `contract_view_block` (повторный скролл в той же сессии не дублирует).
- [ ] Клик PDF / DOCX → по одному `contract_download_pdf` / `contract_download_docx` на клик; файл скачивается.
- [ ] Кнопка «Ознакомился» → `contract_acknowledged`, повторный клик заблокирован UI.
- [ ] API: при `ANALYTICS_ENABLED=1` строки в `analytics_events` с ожидаемым `propertiesJson`.

## 2. Traveler key

- [ ] Задать `TRAVELER_KEY_SALT` в `.env` API.
- [ ] `POST /bookings` с `guestContact` → в строке booking поле `travelerKeyHash` не null.
- [ ] Одинаковый контакт → одинаковый хеш.
- [ ] После миграции: `pnpm run backfill:traveler-key` в `services/api` (см. `BACKFILL_RUNBOOK.md`), доля NULL снизилась.

## 3. DQ dashboard

- [ ] Миграция применена (`analytics_mart_refresh_logs` существует).
- [ ] Admin: `/analytics/dq` открывается, метрики числовые, `overallGrade` отображается.
- [ ] После успешного `POST /internal/analytics/refresh` растёт `martRefreshSuccessCount` (в окне 24h).

## 4. Scores

- [ ] `POST /internal/analytics/scores/recalculate` (internal token) завершается `ok`.
- [ ] `GET /metrics/organizers/scores/latest` и `/metrics/programs/scores/latest` возвращают строки.

## 5. Founder dashboard

- [ ] `/analytics/founder` — верхняя панель с DQ / score / weak lists (после пересчёта).
- [ ] Таблица daily по-прежнему загружается.

## 6. Сборки

- [ ] `pnpm --filter @mywave/config build && pnpm --filter api build && pnpm --filter admin build && pnpm --filter web build`
- [ ] `pnpm --filter api test`
