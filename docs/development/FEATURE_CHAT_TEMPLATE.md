# Шаблон: новая сессия / фича (скопируйте в чат)

Заполните блоки квадратными скобками или удалите ненужное. Цель — **ничего не упустить** на этапе PLAN → TASKS.

---

## Контекст

- **Ветка / PR:** [ ]
- **Кратко что делаем (1–3 предложения):** [ ]

## Канон и границы

- **Затронутые сущности / статусы:** [ ] (сверка: `canonical_entity_model.md`, `canonical_status_models.md`)
- **Риск «второй правды» (Lead vs Booking и т.п.):** [ нет / да — как мигрируем ]
- **Публикация / ингест / деньги:** [ да / нет ] — если да: гейты и аудит учтены? [ ]

## Роли (AGENTS)

- [ ] Architect  [ ] Product  [ ] Backend  [ ] Frontend  [ ] QA  [ ] Finance  [ ] AI  [ ] Marketing  

## Задачи (TASKS)

### User story

Как **[роль]** я хочу **[действие]**, чтобы **[ценность]**.

### Acceptance (Given / When / Then)

1. [ ]
2. [ ]

### Не в scope этой итерации

- [ ]

## Исполнение (EXECUTION)

- **Файлы / модули (план):** [ ]
- **Миграции Prisma:** [ нет / да — описание ]
- **Env / секреты:** [ нет / да — только `.env.example` без значений ]

## Валидация (VALIDATION)

- [ ] Пройден [`docs/qa/MERGE_CHECKLIST.md`](../qa/MERGE_CHECKLIST.md)
- [ ] При необходимости: промпт [`PROMPT_QA_AUDIT.md`](./PROMPT_QA_AUDIT.md)
- [ ] При спорном scope: [`PROMPT_DEVILS_ADVOCATE.md`](./PROMPT_DEVILS_ADVOCATE.md)
- [ ] После выката на окружение: [`docs/qa/POST_MERGE_SMOKE.md`](../qa/POST_MERGE_SMOKE.md)

## Отчёт (REPORT после merge)

- **Сделано:** [ ]
- **Долг / follow-up:** [ ]
- **Метрики / наблюдения:** [ ]
