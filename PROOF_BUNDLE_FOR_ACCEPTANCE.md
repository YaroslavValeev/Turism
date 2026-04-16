# Proof Bundle — Final Acceptance Review

Документ для финальной верификации перед green light на Sprint 1 coding.  
Дата: 2025-03-14.

---

## 1. Список файлов

| Файл | Путь | Статус |
|------|------|--------|
| BLUEPRINT_ADDENDUM_V1.md | `e:\Проекты MyWave\NEW2026\Toutism\BLUEPRINT_ADDENDUM_V1.md` | Существует |
| DERIVED_PRD.md | `e:\Проекты MyWave\NEW2026\Toutism\DERIVED_PRD.md` | Существует |
| DERIVED_TECHNICAL_SPEC.md | `e:\Проекты MyWave\NEW2026\Toutism\DERIVED_TECHNICAL_SPEC.md` | Существует |

---

## 2. Tree / paths

```
Toutism/
├── BLUEPRINT_ADDENDUM_V1.md      ← Pre-code gate, 5 обязательных секций
├── DERIVED_PRD.md                ← Синтез PRD из существующих материалов
├── DERIVED_TECHNICAL_SPEC.md     ← Синтез technical spec
├── IMPLEMENTATION_BLUEPRINT.md   ← Обновлён ссылками на Addendum
├── PROOF_BUNDLE_FOR_ACCEPTANCE.md
├── canonical_entity_model.md
├── canonical_status_models.md
├── program_card_schema.md
├── booking_data_contract.md
├── commission_data_contract.md
├── db_schema_draft.csv
├── ... (остальные docs)
```

---

## 3. Commit hash / diff summary

Репозиторий не под git. Список созданных/изменённых файлов:

**Созданы:**
- BLUEPRINT_ADDENDUM_V1.md
- DERIVED_PRD.md
- DERIVED_TECHNICAL_SPEC.md
- PROOF_BUNDLE_FOR_ACCEPTANCE.md
- startup_config.md
- first_weekly_meeting_prep.md

**Изменены:**
- IMPLEMENTATION_BLUEPRINT.md (Lead vs Booking, стек, Sprint 1, конфликты)
- README.md (стартовый фокус, startup_config)
- sprint_board_template.csv (due_date, definition_of_done)
- weekly_team_meeting_agenda.md (ссылка на prep)
- cursor_task_briefs.md (пример заполненного brief)

---

## 4. Выдержки из файлов

### 4.1 Source-of-Truth Matrix (BLUEPRINT_ADDENDUM_V1 §1)

```
| Domain Area | Canonical Document | Decision / Interpretation |
|-------------|-------------------|---------------------------|
| Entities | canonical_entity_model.md | Lead не каноническая; Booking = каноническая business entity |
| Status models | canonical_status_models.md | Все enum из shared-types |
| Product card | program_card_schema.md | Единственный технический source of truth |
| Booking rules | booking_rules.md | Оплата напрямую организатору |
| Verification rules | verification_framework.md | Verified = личный опыт + медиа + ≥10 отзывов |
| Revenue rules | commission_rules.md | Комиссия только с состоявшейся сделки; audit обязателен |
| Safety / trust | verification_framework, risk_disclosure | В schema с foundation; publish gate |
```

### 4.2 Conflict Resolution (BLUEPRINT_ADDENDUM_V1 §2)

```
Lead vs Booking:
  Proposed: Lead = ops/funnel intake; Booking = каноническая бизнес-сущность
  Accepted: canonical_entity_model (Lead как воронка); booking_data_contract
  Rejected: Lead как отдельная entity
  Risk: Размывание экономики; конфликт north star

program_card_definition vs schema:
  Proposed: program_card_schema.md — единственный technical source of truth
  Accepted: program_card_schema.md
  Rejected: program_card_definition как основа для полей
```

### 4.3 Frozen Stack (BLUEPRINT_ADDENDUM_V1 §3)

```
| Слой | Выбор | Не использовать |
|------|-------|-----------------|
| Frontend | Next.js 14+ (App Router) | Vite, второй framework |
| Backend | Node.js (Express или Fastify) | Python на MVP |
| DB | PostgreSQL | — |
| ORM | Prisma | Drizzle, TypeORM |
| Auth (Sprint 1) | Только admin/internal (JWT) | Public user auth |
```

### 4.4 Rescope Sprint 1 (BLUEPRINT_ADDENDUM_V1 §4)

```
8 задач P0:
1. Repo skeleton
2. Shared canonical enums/types
3. DB schema (users, organizers, audit_logs)
4. Env + config
5. Audit log foundation
6. Organizers CRUD
7. Admin organizers queue
8. Admin/internal auth only

Убрано: public user auth, User accounts
```

### 4.5 Pre-Code Blockers (BLUEPRINT_ADDENDUM_V1 §5)

```
prd.md → DERIVED_PRD.md синтезирован ✅
technical_spec.md → DERIVED_TECHNICAL_SPEC.md синтезирован ✅
offer_platform, launch_legal_map → blockers для public-facing

What Can Proceed: Sprint 1 после принятия Addendum
What Is Blocked: Public catalog, Booking form (public), User-facing auth
```

---

## 5. Однострочные подтверждения

| Требование | Подтверждение |
|------------|---------------|
| Lead = ops intake | **Да.** BLUEPRINT_ADDENDUM §1, §2: «Lead не каноническая сущность; Lead = ops intake / funnel stage». |
| Booking = canonical business entity | **Да.** §1, §2: «Booking = каноническая бизнес-сущность для revenue, audit, north star». |
| Safety/publish gate included in foundation | **Да.** §1 (Safety/trust), §7: «verification_status, risk_level, cancellation_rules в schema с foundation; publish gate для program card». |
| Commission event model before revenue UI | **Да.** DERIVED_PRD §5, Addendum §5.2: «commission event model в schema (Phase 4); поля gmv_rub, completed_at в booking — с Phase 2; revenue UI — позже». |
| Only admin/internal auth in Sprint 1 | **Да.** §3, §4: «Auth (Sprint 1): Только admin/internal»; «Убрано: Auth base (public register/login)». |

---

## 6. Safety в foundation (проверка)

**DERIVED_PRD §5:** «Safety — risk disclosure, informed consent — обязательны».  
**DERIVED_PRD §7:** «Publish gate: программа не публикуется без safety/cancellation полей».  

**BLUEPRINT_ADDENDUM §7:**
- Organizers: verification_status, поля для evidence
- Programs: risk_level, cancellation_rules, safety-поля
- Publish gate: без safety/cancellation — не публикуется
- Audit: verification_status, publish_status — в audit_log

**DERIVED_TECHNICAL_SPEC §5 (DB):** organizers.verification_status, programs.risk_level, audit_logs.

---

## 7. Commission / revenue (проверка)

**DERIVED_PRD §5:** «Комиссия — только с состоявшейся сделки; accrual только после completed/paid_off_platform + evidence».  

**Addendum §1 (Revenue rules):** «Audit обязателен».  
**Addendum §5.2:** «Commission event model в schema на Phase 4; поля в booking — с Phase 2».  

Нет: payment flow, public purchase, commission_due отдельно от booking lifecycle.

---

## 8. Итог

- Все 3 файла существуют
- Все 5 обязательных секций Addendum заполнены
- Стек заморожен в один вариант (Next.js, Prisma, PostgreSQL)
- Sprint 1 — только P0 (8 задач, без public auth)
- Lead vs Booking, program_card, missing docs — разрешены
- Safety и commission model — в foundation/schema

**Статус для GM:** Proof bundle готов к финальной верификации.  
При подтверждении артефактов — **Green light for Sprint 1 coding**.
