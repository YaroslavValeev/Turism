# Score governance (internal v1)

## Назначение

`organizer_score` и `total_program_score` — **внутренние** сигналы для приоритизации работы с supply и качеством карточек. Не публичный рейтинг и не юридическое обязательство.

## Источник правды

- Расчёт: [`services/api/src/modules/analytics/scoreEngine.ts`](../../../services/api/src/modules/analytics/scoreEngine.ts)
- Снимки: таблицы `organizer_score_snapshots`, `program_score_snapshots`
- Запуск: `POST /internal/analytics/scores/recalculate` (см. [`SCHEDULE.md`](./SCHEDULE.md))

## Полосы (`score_band`)

| Значение | Смысл |
|----------|--------|
| `low` / `medium` / `high` | Итоговый балл в диапазоне порогов (см. код: меньше 45 — low, меньше 72 — medium) |
| `unknown` | Недостаточно бронирований у организатора для устойчивой полосы (`SCORE_MIN_BOOKINGS_FOR_BAND`) |
| `insufficient_data` | У программы мало просмотров для performance-части (`SCORE_MIN_VIEWS_FOR_PROGRAM_PERF`) |

## Минимальный объём данных (env)

| Переменная | По умолчанию | Назначение |
|------------|--------------|------------|
| `SCORE_MIN_BOOKINGS_FOR_BAND` | 2 | Минимум бронирований в окне для band ≠ unknown |
| `SCORE_MIN_VIEWS_FOR_PROGRAM_PERF` | 8 | Минимум событий просмотра для расчёта performance |

Изменение весов компонентов и формул — решение владельца продукта + фиксация в ADR/версии `scoreEngine`.

## Частота пересчёта

Рекомендация: не реже 1×/сутки после стабилизации событий; чаще — только при операционной необходимости (нагрузка на БД).

## Интерпретация для команды

- **Низкий score организатора:** проверить SLA, refund/incident, заполнение профиля, billing/contract шаги (см. компоненты в `componentsJson`).
- **Низкий score программы:** контент, медиа, отзывы, расписание, политика отмены; при `insufficient_data` — не наказывать низким performance до появления трафика.
