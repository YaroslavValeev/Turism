# Модель данных контент-конвейера (канон)

**Статус:** внедрение поэтапно (см. план в задаче на контент-конвейер).  
**Схема Prisma:** `services/api/prisma/schema.prisma`.

## Соответствие сущностей ТЗ и таблиц

| Сущность в ТЗ | Таблица / модель | Примечание |
|---------------|------------------|------------|
| `content_sources` | `sources` | Уже существовала; добавлено `adapterKey` |
| `raw_content_items` | `raw_items` | Добавлен `parseStatus` (enum), дедуп = `contentHash` |
| `normalized_content_items` | `normalized_items` | Добавлены `relevanceScore`, `moderationFlagsJson`, `normalizedPayloadJson` |
| Сквозной `content_item_id` | `content_items` | Новая сущность; FK на raw / normalized / candidate / program (опц.) |
| `content_drafts` | `content_drafts` | Версии по `@@unique([contentItemId, draftType, version])` |
| `content_approvals` | `content_approvals` | Решения owner, связь с черновиком |
| `content_publications` | `content_publications` | Идемпотентность: `@@unique([contentItemId, channel, contentDraftId])` + `idempotencyKey` |
| `content_metrics` | `content_metrics` | Срезы по дате / источнику / публикации |

## Жизненный цикл `content_items.workflowStatus`

Детерминированные стадии (enum `ContentWorkflowStatus`):

1. `ingest_collected` — сырьё принято, создана запись `content_items` (после collect).  
2. `draft` — нормализация и `event_candidate` пройдены; готово к AI-черновикам и согласованию.  
3. Далее: `pending_owner_review` → `approved` / `rejected` / `failed` / `archived` и публикация (`scheduled` → `publishing` → `published`).

Связь с **каталожной** публикацией программ (`Program`, `EventCandidate`) остаётся отдельным путём; поле `ContentItem.programId` — опциональная привязка витрины.

## Ingestion

- При `raw_items` create в `persistCollectedItems` создаётся `content_items` в одной транзакции.  
- При нормализации: `content_items` upsert по `rawItemId` (в т.ч. бэкфилл для старых raw без записи).

## Этап D — генерация черновиков (`draft.service.ts`)

- Модуль: `services/api/src/modules/content-pipeline/draft.service.ts` + детерминированные шаблоны `draft.templates.ts`.  
- Вход: `content_item` + связанный `normalized_item` (+ `raw_item` для URL источника).  
- Выход: записи в `content_drafts` с `aiPromptVersion` / `aiModel` (канон: `content-draft-template-v1`, `deterministic-rules-v1`), `inputPayloadJson` (missingFields, hashtags, ссылки), `rawDraftText` / `finalDraftText`.  
- Идемпотентность: `@@unique([contentItemId, draftType, version])`; повторный запуск не создаёт дубль v1.  
- Job (admin JWT): `POST /jobs/run-content-drafts` и `POST /api/jobs/run-content-drafts`, тело `{ "contentItemIds": ["..."], "limit": 40 }` — если `contentItemIds` пусто, берутся элементы с нормализацией и без `telegram_post` v1.

## Этап E — owner-review в Telegram

- Сервис: `services/api/src/modules/content-pipeline/approval.service.ts` — `sendDraftToOwner`, `handleApprovalDecision`, `applyRewrite`, `requestRewrite`.  
- Вебхук: `POST /public/telegram/content-pipeline/:token` (секрет `CONTENT_PIPELINE_TELEGRAM_WEBHOOK_TOKEN`), тело — update Bot API.  
- Админ: `POST /api/jobs/send-content-draft-to-telegram` (JWT) body `{ "contentDraftId": "…" }`.  
- `callback_data`: `P|&lt;draftId&gt;` / `W` / `X` / `K` (≤64 B); идемпотентность по `callback_query.id` в `processed_telegram_callbacks`.  
- `ContentItem.workflowStatus`: после отправки превью → `pending_owner_review`; approve → `approved`; reject → `rejected`; rewrite → `rewrite_requested` + `ownerReviewAwaitingDraftId`; skip → `skipped` (и аналог в `content_approvals`).  
- Голос: `transcribeVoice.ts` (Whisper при `OPENAI_API_KEY`), иначе placeholder без остановки pipeline.

## Этап G1 — публичный блог (web) + read API

- **Публичный read API (без admin JWT):** `GET /public/blog` (список, `placement=blog`, `status=published`), `GET /public/blog/:slug`. Реализация: `services/api/src/modules/public-blog/routes.ts`, подключение в `services/api/src/index.ts` на префикс `/public` (не пересекается с `/public/telegram`, т.к. маршруты разные).
- **Сайт Next.js:** `apps/web/src/app/blog` — листинг `/blog` и статья `/blog/[slug]`; SEO: `generateMetadata`, canonical, OpenGraph `article`, JSON-LD `Article` + `BreadcrumbList`, хлебные крошки в UI; базовый CTA (`BlogArticleCta` — программы, заявка организатора, `StartAlertsSignup`). Sitemap подтягивает URL постов через тот же API.

## Этап G2 — SEO-сущность blog_post + связи

- **Prisma `blog_posts`:** поля `seoTitle`, `seoDescription`, `canonicalUrl`, `ogImage`, `tags[]`, `discipline`, `region`, `country`, `relatedProgramIds[]`, `relatedOrganizerIds[]`; уникальность пары `slug` + `placement` (`@@unique([slug, placement])`). Миграция: `prisma/migrations/20260424183000_blog_post_g2_seo/`.
- **Fallback SEO (сервер):** `services/api/src/modules/public-blog/resolve.ts` — `resolveBlogSeo(env, row, path)`; дефолт OG-картинка: `PUBLIC_WEB_BASE_URL` + `/favicon.svg`. Ответы list/post содержат объект `resolved { seoTitle, seoDescription, canonicalUrl, ogImage }`.
- **Связанные сущности:** `GET /public/blog/:slug/related` — программы (по id, только публично видимые), организаторы, `similarPosts` (по discipline/region, иначе последние), **подборки** (`collections`), если `blog_post.id` входит в `content_collections.relatedBlogPostIds` и подборка публична. Логика: `public-blog/related.ts`.
- **Админ:** `GET/PATCH /api/content-pipeline/blog-posts/:id` (JWT), UI `apps/admin/src/app/blog-posts/`.
- **Mapping-заготовка** без эвристик: `content-pipeline/blogPostMapping.ts` (`suggestRelationsFromNormalizedPayload`).

## Этап G3.1 — подборки (content_collections) **[закрыт]**

**Цель:** управляемые витринные подборки с явным составом; маршрут **подборка → статья / программа / организатор → заявка**.

- **Prisma / таблица:** `content_collections` (`ContentCollection` в `schema.prisma`), миграции G3; индексы по `status`, `discipline`, `region`, `season`.
- **Публичный API (rate-limited):** `GET /public/collections`, `GET /public/collections/:slug`, `GET /public/collections/:slug/related` — только `status=published` и `publishedAt` не в будущем; модуль `public-collections/`.
- **SEO на сервере:** `resolveCollectionSeo` + `PUBLIC_WEB_BASE_URL` для canonical/OG; фронт: `/collections`, `/collections/[slug]`, JSON-LD, CTA с UTM/`collection_id`.
- **Админ:** `apps/admin/.../collections` — CRUD, Preview через `NEXT_PUBLIC_SITE_URL`, пункт **Collections** в `AdminNav`.
- **G2:** `GET /public/blog/:slug/related` возвращает реальные подборки по `relatedBlogPostIds`.
- **Метрики (задел):** UTM + query `collection_id` в CTA; отдельное поле в `content_metrics` — следующий шаг (см. G3.1 критерии в задаче).

---

## Этап G3.2 — SEO-landings: дисциплина / сезон / регион **[закрыт, см. spec]**

**Архитектура / контракт:** [CONTENT_EXPLORE_HUBS_ADR.md](CONTENT_EXPLORE_HUBS_ADR.md).

**Цель (реализовано):** автоматические **тематические страницы** на основе полей `discipline` / `region` / `season` в `blog_posts`, `programs`, `content_collections` (сезон в БД в основном у подборок). Ручные подборки (G3.1) не заменяются; G3.2 — **агрегат по срезу** + ручной словарь синонимов (код, `lib/explore`).

- **URL:** `/explore`, `/explore/discipline/:slug`, `/explore/region/:slug`, `/explore/season/:slug` (сайт) и `GET /public/explore`, `GET /public/explore/:type/:slug` (API), модуль `public-explore/`.
- **Sitemap** включает индекс `/explore` и хабы из `GET /public/explore`.
- **UTM** на клиенте: `buildExploreUtmQuery` (utm + `explore_type` / `explore_slug`).

**Вне scope (в ADR):** отдельная БД-таксономия, AI, комбинированные хабы, тяжёлая аналитика.

**Закрытие G3.2 (зафиксировано, без доработки в рамках этапа):**

- **Сезоны (season):** пустые списки постов/программ на хабе — ожидаемо, пока в схеме `season` в основном у `content_collections`; не «чинить» отдельно до появления полей/правил.
- **MANUAL_EXPLORE_HUBS:** критичная точка качества; расширять дозированно по факту значений в БД.
- **Индекс `GET /public/explore`:** текущая реализация приемлема; кэш/однопроходная агрегация — отдельный инкремент.

**Проверки на среде (smoke):** `GET /public/explore`, `GET /public/explore/discipline/freeride` (при данных), `/explore`, `/explore/discipline/freeride`, sitemap.

**Прочее (неизменно):**

- Агрегаты `content_metrics` + UTM/attribution (entry page / `blog_post_id` / `collection_id`, далее — хабы) — наращивать по мере зрелости.

---

## Этап G4 — внутренняя перелинковка + усиление конверсии

**План (архитектура, задачи, приоритеты):** [G4_INTERNAL_LINKS_AND_CTA_PLAN.md](G4_INTERNAL_LINKS_AND_CTA_PLAN.md).  
**Цель маршрута:** контент → хаб → программа → заявка; граф навигации без тупиков; измеримость входов (blog / collections / explore).  
**G4.1 baseline:** заявки с `entry_type` / `entry_id` в `POST /bookings`; отчёт по входам — `GET /metrics/content-entries` (admin), UI в админке «Content entries».
