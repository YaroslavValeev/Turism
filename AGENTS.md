# AI-агенты и процесс (MyWave Travel)

Краткая точка входа для **Cursor** и людей. Детали: [`docs/development/AGENT_ORCHESTRATION.md`](docs/development/AGENT_ORCHESTRATION.md).

## Конвейер

`PLAN → AGENTS → TASKS → EXECUTION → VALIDATION → REPORT`

## Шаблон и merge (сначала это)

| Шаг | Файл |
|-----|------|
| Новая фича / новый чат — заполнить и вставить | [`docs/development/FEATURE_CHAT_TEMPLATE.md`](docs/development/FEATURE_CHAT_TEMPLATE.md) |
| Перед merge — галочки | [`docs/qa/MERGE_CHECKLIST.md`](docs/qa/MERGE_CHECKLIST.md) |
| После деплоя — короткий smoke | [`docs/qa/POST_MERGE_SMOKE.md`](docs/qa/POST_MERGE_SMOKE.md) |

## Промпты (копировать в отдельные чаты)

| Шаг | Файл |
|-----|------|
| Критика плана / архитектуры / scope | [`docs/development/PROMPT_DEVILS_ADVOCATE.md`](docs/development/PROMPT_DEVILS_ADVOCATE.md) |
| Приёмка перед merge (код + UX + канон) | [`docs/development/PROMPT_QA_AUDIT.md`](docs/development/PROMPT_QA_AUDIT.md) |

## Правила Cursor

Каталог [`.cursor/rules/`](.cursor/rules/): канон продукта (`alwaysApply`), отдельно — `api-services`, `web-apps` по glob.

## Канон продукта (не обсуждать в чате без ADR)

- Посредник, не туроператор; комиссия со сделки; assisted booking.
- Сводка: [`docs/PROJECT_SOURCEBOOK.md`](docs/PROJECT_SOURCEBOOK.md)
- Пробелы реализации vs планом: [`docs/qa/IMPLEMENTATION_GAPS.md`](docs/qa/IMPLEMENTATION_GAPS.md)

## Рекомендуемый порядок фич

1. Карточка + доверие + бронирование  
2. Контент и SEO  
3. UGC  
4. Полноценный AI (с policy и human gate)
