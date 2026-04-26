# Gate 3 — Pre-Timeweb Evidence (деплой)

Цель: **доказуемый** выкат на Timeweb (или аналог) без сюрпризов. Исполняется **после** [GATE1](./GATE1_LOCAL_GREEN_SMOKE.md) и (по плану) [GATE2](./GATE2_AI_PILOT.md).

## 1. Проверить примеры env

| Слой | Файл |
|------|------|
| Root / compose | `.env.example` |
| API | `services/api/.env.example` |
| Web | `apps/web/.env.example` |
| Admin | `apps/admin/.env.example` |

На сервере: **не** копируйте `.env.example` как есть; соберите `.env.production` (в git **не** коммитить; в `.gitignore` есть `.env.production`).

**Обязательно для публичного прод-API (см. `loadEnv` / публикация):** валидные `PUBLIC_*` URL (не `localhost` при `APP_ENV=production`) — иначе процесс **не** стартует.

## 2. `docker compose` config

```bash
docker compose -f docker-compose.production.yml config
```

Ожидание: **без** ошибок парсинга, сервисы `postgres`, `api`, `web`, `admin`, `reverse-proxy` на месте.

## 3. Healthcheck API

В compose: `healthcheck` к `http://127.0.0.1:3001/health` внутри контейнера `api` — убедиться, что `start_period` достаточен после `migrate` + `node dist/index.js`.

## 4. Обязательные env (Timeweb) — краткий список

- `APP_ENV=production`  
- `DATABASE_URL` (к Postgres в сети compose / managed)  
- `JWT_SECRET`, `ADMIN_JWT_SECRET` (длина, уникальность)  
- `PILOT_MODE_ENABLED` = `0` или `1` (осознанно)  
- `CORS_ALLOWED_ORIGINS` = домены web + admin (https)  
- `PUBLIC_WEB_BASE_URL`, `PUBLIC_API_BASE_URL` = публичные **https**  
- Web: `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SITE_URL`, при SSR в Docker: **`API_INTERNAL_BASE_URL`** (см. `apps/web/src/lib/serverApiBase.ts`)  
- Admin: `NEXT_PUBLIC_API_URL`  
- `LEGAL_CONSENT_POLICY_VERSION` (если используете не дефолт)  

Остальное — по `services/api/.env.example` (Telegram, SMTP, analytics) по необходимости.

## 5. Миграции (на сервере, один раз на релиз)

```bash
# В каталоге образа API или в контейнере до `start` (см. ваш entrypoint)
cd /path/to/api && pnpm exec prisma migrate deploy
```

**Rollback БД** — не автомат: скрипты down в Prisma **не** генерятся по умолчанию; откат = **restore** бэкапа — см. [../deployment/ROLLBACK_RUNBOOK.md](../deployment/ROLLBACK_RUNBOOK.md).

## 6. Smoke на сервере (после up)

```bash
curl -sS "https://<API_HOST>/health"
# при пилоте, с admin JWT:
curl -sS "https://<API_HOST>/metrics/pilot-kpi" -H "Authorization: Bearer <ADMIN_JWT>"
```

Web: `curl -sI "https://<WEB_HOST>/"`

## 7. Шаблон evidence

- Шаблон: [../deployment/DEPLOY_EVIDENCE_TEMPLATE.md](../deployment/DEPLOY_EVIDENCE_TEMPLATE.md)  
- Скопировать: `docs/deployment/DEPLOY_EVIDENCE_YYYY-MM-DD.md` и **заполнить** (SHA, curl, миграции, скрин).

## 8. Rollback команд (сжато)

- **Сервисы:** `docker compose -f docker-compose.production.yml down` + поднять **предыдущий** образ (tag/SHA), не `latest` без учёта.  
- **Nginx/SSL** — обычно не откатывают отдельно.  
- **БД** — restore из снимка, если миграция **ломающая**.

---

См. также: [../deployment/PRE_FLIGHT_10_RU.md](../deployment/PRE_FLIGHT_10_RU.md) (10 шагов, пересечение с этим gate).
