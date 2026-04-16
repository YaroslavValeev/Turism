# Sprint 2 — GM Brief

**Вердикт:** Sprint 1 Closed, Sprint 2 Open.  
**Назначение:** Стартовый документ для разработчика и AI-команды. Scope и приоритеты утверждаются GM перед началом реализации.

---

## 1. Управленческая цель спринта

Перевести проект из фазы **foundation/MVP-core** в фазу **controlled expansion**: обеспечить **pilot readiness** и **operational hardening** без premature public/payment features. Цель — возможность провести реальный пилот (1 регион, 1–2 организатора, 3–10 программ, ручной assisted booking) с операционно связанными потоками верификации, модерации, начисления комиссий и обработки инцидентов/отзывов.

---

## 2. Scope (обязательный фокус)

| Приоритет | Область | Описание |
|-----------|---------|----------|
| 1 | **Pilot readiness** | Один регион в конфиге; 1–2 organizer flows; 3–10 pilot programs; ручной assisted booking; проверка end-to-end без разрывов. |
| 2 | **Operational hardening** | Verification flow (listed → checked → verified/trusted по evidence); moderation flow (review pending → approved/rejected); commission accrual flow (completed booking → Commission, reconciliation); incident/review handling (статусы, очереди, audit). |
| 3 | **Admin usability** | Убрать лишние ручные трения в очередях (organizers, programs, bookings, incidents, reviews, commissions); улучшить операторский путь без превращения в enterprise-panel. |
| 4 | **Commission/reconciliation operability** | Операционно понятный цикл начисления и сверки: от completed booking к Commission, смена reconciliation status, audit; без payment logic. |
| 5 | **Trust moderation/verification flows** | Использование evidence для checked/verified/trusted; модерация отзывов по REVIEW_PUBLISH_POLICY; обработка инцидентов по статусам. |
| 6 | **Pilot metrics & go-live discipline** | Реальные сигналы (bookings by status, publish pass/fail, review moderation, incident counts, commission reconciliation); smoke, regression, rollback, checklist перед релизом. |

Всё в рамках существующих сущностей и статусов (canonical). Новые сущности/статусы — только по отдельному согласованию с GM.

---

## 3. Deliverables (ожидаемые артефакты)

- **Pilot-ready контур:** один регион, сценарии organizer → program → publish → booking → completed → review/commission/incident, проверенные по smoke и regression.
- **Улучшенные admin flows:** очереди и действия оператора (verification, moderation, booking status, commission reconciliation, incident status) без лишних трения; при необходимости — минимальные подсказки/чек-листы в UI или в docs.
- **Commission accrual operability:** документированный и проверяемый путь от completed booking к Commission и смене reconciliation; audit сохранён.
- **Verification/moderation operability:** использование evidence по VERIFICATION_LADDER; модерация отзывов по REVIEW_PUBLISH_POLICY; инциденты по статусам.
- **Pilot metrics:** использование/расширение GET /metrics/admin/funnel и checklist для принятия решений (не «большая аналитика»).
- **Release discipline:** актуальный smoke/regression path, rollback-инструкции, checklist перед каждым релизом (на базе RELEASE_AND_OBSERVABILITY_CHECKLIST).

Формат отчётности по Sprint 2: что изменено, файлы созданы/изменены, как тестировали, риски, rollback, source of truth — по аналогии с Checkpoint-отчётами Sprint 1.

---

## 4. Риски

| Риск | Митигация |
|------|-----------|
| Размывание фокуса | Жёстко держать scope: pilot readiness + operational hardening; не добавлять public payment, self-serve, revenue UI, public review/auth. |
| Преждевременная сложность | Admin usability — улучшение путей, а не новый enterprise-panel; pilot metrics — сигналы для решений, а не «красивая аналитика». |
| Новые сущности без согласования | Любое расширение модели/статусов — только после явного согласования с GM. |
| Регрессии | Сохранять smoke и regression; перед релизом — обязательный прогон по checklist. |

---

## 5. Rollback

- Изменения Sprint 2 — в коде, конфиге и документации; при необходимости откат по коммитам/веткам.
- Миграции БД: при добавлении новых миграций в Sprint 2 — документировать обратные шаги (down-migration или порядок отката).
- Конфиг (регион, пилот-настройки): хранить в версионируемых файлах; откат — замена конфига и перезапуск.

---

## 6. Source of truth used

| Область | Документ/артефакт |
|---------|--------------------|
| Sprint 1 итог и границы | SPRINT1_GM_CLOSURE.md, SPRINT1_FINAL_STATUS.md |
| Commission path | docs/COMMISSION_ACCRUAL_PATH.md |
| Review policy | docs/REVIEW_PUBLISH_POLICY.md |
| Verification levels | docs/VERIFICATION_LADDER.md |
| Metrics | docs/METRICS_FOUNDATION.md |
| Release/QA | docs/RELEASE_AND_OBSERVABILITY_CHECKLIST.md |
| Статусы и типы | packages/shared-types (canonical), canonical_status_models |
| API/схема | services/api (Prisma schema, routes), endpoint_contracts / db_schema_draft по мере применимости |

---

## 7. Explicitly out of scope (Sprint 2)

- **Public payment** — любые платёжные шлюзы, списания, приём оплаты от пользователей.
- **Self-serve booking** — самозапись на сайте без участия ops.
- **Revenue dashboard** — пользовательский или админский финансовый дашборд (сводки GMV/доходов как продуктовая фича).
- **Public review layer** — публичное отображение/сбор отзывов вне admin до явной moderation/publish policy.
- **Public auth expansion** — регистрация/логин для гостей как обязательная часть продукта.
- **Новые сущности/статусы** — без отдельного согласования с GM.

---

## 8. Что запрещено включать

- Public payment  
- Self-serve booking  
- Revenue dashboard  
- Public review layer  
- Public auth expansion  
- Новые сущности/статусы без согласования  

---

## 9. Статус документа

После подготовки Sprint 2 GM Brief — **финальная приёмка scope за GM**, затем открытие реализации Sprint 2. Изменения в scope — только по решению GM.

---

*Ссылки: [SPRINT1_GM_CLOSURE.md](SPRINT1_GM_CLOSURE.md), [docs/SPRINT2_OPEN_EMAIL.md](docs/SPRINT2_OPEN_EMAIL.md).*
