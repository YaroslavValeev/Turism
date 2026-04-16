# MyWave Travel — Implementation Blueprint

Документ составлен после полного изучения пакета документов проекта (Kits v2–v6, юридический пакет, data contracts). Содержит единую картину, канонические решения и порядок реализации MVP.

---

## 1. Architecture Summary

### 1.1 Source of Truth по категориям

| Категория | Source of Truth | Документы |
|-----------|-----------------|-----------|
| Сущности и домены | canonical_entity_model.md | Organizer, Program, Lead (в составе Booking), Booking, Review, Verification Evidence, Complaint/Incident, Commission |
| Статусы | canonical_status_models.md | booking_status, organizer verification_status, program publish_status, incident_status, commission reconciliation_status |
| Карточка программы | program_card_schema.md | 26 полей + Required for publish |
| Data contracts | booking_data_contract.md, commission_data_contract.md | Invariants, required fields |
| Репозиторий и модули | repo_structure.md | apps/web, apps/admin, services/api, services/jobs, packages/* |
| Реализация | implementation_order.md, module_delivery_roadmap.csv | Phase 0–5, зависимости |
| API | endpoint_contracts.md, api_map.csv | Эндпоинты, роли, audit |
| БД | db_schema_draft.csv, db_relationship_notes.md | Таблицы, связи |
| Окружения | environment_matrix.csv | local, dev, staging, prod |
| Ops / admin | admin_ops_dashboard_spec.md, ops_queues_and_slas.md | Очереди, SLA |
| Юридические ограничения | terms_of_use, privacy_policy, organizer_rules, cancellation_policy, responsibility_allocation | Роль платформы, отмены, ответственность |
| North Star | north_star_tree.md | Состоявшиеся бронирования у verified organizers |

### 1.2 Отсутствующие документы (из запрошенного списка)

- prd.md, technical_spec.md, test_plan.md, deployment_plan.md, implementation_plan.md (секция 1)
- offer_platform.md (секция 2)
- launch_legal_map.md, deployment_checklist.md, checkbox_texts.md, footer_texts.md (секция 3)

Рекомендация: создать prd.md и technical_spec.md на основе данного blueprint перед стартом разработки. Остальные — по мере необходимости.

### 1.3 Канонические сущности (не менять без согласования)

1. **Organizer** — identity, legal status, contacts, verification evidence, trust signals, payout logic, response discipline
2. **Program** — discipline, region, dates, duration, level, risk, inclusions/exclusions, price, itinerary, media, organizer link, cancellation rules
3. **Lead** — НЕ каноническая доменная сущность; Lead = ops intake / funnel stage; материализуется как Booking в ранних статусах
4. **Booking** — канонический объект сделки (статусы, уведомления, ops, revenue, refunds, reviews, commission); North Star и revenue завязаны на booking
5. **Review** — пост-фактум trust; связан с organizer, program, completed booking
6. **Verification Evidence** — доказательства для listed / checked / verified / trusted
7. **Complaint / Incident** — жалобы, safety, refund-конфликты, fraud
8. **Commission Record** — completed deal, GMV, rate, accrued, collected, reconciliation

### 1.4 Канонические статусы

**Booking:** new → reviewed → sent_to_organizer → contacted → offer_sent → booked → paid_off_platform → completed  
Отмены: cancelled_user, cancelled_organizer  
Refund: refund_pending, refund_done

**Organizer verification:** listed | checked | verified | trusted_by_platform | paused | rejected

**Program publish:** draft → internal_review → needs_fix → approved → published | paused | archived

**Incident:** open | triaged | investigating | waiting_on_organizer | waiting_on_user | resolved | escalated | closed

**Commission reconciliation:** pending_evidence | accrued | invoiced | partially_paid | paid | disputed | written_off

### 1.5 Неизменяемые канонические решения (decision_log)

1. Монетизация: комиссия только с состоявшейся сделки
2. Юрформа: самозанятый, Валеев Ярослав Радионович
3. Verified organizer = личный опыт + медиа + ≥10 отзывов + рейтинг
4. Trust-first: assisted booking + manual verification
5. North Star = состоявшиеся бронирования у verified organizers
6. Сущности: organizer, program, booking, review, incident, commission
7. Статусные модели — обязательны
8. Финансовые и статусные изменения — auditable

### 1.6 Ограничения (продуктовые и юридические)

- Платформа — информационный посредник, не туроператор
- Оплата — напрямую организатору (на MVP)
- Отмены — по cancellation_policy (сроки, %, форс-мажор)
- Организатор — ИП/ООО/самозанятый, подтверждённые документы
- Disclosure и informed consent — обязательны для участников
- Ответственность за безопасность — на организаторе

### 1.8 Технический стек (заморожен)

См. [BLUEPRINT_ADDENDUM_V1.md](BLUEPRINT_ADDENDUM_V1.md) §3.

| Слой | Стек |
|------|------|
| Frontend (web + admin) | Next.js 14+ (App Router) |
| Backend API | Node.js (Express или Fastify) |
| DB | PostgreSQL |
| ORM | Prisma |
| Auth (Sprint 1) | Только admin/internal (JWT) |
| Infra | Docker, Docker Compose |

### 1.9 Модули для MVP (по implementation_order + module_delivery_roadmap)

| Phase | Модуль | Scope | Release |
|-------|--------|-------|---------|
| 0 | foundation | repo, envs, auth, shared enums, DB base, audit log | R1 |
| 1 | organizers | CRUD, verification statuses | R1 |
| 1 | programs | CRUD, publish workflow, media | R2 |
| 2 | public catalog | catalog pages, filters, program page | R2 |
| 2 | bookings | inquiry form, queue, status updates | R3 |
| 3 | trust | reviews, incidents, evidence | R4 |
| 4 | revenue | completion proof, GMV, commission accrual | R5 |
| 5 | automation | reminders, review requests, events, dashboards | R6 |

---

## 2. Implementation Sequence

Порядок строго по цепочке зависимостей:

```
foundation → organizers → programs → catalog → booking → trust → revenue → automation
```

### Phase 0 — Foundation
1. repo skeleton (по repo_structure.md, file_tree_template.txt)
2. env handling (config_and_secrets_map.csv)
3. auth / roles (users, JWT, admin)
4. shared enums (canonical_status_models → packages/shared-types)
5. DB base tables (db_schema_draft.csv)
6. audit log base (audit_log_spec.md)

### Phase 1 — Supply Core
1. organizers CRUD + verification statuses
2. programs CRUD + publish workflow + media
3. admin moderation queues (organizers, programs)

### Phase 2 — Demand Core
1. public catalog (filters по taxonomy_and_filters_model)
2. program page (program_card_schema)
3. booking inquiry form
4. booking status model + transitions
5. organizer lead notification

### Phase 3 — Trust Core
1. risk/safety fields в карточке
2. review flow (только после completed)
3. incident creation + escalation
4. verification evidence handling

### Phase 4 — Revenue Core
1. deal confirmation + GMV
2. commission accrual (commission_data_contract)
3. commission reconciliation queue
4. revenue dashboard

### Phase 5 — Automation
1. stale lead reminders
2. review request automation
3. event tracking (event_tracking_plan.csv)
4. weekly dashboard
5. release observability

---

## 3. First Sprint Plan

**Актуальная версия:** [BLUEPRINT_ADDENDUM_V1.md](BLUEPRINT_ADDENDUM_V1.md) §4 (Rescope Sprint 1).

### Sprint 1 — Foundation + Organizers (2 недели, rescoped)

**Цель:** P0 foundation; организаторы в admin; только admin auth.

| # | Задача | Файлы |
|---|--------|-------|
| 1 | Repo skeleton | apps/web, apps/admin, packages/, services/ |
| 2 | Shared canonical enums/types | packages/shared-types/src/statuses.ts |
| 3 | DB schema (users, organizers, audit_logs) | prisma/schema.prisma |
| 4 | Env + config | packages/config, .env.example |
| 5 | Audit log foundation | services/api/middleware/audit.ts |
| 6 | Organizers CRUD | services/api/modules/organizers/ |
| 7 | Admin organizers queue | apps/admin |
| 8 | Admin/internal auth only | services/api/modules/auth/ |

**Убрано:** public user auth (register/login для пользователей).

---

## 4. Список файлов, с которых начать разработку

### 4.1 Первый коммит (repo skeleton)

```
/
├── package.json              (root workspace)
├── pnpm-workspace.yaml       (или npm workspaces)
├── turbo.json                (опционально)
├── .gitignore
├── .env.example              (из config_and_secrets_map)
├── apps/
│   ├── web/package.json
│   ├── web/tsconfig.json
│   └── admin/package.json
├── services/
│   ├── api/package.json
│   └── api/tsconfig.json
├── packages/
│   ├── shared-types/package.json
│   ├── shared-types/src/index.ts
│   ├── shared-types/src/statuses.ts   ← canonical enums
│   └── config/package.json
├── infra/
│   └── docker/docker-compose.yml
└── scripts/
    └── db-migrate.sh
```

### 4.2 Ключевые файлы по приоритету

| Приоритет | Файл | Назначение |
|-----------|------|------------|
| 1 | packages/shared-types/src/statuses.ts | BookingStatus, OrganizerVerificationStatus, ProgramPublishStatus, IncidentStatus, CommissionReconciliationStatus |
| 2 | packages/shared-types/src/entities.ts | Типы Organizer, Program, Booking (из data contracts) |
| 3 | packages/config/src/env.ts | Парсинг APP_ENV, DATABASE_URL, JWT_SECRET |
| 4 | prisma/schema.prisma | Prisma schema: users, organizers, audit_logs |
| 5 | prisma/migrations/ | Prisma migrations |
| 6 | services/api/src/modules/auth/routes.ts | /auth/register, /auth/login |
| 7 | services/api/src/modules/organizers/routes.ts | CRUD + verification-status |
| 8 | services/api/src/middleware/audit.ts | Audit log на мутации |
| 9 | apps/admin/src/pages/organizers.tsx | Очередь организаторов |
| 10 | .env.example | Шаблон секретов |

### 4.3 Референс-документы при реализации

- **Статусы:** canonical_status_models.md
- **Поля booking:** booking_data_contract.md, booking_field_map.csv
- **Поля program:** program_card_schema.md
- **API:** endpoint_contracts.md, api_map.csv
- **БД:** db_schema_draft.csv, db_relationship_notes.md
- **Audit:** audit_log_spec.md
- **Coding:** coding_standards.md
- **Migration:** migration_strategy.md

---

## 5. Конфликты и расхождения

См. [BLUEPRINT_ADDENDUM_V1.md](BLUEPRINT_ADDENDUM_V1.md) §2 (Conflict Resolution Table).

**Ключевые решения:**
- **Lead vs Booking:** Lead = ops intake, не каноническая сущность; Booking = каноническая бизнес-сущность.
- **program_card_schema** — единственный технический source of truth для карточки.
- **Missing docs** — DERIVED_PRD.md и DERIVED_TECHNICAL_SPEC.md созданы; offer_platform, launch_legal_map — blockers для public-facing.

---

## 6. Checklist перед первым коммитом

- [ ] Прочитан cursor_prompt_pack.md
- [ ] Прочитан handoff_to_dev_team.md
- [ ] Стек заморожен (Next.js, Prisma, PostgreSQL — см. BLUEPRINT_ADDENDUM_V1)
- [ ] .env.example создан без реальных секретов
- [ ] migration_strategy учтена (additive-first, rollback note)

---

*Blueprint составлен по состоянию документов на дату создания. При изменении канонических документов — обновить blueprint и decision_log.*
