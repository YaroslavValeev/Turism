# MyWave: стратегия двух треков (локальная доводка + Timeweb)

Проект остаётся **локальным** до готовности, параллельно готовится **развёртывание на Timeweb.cloud**. Работы разделены на **два независимых трека** с разными артефактами готовности.

---

## Бизнес-решение: пилот 60 дней

- Первые **2 месяца** для организаторов — **бесплатно** (тариф/инвойсы/платёжные конвейеры **выключены** или в режиме «только учёт»).
- При этом **обязательно собирать полные данные**:
  - заявки, источники, конверсии;
  - суммы сделок, **shadow GMV**, **shadow commission**;
  - скорость реакции организатора;
  - качество карточек, AI-результаты, KPI.

Детализация по теню комиссий и GMV — в продуктовых сценариях (см. трек 1, п.3).

---

## AI: роль и guardrails

| Разрешено (операционный помощник) | Только после подтверждения владельца (owner) |
|-----------------------------------|---------------------------------------------|
| Анализ, нормализация, рекомендации | Публикация в публичные каналы / рассылки организаторам |
| Черновики, summaries, SEO-подсказки | Спорные или необратимые решения |
| Quality / safety / audit отчёты | Любой шаг, зафиксированный в policy как owner-gated |

**Публикация, отправка организаторам, спорные решения** — не silent; цепочка согласования (например approve в Telegram/админке) остаётся каноном.

---

## Критерии готовности

### К пилоту (продукт)

Один **полный доказанный контур**:

`программа → заявка → БД → Telegram / admin → смена статуса → фиксация сделки → аналитика`

### К production (инфраструктура Timeweb)

**Evidence pack** (чеклист и шаблон — `docs/deployment/DEPLOY_EVIDENCE_TEMPLATE.md`):

- `docker ps`, DNS/TLS, `/health`, `POST /bookings` → **201**, дубликат → **409**, Telegram, admin, логи, backup, rollback.

Базовая инфраструктурная база уже зафиксирована: [`docs/deployment/TIMEWEB_PRODUCTION_BASELINE.md`](deployment/TIMEWEB_PRODUCTION_BASELINE.md).

---

## Трек 1 — локальная доводка (без обязательного production-деплоя)

Работы, которые **не требуют** боевого деплоя и не должны ломать систему при инкрементальной поставке.

1. **Legal pages и чекбоксы согласий** — `/privacy`, условия, согласие на обработку данных, маркетинг (как отдельный чекбокс, если применимо).
2. **Free pilot mode на 60 дней** — флаги/конфиг, явное отключение списаний/инвойсов, отображение режима в админке (без paywall).
3. **Shadow commission / shadow GMV** — учёт в БД/отчётах без реального выставления счетов; согласованность с `deals` / `commissions` / outreach.
4. **Полный analytics event taxonomy** — единый справочник имён событий, версий, обязательных properties; синхронизация web ↔ API.
5. **AI-контур** — нормализация программ, quality audit карточек, safety-check, SEO, owner-review, Telegram summaries (всё с guardrails выше).
6. **Admin: статусы заявок и ручной operator flow** — очередь, смена статусов, заметки, без обхода аудита.
7. **Content pipeline** — обязательный **owner approval** перед публикацией; без auto-publish.
8. **KPI dashboards** — первые 2 месяца: воронка, конверсии, время ответа, качество карточек, AI SLA.
9. **Seed / test data** — 3–5 организаторов, 10–20 программ, детерминированные сценарии для демо и тестов.
10. **E2E tests** — booking → DB → Telegram → admin → status (и при необходимости сделка + аналитика).

**Артефакты трека 1:** тесты зелёные, сиды, скриншоты/записи сценариев, краткий runbook пилота (можно в `docs/pilot/` по мере готовности).

---

## Трек 2 — подготовка Timeweb deployment evidence

Параллельно с треком 1: всё, что нужно для **доказуемого** production-развёртывания.

1. **Docker compose production config** — актуализация [`docker-compose.production.yml`](../../docker-compose.production.yml), сервисы, volumes, health.
2. **`.env.example` и `.env.production` schema** — единый список переменных, обязательные/опциональные, без секретов в репо.
3. **Healthchecks** — контейнеры + HTTP `/health` (и при необходимости зависимостей).
4. **Миграции** — `prisma migrate deploy` в CI/рунбук, порядок, zero-downtime оговорки.
5. **Nginx / TLS** — см. [`docs/deployment/TIMEWEB_PRODUCTION_BASELINE.md`](deployment/TIMEWEB_PRODUCTION_BASELINE.md), `infra/nginx/`.
6. **Telegram: webhook или polling** — **один выбранный режим** на окружение; согласовать с [`docs/deployment/TELEGRAM_CONTENT_WEBHOOK_RUNBOOK.md`](deployment/TELEGRAM_CONTENT_WEBHOOK_RUNBOOK.md) (или зафиксировать polling + cron в том же runbook).
7. **Smoke-test** — `/health`, `GET/POST` публичные контракты: например `/api/programs` (как в вашем стенде), `POST /bookings` → **201**, повтор → **409**.
8. **Admin evidence** — вход, ключевые разделы, 401/403 без токена.
9. **Logs evidence** — пути логов, уровни, ротация, PII-политика.
10. **Backup / restore check** — см. baseline, отчёт о тесте восстановления на staging.
11. **Rollback rehearsal** — [`docs/deployment/ROLLBACK_RUNBOOK.md`](deployment/ROLLBACK_RUNBOOK.md) + факт прогона.
12. **Финальный** `DEPLOY_EVIDENCE_YYYY-MM-DD.md` — из шаблона ниже, одна дата = один зафиксированный пакет.

**Шаблон evidence:** [`docs/deployment/DEPLOY_EVIDENCE_TEMPLATE.md`](deployment/DEPLOY_EVIDENCE_TEMPLATE.md).

---

## Связь треков

- Трек **1** не должен вводить зависимость от Timeweb; фичи работают локально и в CI.
- Трек **2** не требует завершения всех пунктов трека 1, кроме минимума для smoke (API + web + DB + health).

---

## Статус реализации в репо

Сводка «что уже в коде» и чек-лист для машины: [`STATUS_10_10.md`](STATUS_10_10.md).

## Следующий шаг

1. Владелец **выбирает дату** первого «evidence drop» и копирует шаблон в `DEPLOY_EVIDENCE_YYYY-MM-DD.md`.
2. Команда ведёт **две доски/лейбла** в трекере: `track-1-pilot` и `track-2-timeweb` (или аналог).

---

*Версия документа: стратегическая фиксация; при смене хостинга или режима Telegram — обновить ссылки и п.6.*
