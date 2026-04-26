# G3.2: автоматические SEO-хабы (Explore Hubs)

**Статус:** зафиксировано (реализация G3.2)  
**Связанные документы:** [CONTENT_PIPELINE_DATA_MODEL.md](CONTENT_PIPELINE_DATA_MODEL.md), Prisma `schema.prisma`.

## 1. Цель

Сгенерировать **тематические лендинги** на основе уже наполняемых полей: `discipline` / `region` / `season` в `blog_posts`, `programs`, `content_collections` — без ручного CRUD хаба в админке. Маршрут: **поиск/SEO → статьи / подборки / программы → заявка**.

## 2. URL-схема (стабильная)

```text
/explore
/explore/discipline/{slug}
/explore/region/{slug}
/explore/season/{slug}
```

Комбинированные URL (несколько осей в одном пути) **не** входят в G3.2.

**Конфликты с существующим сайтом:** префикс `/explore` зарезервирован; публичный API: `GET /public/explore`, `GET /public/explore/:type/:slug` — не пересекается с `/public/blog`, `/public/collections`.

## 3. Slug: display → key → URL

- **Display value** — строка из БД или подпись из словаря.
- **Normalized key** — внутренняя группировка синонимов (через ручной mapping + нормализация строки).
- **Slug** в URL: латиница, `a-z0-9-`, lower-case, без ведущих/хвостовых дефисов.

### 3.1 Правила нормализации (базовая линия)

- Регистр: `toLowerCase` (`tr-TR` несущественен для RU, достаточно `toLowerCase()`).
- Пробелы/дефисы: схлопывать, обрезать, при генерации slug — в один `-`.
- Кириллица: **транслитерация** в латиницу (фиксированная таблица; без полного ICU — достаточно RU-алфавита для продукта).
- **Ручной mapping:** словари `discipline` / `region` / `season` — списки `slug` + `label` + `variants[]` (синонимы и варианты написаний, например `freeride`, `FreeRide`, `фрирайд`).
- Если значение **не** в словаре: slug = `translit` + `slugify` от исходной строки (см. код: `valueToDefaultSlug`).

### 3.2 Ограничения G3.2

- Нет единой нормализованной **таблицы таксономии** в БД — всё в коде.
- Синонимы — только вручную; расширение словаря = PR в репо.

## 4. Публичность (сервер)

| Сущность | Условие |
|----------|---------|
| `blog_posts` | `placement=blog`, `status=published` |
| `content_collections` | `status=published`, `publishedAt` задан, `publishedAt <= now` |
| `programs` | Только **публично видимые** по `isProgramPubliclyVisible` (дата окончания, места, `publishStatus === published` и т.д., см. `programs/publicVisibility.ts`) |

**Draft** и несоответствующие условиям сущности **не** отдаются в агрегатах.

## 5. Состав ответа хаба (API)

`GET /public/explore/:type/:slug` возвращает (контракт кода, не схема OpenAPI):

- `type`, `slug`, `label` (отображаемое название среза);
- `resolved` — SEO: `seoTitle`, `seoDescription`, `canonicalUrl`, `ogImage` (fallback как у G2/G3.1, через `PUBLIC_WEB_BASE_URL`);
- `blogPosts` — карточки публикации (только `placement=blog`, published);
- `collections` — публичные подборки;
- `programs` — карточки программ (после серверного фильтра видимости);
- `counts` — числа по категориям;
- `breadcrumbs` — структура для UI: главная / темы / срез.

**Сезон (`season`):** в текущей схеме Prisma поле `season` есть у `ContentCollection` и **нет** у `Program` / `BlogPost`. Поэтому хаб «сезон» в G3.2 в первую очередь агрегирует **подборки**; статьи и программы по сезону — пусто до появления полей/правил (не блокирует релиз).

## 6. SEO (задел, дефолты)

- **Title:** `{Название среза}: программы, подборки и статьи | MyWave` (см. `resolveExploreHubSeo`).
- **Description:** шаблон с подстановкой среза (см. тот же модуль).
- **Canonical:** `${PUBLIC_WEB_BASE_URL}/explore/{type}/{slug}` (если в ответе не переопределено).
- **OpenGraph / Twitter:** согласованы с `resolved`.
- **JSON-LD (web):** `CollectionPage` + при необходимости `BreadcrumbList` (как на других публичных страницах).

## 7. Sitemap (web)

- URL `/explore` и динамические URL из `GET /public/explore` (только хабы с ненулевым суммарным количеством публичного контента — см. агрегатор).

## 8. UTM / метрики (задел G3+)

- Параметры `utm_source=explore`, `utm_medium=web`, `utm_campaign=explore_{type}_{slug}` и `explore_type` + `explore_slug` (или аналог) в ссылках CTA/программ — в клиенте; отдельная колонка в `content_metrics` — **не** G3.2.

## 9. Что не делаем в G3.2

- Отдельная таблица таксономии; AI auto-linking; комбинированные хабы; персонализация; тяжёлая аналитика; админ-CRUD для хабов.

## 10. Критерий готовности (G3.2)

1. ADR (этот файл) в репо.  
2. Реализованы маршруты web `/explore`, `/explore/[type]/[slug]`.  
3. Public API: список + детализация; ответы содержат посты, подборки, программы, SEO, хлебные крошки.  
4. Sitemap обновлён.  
5. Slugify + ручной mapping + тесты на slugify.  
6. Публичная видимость согласована с блогом/подборками/витриной программ; draft наружу не попадает.
