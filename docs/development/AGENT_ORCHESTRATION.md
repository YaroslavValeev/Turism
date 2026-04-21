# Оркестрация AI-агентов разработки (MyWave Travel)

Цель — **система создания продукта**, а не набор разрозненных чатов. Порядок приоритизации: **карточка → доверие → бронирование** → контент → UGC → AI.

## 1. Конвейер сессии (обязательная модель)

```
PLAN → AGENTS → TASKS → EXECUTION → VALIDATION → REPORT
```

| Этап | Ответственный | Артефакт |
|------|----------------|----------|
| PLAN | Architect + Product | scope, риски, зависимости, ссылки на PRD |
| AGENTS | Orchestrator (человек или lead-чат) | кто из ролей подключён |
| TASKS | Product + area lead | user stories, acceptance |
| EXECUTION | Backend / Frontend / др. | код, миграции, UI |
| VALIDATION | QA (промпт) + при споре Devil’s Advocate | вердикт merge |
| REPORT | Architect или TL | что сделано, долг, метрики |

## 2. Роли (главные агенты)

| Роль | Фокус |
|------|--------|
| Architect | модули, контракты, границы сервисов, соответствие канону |
| Product | UX flow, приоритет фаз, acceptance |
| Backend | API, Prisma, статусы, аудит, биллинговые записи |
| Frontend | каталог, карточка, кабинеты, состояния |
| AI Core | propose → rules → human; shadow; confidence; audit |
| Marketing | UGC, воронка, контент; без искажения юридического смысла |
| Finance | комиссия, premium, партнёрский статус, маркировка |
| QA | тест-план, вердикт merge, регрессия |

## 3. Subagents (подзадачи)

- **Product:** UX Flow; Program Card (структура карточки, блоки тура).
- **Backend:** Booking Logic; Organizer Verification (сертификаты, страховка, ЧП, оборудование).
- **AI:** Recommendation; Moderation; Content Parser (ingestion).
- **Marketing:** UGC; Referral; Content Distribution (TG/VK/IG/Dzen из конфигурации).

## 4. Шаблон сессии и merge

| Назначение | Файл |
|------------|------|
| Старт фичи / чата (PLAN + TASKS без пробелов) | [`FEATURE_CHAT_TEMPLATE.md`](./FEATURE_CHAT_TEMPLATE.md) |
| Короткий чеклист перед merge | [`docs/qa/MERGE_CHECKLIST.md`](../qa/MERGE_CHECKLIST.md) |
| Smoke после деплоя (staging / prod) | [`docs/qa/POST_MERGE_SMOKE.md`](../qa/POST_MERGE_SMOKE.md) |
| Пробелы реализации vs планом | [`docs/qa/IMPLEMENTATION_GAPS.md`](../qa/IMPLEMENTATION_GAPS.md) |

## 5. Где лежат промпты

| Назначение | Файл |
|------------|------|
| Разнос планов, поиск блокеров | [`PROMPT_DEVILS_ADVOCATE.md`](./PROMPT_DEVILS_ADVOCATE.md) |
| Приёмка кода/UX перед merge | [`PROMPT_QA_AUDIT.md`](./PROMPT_QA_AUDIT.md) |

## 6. Правила Cursor

См. корень репозитория: [`AGENTS.md`](../../AGENTS.md) и каталог [`.cursor/rules/`](../../.cursor/rules/).

## 7. Первоисточники продукта (читать перед спором)

- `docs/PROJECT_SOURCEBOOK.md`
- `DERIVED_PRD.md`
- `IMPLEMENTATION_BLUEPRINT.md`
- `canonical_entity_model.md`, `canonical_status_models.md`

---

*Версия: 2026-04-17 — шаблон фичи, merge-checklist, post-deploy smoke.*
