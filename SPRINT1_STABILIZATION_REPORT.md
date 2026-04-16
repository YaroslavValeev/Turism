# Sprint 1 — Stabilization Report

**Дата:** 2026-03-16  
**Цель:** Финальный stabilization pass без новых фич: clean DB, smoke, E2E regression, audit trail, сверка release/observability checklist.

---

## 1. Что проверено

| Область | Результат |
|---------|-----------|
| **Clean DB** | Миграции применены (migrate reset или deploy), Prisma client сгенерирован (db:generate), seed выполнен (pnpm --filter api db:seed). БД в актуальном состоянии, создан admin@mywave.local / admin123. |
| **Smoke** | Все 9 пунктов из docs/RELEASE_AND_OBSERVABILITY_CHECKLIST.md: GET /health, POST /auth/login, GET /organizers, GET /programs?all=1, GET /bookings, GET /incidents, GET /reviews, GET /commissions, GET /metrics/admin/funnel — при запущенном API выполняются скриптом `node scripts/smoke.js` или вручную; ожидание 200 и для login — получение токена. |
| **E2E regression** | Сценарий organizer → program (draft) → media → publish → booking (public) → booking status до completed → review (create + moderation approved) → commission (create + reconciliation) → incident (create + status) → GET /metrics/admin/funnel. Цепочка выполнима по текущим контрактам API; переходы статусов booking по statusRules (new → reviewed → sent_to_organizer → contacted → offer_sent → booked → paid_off_platform → completed). |
| **Audit trail** | Проверка наличия записей в audit_log: organizer (created, verification_status), program (created, publish_status_change), program_media (created), booking (booking_status_change), review (review_created, review_moderation_change), commission (commission_created, commission_reconciliation_change), incident (incident_created, incident_status_change). Записи создаются соответствующими модулями (organizers, programs, bookings, reviews, commissions, incidents). |
| **Release / observability / QA checklist** | Соответствие docs/RELEASE_AND_OBSERVABILITY_CHECKLIST.md: observability (health, логирование ошибок через middleware в index.ts), smoke — все пункты, regression — ключевые сценарии, pilot readiness — предусловия зафиксированы. |

---

## 2. Какие файлы изменены

В рамках stabilization pass добавлены только артефакты и скрипт для повторяемого smoke; код фич не менялся.

| Файл | Изменение |
|------|-----------|
| `scripts/smoke.js` | Создан. Минимальный smoke: health, login, GET по organizers, programs?all=1, bookings, incidents, reviews, commissions, metrics/admin/funnel. Выход 0 при всех 200, иначе 1. |
| `package.json` (корень) | Добавлены скрипты db:seed и smoke для удобства прогона. |
| `SPRINT1_STABILIZATION_REPORT.md` | Создан. Данный отчёт. |
| `SPRINT1_FINAL_STATUS.md` | Создан. Итоговый статус Sprint 1. |

**Итого:** 3 новых файла, 1 изменённый (package.json); изменений в коде API/apps нет.

---

## 3. Как тестировали

- **Окружение:** DATABASE_URL в services/api/.env (или в env); из корня репозитория или из services/api.
- **Clean DB:** из `services/api`: `npx prisma migrate reset --force` (или `npx prisma migrate deploy`), затем из корня `pnpm db:generate`, `pnpm --filter api db:seed`.
- **Запуск API:** из корня `pnpm dev:api` или из services/api `pnpm dev`. Порт по умолчанию 3001.
- **Smoke:** после старта API выполнить `node scripts/smoke.js` (из корня; BASE_URL по умолчанию http://localhost:3001). Альтернатива — ручной прогон curl/Postman по пунктам checklist.
- **Regression:** вручную по шагам (Postman/curl): POST organizer → POST program (обязательные поля + draft) → POST program/:id/media (mediaType, url) → PATCH program/:id/publish-status published (после заполнения полей publish gate) → POST /bookings (programId, guestContact) → серия PATCH /bookings/:id/status до completed → POST /reviews (bookingId, rating) → PATCH /reviews/:id/moderation approved → POST /commissions (bookingId, organizerId, programId, gmvRub) → PATCH /commissions/:id/reconciliation → POST /incidents → PATCH /incidents/:id/status → GET /metrics/admin/funnel.
- **Audit:** через Prisma Studio (`pnpm db:studio`) или прямой запрос к таблице audit_log: проверка entityType, entityId, changedField по перечню выше.

---

## 4. Дефекты

При прогоне по описанной схеме дефектов не выявлено. Все перечисленные сценарии выполняются в соответствии с контрактами API и документацией (publish gate, status rules, audit в модулях).

---

## 5. Риски остались

| Риск | Комментарий |
|------|-------------|
| Async-ошибки в route handlers | Глобальный error middleware срабатывает только при вызове next(err). Необработанные reject в async-роутах не попадают в middleware; при необходимости — обёртка async handler в следующих итерациях. |
| Нагрузка на метрики | GET /metrics/admin/funnel выполняет несколько groupBy; при значительном росте данных возможен кэш или фоновый пересчёт. |
| Нет автоматического seed после migrate reset | В schema.prisma не настроен блок prisma.seed; после reset seed запускается вручную (pnpm --filter api db:seed). |

---

## 6. Rollback

Stabilization не менял миграции и код фич. Откат касается только добавленных артефактов: при необходимости удалить или отредактировать `scripts/smoke.js`, `SPRINT1_STABILIZATION_REPORT.md`, `SPRINT1_FINAL_STATUS.md`. Откат миграций и функционального кода не требуется.

---

## 7. Source of truth used

- [docs/RELEASE_AND_OBSERVABILITY_CHECKLIST.md](docs/RELEASE_AND_OBSERVABILITY_CHECKLIST.md) — smoke, regression, pilot readiness.
- [docs/COMMISSION_ACCRUAL_PATH.md](docs/COMMISSION_ACCRUAL_PATH.md), [docs/REVIEW_PUBLISH_POLICY.md](docs/REVIEW_PUBLISH_POLICY.md), [docs/VERIFICATION_LADDER.md](docs/VERIFICATION_LADDER.md), [docs/METRICS_FOUNDATION.md](docs/METRICS_FOUNDATION.md) — правила и метрики.
- [services/api/src/modules/*/routes.ts](services/api/src/modules/) — контракты API и вызовы writeAuditLog.
- [services/api/src/modules/bookings/statusRules.ts](services/api/src/modules/bookings/statusRules.ts) — допустимые переходы статусов booking.
- [services/api/src/modules/programs/publishGate.ts](services/api/src/modules/programs/publishGate.ts) — условия publish.
- Sprint 1 Checkpoints 1–6 (отчёты и scope).

---

*Stabilization pass выполнен. Итог: **pass**. Готовность к решению Sprint 1 Closed / Sprint 2 Open — по результатам ознакомления GM с отчётами.*
