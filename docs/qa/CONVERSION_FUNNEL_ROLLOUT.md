# Conversion funnel — запуск и контроль

Продуктовая воронка организатора (value-based), не массовая рассылка.

**Полный пакет приёмки (audit, матрица флагов, QA, тестовые контуры):** [`CONVERSION_FUNNEL_ACCEPTANCE.md`](./CONVERSION_FUNNEL_ACCEPTANCE.md).

**Owner approval для этапов 3–5:** [`CONVERSION_FUNNEL_OWNER_GOVERNANCE.md`](./CONVERSION_FUNNEL_OWNER_GOVERNANCE.md).

По умолчанию в коде автоматика ограничена этапами **0–2** (`CONVERSION_ALLOWED_MAX_STAGE=2`); этапы 4–5 требуют отдельных флагов.

## 1. Режим запуска

Сначала:

```env
CONVERSION_FUNNEL_ENABLED=1
CONVERSION_FUNNEL_SCHEDULER_ENABLED=0
```

Обработка очереди — вручную: `POST /jobs/run-conversion-funnel` (admin JWT).

## 2. Первая фаза rollout

Рекомендуемые значения (только этапы 0–2, без монетизации и без этапа 3+):

```env
CONVERSION_ALLOWED_MAX_STAGE=2
CONVERSION_ENABLE_STAGE4=0
CONVERSION_ENABLE_STAGE5=0
# опционально выключить follow-up
# CONVERSION_ENABLE_FOLLOWUP=0
```

Проверять: метрики, триггеры, отсутствие дублей по `dedupeKey`, канал (Telegram / email).

## 3. Вторая фаза

Через 2–3 дня можно включить планировщик:

```env
CONVERSION_FUNNEL_SCHEDULER_ENABLED=1
```

Этапы 4–5 по-прежнему выключены, пока `CONVERSION_ENABLE_STAGE4` / `CONVERSION_ENABLE_STAGE5` не включены осознанно.

## 4. Ограничение частоты

Не чаще **одного успешного** conversion-сообщения на организатора за период (по умолчанию 48 часов, все программы):

```env
CONVERSION_ORGANIZER_MIN_INTERVAL_HOURS=48
```

При блокировке в лог API пишется строка `[conversion-funnel] suppressed` с `reason: organizer_rate_limit`.

## 5. Логирование и аналитика

События в `analytics_events` (при включённом `ANALYTICS_ENABLED`):

- `value_threshold_reached`
- `organizer_conversion_stage_sent`
- `organizer_conversion_followup_sent`

Успешная доставка дублируется в stdout: `[conversion-funnel] delivered` (без PII, только id и stage).

## 6. Ежедневный контроль

`GET /jobs/conversion-funnel-stats?windowHours=24` (admin): доставки по каналам, failed, приблизительное число отписок (`serviceCommsOptIn` + `updatedAt` в окне).

Дополнительно: жалобы, ответы вручную (вне API).

## 7. Этапы 4 и 5 (монетизация)

Не включать по умолчанию. Включение только после накопления данных и проверки реакции:

```env
CONVERSION_ENABLE_STAGE4=1
CONVERSION_ENABLE_STAGE5=1
CONVERSION_ALLOWED_MAX_STAGE=5
```

## 8. UI

Блок «Твой прогресс» на `/organizers/analytics` показывает флаги `rollout` с API — сверять с фактическими текстами в `services/api/src/modules/conversion-funnel/messages.ts`.

## 9. Критерий успеха

Сообщения не воспринимаются как спам; есть диалог; нет стабильного негативного фидбэка.
