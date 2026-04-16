# DERIVED_TECHNICAL_SPEC — Technical Specification

Документ синтезирован из repo_structure, implementation_order, endpoint_contracts, db_schema_draft, environment_matrix, BLUEPRINT_ADDENDUM_V1.  
**Статус:** derived source of truth до появления оригинального technical_spec.md.

---

## 1. Стек (заморожен)

| Слой | Технология |
|------|------------|
| Frontend (web + admin) | Next.js 14+ (App Router) |
| Backend API | Node.js (Express или Fastify) |
| DB | PostgreSQL |
| ORM | Prisma |
| Auth (Sprint 1) | JWT, только admin/internal (ADMIN_JWT_SECRET) |
| Infra | Docker, Docker Compose |

---

## 2. Структура репозитория

```
/
├── apps/
│   ├── web/          # Публичный сайт (catalog, program page, booking form)
│   └── admin/        # Внутренняя админка (queues, moderation)
├── services/
│   └── api/          # Backend API (REST)
├── packages/
│   ├── shared-types/ # Canonical enums, entity types
│   └── config/       # Env parsing, constants
├── prisma/           # Schema, migrations
├── infra/
│   └── docker/
├── docs/
└── scripts/
```

---

## 3. Модули и порядок реализации

1. **Foundation** — repo, shared-types, Prisma schema, env, audit log, admin auth
2. **Organizers** — CRUD, verification statuses
3. **Programs** — CRUD, publish workflow, media
4. **Public catalog** — список, фильтры, program page
5. **Bookings** — inquiry form, status model, admin queue
6. **Trust** — reviews, incidents, verification evidence
7. **Revenue** — GMV, commission accrual, reconciliation
8. **Automation** — reminders, review requests, events

---

## 4. API (endpoint_contracts)

| Модуль | Endpoint | Method | Auth |
|--------|----------|--------|------|
| Auth | /auth/login | POST | public (admin credentials) |
| Organizers | /organizers | GET | public |
| Organizers | /organizers/:id | GET | public |
| Organizers | /organizers | POST | admin |
| Organizers | /organizers/:id | PATCH | admin |
| Organizers | /organizers/:id/verification-status | PATCH | admin |
| Programs | /programs | GET | public |
| Programs | /programs/:id | GET | public |
| Programs | /programs | POST | admin |
| Programs | /programs/:id | PATCH | admin |
| Programs | /programs/:id/publish-status | PATCH | admin |
| Bookings | /bookings | POST | public (inquiry) |
| Bookings | /bookings | GET | admin |
| Bookings | /bookings/:id/status | PATCH | admin |
| ... | (см. endpoint_contracts.md) | | |

Все мутирующие endpoints пишут в audit_log.

---

## 5. DB (db_schema_draft)

| Таблица | Ключ | Важные поля | Status columns |
|---------|------|-------------|----------------|
| users | user_id | name, email, role | — |
| organizers | organizer_id | display_name, legal_status, contact_email | verification_status |
| organizer_verification_evidence | evidence_id | organizer_id, evidence_type, evidence_url | — |
| programs | program_id | organizer_id, title, discipline, region, risk_level | publish_status |
| program_media | media_id | program_id, media_type, url | — |
| bookings | booking_id | program_id, organizer_id, user/guest, gmv_rub | booking_status |
| reviews | review_id | booking_id, rating, comment | — |
| incidents | incident_id | booking_id, type, severity | incident_status |
| commissions | commission_record_id | booking_id, gmv_rub, commission_accrued_rub | reconciliation_status |
| audit_logs | audit_id | entity_type, entity_id, changed_field, old_value, new_value | — |

---

## 6. Окружения

| Env | Purpose | Release gate |
|-----|---------|--------------|
| local | Разработка | — |
| dev | Интеграция | basic smoke |
| staging | Preprod | QA sign-off |
| prod | Публичный сервис | founder approval |

---

## 7. Конфиг и секреты (config_and_secrets_map)

- APP_ENV, DATABASE_URL, JWT_SECRET, ADMIN_JWT_SECRET — обязательны
- EMAIL_PROVIDER_KEY, SENTRY_DSN — опционально на MVP

---

## 8. Общие принципы

- Один source of truth для enums (packages/shared-types)
- Нет дублирования бизнес-логики между web/admin/api
- Все статусные переходы — валидация по canonical_status_models
- Financial mutations — обязательный audit
- Миграции — additive-first, rollback note

---

*Source: repo_structure, implementation_order, endpoint_contracts, db_schema_draft, environment_matrix, config_and_secrets_map, BLUEPRINT_ADDENDUM_V1.*
