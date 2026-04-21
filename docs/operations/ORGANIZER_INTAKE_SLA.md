# SLA обработки заявок организатора (Public Organizer Intake)

Операционная политика (не автоматический энфорс в коде на MVP). Времена — **календарные часы**, рабочее окно ops по договорённости команды.

| Переход | Целевой срок | Примечание |
|---------|----------------|-------------|
| `new` → `in_review` | **≤ 4 ч** | Первое признание заявки в очереди |
| `in_review` → `draft_created` **или** `dismissed` | **≤ 48 ч** | Черновик программы из wizard v2 или явный отказ |

**Источник правды по статусам:** поля `processingStatus`, `processedAt` в `public_organizer_intakes`, аудит `public_organizer_intake`.

**Сигналы для контроля:** событие `intake_created` (analytics) + ops Telegram при наличии `TELEGRAM_BOT_API_BASE_URL` / `TELEGRAM_ALERT_CHAT_ID`.

Дальнейшие алерты по просрочке (DQ) — Stage 4 (см. `docs/migration/STAGE4_AGENT_PLAN.md`).
