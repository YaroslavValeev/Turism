# Open status checkpoint (артефакт согласования)

Дата фиксации: 2026-04-26 (обновлено: хвост админки + формальные гейты). **Не** заменяет трекер задач; фиксирует, что критично/открыто в продуктовом смысле.

## Закрыто в репозитории (код / UX админки)

- **Остаточная аналитика (шаблон MyWave Admin):** `analytics/billing`, `analytics/dq` приведены к `AdminPageHeader` / `AdminSectionCard` / `AdminLoadingState` / таблицы `mw-admin-table` (DQ — типизированный payload API, бейдж оценки, issues, stat grid).
- **raw-items:** `loadData` обёрнут в `useCallback` + `useEffect([loadData])` — удовлетворяет строгий `exhaustive-deps` при неизменной логике.
- **collections/new:** тот же визуальный ритм, что у остальных форм (шапка, карточка, поля `mw-admin-*`).

**Build admin:** зелёный (после правок — прогон `pnpm --filter admin build`). **Живой прогон в браузере** с реальным API остаётся на стороне владельца среды.

---

## Критично, ещё не закрыто (вне кода / среда)

1. **Formal close Sprint 3B** — на deploy: реальные `https` в `PUBLIC_WEB_BASE_URL`, `PUBLIC_API_BASE_URL`, `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_API_URL`; одно **боевое** контрольное письмо; в теле **нет** `localhost`.
2. **Живой прогон Sprint 4** — тестовый email + Telegram: текст, ссылки, fallback на неполных данных, mobile.
3. **Booking scenarios (сквозные)** — blog / collection / explore → program → **созданный** booking; **backend** `booking_created` + **client** `program_submitted` с **entry context** (G4.1 / content-entries).
4. **G4.2 на живых данных** — после ненулевого объёма броней: сильные входы, drop-off, completeness tracking; до объёма выводы условны.

## Важно, не блокер запуска (техдолг / продукт)

5. **Дубликаты в каталоге** — merge-key, `sourceUrl`, anti-duplicate.
6. **Единый ingestion / intake dashboard** — сейчас Jobs + разрозненные экраны; нет одного health-экрана (sources → collected → normalized → deduped → autoPublished / skipped / publishFailed).
7. **Остаточные inline-style** на экранах, не прошедших вторую волну (не фундамент).

## Что уже в коде по booking / tracking

- `POST /bookings` + `emitBackendAnalyticsEventBestEffort` для `booking_created` с entry/UTM/explore.
- Клиент `program_submitted` с `entry_*` в `properties_json`.
- Сводка G4.1: `/metrics/content-entries` (**Analytics → Content entries**).
