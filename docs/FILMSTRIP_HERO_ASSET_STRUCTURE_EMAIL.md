# FILMSTRIP_HERO_ASSET_STRUCTURE_EMAIL.md

Тема: Prepare filmstrip hero asset structure for public landing

Привет.

Фиксируем следующее решение по визуальному входу публичной витрины:

## Hero entrance should evolve into a filmstrip-style visual block

с ярко выраженными кадрами / frames.

## Product logic

- first emphasis = `Wakesurf-first`
- other sports = platform breadth signal, not pilot focus
- filmstrip should communicate:
  - current pilot focus
  - future platform width

## Asset placement rule

Нужно разделить:

1. original source files
2. optimized web assets

## 1. Originals

Исходные изображения (в репозитории — JPEG, конвертированные из вложений):

`apps/web/public/media/source/filmstrip/`

### Structure

- `apps/web/public/media/source/filmstrip/wakesurf/`
- `apps/web/public/media/source/filmstrip/ski/`
- `apps/web/public/media/source/filmstrip/kite/`
- `apps/web/public/media/source/filmstrip/mtb/`

## 2. Optimized web assets

Позже подготовить web-ready версии сюда:

`apps/web/public/media/filmstrip/`

### Structure

- `apps/web/public/media/filmstrip/wakesurf/`
- `apps/web/public/media/filmstrip/ski/`
- `apps/web/public/media/filmstrip/kite/`
- `apps/web/public/media/filmstrip/mtb/`

## Naming rules

- latin only
- lower snake_case
- no spaces
- no random exported UUID names
- keep category consistency

Examples:

- `wasurf_1.jpg`
- `ski_kids_1.jpg`
- `mtb_cross_1.jpg`

## Filmstrip composition priority

For first implementation:

1. main hero frame = wakesurf
2. supporting frames = wakesurf / mtb / ski / kite mix
3. do not make all sports visually equal in pilot mode
4. Wakesurf remains the dominant opening impression

## What not to do

- do not mix hero assets with program-specific media
- do not drop originals directly into root public folders
- do not publish raw assets as final web versions
- do not weaken Wakesurf-first emphasis

## Next step

After assets are placed:

1. select best 5–7 images
2. define common crop / ratio
3. prepare optimized web versions
4. implement filmstrip hero component
5. connect it to the public landing

Это отдельный brand/hero asset layer, не program media layer.
