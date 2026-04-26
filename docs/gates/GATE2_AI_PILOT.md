# Gate 2 — AI Pilot Operating Layer (минимальный контур)

**Правило владельца (канон):** AI может **готовить, анализировать, нормализовать, предлагать, черновить**. **Публикация, отправка организатору, деньги, спорные действия** — **только после подтверждения владельца** (как в контент-конвейере: Telegram/admin approve).

## 1–10: карта по репозиторию (текущее / цель)

| # | Название | Роль | Где в репо / примечание | Статус (пилот) |
|---|----------|------|------------------------|----------------|
| 1 | AI Program Normalizer | Приводит поля программы к канону | Ingestion + `programs` + при необходимости LLM в `services/agents` | **Частично** (правила, publish gate); полный нормализатор — доработка. |
| 2 | AI Card Quality Auditor | Оценка карточки, weak signals | `ProgramScoreSnapshot`, `publishGate`, аналитика | **Частично** (скоринг); отдельный «auditor»-промпт — опционально. |
| 3 | AI Safety Checker | Красные флаги текста/офферов | Политика в `publishGate`, модерация | **Частично**; расширить policy YAML по мере рисков. |
| 4 | AI SEO Assistant | Подсказки SEO к блогу/карточкам | `blog_posts` поля, site publisher, админ `blog-posts` | **Частично**; LLM-черновик без auto-publish. |
| 5 | AI Telegram Founder Summary | Сводка для владельца | `services/agents/analytics` (formatter, `telegramControl`) | **Каркас**; включить крон/ручной run, токен/чат. |
| 6 | AI Analytics Summary по pilot KPI | Текст к `/metrics/pilot-kpi` / content-entries | `agents/analytics` + `GET /metrics/...` | **Каркас**; сначала read-only, без записи. |
| 7 | AI Outreach Draft для организаторов | Черновики рассылки / outreach | `organizer-outreach`, `services/agents/marketing` | **Каркас**; отправка только из админки с подтверждением. |
| 8 | Owner approval | Ручной gate перед публикацией/отправкой | `content-pipeline/approval`, Telegram callbacks, `publishDraft` | **Сделано** для контента; **реюз** для outreach по тому же паттерну. |
| 9 | AI logs / audit | Следы решений | `writeAuditLog`, `services/agents/orchestrator/decision-log` | **Частично**; унифицировать поле `entityType` + payload для AI. |
| 10 | Fallback: AI не роняет flow | Брони/админ/контент при падении LLM | `try/catch` в job routes, `emitBackendAnalytics` best-effort, `safeServerFetch` в web | **Принцип** — всегда **best-effort**; повтори паттерн для новых AI-вызовов. |

## DoD (минимум к «пилоту с AI»)

- Для **каждой** новой AI-цепочки: **таймаут**, **catch**, **лог** (без секретов), **аудит** с `idempotency`/run id при наличии.
- **Ни один** `POST` наружу (организатор, Telegram broadcast) **без** явного шага owner/admin после черновика.
- Документация: этот файл + [STATUS_10_10.md](../STATUS_10_10.md) + ADR по контенту/аутрич.

## Не входит в Gate 2 (сознательно)

- Новые крупные ML-модели, отдельный «AGI» слой.
- Auto-publish или auto-рассылка без владельца.
