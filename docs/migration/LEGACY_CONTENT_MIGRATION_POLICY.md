# Legacy Content Migration Policy

Версия: 1.0  
Дата: 2026-04-17  
Статус: required for stages 1-3 rollout

## 1. Что мигрируем

- Существующие карточки программ с неполными полями.
- Legacy organizer intake записи (`public-intake`) без полноценного onboarding контракта.

## 2. Правила для карточек программ

- Если не заполнены обязательные поля для публикации:
  - статус в админке: `changes_requested` (или `requires_completion` в compatibility label),
  - публичная публикация не допускается.
- Если карточка уже опубликована и выявлена неполнота:
  - временно остается видимой только если не нарушает safety/critical policy,
  - создается auto moderation task на доработку.

## 3. Правила для organizer intake

- Legacy intake не удаляется.
- Каждая запись маппится в onboarding pipeline:
  - `submitted` (raw intake accepted),
  - `under_review` (после triage),
  - `corrections_required` или `verified`.

## 4. Кто инициирует миграцию

- Stage Owner этапа 3 запускает migration batch.
- Product Logic Agent подтверждает правила статусов.
- QA Agent подтверждает отсутствие регрессии в каталоге.

## 5. Как не ломается каталог

- Additive policy:
  - не удаляем legacy fields до завершения migration parity.
  - используем fallback renderer.
- Для карточек с недостающими необязательными полями:
  - секция скрывается без ошибки рендера.

## 6. Критерий готовности

- Есть список legacy записей с migration outcome.
- Нет опубликованных карточек с критическим отсутствием mandatory safety/conditions полей.
- Публичный каталог проходит smoke после migration batch.

