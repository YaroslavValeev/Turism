# Cursor Prompt Pack

## Universal implementation brief
Контекст:
Строим trust-first платформу спортивно-тренировочных выездов.
Ключевые сущности: organizer, program, booking, review, incident, commission.
Монетизация: комиссия только с состоявшейся сделки.
Не ломать канонические статусы и data contracts.

Задача:
[описать задачу]

Обязательно:
- указать точные файлы
- указать изменения в schema / API / UI / jobs / analytics
- дать acceptance criteria
- дать rollback path
- дать test checklist
- отметить влияние на admin queues и audit logs

Формат ответа:
1. Что меняем
2. Почему
3. Какие файлы
4. Какие данные / статусы затрагиваются
5. Как тестировать
6. Риски
7. Rollback

## Prompt — build module
Собери модуль [название] по артефактам из kit v5/v6.
Нельзя придумывать новые сущности и статусы, если они не согласованы.
Сначала опиши implementation plan, затем дай file-by-file changes.

## Prompt — schema change
Нужно изменить БД.
Сначала проверь:
- ломает ли это canonical entities
- нужна ли миграция данных
- затрагивает ли analytics
- затрагивает ли admin dashboard
- затрагивает ли jobs

Потом дай safe migration sequence.
