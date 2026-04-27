# P1 checkpoint — AI Pilot (локальный репозиторий)

Короткий чеклист перед окончательным закрытием **Gate 2 AI P1** (после зелёного `smoke:ai-pilot` / `smoke:ai-pilot-p1`).

## 1. `/ai-pilot/*` только с admin JWT

**Статус:** подтверждено в коде.

Все маршруты `aiPilotRoutes` обёрнуты в `requireAdmin(env)` — без валидного `Authorization: Bearer <admin_jwt>` ответ **401/403**, публичного доступа нет.

- `services/api/src/modules/ai-pilot/routes.ts` — `const admin = requireAdmin(env);` на роутере
- `services/api/src/middleware/auth.ts` — `requireAdmin`

## 2. `outreach-draft` не вызывает SMTP, Telegram, webhook, внешнюю отправку

**Статус:** подтверждено в коде.

`buildOutreachDraft` импортирует только Prisma, `callOpenAiJson`, метрики/шаблоны и `computeReportingWindow` / `submitOutreachForReview` (последний **не** вызывается из `buildOutreachDraft`). Нет импортов `sendEmail`, `notifyOutreach`, `fetch` к вебхукам.

- `services/api/src/modules/ai-pilot/outreachDraft.ts` — только `prisma.*.create/update` в статусе `draft`, плюс опционально OpenAI.

## 3. `submit-owner-approval` только `pending_owner_review`, без отправки

**Статус:** подтверждено в коде.

`submitOutreachDraftForOwnerApproval` вызывает `submitOutreachForReview` из `organizer-outreach/service` — там только обновление статуса `draft` → `pending_owner_review` и `writeAuditLog`. **Нет** вызова `sendOutreachEmailForCampaign`, `approveAndSendOutreachCampaign` и т.п.

- `services/api/src/modules/ai-pilot/outreachDraft.ts` — `submitOutreachDraftForOwnerApproval`
- `services/api/src/modules/organizer-outreach/service.ts` — `submitOutreachForReview` (только статус + audit)
- `services/api/src/modules/ai-pilot/routes.ts` — `POST .../submit-owner-approval` возвращает `sendBlocked: true` (напоминание клиенту)

## 4. AI audit log не копит лишние PII

**Статус:** подтверждено по контракту `logAiPilotAction`.

В `audit_logs` для `entityType: ai_pilot` пишется JSON с полями `model`, `status`, `detail` (обрезка до 2000 символов, общий `newValue` до 4000). **Полные тела запросов (текст программы, email и т.д.) в audit не складываются** — в лог идут метаданные действия. Идентификатор субъекта: `changedBy` = `adminUserId` при наличии.

- `services/api/src/modules/ai-pilot/auditAiPilot.ts` — `logAiPilotAction`

*Оговорка:* в `detail` теоретически может попасть текст исключения при ошибке; в штатных путях передаются `reason` / `fallbackReason`, не сырой payload заявок.

## 5. SEO Assistant не публикует на сайт автоматически

**Статус:** подтверждено в коде.

`buildSeoAssistant` / `POST /ai-pilot/seo-assistant` возвращают JSON в HTTP-ответе. **Нет** вызовов Prisma `program.update`, `blog_posts`, content-pipeline, публикации в web.

- `services/api/src/modules/ai-pilot/seoAssistant.ts` — только вычисление/LLM + ответ
- `services/api/src/modules/ai-pilot/routes.ts` — `POST /seo-assistant` только `res.json({ result, meta })`

---

## Итог: закрытие P1 на 10/10 (локально)

Если **все 5 пунктов выше** приняты (код-ревью + зелёный smoke) — **Gate 2 AI P1** в рамках локального репозитория можно считать закрытым.

### Принятие команды (зафиксировано)

- **Дата:** 2026-04-26  
- **Условия:** пять safety-подтверждений выше + зелёный `pnpm --filter api smoke:ai-pilot-p1` (exit 0).  
- **Решение:** **Gate 2 AI P1 — закрыт на 10/10** в рамках локального репозитория.

До полного **Local Pilot Evidence Pack** остаётся обязательный шаг: **Gate 1 UI-pass** и обновление `docs/gates/GATE1_LOCAL_GREEN_SMOKE.md` (без этого пакет не считается закрытым).

## Общий статус (заполняется при закрытии evidence-пакета)

```text
Gate 1 API — PASSED
Gate 1 UI — PENDING (ожидается ручной UI-pass в GATE1_LOCAL_GREEN_SMOKE.md)
Gate 2 AI P0 — PASSED
Gate 2 AI P1 — PASSED
Local Pilot Evidence Pack — PENDING (блокируется Gate 1 UI)
Date: 2026-04-26
Commit: 6efe69b
Notes: новые продуктовые фичи не добавлять до закрытия Gate 1 UI; далее — Gate 3 Timeweb evidence.
```

**Следующий правильный порядок (напоминание):** сначала **закрыть Gate 1 UI-pass** в `GATE1_LOCAL_GREEN_SMOKE.md`, если он ещё `PENDING`, затем обновить этот блок и (при необходимости) `GATE2_AI_PILOT.md` / Timeweb evidence.
