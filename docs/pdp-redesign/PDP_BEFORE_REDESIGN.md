# PDP `/program/[id]` — состояние до редизайна (Phase 1: Audit)

Дата аудита: 2026-10-01. Ветка на момент аудита: `fix/telegram-photo-caption`
(в рабочей копии уже есть незакоммиченная фича «программа по запросу» — `isOnRequestProgram` /
`onRequestLabel` в `program-pdp.client.tsx`; редизайн её сохраняет).

Цель документа — зафиксировать, **что уже работает**, чтобы визуальный рефакторинг ничего не потерял.

---

## 1. Файлы и роли

| Файл | Роль | Бизнес-логика |
|---|---|---|
| `apps/web/src/app/program/[id]/layout.tsx` | `generateMetadata` (title, description, canonical, OG, Twitter, robots noindex при 404) + JSON-LD `TouristTrip` | SEO — **не трогаем** |
| `apps/web/src/app/program/[id]/page.tsx` | Server Component: параллельно `GET /programs/:id`, `GET /reviews/public?programId=`, explore-индекс; `notFound()` если программы нет | Загрузка данных — **не трогаем** |
| `apps/web/src/app/program/[id]/program-pdp.client.tsx` | Client Component (SSR через `initialProgram`): состояние формы, аналитика, сабмит заявки, вся вёрстка | Логика + вёрстка в одном файле (≈1500 строк) |
| `apps/web/src/components/ProgramPrice.tsx` | Цена в валюте организатора + строка `≈ … ₽ по курсу ЦБ` (title = дата курса) | Отображение |
| `apps/web/src/lib/priceFormat.ts` | `formatProgramPrice`, `formatProgramPriceRub`, `formatProgramPriceRubTitle` | Правила цены/FX (покрыто тестами) |
| `apps/web/src/lib/bookingFeedback.ts` | `contactError` (валидация контакта), `bookingFeedback(status, body)` (тексты успеха/ошибки) | Покрыто тестами |
| `apps/web/src/lib/recommendedProgramFields.ts` | `organizerText` (отсев плейсхолдеров), `resolveProgramField` (организатор vs «Примечание MyWave»), `readMyWaveNotes(aiEnrichment)` | Покрыто тестами |
| `apps/web/src/lib/programCardCover.ts` | `orderProgramMediaForDisplay`, `presentProgramMediaUrl` | Покрыто тестами |
| `apps/web/src/lib/catalog.ts` | `safeCatalogReturn`, `participantLevel`, `programFormatLabel`, `localDate`, `isFestival` | Покрыто тестами |
| `apps/web/src/lib/programSchedule.ts` | `isOnRequestProgram`, `onRequestLabel` | Новая фича (не закоммичена) |
| `apps/web/src/content/programPageOverrides.ts` | Ручные оверрайды текстов по title | Ручные данные |
| `apps/web/src/lib/exploreNavWeb.ts` + `@mywave/explore-links` | Ссылки «Смотреть ещё по теме», фильтр по валидным хабам | Отображение |
| `globals.css` (`.mw-pdp-*`, `.mw-program-hero`, `.mw-form-card`), `ux.css` | Стили PDP | — |

## 2. Backend / API

| Что | Endpoint | Где вызывается |
|---|---|---|
| Карточка | `GET {API}/programs/:id` (revalidate 300) | `page.tsx`, `layout.tsx` (дважды, кэш Next), fallback в клиенте, если `initialProgram.id !== id` |
| Отзывы | `GET {API}/reviews/public?programId=` | `page.tsx`, fallback в клиенте |
| Заявка | `POST {API}/bookings` (timeout 20 c) | `handleSubmit` |
| Explore-хабы | `fetchPublicExploreList()` | `page.tsx` → `validHubKeys` |

**Payload заявки (контракт, не менять):**
`programId, guestContact, notes?, legalConsent: true, sourceChannel: "program_page", sourceCampaign: "g4_entry_tracking", entryType, entryId, utmSource, utmMedium, exploreType, exploreSlug`.

**Поля программы:** см. тип `Program` в `program-pdp.client.tsx`. Происхождение:
- из БД/организатора: `title, discipline, region, exactLocation, startDate, endDate, durationDays, formatType, levelRequired, priceFromRub, currency, audienceFit, itineraryDayByDay, inclusions, exclusions, gearRequirements, medicalLimitations, cancellationRules, organizerName, organizer, accommodationDetails, transferDetails, media`;
- вычисляет API: `priceRubApprox`, `priceRubRateDate` (курс ЦБ);
- ingestion/источник: `autoPublished, sourceType, sourceUrl, reviewStatus, ingestedAt, updatedFromSourceAt`;
- AI enrichment: `aiEnrichment.notes` → «Примечание MyWave — не от организатора»;
- **внимание:** для авто-импорта ingestion ставит `riskLevel = "medium"` по умолчанию (`services/api/src/modules/ingestion/service.ts`), т.е. для `autoPublished` это оценка платформы, а не слова организатора;
- ручные: `programPageOverrides.ts`.

**Цена:** `priceFromRub` хранит сумму в `currency` (историческое имя). Структурированных `priceOptions` в API нет → в редизайне показываем одну цену «от …», варианты — отдельная задача.

## 3. Frontend-поведение (инвентарь)

- **Back:** `← К результатам поиска`, href = `safeCatalogReturn(?returnTo)` (сохраняет фильтры каталога).
- **Hero:** бейджи-ссылки дисциплины и региона (→ каталог с фильтром), бейджи уровня и формата, H1, строка «дисциплина · регион · место», цена (`ProgramPrice`), даты (или «По запросу …»), длительность, рейтинг отзывов **или** текст «Пока нет отзывов», CTA `<a href="#request">` («Оставить заявку» / «Выезд завершён»), примечание о подтверждении.
- **Плашка источника** (только `autoPublished`): тип источника, `auto_pending`, ссылка на `sourceUrl`, «Обновлено с источника».
- **Ключевые детали:** длительность, дисциплина (ссылка), регион (ссылка), сезон старта, уровень, тип программы, риск.
- **Отзывы:** список (звёзды, дата, текст) или пустое состояние (дублируется с hero).
- **Для кого / Включено-не включено / Полезно знать (AI notes + ссылки) / Программа выезда или «Описание из источника» (`<details>`) / Риск и ограничения / Организационные условия (экипировка, размещение, трансфер — организатор или «Примечание MyWave») / Организатор или «Источник сведений» + статус верификации / Условия отмены / Что произойдёт после заявки / Описание и факты (trustReason) / Медиа (img + video, подписи).**
- **Форма `#request`:** `guestContact` (id), `notes`, 2 обязательных consent (не отмечены по умолчанию), ссылка `/privacy-and-consent`, submit, loading («Отправляем…»), ошибки (`role=alert`, фокус на `#program-request-feedback`), сетевые ошибки сохраняют введённые данные, успех (`role=status`, `aria-live`) + ссылка назад; для завершённых выездов — блок и disabled.
- **Смотреть ещё по теме:** discipline/region/season хабы с `?entry_type=program&entry_id=…`.
- **Desktop sticky aside** (≥900px): цена, даты, CTA, примечание.
- **Mobile sticky CTA** (<900px): цена, даты, CTA; `scroll-padding-bottom` у `html`, отступ у consent-баннера.
- **UTM / entry tracking:** читается из `window.location.search` в `useEffect` (не ломает SSR).

## 4. Аналитика (существующие события)

| Событие | Когда | Где |
|---|---|---|
| `page_view` (`page_type: program_detail`) | Монтирование | `useEffect` в контейнере |
| `view_item` | Монтирование | там же |
| `program_submitted` | Ответ 201 на `POST /bookings` | `handleSubmit` |

Событий клика по CTA, источнику, related, галерее **нет** — редизайн их не добавляет (см. follow-up).
Все события живут в контейнере, а не в DOM-разметке → перестройка DOM их не затрагивает.

## 5. SEO

- `title`, `description`, `canonical /program/:id`, OG (`website`, image = первое image-media), Twitter (`summary_large_image` при наличии изображения), `robots noindex` если программа не найдена.
- JSON-LD `TouristTrip` (name, description, url, touristType, startDate, endDate).
- H1 и весь контент рендерятся на сервере (client component с `initialProgram` → SSR).

## 6. Тесты на момент аудита

- `pnpm test:web:ux` — `node:test` через `tsx` для чистых функций (`catalog`, `bookingFeedback`, `programCardCover`, `priceFormat`, `recommendedProgramFields`, …).
- Компонентных тестов (RTL) и E2E-браузера (Playwright) в `apps/web` нет. Есть node-скрипты `e2e:checkpoint*` на API.

## 7. Baseline-сценарий (ручная проверка до/после)

Каталог → карточка → условия → `#request` → заполнение → consent → отправка → успех.
Плюс: источник, отзывы, медиа, related, цена в USD/EUR с `≈ ₽`, mobile CTA, desktop CTA, ссылки дисциплины/региона, privacy, «назад» с фильтрами, JSON-LD и OG в HTML.

Скриншоты baseline снимаются локально (нужен контур web:3000 + API:3001 + Postgres):
`pnpm local:bootstrap && pnpm db:seed:demo && pnpm dev:api` и `pnpm dev:web`, затем 1440/1024/768/390 на `git stash`-версии и на ветке редизайна.

## 8. Обнаруженные проблемы — отдельные задачи (НЕ исправляются в редизайне)

1. **Unknown в данных:** `discipline`/`region`/`organizerName` могут приходить как `Unknown`/пусто → UI-правило «не показываем»; первичное исправление — data pipeline.
2. **SEO description** собирается как «`{discipline}` в регионе `{region}`» — при `Unknown` получится «Unknown в регионе Unknown». Нужна правка в `layout.tsx` отдельным PR.
3. **`riskLevel` по умолчанию `medium`** для авто-импорта — выдаётся как факт. В редизайне помечено «Оценка MyWaveTour» для `autoPublished`; нужна явная метка источника в API.
4. **Структурированные варианты цены** (`priceOptions`) отсутствуют в API.
5. **Lifecycle-статусы** (`startsSoon`, `ongoing`, `cancelled`) в системе не определены; сейчас есть только `ended` (endDate < сегодня). Чип «Идёт сейчас» из мокапа не выводится до отдельного решения.
6. **Сезон старта для `on_request`** считается из начала окна сезона — может вводить в заблуждение.
7. **Аналитика CTA / source / related / gallery** отсутствует.
8. **`next/image`** не используется (внешние/проксированные URL, нужен `images.remotePatterns`).
9. Даты форматировались `toLocaleDateString` без таймзоны → потенциальный hydration mismatch и сдвиг даты в отрицательных TZ. В редизайне даты форматируются детерминированно из `YYYY-MM-DD`.

---

## 9. FUNCTIONAL PARITY (чеклист для PR)

- [ ] Program loads
- [ ] Media loads
- [ ] Price works
- [ ] FX conversion works
- [ ] Reviews work
- [ ] Source link works
- [ ] Form works
- [ ] Consent works
- [ ] Lead is created
- [ ] Mobile CTA works
- [ ] Desktop CTA works
- [ ] UTM works
- [ ] Related works
- [ ] SEO works
- [ ] Structured data works
- [ ] Analytics works
- [ ] Error state works
- [ ] Loading state works
