# Founder OS Kit v6 — Build System / Repo / Delivery Architecture

Этот набор переводит проект в режим прямой реализации.
Он собирает воедино:
- продуктовую модель из PRD
- архитектурные решения из technical spec
- release discipline из test/deploy plan
- status/data logic из v5
- team/AI execution logic из v3
- revenue / partnerships logic из v4

## Цель kit
Дать разработке один канонический набор артефактов:
1. как выглядит репозиторий
2. какие окружения нужны
3. какие сущности и API нужны
4. как выглядит черновая схема БД
5. как должна работать админка
6. в каком порядке собирать модули
7. как ставить задачи в Cursor / AI-team
8. какие acceptance criteria нужны по модулям

## Основные решения, встроенные в kit
- trust-first launch
- assisted booking + manual verification
- комиссия только с состоявшейся сделки
- северная звезда: completed bookings у verified organizers
- юр.статус старта: самозанятый, Валеев Ярослав Радионович
- verified organizer = личный опыт + медиа + >=10 отзывов + рейтинг

## Что внутри
- repo_structure.md
- file_tree_template.txt
- environment_matrix.csv
- config_and_secrets_map.csv
- api_map.csv
- endpoint_contracts.md
- db_schema_draft.csv
- db_relationship_notes.md
- admin_panel_map.md
- implementation_order.md
- module_delivery_roadmap.csv
- release_plan_by_module.md
- qa_acceptance_by_module.csv
- migration_strategy.md
- coding_standards.md
- cursor_prompt_pack.md
- handoff_to_dev_team.md

## Как использовать
1. Зафиксируй стек.
2. Прими repo_structure.md как каноническую структуру.
3. Подними environment_matrix.csv и config_and_secrets_map.csv.
4. Реализуй сущности и статусы по db_schema_draft.csv и api_map.csv.
5. Собирай модули в порядке implementation_order.md.
6. Каждую задачу в Cursor оформляй по cursor_prompt_pack.md.
