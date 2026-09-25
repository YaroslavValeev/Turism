# Toutism remediation plan — 2026-08-20

## 1. Цель и границы

Довести текущий workspace до воспроизводимой проверки кода, UX, accessibility и SEO без деплоя и без изменений VPS.

Границы:

- production/VPS остаются `HOLD` до отдельного Owner GO;
- artifact infrastructure, Camp runtime, web UX/SEO и infra redirect не смешиваются в одном PR;
- `partner_allowed` допустим только при явном подтверждении прав; все косвенные признаки дают `unknown`;
- существующие незакоммиченные изменения сохраняются.

## 2. Атомарные задачи

### A. Camp rights-policy — DONE locally

- Убрать вывод `partner_allowed` из `organizer_form` и `admin_manual`.
- Сохранить `restricted` для явно flagged-контента.
- Добавить regression tests для обоих косвенных intake source.
- Acceptance: mapper tests и API TypeScript проходят.
- Остаётся: отдельно спроектировать поле явного подтверждения прав, миграцию и audit trail.

### B. Explore runtime и indexability — DONE locally

- Сделать `ProgramCard` явной client boundary для DOM `onError` handler.
- Изолировать `useSearchParams` в малом Suspense-island, чтобы главная с H1, hero и навигацией SSR-рендерилась без JS.
- Acceptance: `/explore/discipline/wakesurf` в production build отвечает 200, содержит H1 и не содержит `__next_error__`; главная содержит SSR H1.

### C. SEO metadata и sitemap — DONE locally

- Убрать ложный request-time `lastModified` у статических URL.
- Добавить опубликованные `/program/{id}` в sitemap.
- Добавить root и program OpenGraph/Twitter metadata.
- Добавить `TouristTrip` JSON-LD из публичных полей.
- Добавить `noindex,nofollow,nocache` для review token, organizer analytics и billing.
- Acceptance: sitemap XML валиден, содержит пять текущих program URL; internal routes отдают `noindex`.

### D. UX и accessibility — DONE locally

- Consent выключен по умолчанию и требует явного действия.
- Ссылка на privacy policy не вложена в interactive label.
- Error/success получили `alert/status`, `aria-live`, `aria-invalid`, `aria-describedby`.
- Telegram CTA не рендерится без настоящего URL.
- Фото программы имеют смысловой fallback alt.
- Mobile nav получила видимую подсказку горизонтальной прокрутки.
- Acceptance: web TypeScript и production build проходят; остаётся ручной mobile/screen-reader smoke.

### E. Repo quality gate — DONE locally

- `pnpm test:unit`: config, explore-links и API tests.
- `pnpm build:quality`: последовательные shared/config/API/web/admin builds, чтобы не конкурировать за память на Windows.
- `pnpm check:quality`: общий test + build gate.
- Acceptance: 83/83 unit tests, API/shared/web/admin builds passed.

### F. Docker и browser acceptance — PARTIAL

- Docker Desktop named pipes есть, но engine не отвечает; локальная служба не запускается без прав администратора.
- После запуска Docker Desktop: `docker compose ps`, clean Docker build, API health, web → API integration smoke, DB migration status.
- Bounded screenshot smoke выполнен для home 1440px, home 390px и explore 1440px; найдено и исправлено mobile-обрезание role switcher.
- Остаётся интерактивный desktop/tablet/mobile smoke: URL filters, consent validation, form errors, program media и history back/forward.
- Пройти keyboard-only и NVDA/VoiceOver smoke.

### G. Canonical host redirect — PENDING separate infra PR

- Создать отдельный TLS server block для `www.mywavetour.ru`.
- Вернуть `301 https://mywavetour.ru$request_uri`.
- Проверить path/query preservation, `nginx -t`, Docker config smoke и rollback на предыдущий config.

## 3. Разбиение на PR

1. `fix/camp-rights-explicit-confirmation` — только Camp mapper и regression tests.
2. `fix/web-explore-seo-runtime` — ProgramCard boundary, SSR, sitemap, metadata, JSON-LD, noindex layouts.
3. `fix/web-ux-accessibility` — consent, live regions, alt, Telegram CTA, mobile nav.
4. `chore/repo-quality-gate` — только repo-level quality scripts.
5. `fix/infra-www-canonical-redirect` — только nginx + infra validation.

Каждый PR должен иметь чистый committed SHA, зелёный CI и своё rollback-описание. Infra и runtime не объединять.

## 4. Риски и rollback

- Camp policy: откатить mapper/test commit; не возвращать косвенное `partner_allowed`.
- Explore boundary: откатить client-boundary commit, если bundle/performance регрессирует; перед этим снять route metrics.
- SSR/search params: откатить только island refactor; проверить back/forward и filter URL sync.
- Sitemap/metadata: откатить SEO commit; sitemap не должен падать при недоступном API.
- UX: откатить компонентный commit; не возвращать preselected consent.
- Nginx: перед выкатом сохранить текущий config и иметь одну команду возврата.

## 5. Release gate

Merge допустим только после:

- clean branch и committed SHA;
- CI `check:quality` passed;
- Docker/API/DB smoke passed;
- desktop/mobile/accessibility smoke passed;
- нет blocker/critical findings;
- Owner review каждого логического PR.

Deploy остаётся отдельным решением и не входит в этот remediation plan.
