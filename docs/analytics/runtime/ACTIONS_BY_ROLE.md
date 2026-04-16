# Действия по ролям (default playbook)

Краткие шаги при сигналах с Founder dashboard / DQ / billing alerts. Детали DQ: [`DQ_PLAYBOOK.md`](./DQ_PLAYBOOK.md).

## Founder / GM

| Сигнал | Действие |
|--------|----------|
| DQ `critical` | Собрать 15-минутный triage: ingestion vs mart vs infra; назначить владельца инцидента на сутки |
| Падение organizer score WoW | Выбрать топ-3 weak organizers, созвон с партнёрством по плану улучшений на неделю |
| Падение program score WoW | Выборочный аудит карточек + приоритет доработок контента |
| `no_analytics_events_in_window` на стенде | Ожидаемо; на prod — проверить consent и включение `ANALYTICS_ENABLED` |

## Partnerships / supply

| Сигнал | Действие |
|--------|----------|
| Weak organizer (low / unknown с малым n) | Письмо/звон: ожидания платформы, договор, SLA ответа, реферальные программы |
| Weak program | Чеклист: медиа ≥1, отзывы, itinerary, cancellation, safety; оффер помощи редактора |

## Moderation / trust & safety

| Сигнал | Действие |
|--------|----------|
| Рост complaint/incident в компонентах score | Просмотр открытых инцидентов по организатору; эскалация по внутренним правилам эскалации команды |
| Организатор с низким score и высоким refund | Совместно с finance — сверка статусов бронирований |

## Finance / billing

| Сигнал | Действие |
|--------|----------|
| Billing alert (refunds выше payments и т.д.) | Уже в [`alerts.ts`](../../../services/api/src/modules/analytics/alerts.ts); сверка дня в `mv_billing_daily`, связь с организатором |
| Orphan payment/refund в DQ | Проверить порядок emit vs commit в коде платежей; починить регрессию |

## Владелец DQ-контура

- Раз в квартал: сверить пороги env с реальным шумом (см. таблица в [`DQ_PLAYBOOK.md`](./DQ_PLAYBOOK.md)).
- Реагировать на «alert fatigue»: поднять пороги или уменьшить частоту `alerts/run`, не отключая критические классы.
