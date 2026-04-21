# Restart → smoke → Go / No-Go (локально и staging)

Одна страница для **owner и разработчика**: поднять стек без конфликтов портов, убедиться, что контур живой, решить — можно ли продолжать работу или выкат.

Полный smoke после деплоя на целевое окружение: [`docs/qa/POST_MERGE_SMOKE.md`](../qa/POST_MERGE_SMOKE.md). Маршруты браузера: [`docs/qa/BROWSER_CHECK_ROUTES.md`](../qa/BROWSER_CHECK_ROUTES.md).

---

## 1. Clean restart (освободить порты)

Целевые порты по умолчанию: **API `3001`**, **admin `3002`**.

**Windows (PowerShell):**

```powershell
netstat -ano | findstr :3001
netstat -ano | findstr :3002
taskkill /PID <PID> /F
```

**WSL / Linux:**

```bash
lsof -i :3001
lsof -i :3002
# или: ss -lptn 'sport = :3001'
kill -9 <PID>
```

Из **корня репозитория**: `pnpm dev` (параллельно API + admin). Убедиться, что в логах нет `EADDRINUSE` и что API пишет `listening`.

---

## 2. Минимальный smoke (5–10 минут)

| Шаг | Действие | Ожидание |
|-----|----------|----------|
| A | `GET http://localhost:3001/health` | `200`, `{"status":"ok"}` |
| B | Открыть админку (`http://localhost:3002`), логин | сессия, без 5xx |
| C | Главная админки: блок **Conversion drafts** (очередь owner) | сводка загрузилась или явная ошибка сети (не молчаливый 500) |
| D | `/admin/conversion-drafts` — список, при необходимости фильтр `awaiting_owner` | таблица / пустой список по фильтру — ок, если БД чистая |
| E | (Опционально) После `pnpm db:seed` — fixture-черновик `awaiting_owner` для ручной проверки owner flow | см. seed в `services/api/prisma/seed.ts` |

**Автоматический сценарий (CI и локально при готовой БД):**

```bash
# JWT: залогиниться как admin (seed: admin@mywave.local / admin123), положить токен в переменную
set ADMIN_E2E_TOKEN=<token>   # Windows cmd
# $env:ADMIN_E2E_TOKEN="..."  # PowerShell

pnpm e2e:admin
```

Корневой скрипт: `pnpm e2e:admin` → Playwright в `apps/admin/e2e/`.

---

## 3. Go / No-Go

| Ситуация | Решение |
|----------|---------|
| Health ок, админка логинится, conversion summary не падает на сети | **Go** — можно работать с owner-уровнем и ручной проверкой drafts |
| Порт занят / API не слушает | **No-Go** — сначала п.1, без параллельных `pnpm dev` |
| `e2e:admin` падает на PR / после merge | **No-Go** для merge (в CI должны быть required checks: **build** + **e2e-admin**) |
| В production-hardening нужны алерты по `ownerNotifyFailed` | Включить **`CONVERSION_OWNER_NOTIFY_ALERT_ENABLED=1`**, **`TELEGRAM_BOT_API_BASE_URL`**, **`TELEGRAM_ALERT_CHAT_ID`** (см. `services/api/.env.example`) |

**Не смешивать:** «Go для ежедневной разработки» ≠ «Go для публичного прод без [`POST_MERGE_SMOKE`](../qa/POST_MERGE_SMOKE.md)».

---

## 4. GitHub (рекомендация)

В настройках репозитория **Branch protection** для `main`: required status checks — **`build`** и **`e2e-admin`** (имена jobs из `.github/workflows/ci.yml`). Точные имена задач — в UI Actions после первого успешного прогона.

---

*Документ про операционную дисциплину, не про новые фичи. Обновляйте при смене портов, сценария E2E или обязательных checks.*
