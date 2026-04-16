# Metrics foundation (admin / funnel, операционные агрегаты)

Только операционные агрегаты для ops и пилота. Без premature revenue UI, без лишней аналитической сложности.

## Назначение

- Одна точка (endpoint или отчёт) для быстрой оценки состояния воронки и очередей.
- Основа для будущего admin-дашборда (не финансового): сколько заявок в каком статусе, инциденты, отзывы на модерации, комиссии в работе.

## Метрики (операционные)

| Метрика | Описание | Источник |
|---------|----------|----------|
| Bookings by status | Количество бронирований по каждому bookingStatus | Booking |
| Incidents by status | Количество инцидентов по incidentStatus | Incident |
| Reviews by moderation | Количество отзывов по moderationStatus | Review |
| Commissions by reconciliation | Количество комиссий по reconciliationStatus | Commission |
| Organizers by verification | Количество организаторов по verificationStatus | Organizer |

Агрегаты считаются по текущему состоянию БД (без временных окон в MVP). При необходимости позже добавляются фильтры по дате.

## Реализация

- **API:** GET /metrics/admin/funnel (только с admin auth). Ответ: JSON с объектами вида `{ bookings: { new: N, reviewed: M, ... }, incidents: { ... }, ... }`.
- **Нет:** графиков, исторических рядов, revenue dashboard, экспорта в BI на этом этапе.

## Source of truth

Агрегаты выводятся из тех же таблиц, что и очереди (bookings, incidents, reviews, commissions, organizers). Отдельное хранилище метрик не вводится.
