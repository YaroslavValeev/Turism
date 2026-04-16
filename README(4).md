# Founder OS Kit v5 — Product / Data / Automation System

Этот kit превращает проект в управляемую продуктовую и операционную систему на уровне:
- канонических сущностей
- статусных моделей
- событий и аналитики
- automation-логики
- admin / ops очередей
- observability и release контроля

## На базе чего собран
Kit v5 опирается на уже зафиксированную логику проекта:
- PRD: каталог программ, профили организаторов, бронирование, отзывы, safety-блоки
- Technical spec: frontend + backend API + PostgreSQL + роли customer / organizer / admin
- Implementation plan: MVP за 6 месяцев, staged rollout
- Test plan: functional + security + performance + usability
- Deployment plan: dev / staging / prod + rollback + smoke tests
- Legal pack: organizer rules, contract, cancellation, disclosure, informed consent
- Founder kits v2–v4: verified framework, booking/status logic, revenue-deal tracking, partnerships flow

## Что внутри
- canonical_entity_model.md
- canonical_status_models.md
- program_card_schema.md
- booking_data_contract.md
- commission_data_contract.md
- data_dictionary.csv
- booking_field_map.csv
- event_tracking_plan.csv
- funnel_metrics_model.md
- north_star_tree.md
- admin_ops_dashboard_spec.md
- ops_queues_and_slas.md
- automation_map.csv
- notification_matrix.csv
- manual_vs_automation_boundaries.md
- qa_data_automation_matrix.csv
- release_observability_checklist.md
- audit_log_spec.md
- taxonomy_and_filters_model.md
- integration_contracts.md

## Базовые решения, встроенные в kit
- монетизация: комиссия только с состоявшейся сделки
- текущий юрстатус старта: самозанятый, Валеев Ярослав Радионович
- trust-first логика: assisted booking + manual verification
- verified organizer = личный опыт + медиа + >=10 отзывов + клиентский рейтинг
- north star: количество состоявшихся бронирований у verified organizers
