# Production Surface vs Internal Control

Owner-facing truth. Документ держит явную границу между тем, что видит пользователь, и тем, что остаётся внутренним режимом запуска.

## 1. Production-facing

Это слой, который видит пользователь на сайте и в публичных карточках программ.

- Никаких слов `pilot`, `limited`, `assisted-only`, `self-serve`, `public payment not available`.
- Каталог и карточки выглядят как обычный рабочий продукт.
- Внешние тексты говорят о ценности: формат, уровень, сопровождение, организатор, следующий шаг.
- Ограничения rollout не объясняются пользователю в лоб, если они не нужны для конкретного действия.

## 2. Internal control

Это слой, который продолжает действовать внутри продукта и в операционке.

- Текущий операционный фокус: `Wakesurf + Krasnodar`.
- Anchor locations следующего цикла: `Dubai`, `Bodrum`.
- Rollout остаётся контролируемым: малое число organizer flows, малое число опубликованных программ, ручной контроль очередей.
- Ограничения по запуску, go/no-go и monitoring остаются в внутренних runbook и owner-документах.

## 3. Что нельзя смешивать

- Нельзя показывать пользователю внутренние rollout-ограничения как часть обычного UX.
- Нельзя считать production-facing тексты признаком того, что внутренние guardrails сняты.
- Нельзя открывать новый широкий feature scope без отдельного owner-решения.

## 4. Как маркировать решения дальше

Во всех следующих обсуждениях и изменениях используем две метки:

- `Production-facing` — то, что влияет на внешний продукт, тексты, карточки, пользовательский маршрут.
- `Internal control` — то, что влияет на rollout, очереди, guardrails, monitoring, gating и manual operations.

## 5. Tests Before Deploy

Перед каждым деплоем прогоняется релизный минимум:

1. `npx pnpm@9.0.0 --filter @mywave/shared-types build`
2. `npx pnpm@9.0.0 --filter admin build`
3. `npx pnpm@9.0.0 --filter web build`
4. `npx pnpm@9.0.0 smoke`
5. `npx pnpm@9.0.0 e2e:checkpoint1`
6. `npx pnpm@9.0.0 e2e:checkpoint2`
7. Manual sanity check на `web/admin` перед go-live

## 6. Source of truth

С этим документом вместе читаются:

- `startup_config.md`
- `SPRINT2_CHECKPOINT_5_REPORT.md`
- `PILOT_MONITORING_PLAN.md`

Правило: публичная поверхность может выглядеть как production, но owner-level truth об internal control не теряется и не маскируется.
