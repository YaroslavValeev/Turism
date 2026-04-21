# Уведомления (MVP): ops / диагностика

## HTTP (read-only)

С заголовком админского JWT (как для остальных `/admin/*`):

`GET {API_BASE}/admin/notifications/overview`

Ответ: счётчики `jobs` (pending / failed / done), `deliveries` (delivered, skipped_*, failed, unsubscribed, pending_confirmation), `subscriptions` по статусам, **`feedback`** (positive / negative / total / `by_event_type`).

### Feedback API (публично)

```http
POST /public/notification-feedback
Content-Type: application/json

{"token":"<JWT>","feedback":"positive"}
```

Для **`POST`** оба поля обязательны; тип в теле должен совпадать с полем `f` внутри JWT. Для one-click из письма используется **`GET /public/notification-feedback?token=...`** (тип только в JWT).

## Ручной SQL (PostgreSQL)

Очередь:

```sql
SELECT status, COUNT(*) FROM notification_jobs GROUP BY status ORDER BY status;
SELECT result_code, COUNT(*) FROM notification_jobs WHERE result_code IS NOT NULL GROUP BY result_code;
```

Доставки по исходу:

```sql
SELECT outcome, COUNT(*) FROM notification_deliveries GROUP BY outcome ORDER BY outcome;
```

Подписки:

```sql
SELECT status, COUNT(*) FROM notification_subscriptions GROUP BY status;
```

## Отписка Telegram без UI

1. Получить JWT отписки для подписки (только сервер или одноразовый скрипт с доступом к `JWT_SECRET` / `NOTIFICATIONS_TOKEN_SECRET` и коду `signNotificationUnsubscribeToken`).

2. Вызвать:

```http
POST {API_BASE}/public/notification-subscriptions/telegram-deactivate
Content-Type: application/json

{"token":"<JWT>"}
```

Ответ: `{ "ok": true, "status": "unsubscribed" }`.

Email: открыть ссылку из футера письма `GET /public/notification-unsubscribe?token=...`.

## Double opt-in

Пока `status = pending_confirmation`, рассылка транзакционных уведомлений по этой подписке не идёт. В worker перед отправкой статус перепроверяется; при рассинхроне пишется `notification_deliveries.outcome = pending_confirmation`.

## Production checklist

- `NOTIFICATIONS_EMAIL_CONFIRM_BYPASS` = выключен.
- `NOTIFICATIONS_LINK_BASE_URL` указывает на публичный базовый URL API (те же пути `/public/...`).
- Задан устойчивый секрет (`JWT_SECRET` и при желании отдельный `NOTIFICATIONS_TOKEN_SECRET`).
