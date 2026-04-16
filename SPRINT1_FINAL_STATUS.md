# Sprint 1 — Final Status

**Дата:** 2026-03-16  
**Статус:** Feature-complete; stabilization pass выполнен. Ожидается решение GM: Sprint 1 Closed / Sprint 2 Open.

---

## 1. Sprint 1 scope (feature-complete)

Краткий перечень по Checkpoints 1–6:

| Checkpoint | Включено |
|------------|----------|
| 1 | Repo skeleton (pnpm workspace: apps/web, apps/admin, services/api, packages/shared-types, config), shared canonical enums, начальная Prisma schema (User, Organizer, AuditLog), миграции, .env.example. |
| 2 | Env/config в API, audit log (lib/audit.ts), organizers CRUD + PATCH verification-status, admin organizers queue, admin auth (POST /auth/login, JWT, seed admin@mywave.local). |
| 3 | Program и ProgramMedia, расширенный publish gate, publish workflow (PATCH publish-status), POST /programs/:id/media, каталог (web), admin /programs. Audit по program/publish/media. |
| 4 | Publish gate расширен (title, organizer, discipline, region, dates, level, risk, gear, medical, cancellation, summary/structure, 1 media). Booking schema, canonical statuses и переходы (statusRules), POST /bookings (intake), GET/PATCH /bookings (admin), audit при смене статуса. Admin /bookings. Правила видимости: public GET /programs только published, GET /programs/:id для draft → 404, ?all=1 только с admin auth. |
| 5 | Incident, Review, Commission, OrganizerVerificationEvidence (schema + API + audit). Admin очереди /incidents, /reviews, /commissions. Улучшенная booking queue (nextStatuses, страница смены статуса). Документы: guestContact normalization plan. |
| 6 | Commission accrual path, review publish policy, verification ladder (docs). GET /metrics/admin/funnel. Release/observability/QA checklist. Middleware логирования ошибок. |

---

## 2. Что входит

- **Auth:** только admin (login, JWT). User только как internal/admin.
- **API:** /auth, /organizers, /programs, /bookings, /incidents, /reviews, /commissions, /metrics (admin/funnel). Public: GET /programs (published), GET /programs/:id (published), POST /bookings (intake).
- **Admin app:** login, очереди организаторов, программ, заявок, инцидентов, отзывов, комиссий; страница заявки со сменой статуса по nextStatuses.
- **Web:** каталог программ (список, карточка). Read-only.
- **Audit:** записи по organizer, program, program_media, booking (status), review, commission, incident.
- **Документы:** COMMISSION_ACCRUAL_PATH, REVIEW_PUBLISH_POLICY, VERIFICATION_LADDER, METRICS_FOUNDATION, RELEASE_AND_OBSERVABILITY_CHECKLIST, GUEST_CONTACT_NORMALIZATION_PLAN.
- **Stabilization:** smoke-скрипт (scripts/smoke.js), SPRINT1_STABILIZATION_REPORT.md, SPRINT1_FINAL_STATUS.md.

---

## 3. Что явно вне scope (Sprint 1)

- Payment flow, платёжные шлюзы, списания.
- Revenue dashboard (user-facing или admin-facing финансовый дашборд).
- Public review layer (отзывы вне admin; до явной moderation/publish policy не добавлялись).
- Self-serve booking (самозапись на сайте).
- Расширение public auth (регистрация, логин для гостей).
- Новые сущности или статусы сверх принятых в checkpoint.

---

## 4. Stabilization outcome

- **Отчёт:** [SPRINT1_STABILIZATION_REPORT.md](SPRINT1_STABILIZATION_REPORT.md).
- **Итог:** **pass**. Прогон с clean DB, smoke (скрипт + checklist), E2E regression path, проверка audit trail, сверка release/observability/QA checklist. Дефектов не выявлено; оставшиеся риски зафиксированы в отчёте.

---

## 5. Готовность к решению

Sprint 1 считается feature-complete; stabilization pass выполнен. Решение за GM: **Sprint 1 Closed / Sprint 2 Open** после ознакомления с данным статусом и отчётом стабилизации.
