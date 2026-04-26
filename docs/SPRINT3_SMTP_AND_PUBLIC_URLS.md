# Sprint 3 — Gmail SMTP, живой email e2e, публичные URL (без localhost)

## 1. Цель

- Письма о новых программах уходят через **Gmail SMTP** (учётка вида `mywavemoscow@gmail.com` + **пароль приложения**).
- Ссылки в письмах (программа, отписка) строятся из **`PUBLIC_WEB_BASE_URL`** и **`PUBLIC_API_BASE_URL`** — в бою это **https** и **реальный домен**, не `localhost`.
- API в `APP_ENV=production` **не стартует**, если публичные base URL указывают на localhost (см. `assertPublicBaseUrlsForProduction`), кроме аварийного `ALLOW_LOCALHOST_IN_PUBLIC_URLS=1`.

## 2. Gmail: что включить

1. В Google-аккаунте включить **двухфакторную аутентификацию**.
2. Создать **пароль приложения** (16 символов) для «Почта» / «Другое».
3. В `.env` **без пробелов** вставить этот пароль в `SMTP_PASS` (как одну строку).

## 3. Рекомендуемые значения SMTP (Gmail)

| Переменная | Значение |
|------------|----------|
| `SMTP_HOST` | `smtp.gmail.com` |
| `SMTP_USER` | `mywavemoscow@gmail.com` (тот же ящик, с которого отправляем) |
| `SMTP_PASS` | пароль приложения Google |
| `SMTP_FROM` | `MyWaveTour <mywavemoscow@gmail.com>` (или display name + тот же адрес) |
| `SMTP_PORT` + `SMTP_SECURE` | **Вариант A (часто проще):** `465` и `SMTP_SECURE=1`. **Вариант B:** `587` и `SMTP_SECURE=0` (STARTTLS) |

Nodemailer для `smtp.gmail.com` в коде подмешивает совместимые `tls`-опции.

## 4. Публичные URL (обязательно в prod)

| Переменная | Пример (prod) |
|------------|----------------|
| `PUBLIC_WEB_BASE_URL` | `https://mywavetour.ru` (без завершающего `/`) |
| `PUBLIC_API_BASE_URL` | `https://api.mywavetour.ru` или тот же домен, если API за прокси на `/` |

**Фронт (Next `apps/web`):**

- `NEXT_PUBLIC_SITE_URL` — тот же канон, что `PUBLIC_WEB_BASE_URL` (для SEO, layout, sitemap).
- `NEXT_PUBLIC_API_URL` — тот публичный base, с которого браузер бьёт в API.

**CORS:** `CORS_ALLOWED_ORIGINS` должен включать origin публичного web (и админки при необходимости).

## 5. Staging-ограничение рассылки (`EMAIL_STAGING_ALLOWLIST`)

`EMAIL_STAGING_ALLOWLIST=you@gmail.com,other@x.com` — при **непустом** значении:

- в цикл уведомлений попадают **только** подписки, у которых `email` есть в списке (без email в списке строка пропускается целиком — и email, и Telegram DM);
- публикация в **Telegram-канал** обновлений **не выполняется** (чтобы e2e на staging не дублировал пост в боевой канал).

В production поле обычно **пустое**: работают обычные правила выборки и пост в канал.

E2E-скрипт при необходимости копирует `SPRINT3_E2E_RECIPIENT_EMAIL` в allowlist, если `EMAIL_STAGING_ALLOWLIST` пуст (см. `scripts/sprint3_subscribe_notify_unsubscribe_e2e.ts`).

## 6. Сценарий «живой» e2e (ручной + скрипт)

1. В `services/api/.env` (и/или корневом `.env`) заполнить Gmail SMTP + публичные URL **staging/prod** (без localhost).
2. `pnpm --filter @mywave/config build` (после смены `packages/config`).
3. Запуск:  
   `pnpm --filter api run sprint3:email-e2e`  
   Переменные: `SPRINT3_E2E_RECIPIENT_EMAIL` (обязательна для полного сценария), при желании `SPRINT3_SKIP_CLEANUP=1` чтобы не удалять тестовые строки.
4. Скрипт: smtp-probe (текст письма с `PUBLIC_*` в теле) → Prisma: подписка + программа в уникальной дисциплине/регионе → `notifySubscribersOnProgramPublished` → проверка отписки по HTTP.
5. В письме проверить: ссылка **«Открыть программу»** ведёт на `${PUBLIC_WEB_BASE_URL}/program/...?utm_...`, **«Отписаться»** — на `${PUBLIC_API_BASE_URL}/public/subscriptions/unsubscribe?...` — **ни одного `localhost`**, если в env нет localhost.

**Публикация из админки:** `PATCH /programs/:id/publish-status` с `publishStatus: "published"` вызывает тот же `notifySubscribersOnProgramPublished`, что и скрипт.

## 7. Финальный чек-лист env для боевого режима

Обязательные/критичные (API):

- `APP_ENV=production`
- `DATABASE_URL`
- `JWT_SECRET`, `ADMIN_JWT_SECRET`
- `PUBLIC_WEB_BASE_URL`, `PUBLIC_API_BASE_URL` (https, **не** localhost)
- `CORS_ALLOWED_ORIGINS` (содержит публичный web origin)
- `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `SMTP_PORT`, `SMTP_SECURE`

Рекомендуемо:

- `ANALYTICS_ENABLED`, `INTERNAL_ANALYTICS_TOKEN` — по политике среды
- `TELEGRAM_*` — если нужны уведомления/канал
- `EMAIL_STAGING_ALLOWLIST` — **только** staging/QA, в prod **пусто**

Web (`apps/web` / Docker):

- `NEXT_PUBLIC_SITE_URL` (совпадает с публичным web)
- `NEXT_PUBLIC_API_URL` (публичный API)
- `API_INTERNAL_BASE_URL` / внутренняя сеть к API в compose

## 8. Откат

- Проблемы с Gmail: переключиться на 465/SSL или 587/STARTTLS; проверить «менее безопасные приложения» не подходит — только **пароль приложения**.
- API не стартует: проверить `PUBLIC_*` и `APP_ENV`, временно `ALLOW_LOCALHOST_IN_PUBLIC_URLS=1` только не на public-facing prod.

## 9. Статус Sprint 3 (sign-off) и «localhost» в письмах

### Считается сделанным (подтверждено прогоном + почтой)

- **Gmail SMTP** — рабочая доставка с `mywavemoscow@gmail.com` (пароль приложения, не обычный пароль).
- **Живой e2e** — скрипт `pnpm --filter api run sprint3:email-e2e` (с `SPRINT3_E2E_RECIPIENT_EMAIL`): probe-письмо, письмо о публикации, `email delivery: success`, отписка по `GET` `/public/subscriptions/unsubscribe?email=...`.
- **Guards** — в `APP_ENV=production` API не поднимается с localhost в `PUBLIC_*` (см. §1), чтобы не уехать в прод с битыми ссылками.

### «Нет localhost в письмах» — когда это выполняется

Сами ссылки **не зашиты в коде** как `localhost`: они берутся из **`PUBLIC_WEB_BASE_URL`** и **`PUBLIC_API_BASE_URL`**. Пока проект **не задеплоен** и в `.env` стоят `http://localhost:3000` / `http://localhost:3001`, в письмах **будет** `localhost` — это ожидаемо.

**Критерий «в письмах больше нет localhost»** выполняется после:

1. Выдачи **публичных** URL (https) для web и API.
2. Установки в **боевом** (или staging с реальным доменом) env:  
   `PUBLIC_WEB_BASE_URL`, `PUBLIC_API_BASE_URL` и алиасов **Next** (`NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_API_URL`) на эти URL.
3. Повторной проверки: одно письмо из сценария публикации — в теле **нет** `localhost`, ссылки открываются в браузере.

До деплоя probe-письмо намеренно пишет `WARNING: links above still look like dev (localhost)` — это сигнал конфигурации, а не ошибка SMTP.

Практический чек-лист и шаблон отчёта: **`docs/SPRINT3B_PRODUCTION_URLS.md`**.

### Следующий этап roadmap (после закрытия публичных URL)

- Улучшение **Telegram / email** шаблонов под конверсию.
- **Booking**-сценарии.
- **G4.2** на живых данных.

## 10. Сводка env для боевого режима (один список)

| Переменная | Заметка |
|------------|--------|
| `APP_ENV` | `production` |
| `DATABASE_URL` | продовая БД |
| `JWT_SECRET`, `ADMIN_JWT_SECRET` | сильные секреты |
| `PUBLIC_WEB_BASE_URL` | `https://…` без хвостового `/` |
| `PUBLIC_API_BASE_URL` | `https://…` |
| `CORS_ALLOWED_ORIGINS` | origin публичного фронта (и при необходимости admin) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `SMTP_SECURE` | Gmail как в §3 |
| `EMAIL_STAGING_ALLOWLIST` | **пусто** в публичном prod |
| `apps/web`: `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_API_URL` | в согласовании с `PUBLIC_*` |
| Внутри Docker/сети | `API_INTERNAL_BASE_URL` к API при необходимости |

### Аварийные (не для нормального public prod)

| Переменная | Когда |
|------------|--------|
| `ALLOW_LOCALHOST_IN_PUBLIC_URLS=1` | Только отладка; в публичном бою ссылок в письмах **не** должно с localhost. |
