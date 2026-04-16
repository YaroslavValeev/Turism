# Analytics Phase 2 — поэтапный план внедрения

**Северная звезда:** «данным можно доверять» → решения продукта/операций/финансов на одних и тех же определениях.

---

## Этап 2.1 — Каноника и контракты (1–2 недели)

**Выход:** утверждённые документы + синхронизация кода с каноном.

- Зафиксировать приоритет: `PHASE2_METRIC_DICTIONARY_CANONICAL.md` vs `METRIC_DICTIONARY.md` v1 (уже описано).
- Пройти review `PHASE2_EVENT_DICTIONARY_CANONICAL.md` с инженерами доменов (bookings/billing/organizers).
- Ввести лёгкий процесс: PR checklist «изменение метрики → обновление canonical doc».

**Rollback:** только документы; риск низкий.

---

## Этап 2.2 — Data Quality storage + API (2–4 недели)

**Выход:** таблицы из `PHASE2_DATA_QUALITY_METRICS_SCHEMA.md` + `GET /metrics/data-quality/*`.

Работы:

1. DDL миграции: hourly/daily DQ агрегаты + `mart_refresh_log` + freshness snapshot.
2. Инструментирование ingestion (счётчики accepted/rejected/duplicate/skipped).
3. Nightly orphan checks (SQL) + отчётные поля.
4. Admin UI: `PHASE2_DATA_QUALITY_DASHBOARD_DESIGN.md`.

**Rollback:** feature flag `DATA_QUALITY_DASHBOARD_ENABLED`.

---

## Этап 2.3 — Attribution + traveler key (3–6 недель, параллельно частично)

**Выход:** реализация минимального `traveler_key_hash` write-path + поля first/last touch.

Зависимости: юридическое/продуктовое согласование нормализации контакта.

**Rollback:** отключить хэширование, оставить только server metrics.

---

## Этап 2.4 — Cohort витрины (4–8 недель)

**Выход:** `cohort_*` таблицы + 2 дефолтных отчёта (customer B, organizer A).

Зависимости: Этап 2.3 для customer cohort качества.

---

## Этап 2.5 — Organizer/Program scoring (4–8 недель)

**Выход:** nightly `organizer_scores_*`, `program_scores_*` + Trust dashboard + score dashboards.

Зависимости: DQ (2.2) + cohort/performance inputs (2.4) для performance части.

---

## Этап 2.6 — Dashboards V2 (после 2.2+2.5)

**Выход:** отдельные дашборды:

1. Data Quality  
2. Trust  
3. Cohort  
4. Organizer score  
5. Program score  

Founder v2 — композит поверх слоёв (как вы просили).

---

## Критерии готовности Phase 2 (общие)

1. Любая метрика на дашборде имеет ссылку на canonical dictionary.
2. DQ dashboard показывает свежесть + ошибки ingestion + mart refresh.
3. Любой новый event добавляется через event dictionary процесс.
4. На staging выполняются 5 manual сценариев без «неожиданных» расхождений.
