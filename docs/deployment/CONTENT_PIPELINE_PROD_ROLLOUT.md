# Content Pipeline — обязательный production rollout

Документ фиксирует канонический чеклист **до** этапа G (интеграция контента в продукт: SEO, витрина, подборки, карточки программ). Этап G начинаем **только** после зелёного prod smoke.

Подробности webhook: [TELEGRAM_CONTENT_WEBHOOK_RUNBOOK.md](./TELEGRAM_CONTENT_WEBHOOK_RUNBOOK.md).

## 1. Миграции на production

Использовать **только**:

```bash
pnpm --filter api exec prisma migrate deploy
```

**Не** использовать `prisma migrate dev` на production.

`DATABASE_URL` — тот же, что у работающего API.

## 2. Публичные URL

- **`PUBLIC_WEB_BASE_URL`** — публичный URL **сайта** (витрина, ссылки в письмах и в контент-конвейере на стороне «веб»).
- **`PUBLIC_API_BASE_URL`** — публичный **HTTPS origin API**, с которого API доступен **извне** (для health, admin API, ссылок на API). Должен совпадать с тем, что реально отдаёт nginx/балансировщик.

## 3. Telegram webhook (только API-host)

Webhook ставим на **хост API**, а не на веб-витрину:

`https://<public-api-host>/public/telegram/content-pipeline/<CONTENT_PIPELINE_TELEGRAM_WEBHOOK_TOKEN>`

Секрет в path и в env должен **совпадать**.

## 4. Проверить env (минимум)

- `TELEGRAM_BOT_API_BASE_URL`
- `TELEGRAM_CONTENT_OWNER_CHAT_ID` (согласование owner; иначе может использоваться `TELEGRAM_ALERT_CHAT_ID`)
- `TELEGRAM_UPDATES_CHANNEL_CHAT_ID` (публикация в Telegram channel)
- `CONTENT_PIPELINE_TELEGRAM_WEBHOOK_TOKEN`
- `OPENAI_API_KEY` — **опционально** (voice rewrite)
- `CORS_ALLOWED_ORIGINS` — если admin/web и API на **разных** origin

## 5. После деплоя

```bash
pnpm --filter api smoke:content-pipeline
```

Запускать в окружении, где уже выставлены prod `PUBLIC_WEB_BASE_URL` / `PUBLIC_API_BASE_URL` (не localhost, если требуется полная проверка webhook).

## 6. Ручная проверка

- Owner Review в Telegram (кнопки, approve/rewrite/reject);
- публикация в **Telegram channel**;
- создание / наличие **`blog_posts`**;
- **Publications** / **Retry** / ошибки в админке.

## 7. Ротация секретов (после стабилизации)

- Telegram bot token;
- SMTP password;
- DB password;
- при необходимости `JWT_SECRET` / `ADMIN_JWT_SECRET` (ротация JWT = перелогин пользователей админки).

## Критерий перехода к этапу G

Зелёный **prod** smoke-скрипт + пройденные ручные проверки из п.6.
