# Ingestion — Next Steps

Статус: execution plan  
Дата: 2026-04-08  
Основание: [INGESTION_SOURCE_COVERAGE_2026-04-08.md](INGESTION_SOURCE_COVERAGE_2026-04-08.md)

---

## 1. Текущее состояние

- Всего источников: `34`
- Активных источников: `33`
- Источников с опубликованными карточками: `1`
- Реально publishable pipeline сейчас подтверждён только для `Freetime.guru`

Вывод:

- ingestion уже работает как система
- но качество покрытия по источникам пока низкое
- главный следующий шаг не “добавить ещё 20 источников”, а поднять качество extraction для 5-6 источников с реальным шансом дать карточки

---

## 2. Что делать дальше

### Этап A. Усилить уже рабочий источник

#### `Freetime.guru`

Что делать:

- добавить detail-page extraction поверх календаря
- улучшить title cleanup
- лучше извлекать описание, программу, цену, локацию и media
- нормализовать карточки до travel-catalog quality, а не raw-ingestion style

Почему:

- это единственный источник, который уже доказал publishable output
- значит это самый дешёвый путь быстро увеличить количество качественных карточек

---

### Этап B. Взять 4 следующих приоритетных site-grade источника

#### Priority shortlist

1. `SurfPoint`
   - `https://surfpoint.ru/surf-camp/`
   - уже даёт `20 raw / 20 normalized`
   - нужен parser под site/detail pages

2. `TrialNinja Bike Camp`
   - `https://bike-camp.ru/raspisanie-2026/`
   - есть явный schedule-like URL
   - хороший кандидат на parser под расписание

3. `NEW STAR CAMP`
   - `https://newstarcamp.ru/`
   - сильный бренд, нужен dedicated site parser

4. `SaratovSurfCamp`
   - `https://sarsurfcamp.ru/`
   - нужен parser под сайт организатора и его event pages

5. `Heliski Russia`
   - `https://heliski.ru/`
   - высокий шанс на structured expedition/trip pages

Почему именно они:

- у них уже есть site-grade URLs
- у части уже есть raw coverage
- у них выше шанс получить event cards, чем у Instagram-only профилей

---

### Этап C. Оставить часть источников только как discovery

Сейчас не тратить parser effort в первую очередь на:

- `Instagram-only` профили без нормального сайта/календаря
- общие брендовые/контентные ленты
- источники, которые не дают будущих event-like публикаций

Их роль:

- discovery
- ручная проверка
- подсказка, куда писать site parser позже

---

## 3. Engineering backlog

### Sprint 1

- усилить `Freetime.guru` detail-page extraction
- добавить coverage dashboard/report как обязательный artefact после каждого прогона
- убрать remaining noisy auto-publish paths для слабых источников

### Sprint 2

- сделать parser profile для `SurfPoint`
- сделать parser profile для `TrialNinja Bike Camp`
- повторно прогнать ingestion и оценить publish yield

### Sprint 3

- сделать parser profile для `NEW STAR CAMP`
- сделать parser profile для `SaratovSurfCamp`
- оценить, есть ли publishable output или источник остаётся discovery-only

### Sprint 4

- сделать parser profile для `Heliski Russia`
- добавить source health labels:
  - `publishable`
  - `needs site parser`
  - `discovery only`
  - `inactive / dead`

---

## 4. Что нужно от Owner

1. Подтвердить, что следующий parser focus:
   - `Freetime`
   - `SurfPoint`
   - `TrialNinja Bike Camp`
   - `NEW STAR CAMP`
   - `SaratovSurfCamp`
   - `Heliski Russia`

2. Прислать шаблонную fallback-картинку для карточек без media.

3. Отметить, какие из источников для тебя бизнес-приоритетнее даже при меньшем текущем coverage.

4. Подтвердить, что:
   - `Instagram` оставляем discovery-layer
   - `site / calendar / schedule` делаем главным publish source

---

## 5. Что уже можно считать правильной operational policy

- не считать количество подключённых источников метрикой успеха
- считать успехом только:
  - `publishable cards per source`
  - `noise ratio`
  - `coverage quality`
  - `lead-generating cards`

---

## 6. Следующая точка решения

После реализации parser profiles для `Freetime + SurfPoint + TrialNinja` нужно принять решение:

- продолжаем расширять site parser portfolio
- или временно замораживаем слабые источники и идём только по тем, кто уже даёт качественные карточки
