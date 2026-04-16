# Cursor Task Briefs

## Универсальный brief для Cursor / dev agent

Контекст:
Мы строим trust-first платформу для спортивно-тренировочных выездов.
Модель монетизации: комиссия только с состоявшейся сделки.
Запуск: assisted booking + manual verification.

Задача:
[описать задачу]

Обязательно:
- не ломать booking status model
- учитывать organizer / program / booking / review / commission entities
- указывать точный файл и точку изменения
- дать rollback path
- дать test checklist

Формат ответа:
1. Что меняем
2. Зачем
3. Какие файлы
4. Как тестировать
5. Риски

---

## Пример заполненного brief

Контекст: (как выше)

Задача:
Реализовать canonical booking status model: new → contacted → booked → completed. Плюс статусы отмены: cancelled_by_client, cancelled_by_organizer, refund_pending.

Обязательно:
- не ломать существующие booking entities
- учитывать organizer / program / booking / review / commission
- добавить в [путь к модели], миграция — [путь]
- rollback: откат миграции + revert коммита
- test checklist: unit на валидацию статусов, интеграция на flow new→completed

Формат ответа: (как выше)
