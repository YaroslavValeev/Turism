# Stage 4 — подготовка: статусы, события, автоматизация (Admin Backbone)

Цель: встроить intake, program, booking и revenue в **единую status/event модель** без «тихих» переходов и без обхода гейтов.

## 1. Интеграция intake в status/event backbone

| Сущность | События (минимум) | Статусы |
|----------|-------------------|---------|
| `PublicOrganizerIntake` | `intake_created` (есть), далее `intake_status_changed`, опционально `intake_draft_linked` | `new` → `in_review` → `draft_created` \| `dismissed` |
| `Program` | `program_draft_created_from_intake` (через audit сегодня), далее publish workflow | `draft` → `internal_review` → … |
| `Booking` | уже: `booking_created`, `lead_delivered`, … | канон из `canonical_status_models` |

**Связь lifecycle:** intake (wizard v2) → **draft** program (идемпотентно) → оператор доводит медиа/publish gate → публикация → заявки гостей остаются на существующем booking pipeline.

## 2. Program lifecycle после intake (draft → moderation)

Рекомендуемая цепочка (продуктово):

1. **draft** — автоматически из intake (текущее поведение).
2. **internal_review** — оператор проверил поля, добавил медиа, готов к модерации.
3. **needs_fix** / **approved** / **published** — существующий publish workflow без auto-publish из intake.

**Запрещено:** автоматический переход `draft` → `published` из intake или из ingestion без человека/гейта.

## 3. Делегирование через агентов (следующий спринт)

### Backend Agent

- Доводит связку intake ↔ program (консистентность `linkedProgramId`, 409-сценарии).
- Расширяет события: `intake_status_changed`, опционально `program_created_from_intake` в analytics allowlist.
- Подготовка DQ по SLA (просрочки `new` / `in_review`).

**Subagents:**

1. **Intake Processing** — статусы, аудит, идемпотентность POST draft-program.
2. **Program Link** — маппинг meta → Program, валидация с `publishGate` поэтапно.
3. **Event Emission** — analytics + контракт PII для `properties_json`.

### Frontend / Admin Agent

- Убирает оставшиеся ручные шаги (глубже: фильтр программ по id, breadcrumbs).
- Единая навигация (`AdminNav`) на всех ops-страницах.

**Subagents:**

1. **Intake List UI** — колонки, фильтры, ссылки.
2. **Intake Detail UX** — превью, быстрые переходы (уже: `/programs?program=`).

### Integration Agent

- Ops: Telegram-алерты по SLA breach (через существующий ops scheduler / marts).
- Связка с `TELEGRAM_ALERT_CHAT_ID`.

**Subagents:**

1. **Ops Notification** — шаблоны текстов без PII, cooldown.

### QA Agent

- intake → draft → открыть программу по query.
- Повтор POST draft-program → идемпотентность.
- 409 при битом `linkedProgramId`.
- Статусы PATCH intake.
- Событие `intake_created` приходит в store (при включённом `ANALYTICS_ENABLED`).

## 4. Rollback / флаги

- Отключение ops Telegram: не задавать `TELEGRAM_ALERT_CHAT_ID`.
- Отключение записи событий: `ANALYTICS_ENABLED=0` (как сейчас для других backend-событий).
