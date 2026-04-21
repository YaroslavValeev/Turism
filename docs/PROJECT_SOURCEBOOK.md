# MyWave Travel — Project Sourcebook

Единая точка входа: **смысл продукта**, **канон**, **архитектура**, **технический контур**, **связанные процессы** (ингест, приёмка) и **указатель** на детальные документы.

**Как поддерживать:** при смене канона (сущности, статусы, политика публикации) обновляйте первоисточники (`canonical_*`, `DERIVED_*`, `IMPLEMENTATION_BLUEPRINT.md`, политики в `docs/`) и затем **кратко синхронизируйте этот файл** (дата внизу раздела «Версия»).

---

## 1. Что это за проект

**MyWave Travel** — trust-first платформа **спортивно-тренировочных выездов** (кэмпы, клиники, туры по экстремальным дисциплинам и активному отдыху).

| Аспект | Формулировка |
|--------|----------------|
| Роль платформы | Информационный **посредник** между участниками и организаторами. Не туроператор, не продавец туров. |
| Монетизация | Комиссия **только** с реально состоявшейся сделки. |
| Запуск | **Assisted booking** + ручная **verification** организаторов. |
| North Star | Состоявшиеся бронирования у **verified** organizers (см. `north_star_tree.md`). |

**Пилот (owner-level truth):** см. [`startup_config.md`](../startup_config.md) — wakesurf-first, anchor locations (Krasnodar, Dubai, Bodrum), русскоязычная аудитория и смесь РФ/зарубежных программ; границы production vs internal control — `docs/PRODUCTION_SURFACE_AND_INTERNAL_CONTROL.md`.

---

## 2. Для кого система

| Сегмент | Потребность |
|---------|----------------|
| Участники | Поиск программ, заявка, доверие к организатору |
| Организаторы | Размещение программ, заявки, работа с лидами |
| Платформа (ops) | Заявки, верификация, модерация, комиссии, инциденты |

---

## 3. MVP: в scope и вне

**В scope:** organizers (CRUD, verification), programs (CRUD, publish, карточка по схеме), публичный каталог и страница программы, booking (assisted), trust (reviews, incidents, evidence), revenue (deal, GMV, commission, reconciliation), admin-очереди.

**Вне scope ранней фазы (0–10 bookings):** обязательные user accounts, онлайн-оплата через платформу, сложный lead scoring, публичный growth dashboard, тяжёлые referral-механики.

Подробнее: [`DERIVED_PRD.md`](../DERIVED_PRD.md).

---

## 4. Канон: сущности и статусы

### 4.1 Сущности (не менять без согласования)

1. **Organizer** — identity, юрформа, контакты, evidence, trust, дисциплина ответов.  
2. **Program** — дисциплина, регион, даты, уровень, риск, цена, медиа, правила отмен.  
3. **Lead** — **не** отдельная каноническая доменная сущность; ранний intake = стадии **Booking**.  
4. **Booking** — канонический объект сделки; North Star и revenue завязаны на него.  
5. **Review** — после completed booking.  
6. **Verification Evidence** — уровни доверия организатора.  
7. **Complaint / Incident** — жалобы, safety, споры.  
8. **Commission Record** — сделка, GMV, начисление, сверка.

Источник полей и связей: [`canonical_entity_model.md`](../canonical_entity_model.md), [`db_relationship_notes.md`](../db_relationship_notes.md).

### 4.2 Ключевые статусные цепочки

- **Booking:** `new` → `reviewed` → `sent_to_organizer` → `contacted` → `offer_sent` → `booked` → `paid_off_platform` → `completed`; отмены и refund — по [`canonical_status_models.md`](../canonical_status_models.md).  
- **Organizer verification:** `listed` | `checked` | `verified` | `trusted_by_platform` | `paused` | `rejected`.  
- **Program publish:** `draft` → `internal_review` → `needs_fix` → `approved` → `published` | `paused` | `archived`.  
- **Incident** и **Commission reconciliation** — см. тот же файл статусов.

### 4.3 Неизменяемые продуктовые решения

Комиссия только с состоявшейся сделки; trust-first и assisted booking; финансовые и статусные изменения — **auditable**; платформа не подменяет туроператора; оплата на MVP — организатору напрямую.

Полный blueprint: [`IMPLEMENTATION_BLUEPRINT.md`](../IMPLEMENTATION_BLUEPRINT.md).

---

## 5. Архитектура репозитория (фактическая и целевая)

Монорепо **pnpm workspace**. Ядро кода:

| Область | Путь | Назначение |
|---------|------|------------|
| Публичный фронт | `apps/web` | Лендинг, каталог, карточка программы, organizer surfaces, ревью по токену |
| Админка | `apps/admin` | Очереди, модерация, источники, raw items, event candidates, аналитика, биллинг |
| API | `services/api` | REST, Prisma, ингест, бронирования, организаторы и т.д. |
| Общие типы / конфиг | `packages/shared-types`, `packages/config` | Единые enum и env; **`PLATFORM_MODE`** (`launch` \| `monetization`) — глобальный коммерческий режим (см. `loadEnv`, `GET /public/platform`) |

**Организаторская заявка на программу (пилот):** пошаговый мастер на `/organizers/program` и публичный чеклист публикации `GET /public/program-publish-hints` — в одной линии с `canPublish` / `publishGate` в `services/api`. Очередь оператора: админка `/organizer-intakes`, API `GET/PATCH/POST /admin/organizer-intakes/*` (создание черновика программы из `meta` wizard v2 + привязка к `Organizer`). Событие **`intake_created`** (backend analytics) + ops Telegram при настроенном боте. SLA: [`operations/ORGANIZER_INTAKE_SLA.md`](./operations/ORGANIZER_INTAKE_SLA.md). План Stage 4 по агентам: [`migration/STAGE4_AGENT_PLAN.md`](./migration/STAGE4_AGENT_PLAN.md). Закрытие Stage 4 и хвост 4.1: [`migration/STAGE4_CLOSE_REPORT.md`](./migration/STAGE4_CLOSE_REPORT.md), ADR [`decisions/ADR-007-booking-billing-status-strategy.md`](./decisions/ADR-007-booking-billing-status-strategy.md), [`decisions/ADR-008-commission-reconciliation-strategy.md`](./decisions/ADR-008-commission-reconciliation-strategy.md). План 4.1 после Accepted ADR: [`migration/STAGE4_1_IMPLEMENTATION_PLAN.md`](./migration/STAGE4_1_IMPLEMENTATION_PLAN.md), guardrails: [`migration/STAGE4_1_CODING_GUARDRAILS.md`](./migration/STAGE4_1_CODING_GUARDRAILS.md).

**Режим запуска (Launch Mode):** при `PLATFORM_MODE=launch` комиссии и биллинг **не отключены** — расчёты, события и переходы сохраняются; **к списанию** комиссия **0** (см. `billing/service`, `calculationJson`, ведомости). UI: `apps/web` — `/organizers/analytics`, `/organizers/billing`, `/admin/platform`. QA: [`qa/PLATFORM_MODE_QA.md`](./qa/PLATFORM_MODE_QA.md). **Эксплуатация (после закрытия dev-этапа):** маркетинг и трафик, сбор views/clicks/leads/attribution, наблюдение `commission_transition_violation_detected` **без** включения commission strict-mode и без правок policy до отдельного решения.

**Важно:** в ранних derived-доках схема дерева иногда указывала `prisma/` в корне; в текущем коде **схема и миграции Prisma** живут в **`services/api/prisma/`**.

Карта модулей и очередей: [`repo_structure.md`](../repo_structure.md), [`implementation_order.md`](../implementation_order.md).

**Процесс разработки с AI:** оркестрация ролей, шаблон фичи, merge-checklist, промпты Devil’s Advocate / QA и правила Cursor — [`docs/development/AGENT_ORCHESTRATION.md`](./development/AGENT_ORCHESTRATION.md), корневой [`AGENTS.md`](../AGENTS.md).

---

## 6. Технический стек и порядок внедрения

| Слой | Технология |
|------|------------|
| Web + Admin | Next.js 14+ (App Router) |
| API | Node.js + Express |
| БД | PostgreSQL |
| ORM | Prisma |
| Auth (пилот admin) | JWT, internal/admin |
| Локальная инфра | Docker Compose (см. корень / `docker-compose.yml`) |

**Цепочка модулей:** `foundation` → `organizers` → `programs` → `catalog` → `bookings` → `trust` → `revenue` → `automation`.

Детали эндпоинтов и таблиц — выжимка в [`DERIVED_TECHNICAL_SPEC.md`](../DERIVED_TECHNICAL_SPEC.md); полные списки — [`endpoint_contracts.md`](../endpoint_contracts.md), [`db_schema_draft.csv`](../db_schema_draft.csv).

---

## 7. Обнаружение контента и публикация (ingestion)

Отдельный канонический слой: **discovery ≠ публикация**. Сырые источники и кандидаты проходят pipeline; в публичный каталог без гейта не выкатываем.

- Политика: [`INGESTION_POLICY.md`](./INGESTION_POLICY.md).  
- Пример операционного пакета источников (owner batch): [`ingestion/OWNER_SOURCES_2026-04-16.md`](./ingestion/OWNER_SOURCES_2026-04-16.md).  
- Локальная / мобильная приёмка и гейт до деплоя: [`deployment/PRE_DEPLOY_LOCAL_AND_MOBILE.md`](./deployment/PRE_DEPLOY_LOCAL_AND_MOBILE.md), [`qa/BROWSER_CHECK_ROUTES.md`](./qa/BROWSER_CHECK_ROUTES.md), [`qa/MOBILE_CHECK_ROUTES.md`](./qa/MOBILE_CHECK_ROUTES.md). После выката: [`qa/POST_MERGE_SMOKE.md`](./qa/POST_MERGE_SMOKE.md). Пробелы vs планом: [`qa/IMPLEMENTATION_GAPS.md`](./qa/IMPLEMENTATION_GAPS.md).

---

## 8. Окружения, секреты, релизная дисциплина

| Env | Назначение |
|-----|------------|
| local | Разработка |
| dev / staging | Интеграция и preprod |
| prod | Публичный сервис — только после согласованных gate |

Секреты и переменные: [`config_and_secrets_map.csv`](../config_and_secrets_map.csv), `.env.example` в корне и в `services/api`.

---

## 9. Указатель первоисточников (что читать для глубины)

| Тема | Файл |
|------|------|
| Продукт и MVP (derived PRD) | [`DERIVED_PRD.md`](../DERIVED_PRD.md) |
| Канон реализации и фазы | [`IMPLEMENTATION_BLUEPRINT.md`](../IMPLEMENTATION_BLUEPRINT.md) |
| Техспека и API/DB выжимка | [`DERIVED_TECHNICAL_SPEC.md`](../DERIVED_TECHNICAL_SPEC.md) |
| Конфликты и addendum | [`BLUEPRINT_ADDENDUM_V1.md`](../BLUEPRINT_ADDENDUM_V1.md) |
| Сущности | [`canonical_entity_model.md`](../canonical_entity_model.md) |
| Статусы | [`canonical_status_models.md`](../canonical_status_models.md) |
| Карточка программы | [`program_card_schema.md`](../program_card_schema.md) |
| Бронирование / комиссии | [`booking_data_contract.md`](../booking_data_contract.md), [`commission_data_contract.md`](../commission_data_contract.md) |
| Stage 0 closure pack | [`migration/EXECUTION_START_PACK.md`](./migration/EXECUTION_START_PACK.md), [`migration/STAGE_DOD_1_3.md`](./migration/STAGE_DOD_1_3.md), [`migration/LEGACY_CONTENT_MIGRATION_POLICY.md`](./migration/LEGACY_CONTENT_MIGRATION_POLICY.md) |
| Stage 4.1 hardening (ADR-007/008, direct writes, commission soft/strict) | [`migration/STAGE4_1_CODING_GUARDRAILS.md`](./migration/STAGE4_1_CODING_GUARDRAILS.md), [`migration/STAGE4_1_BOOKING_STATUS_WRITERS_AUDIT.md`](./migration/STAGE4_1_BOOKING_STATUS_WRITERS_AUDIT.md), [`migration/STAGE4_1_ADR007_GUARD.md`](./migration/STAGE4_1_ADR007_GUARD.md), [`migration/STAGE4_1_COMMISSION_STRICT_MODE.md`](./migration/STAGE4_1_COMMISSION_STRICT_MODE.md), [`migration/STAGE4_1_COMMISSION_VIOLATION_SNAPSHOT.md`](./migration/STAGE4_1_COMMISSION_VIOLATION_SNAPSHOT.md), [`migration/STAGE4_1_START_EXECUTION_REPORT.md`](./migration/STAGE4_1_START_EXECUTION_REPORT.md) |
| Platform mode + приёмка UI/API | [`qa/PLATFORM_MODE_QA.md`](./qa/PLATFORM_MODE_QA.md), `GET /public/platform`, `GET /metrics/admin/platform-mode`, `packages/config` (`PLATFORM_MODE`, `NOTIFICATIONS_ANTI_FLIP_WINDOW_HOURS`) |
| Decision: Lead vs Booking | [`decisions/ADR-005-lead-vs-booking.md`](./decisions/ADR-005-lead-vs-booking.md) |
| Lifecycle источников парсинга и внешних каналов (manual_only / archived) | [`decisions/ADR-009-source-and-channel-lifecycle.md`](./decisions/ADR-009-source-and-channel-lifecycle.md) |
| План волны: Sources / Parsing Owner Ops (Stage A–C, rollout, DoD) | [`architecture/SOURCES_PARSING_OWNER_OPS_WAVE.md`](./architecture/SOURCES_PARSING_OWNER_OPS_WAVE.md) |
| Premium / payouts / strict commission (рамка Wave 4) | [`decisions/ADR-010-premium-and-payout-preconditions.md`](./decisions/ADR-010-premium-and-payout-preconditions.md) |
| Idempotency (delivery + finance sync) | [`architecture/IDEMPOTENCY_DELIVERY_AND_SYNC.md`](./architecture/IDEMPOTENCY_DELIVERY_AND_SYNC.md) |
| Import mapping для owner batch (`mywave_v5_real_only.xlsx`) | [`ingestion/SOURCES_IMPORT_MAPPING_MYWAVE_V5.md`](./ingestion/SOURCES_IMPORT_MAPPING_MYWAVE_V5.md) |
| UGC after completed (post-trip review + media) | [`qa/UGC_AFTER_COMPLETED.md`](./qa/UGC_AFTER_COMPLETED.md) |
| UGC growth loop (reward + referral MVP) | [`qa/UGC_GROWTH_LOOP.md`](./qa/UGC_GROWTH_LOOP.md) |
| UGC reward hardening (self-use / duplicate / rate-limit / rewards) | [`qa/UGC_REWARD_HARDENING.md`](./qa/UGC_REWARD_HARDENING.md) |
| UGC reward → billing (Model A: discount → final → commission) | [`qa/UGC_REWARD_BILLING.md`](./qa/UGC_REWARD_BILLING.md) |
| UGC reward recovery (cancel/refund lifecycle, trust-retention) | [`qa/UGC_REWARD_RECOVERY.md`](./qa/UGC_REWARD_RECOVERY.md) |
| UGC «Мои бонусы» — read-only страница для пользователя | [`qa/UGC_MY_REWARDS_PAGE.md`](./qa/UGC_MY_REWARDS_PAGE.md) |
| Admin economics overview (funnel + unit economics, `GET /admin/economics/overview`) | [`operations/ECONOMICS_OVERVIEW_RUNBOOK.md`](./operations/ECONOMICS_OVERVIEW_RUNBOOK.md) |
| Owner economics rhythm (daily/weekly/monthly, alerts, override rules) | [`operations/OWNER_ECONOMICS_RHYTHM.md`](./operations/OWNER_ECONOMICS_RHYTHM.md) |
| Локальный restart, smoke, Go/No-Go (owner + dev) | [`operations/RESTART_SMOKE_GONOGO.md`](./operations/RESTART_SMOKE_GONOGO.md) |
| Owner runbook по contract-driven источникам и ручному ingestion | [`operations/SOURCES_OWNER_INGESTION_RUNBOOK.md`](./operations/SOURCES_OWNER_INGESTION_RUNBOOK.md) |
| Операционный «Founder OS» kit (шаблоны, не код) | [`README.md`](../README.md), CSV/MD из корня по ссылкам из README |

Статус спринтов и чекпоинты — файлы `SPRINT*_*.md` в корне и `docs/` (история выполнения, не замена PRD).

---

## Версия

Документ создан как **сводный sourcebook** в репозитории Toutism; синхронизируйте дату при крупных изменениях канона.

*Последнее обновление содержания: 2026-04-23 — зафиксировано закрытие разработческого этапа Stage 4.1: ADR-007 guard (`scripts/check-booking-status-writers.mjs`, `pnpm run check:booking-status-adr007`), **platform mode** (`launch` / `monetization`), синхронизация web/API, зелёная сборка api+web, QA-пакет [`qa/PLATFORM_MODE_QA.md`](./qa/PLATFORM_MODE_QA.md); переход к **эксплуатации** (трафик, аналитика, наблюдение commission violations **без** strict-mode до решения по snapshot).*
