# Definition of Done: Stages 1-3

Версия: 1.0  
Дата: 2026-04-17  
Статус: acceptance gate document

## Stage 1: Искатель (карточка + каталог)

### Functional result
- Карточка программы использует единый шаблон секций.
- Пустые секции не рендерятся.
- Дисциплина/регион кликабельны и применяют фильтры каталога.

### UI-visible result
- Пользователь видит структурированные блоки вместо сплошного текста.
- В каталоге явно показаны активные фильтры.

### Tests required
- Unit: render rules по заполненным/пустым полям.
- Integration: navigation + query filter mapping.
- E2E: 10 карточек (полные/неполные) без broken layout.

### Feature flags / rollback
- URL-фильтры каталога: `discipline`, `country`, `region` (shareable deep-link на `/#programs`)
- Rollback: вернуть прежний рендер/навигацию через revert PR (флаги в коде не обязательны, т.к. изменения additive-friendly)

### Blockers to next stage
- Секции продолжают показываться пустыми.
- Фильтры ломают навигацию.
- Нет smoke report по 10 карточкам.

## Stage 2: Форма заявки + delivery pipeline

### Functional result
- Обновленная форма заявки принимает обязательные поля.
- Заявка всегда привязана к `booking_id`, `program_id`, `organizer_id`.
- Работает primary Telegram + fallback delivery.

### UI-visible result
- Понятная форма, валидируемые поля, подтверждение отправки.
- Пользователь не теряет контекст после submit.

### Tests required
- Unit: валидация submit payload.
- Integration: routing rules verified/fallback.
- E2E:
  - verified organizer -> Telegram delivery,
  - unverified/telegram unavailable -> fallback delivery.

### Feature flags / rollback
- `FEATURE_TELEGRAM_PRIMARY_DELIVERY`
- `FEATURE_DELIVERY_FALLBACK_ROUTER`
- `FEATURE_DELIVERY_AUDIT_LOG`
- Rollback: telegram off, fallback-only mode.

### Blockers to next stage
- Любой path теряет заявку.
- Нет idempotency контроля duplicate delivery.
- Нет delivery audit trail.

## Stage 3: Organizer portal hardening

### Functional result
- Многошаговая форма подачи программы с draft-save.
- Валидация обязательных полей перед `submitted`.
- Legacy intake поддерживается через compatibility adapter.

### UI-visible result
- Организатор видит шаги, статус, ошибки и прогресс.
- В карточке и/или админке отображается verified/not verified.

### Tests required
- Unit: mandatory fields validation.
- Integration: draft-save/reload/submit transitions.
- E2E: submit полной карточки и блок submit неполной карточки.

### Feature flags / rollback
- `FEATURE_ORGANIZER_STEP_FLOW`
- `FEATURE_ORGANIZER_DRAFT_SAVE`
- `FEATURE_PROGRAM_MANDATORY_ENFORCEMENT`
- Rollback: return to legacy intake form.

### Blockers to next stage
- Неполная программа проходит в `submitted`.
- Draft-save теряет данные.
- Нет migration policy для legacy контента.

