# Browser review — маршруты для ручной приёмки

Базовые хосты: **web** `http://localhost:3000`, **API** `http://localhost:3001`, **admin** `http://localhost:3002`. Если `web` поднят на другом порту — подставьте его везде вместо `:3000`.

Перед проверкой убедитесь, что на `:3000` действительно запущен [`apps/web`](../../apps/web) этого репозитория (см. [`docs/deployment/PRE_DEPLOY_LOCAL_AND_MOBILE.md`](../deployment/PRE_DEPLOY_LOCAL_AND_MOBILE.md) — раздел про порт 3000).

## Публичный каталог (web)

| Приоритет | Путь | Зачем |
|-----------|------|--------|
| 1 | `/` | Лендинг, каталог программ, фильтры; основная проверка отображения данных после ингеста |
| 1b | `/?discipline=<text>&country=<text>&region=<text>#programs` | Проверка **shareable** фильтров каталога: значения должны отражаться в UI и совпадать с query string |
| 2 | `/program/<id>` | Карточка программы: взять `<id>` со ссылки с главной или из API/админки; проверить клики по дисциплине/региону → возврат в каталог с корректным фильтром |

## Organizer surfaces (web)

| Путь | Зачем |
|------|--------|
| `/organizers/program` | Поверхность программы организатора |
| `/organizers/analytics` | Аналитика |
| `/organizers/verification` | Верификация |
| `/organizers/billing` | Биллинг |
| `/admin/platform` | Режим платформы (launch / monetization), нужен admin token в форме |

## API (приёмка без браузера)

| Метод | URL | Зачем |
|-------|-----|--------|
| GET | `http://localhost:3001/public/platform` | Режим платформы: `platformMode`, `launchMode` (без секретов) |
| GET + Bearer | `http://localhost:3001/metrics/admin/platform-mode` | Тот же смысл, но через admin JWT |
| GET | `http://localhost:3001/public/program-publish-hints` | Чеклист полей публикации (baseline + verified), тот же контракт, что подхватывает мастер на `/organizers/program` |
| PATCH + Bearer | `http://localhost:3001/programs/<id>` | Тело только `{ "durationDays": 5 }` → **400** `DURATION_READ_ONLY`; смена `startDate`/`endDate` → пересчёт `durationDays` в ответе; см. `docs/qa/DATE_EDIT_RULES.md` |
| PATCH + Bearer | `http://localhost:3001/programs/<id>/publish-status` | При неполной карточке и `published` → **400** с `missing` и `missingFields`; см. `docs/qa/PUBLICATION_RULES.md` |
| POST | `http://localhost:3001/public/notification-subscriptions` | Подписка: `{ "consent": true, "channel": "email", "type": "seasonal" \| "program_updates", "contactEmail": "...", "filters": { "discipline": "..." } }`; см. `docs/qa/NOTIFICATIONS_MVP.md` |
| GET + `Authorization: Bearer <admin JWT>` | `http://localhost:3001/admin/organizer-intakes` | Очередь заявок организаторов (`intake_type`, `processing_status`, `limit`, `offset`) |
| GET + Bearer | `http://localhost:3001/admin/organizer-intakes/<id>` | Деталь заявки + связанная программа (если есть) |
| GET | `http://localhost:3001/organizers/<organizerId>/programs/<programId>/conversion-progress` | Чеклист воронки и флаги rollout (без auth; для пилота — сверка с UI на `/organizers/analytics`) |
| POST + Bearer | `http://localhost:3001/jobs/run-conversion-funnel` | Ручной тик conversion funnel (при `CONVERSION_FUNNEL_SCHEDULER_ENABLED=0`) |
| GET + Bearer | `http://localhost:3001/jobs/conversion-funnel-stats?windowHours=24` | Сводка доставок за окно; см. `docs/qa/CONVERSION_FUNNEL_ROLLOUT.md` |
| GET + Bearer | `http://localhost:3001/admin/conversion-drafts` | Очередь черновиков conversion (этапы 3–5, owner approval); query `?status=awaiting_owner` |
| PATCH + Bearer | `http://localhost:3001/admin/conversion-drafts/<draftId>` | Тело `{ "messageText": "..." }` — правка текста до отправки |
| POST | `http://localhost:3001/public/conversion-funnel/governance/<CONVERSION_TELEGRAM_WEBHOOK_SECRET>/telegram` | Webhook Telegram (callback_query от inline-кнопок); см. `docs/qa/CONVERSION_FUNNEL_OWNER_GOVERNANCE.md` |
| GET + Bearer | `http://localhost:3001/admin/conversion-drafts/stats/summary` | Сводка: awaiting_owner, deferred, rejected, sentToday (UTC) |
| POST + Bearer | `http://localhost:3001/admin/conversion-drafts/<id>/send` | Отправить организатору (эквивалент кнопки в TG) |
| POST + Bearer | `http://localhost:3001/admin/conversion-drafts/<id>/reject` | Отклонить |
| POST + Bearer | `http://localhost:3001/admin/conversion-drafts/<id>/defer` | Тело `{ "deferHours": 24 }` |
| POST + Bearer | `http://localhost:3001/admin/conversion-drafts/<id>/reopen` | Снова в очередь после reject/defer |

## Admin UI (conversion drafts)

| Путь (admin app) | Зачем |
|------------------|--------|
| `/admin/conversion-drafts` | Таблица черновиков, фильтры, блок счётчиков сверху |
| `/admin/conversion-drafts/<id>` | Карточка: метрики, текст, audit, доставка, кнопки Send / Reject / Defer / Reopen |
| PATCH + Bearer | `http://localhost:3001/admin/organizer-intakes/<id>/status` | Тело: `{ "processingStatus": "in_review" \| "dismissed" \| "new" \| "draft_created", "note"?: "..." }` |
| POST + Bearer | `http://localhost:3001/admin/organizer-intakes/<id>/draft-program` | Тело: `{ "organizerId": "<cuid>" }` — черновик из `meta` wizard v2 (идемпотентно, если черновик уже создан) |

## Публичное по токену (пилот)

| Путь | Зачем |
|------|--------|
| `/review/<token>` | Ревью по токену — нужен валидный токен из сценария |

## Админка (ингест, сырые данные, кандидаты)

Корень `/` редиректит на `/login` или `/organizers` (см. `apps/admin/src/app/page.tsx`).

| Приоритет | Путь | Зачем |
|-----------|------|--------|
| 1 | `/login` | Вход |
| 2 | `/sources` | Источники (owner-batch и др.) |
| 3 | `/raw-items` | Сырые элементы после collect |
| 4 | `/event-candidates` | Кандидаты после normalize/dedup |
| 5 | `/programs` | Программы; под строкой — **«Карточка тура»**, **«Контент карточки»**, **«Даты поездки»** (`durationDays` только предпросмотр/после сохранения с API, без ручного ввода), сохранение через PATCH |
| 5b | `/programs?program=<programId>` | Из intake→draft: прокрутка к строке программы и краткая подсветка |
| 6 | `/jobs` | Джобы при необходимости |
| 7 | `/organizers` | Список организаторов; под строкой — **«Карточка доверия»** (сертификаты, страховка, ЧП, оборудование), сохранение через PATCH |
| 8 | `/organizer-intakes` | Очередь публичных заявок организаторов (лендинг / мастер); фильтр по типу и статусу обработки |
| 9 | `/organizer-intakes/<id>` | Карточка заявки: meta, смена статуса, создание черновика программы (wizard v2 + выбор organizerId) |

## Economics governance (admin, smoke)

База **admin** `http://localhost:3002`. Нужен вход (`/login`) и запущенный API (`:3001`).

| Приоритет | Путь | Зачем |
|-----------|------|--------|
| E1 | `/admin/economics` | Dashboard: карточки метрик, таблицы override / EW, пороги env, кнопка «Запустить guardrails job»; блок «Перейти к реферальному коду» |
| E2 | `/admin/economics/programs/<programId>` | Effective state грузится; форма override: без даты при не-indefinite — preview/apply заблокированы локально; **Предпросмотр** → сравнение множителей и blocked; **Применить** только после предпросмотра; **Снять override** → показ блока recompute (old/new) + обновлённый effective |
| E3 | `/admin/economics/referrals/<code>` | То же для реферала (quality / override); preview → apply → clear |

Быстрый переход к economics программы: со страницы **`/programs`** под названием программы ссылка **«Economics / guardrails»**.

## Опционально (второй проход)

- `/analytics/founder`
- `/analytics/billing`
- `/analytics/dq`
- `/analytics/score-actions`

**Platform mode (2026-04-23):** маршруты `GET /public/platform`, `GET /metrics/admin/platform-mode`, web `/organizers/analytics`, `/organizers/billing`, `/admin/platform` — см. [`PLATFORM_MODE_QA.md`](./PLATFORM_MODE_QA.md) и [`PROJECT_SOURCEBOOK.md`](../PROJECT_SOURCEBOOK.md).
