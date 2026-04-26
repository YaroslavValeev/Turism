# Content pipeline: production runbook

## Health и публичные точки

```bash
curl -sS "http://localhost:3001/health"
# → {"status":"ok"}

curl -sS "http://localhost:3000/public/blog"
# (или prod URL) — список/лента блога
```

## Состояния публикаций (retry / dead-letter)

Prisma: `ContentPublishState` = `pending` | `publishing` | `published` | `failed`.  
В UI `publishing` показывается как «in flight»; при ошибке — `failed` + `retryCount` (лимит совпадает с `MAX_CONTENT_PUBLICATION_RETRY` в `publisher.service.ts`).

- `GET /api/content-pipeline/publications?state=failed`
- `POST /api/content-pipeline/publications/:id/retry`
- `POST /api/content-pipeline/publications/retry-failed` — пакетно (тело: `{ "limit": 20 }`, по умолчанию до 20)

Отдельная DLQ-таблица не вводилась: источник правды — `content_publications`.

## Фильтр content items по эффекту (сервер)

- `GET /api/content-pipeline/items?minRevenue=1` — только items, у которых сумма `revenueRub` в `content_metrics` ≥ порога
- `GET /api/content-pipeline/items?minLeads=1&status=published` — комбинация с `status`

## Массовое одобрение черновиков

- `POST /api/content-pipeline/drafts/bulk-decision` — тело: `{ "draftIds": ["..."], "decision": "approved" }` (до 30 id).  
  Админ: `/admin/content-pipeline` — чекбоксы в строках `pending_owner_review` + кнопка «Одобрить выбранные».

## Блог: подборки (collections)

В `inputPayloadJson` черновика допускается `relatedCollectionIds: string[]`. При публикации в `site_blog` они пишутся в `blog_posts.relatedCollectionIds` (create/update, если массив не пустой — иначе при update старые id не сбрасываются).

## Единый runner (автоматические шаги)

`collect → normalize → dedup → draft`. Owner review и публикация — **только вручную** (Telegram / админ), без auto-publish.

- Ручной запуск (нужен admin JWT):

```bash
curl -sS -X POST "http://localhost:3001/jobs/run-content-pipeline" \
  -H "Authorization: Bearer $ADMIN_JWT" \
  -H "Content-Type: application/json" \
  -d '{}'
```

Опционально: `sourceIds`, `draftLimit`, `contentItemIdsForDrafts` в JSON теле.

Ответ содержит `runId` и `steps[]` для трассировки.

## Marketing → draft (internal)

Токен: `INTERNAL_ANALYTICS_TOKEN` (как у `/internal/analytics`).

```bash
curl -sS -X POST "http://localhost:3001/internal/content-pipeline/create-from-marketing" \
  -H "Authorization: Bearer $INTERNAL_ANALYTICS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"topic":"Кайт весной","source":"sheets","action_type":"new_row"}'
```

## Цепочка G4.1 (атрибуция)

Запросы к программе с `entry_type`, `entry_id`, `utm_*`, `explore_*` сохраняются в полях `bookings` и в сделке `deals` (1:1 с бронью).

## Комиссия

Начисление в `recalculateCommissionForBooking`: организатор `verified` / `trusted_by_platform` **и** сделка `confirmed` или `completed`. Иначе комиссия обнуляется (`reconciliationStatus: reversed`, причина в `calculationJson`).

## Метрики «контент → деньги»

```bash
curl -sS "http://localhost:3001/metrics/content-performance?limit=50" \
  -H "Authorization: Bearer $ADMIN_JWT"
```

`revenueRub` в `content_metrics` увеличивается при переводе брони в `completed`, если задана связь `contentItemId`.

## E2E (кратко)

1. `POST /jobs/run-content-pipeline` → появляются `content_drafts`.
2. В Telegram: approve owner / или админ `content-pipeline` → `publish` на `site_blog` (без VK/FB, если не настраивали).
3. Пользователь переходит по UTM-ссылке, отправляет `POST /bookings` с query-полями.
4. Админ ведёт статус брони → `deals` синхронизируется, при оплате — комиссия по правилам выше.
5. Проверка: `GET /metrics/content-performance`, `GET /bookings` (с полями атрибуции).

## Smoke (локально, без side-effect jobs)

`node scripts/smoke_content_pipeline.mjs` — `GET /health`, логин, `content-pipeline/items`, `content-performance` (при `POST /jobs/run-content-pipeline` не вызывается).
