# Staging-first gate report (parity, Telegram, review MVP, prod)

Сводка для перехода к выделенному staging и prod. Обновляйте дату/секцию «Runtime fingerprint» после каждого прогона.

## Runtime fingerprint (последний прогон в репозитории)

| Параметр | Значение |
|----------|----------|
| Дата отчёта | 2026-04-16 |
| `TARGET_BASE_URL` (host) | `localhost:3001` — **не** выделенный staging-хост; контур staging-like / local-first |
| `TARGET_INTERNAL_TOKEN` / internal | задан |
| `TARGET_ADMIN_TOKEN` | задан (для parity) |
| `TELEGRAM_BOT_API_BASE_URL` | задан |
| `TELEGRAM_ALERT_CHAT_ID` | задан |

Для **выделенного staging**: замените `TARGET_BASE_URL` на HTTPS API staging, выровняйте токены с секретами staging, повторите все команды ниже.

---

## 1. Staging parity report

### Команда

```bash
pnpm --filter @mywave/config build
node scripts/check_analytics_parity.mjs
```

При необходимости локального сравнения задайте также `LOCAL_BASE_URL`, `LOCAL_ADMIN_TOKEN`, `LOCAL_INTERNAL_TOKEN`.

### Критерии «green» (target)

| Проверка | Ожидание |
|----------|----------|
| `GET /health` | `200`, `ok` |
| Dashboards (admin JWT) | `dq`, `founder`, `billing`, `founderDaily` — `live` |
| `POST /internal/analytics/refresh` | `200`, `ok: true` |
| `POST /internal/analytics/scores/recalculate` | `200`, `ok: true` |
| `POST /internal/analytics/alerts/run` | `200`, `ok: true` |

### Результат прогона (localhost target, 2026-04-16)

- Health: **200**, ok  
- Dashboards: **live** (dq, founder, billing)  
- Cycle: **refresh / scores / alerts** — все **ok**  
- Алерты в этом прогоне **не срабатывали** (`fired: []`) — нормально при зелёном DQ.

**Вывод:** parity по целевому URL в актуальной конфигурации **GREEN**. На отдельном staging-хосте нужен **повторный** прогон с теми же критериями.

---

## 2. Telegram runtime check

### Команда

```bash
pnpm run check:telegram-alerts
```

Вызывает `POST …/internal/analytics/alerts/run` с internal token.

### Результат прогона (2026-04-16)

- HTTP: **200**  
- Тело: `ok: true`, `fired: []`, `skipped: []`, поле `telegram: false` — **ожидаемо**, если нет сработавших алертов (отправка в Telegram выполняется только при `fired.length > 0`).

### Подтверждение реальной доставки в чат

Нужен хотя бы один сценарий с **непустым `fired`** (например критический DQ или тестовый billing anomaly на staging-данных), либо отдельный controlled вызов Bot API вне алертов. До этого момента считать: **runtime конфигурации Telegram загружена, путь `/alerts/run` исполняется**.

---

## 3. Auto review request MVP — staging validation

Опорный чеклист: `REVIEW_FLOW_MANUAL_VALIDATION_STAGE.md` (сценарии 1–6 уже пройдены на local/staging-like).

На **выделенном staging** повторить:

1. **completed → review request** — строка в `review_requests`, статус `queued`.  
2. **`POST /reviews/requests/process`** — переход `queued → sent`, счётчики доставки.  
3. **`POST /reviews/request/:token/submit`** — одна review, request в `skipped_review_exists` или эквивалент.  
4. **Повторный submit** — `409`, вторая review не создаётся.  
5. **Напоминания** — bounded `reminderCount`, без дублирующего спама при повторном process.  
6. **После review** — process не шлёт лишних писем/сообщений.

Дополнительно на staging: проверить **реальный** канал доставки (если не mock), мониторинг `delivery_failed`.

**Вывод по коду/докам:** MVP готов к повторной валидации на staging-хосте; автоматический «зелёный» прогон из CI без данных бронирований здесь не выполнялся.

---

## 4. Rollout recommendation (prod)

Опираться на `AUTO_REVIEW_PROD_ROLLOUT_PLAN.md`.

| Рекомендация | Деталь |
|--------------|--------|
| Gate перед prod | Выделенный **staging** с полным parity + Telegram smoke с реальным `fired` + чеклист review (6 пунктов). |
| Фаза A | Prod: создание запросов на `completed`, диспатч в **safe / record-only** или узкая когорта. |
| Фаза B | Ограниченная реальная отправка, метрики `delivery_failed`, дубликаты, модерация. |
| Фаза C | Полный охват при стабильных метриках. |
| Rollback | Отключить job `run-review-reminders`, при необходимости заморозить send в `queued`, крайний случай — отключить триггер при `completed`. |

**Итоговая рекомендация:** **не** включать полную prod-отправку, пока нет успешного прогона тех же проверок на **HTTPS staging** с боевыми секретами staging и одним подтверждённым Telegram delivery при сработавшем алерте или тестовом сценарии.

---

## Команды одним списком

| Цель | Команда |
|------|---------|
| Parity | `node scripts/check_analytics_parity.mjs` |
| Telegram path | `pnpm run check:telegram-alerts` |
| Web proxy E2E (локально) | `pnpm run sync:web-analytics-env` затем `pnpm run check:web-analytics-proxy` |
| Выравнивание web `.env.local` | `pnpm run sync:web-analytics-env` |
