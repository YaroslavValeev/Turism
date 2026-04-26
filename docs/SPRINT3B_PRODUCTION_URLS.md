# Sprint 3B — боевые публичные URL (без `localhost` в письмах)

## Канон из репозитория (см. `docs/deployment/OWNER_QUICKSTART.md`, `TIMEWEB_PRODUCTION_BASELINE.md`)

| Назначение | Пример base URL (без `/` в конце) |
|------------|-----------------------------------|
| Публичный web | `https://mywavetour.ru` |
| API (публично) | `https://api.mywavetour.ru` |
| Админка (отдельный хост) | `https://admin.mywavetour.ru` — **не** подставлять в `PUBLIC_*` писем, если письма только про сайт/отписку |

## 1. Что прописать

### API (`services/api/.env` + прод-секреты)

| Переменная | Значение |
|------------|----------|
| `PUBLIC_WEB_BASE_URL` | `https://mywavetour.ru` |
| `PUBLIC_API_BASE_URL` | `https://api.mywavetour.ru` |
| `CORS_ALLOWED_ORIGINS` | `https://mywavetour.ru`, при необходимости `https://admin.mywavetour.ru` (через запятую, без пробелов вокруг `,` — см. `isOriginAllowed`) |

### Web (`apps/web` — production env)

| Переменная | Значение |
|------------|----------|
| `NEXT_PUBLIC_SITE_URL` | `https://mywavetour.ru` |
| `NEXT_PUBLIC_API_URL` | `https://api.mywavetour.ru` |

### Admin (если бьёт в API из браузера)

| Переменная | Пример |
|------------|--------|
| `NEXT_PUBLIC_API_URL` | `https://api.mywavetour.ru` |
| `NEXT_PUBLIC_WEB_URL` / `NEXT_PUBLIC_SITE_URL` | по факту админского фронта (см. `apps/admin/.env.example`) |

## 2. Проверка после смены URL

1. `GET https://api.mywavetour.ru/health` → `{"status":"ok"}`.
2. `APP_ENV=production` на API **только** когда `PUBLIC_*` уже не localhost (иначе `assertPublicBaseUrlsForProduction` остановит старт) **или** временно `APP_ENV=local` для smoke с реальными https URL.
3. Повторить:  
   `SPRINT3_E2E_RECIPIENT_EMAIL=... pnpm --filter api run sprint3:email-e2e`  
   Опционально: `SPRINT3_FAIL_ON_LOCALHOST=1` — скрипт упадёт, если в `PUBLIC_*` ещё localhost.
4. Во входящих: в **обоих** письмах (probe и «Подборка MyWaveTour») не должно быть подстроки `localhost` в ссылках.

## 3. Шаблон отчёта Sprint 3B (заполняет владелец после прогона)

- **Дата / среда:**  
- **Фактические FQDN** (если не `mywavetour.ru` / `api.mywavetour.ru`):  
- **Письма:** probe + «Новый выезд…» / только probe —  
- **`localhost` в теле письма:** да / нет (цитата или скрин в wiki).  
- **Оставшиеся риски:** CORS, cookies, кэш CDN, реальная публикация программы с админки.
