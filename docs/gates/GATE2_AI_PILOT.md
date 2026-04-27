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

## Реализовано в API (P0, `services/api`)

Все маршруты **только admin JWT** (`Authorization: Bearer …`). Дубли префикса: `/ai-pilot` и `/api/ai-pilot`.

| Метод | Путь | Назначение |
|--------|------|------------|
| GET | `/ai-pilot/owner-policy` | Канон: `AI_OWNER_APPROVAL_REQUIRED`, `AI_AUTOPUBLISH_ENABLED`, флаги `AI_ENABLED`, наличие ключа OpenAI. |
| POST | `/ai-pilot/normalize` | Тело: `{ text, sourceUrl?, discipline?, region? }` → JSON карточки + `meta.source` (`llm` \| `fallback`). Без ключа / `AI_ENABLED=0` — fallback, **без 500**. |
| POST | `/ai-pilot/card-auditor` | Тело: `{ card: object }` → score / status / criticalMissing; эвристика + опционально LLM. |
| POST | `/ai-pilot/safety-check` | Тело: `{ text }` → эвристика фраз (без обязательного LLM). |
| GET | `/ai-pilot/founder-summary?period=weekly` (или `daily`) | Сводка по `getPilotKpiSnapshot` + `buildFounderSummary` + опционально LLM; fallback с агрегатами. |

**Аудит:** `writeAuditLog` с `entityType: ai_pilot`, действия `ai_normalize`, `ai_card_auditor`, `ai_safety_check`, `ai_founder_summary`.

**Переменные:** `OPENAI_API_KEY`, `AI_ENABLED`, `AI_OWNER_APPROVAL_REQUIRED`, `AI_AUTOPUBLISH_ENABLED` — см. `services/api/.env.example` и `@mywave/config` `loadEnv()`.

**Тесты:** `safetyHeuristic.test.ts`, `cardAuditorHeuristic.test.ts` (vitest).

## Evidence (локальный checkpoint)

Запуск:

- `pnpm --filter api smoke:ai-pilot`

Шаблон фиксации:

```text
Gate 2 AI P0 Evidence — PASSED|FAILED
Date: YYYY-MM-DD
Commit: <git sha>
GET /ai-pilot/owner-policy: 200
POST /ai-pilot/normalize: 200 (fallback без ключа/OpenAI disabled) | 200 (llm)
POST /ai-pilot/card-auditor: 200
POST /ai-pilot/safety-check: 200 (risky claims detected)
GET /ai-pilot/founder-summary: 200 (fallback без ключа/OpenAI disabled) | 200 (llm)
Audit log: entityType=ai_pilot present
Public POST /bookings: unchanged
No OPENAI_API_KEY: no 500 on AI endpoints
Known issues:
```

### Последний прогон (локально)

```text
Gate 2 AI P0 Evidence — PASSED
Date: 2026-04-26
Commit: 6efe69b
GET /ai-pilot/owner-policy: 200
POST /ai-pilot/normalize: 200 (fallback without key)
POST /ai-pilot/card-auditor: 200
POST /ai-pilot/safety-check: 200 (risky claims detected)
GET /ai-pilot/founder-summary: 200 (fallback without key)
Audit log: entityType=ai_pilot present
Public POST /bookings: unchanged (см. smoke:pilot-e2e)
No OPENAI_API_KEY: no 500 on AI endpoints
Smoke command: pnpm --filter api smoke:ai-pilot
Known issues: —
```

**P1 (ещё не обязательный минимум):** SEO Assistant, Outreach Draft — по отдельным задачам.

## P1 (локально, owner-approval only)

### Реализованные endpoints

- `POST /ai-pilot/seo-assistant` — генерация SEO-пакета (meta/slug/faq/internal links), fallback без OpenAI.
- `POST /ai-pilot/outreach-draft` — создаёт/обновляет `organizer_outreach_campaigns` в статусе `draft`, **без отправки**.
- `POST /ai-pilot/outreach-draft/:campaignId/submit-owner-approval` — переводит драфт в `pending_owner_review`, `sendBlocked=true`.
- `GET /ai-pilot/founder-summary/weekly` — weekly сводка (LLM или fallback), read-only.

### Smoke P1

- Команда: `pnpm --filter api smoke:ai-pilot-p1`
- Проверяет: `seo-assistant`, `outreach-draft`, owner-approval step, `founder-summary/weekly`, `ai_pilot` audit logs.

### Evidence block (P1)

```text
Gate 2 AI P1 Evidence — PASSED|FAILED
Date: YYYY-MM-DD
Commit: <git sha>
POST /ai-pilot/seo-assistant: 200
POST /ai-pilot/outreach-draft: 200 (status=draft, requiresOwnerApproval=true)
POST /ai-pilot/outreach-draft/:campaignId/submit-owner-approval: 200 (status=pending_owner_review, sendBlocked=true)
GET /ai-pilot/founder-summary/weekly: 200
Smoke: smoke:ai-pilot-p1 => exit 0
Audit log: entityType=ai_pilot for P1 actions
Autopublish: disabled
Autosend to organizer: disabled
Payments: unchanged/off
Verified status auto-assignment: disabled
Known issues:
```

### Последний прогон P1 (локально)

```text
Gate 2 AI P1 Evidence — PASSED
Date: 2026-04-26
Commit: 6efe69b
POST /ai-pilot/seo-assistant: 200
POST /ai-pilot/outreach-draft: 200 (status=draft, requiresOwnerApproval=true)
POST /ai-pilot/outreach-draft/:campaignId/submit-owner-approval: 200 (status=pending_owner_review, sendBlocked=true)
GET /ai-pilot/founder-summary/weekly: 200
Smoke: smoke:ai-pilot-p1 => exit 0
Audit log: entityType=ai_pilot for P1 actions
Autopublish: disabled
Autosend to organizer: disabled
Payments: unchanged/off
Verified status auto-assignment: disabled
Known issues: —
```

## Не входит в Gate 2 (сознательно)

- Новые крупные ML-модели, отдельный «AGI» слой.
- Auto-publish или auto-рассылка без владельца.
