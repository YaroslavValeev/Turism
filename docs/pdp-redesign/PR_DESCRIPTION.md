# PR: Program PDP — Performance Travel Editorial redesign

Ветка: `feature/program-pdp-editorial-redesign`. Аудит «до» — `docs/pdp-redesign/PDP_BEFORE_REDESIGN.md`.

## What changed

- **Presentation layer разделён на компоненты** `apps/web/src/components/program-pdp/`:
  `ProgramHero`, `ProgramMedia` (`ProgramHeroMedia` + `ProgramGallery`), `ProgramDecisionPanel`,
  `ProgramQuickFacts`, `ProgramSection`, `ProgramText` (Prose / BulletList / MyWaveNote / SourceCaption / ProgramInfoField),
  `ProgramReviews`, `ProgramProvenance`, `ProgramApplicationForm`, `ProgramRelated`, `ProgramMobileCta`, `icons` (inline SVG, без зависимостей).
- `program-pdp.client.tsx` остался контейнером: состояние, эффекты, аналитика, `handleSubmit`, расчёт производных значений.
- **Layout:** 12-колоночная сетка до 1280px; слева meta → H1 → локация → hero-фото → quick facts → контент; справа sticky decision panel (≥900px). На мобильных: head → facts → панель → контент → форма → related.
- **Hero-фото** перенесено наверх (16:10 desktop, 10:7 mobile, `aspect-ratio` + `width/height` → без CLS, eager + `fetchpriority=high`), счётчик `1 / N` при нескольких фото ведёт к галерее.
- **Decision panel:** даты «27 сентября — 3 октября 2026» + длительность, цена (`ProgramPrice`), видимая строка о курсе ЦБ, первые 3 пункта «Включено» (из данных организатора), рейтинг (если есть отзывы), CTA «Уточнить наличие мест» → `#request`, дисклеймер.
- **Quick facts** из данных: длительность, дисциплина (ссылка в каталог), уровень, тип программы, сезон старта, риск (для авто-импорта помечен «Оценка MyWaveTour»).
- **Источник и актуальность:** объединены плашка авто-импорта, «Добавлено в MyWaveTour», «Обновлено с источника (МСК)», «Проверить первоисточник», trustReason и исходное описание в `<details>`.
- **Mobile sticky CTA:** цена + короткие даты + «Уточнить место →», safe-area, прячется, пока форма в зоне видимости (не перекрывает submit/consent/ошибки).
- **Design tokens:** в `:root` добавлены spacing (4…96), radius (control/media/panel/pill), motion (fast/base/slow + reduced-motion), `--mw-text-secondary`, `--mw-success/warning/error`. Палитра мокапа применяется **только внутри `.mw-pdp-root`** через переопределение существующих `--mw-*` (без второй темы). Стили — `apps/web/src/app/program/[id]/pdp.css`, грузятся только на этом маршруте.
- **Data safety:** `apps/web/src/lib/programDisplay.ts` — `displayValue` (Unknown/undefined/null/NaN/«—» → скрыть), `humanLabel` (непереведённый snake_case enum → скрыть), детерминированные даты (без TZ → без hydration mismatch), склонения. Тесты — `programDisplay.test.ts`.

## What intentionally did NOT change

- API-контракты, payload `POST /bookings` (`guestContact`, `notes`, `legalConsent`, UTM/entry-поля), id `guestContact` / `notes` / `program-request-feedback`, якорь `#request`.
- `page.tsx` (загрузка данных), `generateMetadata`, JSON-LD (в `layout.tsx` добавлен только импорт CSS).
- События `page_view`, `view_item`, `program_submitted` — тот же код, те же параметры.
- Бизнес-правила: `ended`, валидация контакта, обязательность двух consent, тексты успеха/ошибок, `resolveProgramField`, оверрайды, порядок медиа, on-request даты.
- URL `/program/[id]`, `returnTo` с фильтрами каталога.
- Данные не исправляются во фронтенде — только скрываются невалидные значения.

## Existing functionality preserved (маппинг «было → стало»)

| Было | Стало |
|---|---|
| Бейджи дисциплины/региона (ссылки в каталог) | Дисциплина — ссылка в quick facts; регион — ссылка в строке локации |
| Бейджи уровня/формата | Quick facts + meta-строка |
| Цена/даты/CTA в hero + sticky aside | Decision panel (sticky на desktop, inline на mobile) |
| «Пока нет отзывов» в hero **и** в секции | Одно пустое состояние в секции «Отзывы» |
| Плашка «Из открытого источника» | Раздел «Источник и актуальность» |
| «Описание из источника» / «Программа выезда» | Исходное описание — в «Источник и актуальность»; программа выезда — отдельный раздел |
| «Описание и факты в карточке» | Подраздел «Источник и актуальность» |
| Секция «Медиа» | Hero-фото + «Фото и видео» (остальные фото/видео с подписями) |
| «Организационные условия» | «Проживание, трансфер и экипировка» (организатор vs «Примечание MyWave» сохранены) |
| Примечания под CTA | Дисклеймер «Заявка не является бронированием. Финальные условия подтвердит организатор.» |

Поведенческие нюансы (осознанные):
- Ссылка на источник показывается только для `http(s)`-URL (раньше `sourceUrl` вставлялся в `href` без проверки).
- Ссылки «другие программы по дисциплине» скрываются, если дисциплина невалидна (Unknown).
- На мобильной нижней панели нет строки `≈ ₽` — она видна в decision panel над контентом.

## Screenshots

1440 / 1024 / 768 / 390 (+320) — снять на staging или локально (нужен контур web + API + Postgres).

## Tests

- `pnpm test:web:ux` — 56/56 (без изменений).
- `programDisplay.test.ts` — 7/7, добавлен в `test:web:ux`.
- `tsc --noEmit` (web) — без ошибок; `pnpm --filter web build` — см. CI.

## Risks

- Визуальная регрессия на нестандартных данных (очень длинный H1, 12+ фото, 20 отзывов) — проверить на staging.
- `body:has(.mw-pdp-root)` меняет фон страницы только на PDP; браузеры без `:has` покажут прежний фон.

## Known limitations

- Нет `priceOptions` в API → одна цена «от …».
- Нет lifecycle-статусов кроме «Завершён» → чип «Идёт сейчас» не выводится.
- Нет компонентных (RTL) и браузерных E2E-тестов в `apps/web`; E2E-сценарии 1–10 из ТЗ — ручная проверка или отдельная задача на Playwright.
- `next/image` не используется (нужен `images.remotePatterns` для внешних/проксированных URL).

## Rollback

Отдельный PR без изменений backend/DB → `git revert <merge-commit>`. Затронуты только `apps/web` (PDP + новые компоненты + токены) и docs.

## FUNCTIONAL PARITY

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
