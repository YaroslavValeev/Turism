# Sprint 1 — Checkpoint 6 (pilot-readiness foundation)

**Дата:** 2026-03-16  
**Scope:** Commission accrual path; review publish policy; verification ladder (operationalized); metrics foundation; release/observability/QA checklist. Без payment flow, без revenue UI, без public review layer.

---

## 1. Что изменено

| Изменение | Описание |
|-----------|----------|
| Commission accrual path | Документ docs/COMMISSION_ACCRUAL_PATH.md: source of truth = completed booking; auditable путь от completed → ручное создание Commission (POST /commissions); audit при создании и смене reconciliation. Нет payment flow, нет revenue dashboard. |
| Review publish policy | Документ docs/REVIEW_PUBLISH_POLICY.md: статусы pending/approved/rejected; кто переводит (admin); approved не течёт наружу без отдельного решения; public review layer отсутствует. |
| Verification ladder | Документ docs/VERIFICATION_LADDER.md: уровни listed → checked → verified → trusted_by_platform описаны через evidence и ops-правила; присвоение только со следом в evidence/audit. |
| Metrics foundation | Документ docs/METRICS_FOUNDATION.md; endpoint GET /metrics/admin/funnel (admin only): агрегаты по bookingStatus, incidentStatus, moderationStatus, reconciliationStatus, verificationStatus. Только операционные метрики, без revenue UI. |
| Release / observability / QA | Документ docs/RELEASE_AND_OBSERVABILITY_CHECKLIST.md: health, логирование ошибок, smoke/regression checklist, pilot readiness предусловия. В API: middleware для логирования необработанных ошибок (next(err)). |

---

## 2. Какие файлы созданы/изменены

### Созданы (7 файлов)

1. `docs/COMMISSION_ACCRUAL_PATH.md`
2. `docs/REVIEW_PUBLISH_POLICY.md`
3. `docs/VERIFICATION_LADDER.md`
4. `docs/METRICS_FOUNDATION.md`
5. `docs/RELEASE_AND_OBSERVABILITY_CHECKLIST.md`
6. `services/api/src/modules/metrics/routes.ts`
7. `SPRINT1_CHECKPOINT_6.md`

### Изменены (1 файл)

8. `services/api/src/index.ts` — подключение metricsRoutes, GET /metrics/admin/funnel; middleware логирования ошибок (observability).

**Итого:** 7 созданных, 1 изменённый = 8 файлов.

---

## 3. Tree (релевантная часть)

```
docs/
├── COMMISSION_ACCRUAL_PATH.md
├── REVIEW_PUBLISH_POLICY.md
├── VERIFICATION_LADDER.md
├── METRICS_FOUNDATION.md
└── RELEASE_AND_OBSERVABILITY_CHECKLIST.md

services/api/src/
├── index.ts                        ← /metrics, error logging
└── modules/
    └── metrics/
        └── routes.ts               ← GET /metrics/admin/funnel
```

---

## 4. Как тестировать

### Документы

- Прочитать docs/COMMISSION_ACCRUAL_PATH.md — путь от completed booking к Commission, без payment.
- Прочитать docs/REVIEW_PUBLISH_POLICY.md — policy зафиксирована, public layer отсутствует.
- Прочитать docs/VERIFICATION_LADDER.md — уровни через evidence и ops-правила.

### Metrics

- GET /metrics/admin/funnel без auth → 401.
- GET /metrics/admin/funnel с admin Bearer → 200, JSON: { bookings: {...}, incidents: {...}, reviews: {...}, commissions: {...}, organizers: {...} } (ключи — статусы, значения — счётчики).

### Observability

- GET /health → 200, { status: "ok" }.
- При вызове next(err) в любом route ошибка логируется и возвращается 500 (проверка по коду middleware).

### QA / pilot

- Пройти smoke и regression из docs/RELEASE_AND_OBSERVABILITY_CHECKLIST.md.

---

## 5. Риски

| Риск | Митигация |
|------|-----------|
| Метрики тяжёлые на больших объёмах | groupBy по индексам; при росте — кэш или фоновый пересчёт. |
| Error handler не ловит async throw | Сейчас ловит только next(err). При необходимости — обёртка async handler в следующих итерациях. |

---

## 6. Rollback

- Удалить или не подключать metrics routes; убрать middleware ошибок из index.ts; удалить/архивировать добавленные docs. Миграции БД не менялись.

---

## 7. Source of Truth Used

| Решение | Документ |
|---------|----------|
| Commission path | docs/COMMISSION_ACCRUAL_PATH.md, commission_data_contract |
| Review policy | docs/REVIEW_PUBLISH_POLICY.md |
| Verification levels | docs/VERIFICATION_LADDER.md, db_schema_draft, verification_framework |
| Metrics | docs/METRICS_FOUNDATION.md |
| Release/QA | docs/RELEASE_AND_OBSERVABILITY_CHECKLIST.md |

---

## 8. Подтверждения (отдельно)

| Требование | Подтверждение |
|------------|---------------|
| **Commission accrual path defined** | docs/COMMISSION_ACCRUAL_PATH.md задаёт source of truth (completed booking), auditable путь (ручное создание Commission + audit), без payment flow и без revenue dashboard. |
| **Review publish policy defined** | docs/REVIEW_PUBLISH_POLICY.md фиксирует policy письменно; public review layer отсутствует; approved не течёт наружу без отдельного решения. |
| **Verified/trusted rules operationalized** | docs/VERIFICATION_LADDER.md описывает уровни через evidence и ops-правила; присвоение checked/verified/trusted только со следом в evidence и audit. |
| **Public payment absent** | Нет эндпоинтов оплаты, нет логики платежей в коде и в описанных процессах. |
| **Revenue UI absent** | Нет revenue dashboard; GET /metrics/admin/funnel — только операционные агрегаты (счётчики по статусам). |
| **Self-serve booking absent** | Бронирование только через assisted intake (POST /bookings); самозапись на сайте не реализована. |

---

*Checkpoint 6 завершён. Pilot-readiness foundation: rules/process layer для доверия и комиссий, метрики воронки, checklist release/observability/QA.*
