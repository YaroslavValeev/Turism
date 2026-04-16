# PUBLIC_WAKESURF_UX_ACCEPTANCE_EMAIL.md

**Тема:** Public Wakesurf-first UX accepted — apply minor corrections and move to pilot monitoring

Привет.

## Public visual UX — Accepted with minor corrections

Публичная витрина достигла **pilot-ready** уровня; дальнейшая работа — не бесконечный polish, а **pilot monitoring** и **first signal report**.

## Что принято

- Hero carousel как полноценный визуальный блок (не placeholder)
- Trust cards
- Секция «Как работает MyWave Travel»
- Блок актуальных программ пилота (каталог)
- Бейджи: `В пилоте`, `Wakesurf-first`, `Assisted booking`
- Общее направление **premium-utility**

## Minor corrections (короткий pass)

В коде учтено:

1. **Safe area в карусели** — горизонтальные отступы overlay увеличены (`clamp(72px, 11vw, 104px)`), чтобы заголовок слайда не пересекался со стрелками; на мобильных стрелки скрыты — отступы обычные.
2. **Контраст текста** — усилен нижний градиент overlay; усилены тени у заголовка и лида на слайде; слегка скорректирован фон слайда Dubai для предсказуемее читаемости.
3. **Первый экран** — лёгкое усиление глубины фона hero (без смены IA).

Дальнейшая смена абстрактных градиентов на **брендовые фото воды/катания** — отдельный шаг по ассетам, не блокер pilot-ready.

## Что не делать

- Не открывать новый UX-checkpoint / redesign sprint
- Не менять продуктовую логику и intake policy
- Не расширять пилотный scope
- Не уходить в бесконечную шлифовку
- Не трогать public payment / assisted booking правила

## Что дальше

После minor corrections публичную витрину считаем **pilot-ready** и переходим к:

- **Pilot monitoring**
- **First signal report** — шаблон: [FIRST_SIGNAL_REPORT.md](FIRST_SIGNAL_REPORT.md)

Работаем дальше через реальные сигналы пилота, не через новый redesign.
