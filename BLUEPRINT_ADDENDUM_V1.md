# Blueprint Addendum v1 — Pre-Code Gate

Документ подготовлен по управленческому решению GM. Статус: **Accepted with conditions**.  
Добавляет обязательные блоки к [IMPLEMENTATION_BLUEPRINT.md](IMPLEMENTATION_BLUEPRINT.md) перед выдачей green light на coding.

---

## 1. Source-of-Truth Matrix

| Domain Area | Canonical Document | Secondary / Supporting | Decision / Interpretation | Notes |
|-------------|-------------------|------------------------|---------------------------|-------|
| **Entities** | canonical_entity_model.md | booking_data_contract.md, commission_data_contract.md | Lead не каноническая сущность; Lead = ops intake / funnel stage; Booking = каноническая business entity | North Star и revenue завязаны на booking |
| **Status models** | canonical_status_models.md | db_schema_draft.csv | Все enum-ы импортируются только из shared-types; нет дублирования | Валидация transition — backend |
| **Product card** | program_card_schema.md | program_card_definition.md | program_card_schema — единственный технический source of truth | definition — только для понимания |
| **Booking rules** | booking_rules.md | cancellation_policy.md | Оплата напрямую организатору; платформа — посредник | UI flow должен отражать |
| **Verification rules** | verification_framework.md, organizer_verification_policy.md | organizer_rules.md | Verified = личный опыт + медиа + ≥10 отзывов + рейтинг | decision_log |
| **Revenue rules** | commission_rules.md, commission_data_contract.md | decision_log.csv | Комиссия только с состоявшейся сделки; accrual только после completed/paid_off_platform + evidence | Audit обязателен |
| **Legal texts** | terms_of_use.md, privacy_policy.md, organizer_rules.md, cancellation_policy.md, responsibility_allocation.md | risk_disclosure_template.md, informed_consent_template.md | Существующие — canonical; offer_platform, launch_legal_map — отсутствуют (см. Pre-code blockers) | Чекбоксы и footer — derived |
| **API / DB / audit** | endpoint_contracts.md, api_map.csv, db_schema_draft.csv, audit_log_spec.md | db_relationship_notes.md, config_and_secrets_map.csv | Все мутации — audit; canonical statuses в schema | migration_strategy — additive-first |
| **Safety / trust** | verification_framework.md, risk_disclosure_template.md, informed_consent_template.md | organizer_rules.md, responsibility_allocation.md | Risk disclosure, safety flags, verification fields — в schema с foundation; publish gate для program card | Не «позже», а с самого начала |

---

## 2. Conflict Resolution Table

| Conflict | Impacted Modules | Proposed Resolution | Accepted Source of Truth | Rejected Interpretation | Risk if Unresolved |
|----------|------------------|---------------------|--------------------------|--------------------------|--------------------|
| **Lead vs Booking** | booking, revenue, north_star, funnel | Lead = ops/funnel intake, не доменная сущность; Booking = каноническая бизнес-сущность для revenue, audit, north star | canonical_entity_model (Lead как описание воронки, не отдельная таблица); booking_data_contract | Lead как отдельная entity с собственным lifecycle | Размывание экономики; конфликт north star |
| **program_card_definition vs schema** | catalog, programs, admin | program_card_schema.md — единственный технический source of truth | program_card_schema.md | program_card_definition.md как основа для полей | Product и data в разных реальностях |
| **Missing PRD / technical spec** | все | Синтезировать DERIVED_PRD.md и DERIVED_TECHNICAL_SPEC.md из существующих материалов | Новые derived docs | Продолжать без явного PRD | Архитектурный drift, расплывчатые границы |
| **Missing legal docs** | public site, booking flow, checkboxes | offer_platform, launch_legal_map — создать как derived или placeholder; блокировать public-facing до готовности | Существующие legal docs + derived placeholders | Кодить без привязки legal к UI | Юридические риски, некорректные чекбоксы |
| **Region taxonomy** | catalog, filters | Добавить region как string/enum в schema; для старта — Альпы (startup_config) | taxonomy_and_filters_model + startup_config | Оставлять неопределённым | Фильтры не работают |

---

## 3. Freeze the Stack

**Принято решение GM:** один конкретный стек для MVP, без «или/или».

| Слой | Замороженный выбор | Не использовать |
|------|--------------------|-----------------|
| **Frontend (web + admin)** | Next.js 14+ (App Router) — единый слой для web и admin | Vite отдельно, второй frontend-framework |
| **Backend API** | Node.js (Express или Fastify) | Python на MVP (если не обосновано) |
| **DB** | PostgreSQL | — |
| **ORM** | Prisma | Drizzle, TypeORM, raw SQL |
| **Auth (Sprint 1)** | Только admin/internal (JWT, ADMIN_JWT_SECRET) | Public user auth на Sprint 1 |
| **Jobs** | node-cron или простой worker (отложить BullMQ) | — |
| **Infra** | Docker, Docker Compose | — |

**Обоснование:** lean MVP; assisted booking + manual verification не требует user accounts на старте; admin auth достаточен для ops и moderator.

---

## 4. Rescope Sprint 1

**Принцип:** только P0 foundation-задачи. Без public user auth, без «маркетингово красивого».

| # | Задача | Owner | DoD | Файлы | Source of Truth Used |
|---|--------|-------|-----|-------|----------------------|
| 1 | Repo skeleton | Tech | Структура по repo_structure; Next.js apps | apps/web, apps/admin, packages/, services/ | repo_structure.md, file_tree_template.txt |
| 2 | Shared canonical enums/types | Tech | Все статусы из canonical_status_models в packages/shared-types | packages/shared-types/src/statuses.ts | canonical_status_models.md |
| 3 | DB schema (users, organizers, audit_logs) | Tech | Миграции Prisma; rollback note | prisma/schema.prisma, migrations/ | db_schema_draft.csv, db_relationship_notes.md |
| 4 | Env + config | Tech | APP_ENV, DATABASE_URL, JWT_SECRET, ADMIN_JWT_SECRET | packages/config, .env.example | config_and_secrets_map.csv |
| 5 | Audit log foundation | Tech | Middleware пишет в audit_logs при мутациях | services/api/middleware/audit.ts | audit_log_spec.md |
| 6 | Organizers CRUD | Tech | GET/POST/PATCH /organizers; PATCH verification-status | services/api/modules/organizers/ | canonical_entity_model, canonical_status_models |
| 7 | Admin organizers queue | Tech | Список организаторов, фильтр по verification_status | apps/admin (Next.js) | admin_ops_dashboard_spec.md |
| 8 | Admin/internal auth only | Tech | POST /auth/login (admin); JWT с ролью admin | services/api/modules/auth/ | config_and_secrets_map, handoff_to_dev_team |

**Убрано из Sprint 1:**
- ~~Auth base (public register/login)~~ → только admin auth
- ~~User accounts~~ → не P0 для assisted booking MVP

**Acceptance (artifact-based):**
- [ ] `packages/shared-types/src/statuses.ts` экспортирует все enum из canonical_status_models
- [ ] `prisma/schema.prisma` содержит users, organizers, audit_logs
- [ ] `prisma/migrate dev` выполняется без ошибок
- [ ] POST /organizers создаёт запись; PATCH verification-status пишет в audit_log
- [ ] Admin UI: страница списка организаторов с фильтром
- [ ] Admin login: JWT с ADMIN_JWT_SECRET

**Risks:** нет  
**Rollback:** `prisma migrate reset`; revert коммитов  
**Test:** unit на status validation; integration на organizers CRUD + audit write

---

## 5. Pre-Code Blockers

### 5.1 Missing Docs

| Doc | Status | Action | Blocked Until |
|-----|--------|--------|---------------|
| prd.md | отсутствует | Синтезирован DERIVED_PRD.md | Готово |
| technical_spec.md | отсутствует | Синтезирован DERIVED_TECHNICAL_SPEC.md | Готово |
| offer_platform.md | отсутствует | Создать derived placeholder или извлечь из organizer_contract_template | Public-facing модули |
| launch_legal_map.md | отсутствует | Создать: где какой legal doc на сайте | Public catalog, booking flow |
| test_plan.md | отсутствует | Не blocker для Sprint 1 | Phase 2+ |
| deployment_plan.md | отсутствует | Не blocker для Sprint 1 | Pre-staging |
| checkbox_texts.md | отсутствует | Создать при booking flow | Booking module |
| footer_texts.md | отсутствует | Создать при public catalog | Catalog module |

### 5.2 Assumptions

- Assisted booking = лид приходит через форму, ops вручную передаёт организатору; user account не обязателен.
- Commission event model закладывается в schema (commissions table) на Phase 4, но поля в booking (gmv_rub, completed_at) — с Phase 2.
- Safety: risk_level, cancellation_rules, verification evidence — в schema organizers/programs с foundation; publish gate — при programs module.

### 5.3 What Can Proceed

- Sprint 1 (foundation + organizers + admin auth + audit) — после принятия Addendum и создания DERIVED_PRD + DERIVED_TECHNICAL_SPEC.
- Programs schema + publish workflow — после Sprint 1.
- Internal admin flows — без offer_platform, launch_legal_map.

### 5.4 What Is Blocked

- **Public catalog** — до launch_legal_map (где какие legal docs).
- **Booking form (public)** — до checkbox_texts, offer_platform, responsibility_allocation привязки.
- **User-facing auth** — до явного продуктового решения.

---

## 6. Output Format (обязательный для каждой задачи)

При каждой задаче разработчик указывает:

| Поле | Содержание |
|------|------------|
| **Что меняет** | Конкретный список изменений |
| **Какие файлы создаёт/изменяет** | Пути, не общие слова |
| **Как тестировать** | Шаги, команды, ожидаемый результат |
| **Риски** | Технические, продуктовые |
| **Rollback** | Конкретные команды/шаги |
| **Source of truth used** | Какие документы применены, какие конфликты закрыты |

---

## 7. Safety в Foundation (уточнение)

Safety не откладывается до trust-модуля. В schema с foundation должны быть:

- **Organizers:** verification_status, поля для evidence (ссылки на документы).
- **Programs (при добавлении):** risk_level, cancellation_rules, safety-поля из program_card_schema.
- **Publish gate:** программа не публикуется без заполненных safety/cancellation полей (program_card_schema: Required for publish).
- **Audit:** все изменения verification_status, publish_status — в audit_log.

Это не «позже блок», а часть схемы и логики публикации с самого начала.

---

*Addendum v1. После принятия — green light на Sprint 1 coding. Изменения стека, scope и source of truth — только через согласование с GM.*
