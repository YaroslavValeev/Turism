# WAKESURF_FIRST_PUBLIC_CONTENT_EMAIL.md

**Тема:** Wakesurf-first — публичный UX-пак: лендинг, каталог, страница программы (GM)

Привет.

Зафиксирован пакет публичного контента и поведения для первого запуска: лендинг с hero, каруселью направлений, блоками доверия и шагов, каталогом программ пилота с бейджами и фильтрами, long-form страницей программы с блоками по IA и одобренными отзывами.

## Цели

- Позиционирование **Wakesurf-first** и **assisted booking** без иллюзии self-serve оплаты.
- Единая подача программ: уровень, включено/не включено, отмены, организатор, доверие.
- Публичный API не раскрывает операторские поля (в т.ч. `intakeSource` — см. [INGESTION_POLICY.md](INGESTION_POLICY.md)).
- Отзывы на сайте только после модерации (`approved`), без лишнего PII.

## Scope (ux-content-pack-01)

- Главная: секции по [SITE_IA_WAKESURF_FIRST.md](SITE_IA_WAKESURF_FIRST.md) — hero, карусель (Dubai / Bodrum / Krasnodar как направления пилота), trust, шаги, каталог с фильтрами по уровню и датам (клиентски), блоки «для кого», «что в программе», организаторам, FAQ, футер.
- Страница программы: long-form поля из схемы + fallback-тексты контент-пака, если в БД пусто; форма заявки (assisted booking); блок одобренных отзывов через публичный endpoint.

## Канонические ссылки

- Intake и публикация: [INGESTION_POLICY.md](INGESTION_POLICY.md)
- Информационная архитектура пилота: [SITE_IA_WAKESURF_FIRST.md](SITE_IA_WAKESURF_FIRST.md)
- Решение по источникам и презентации: [SOURCE_AND_PRESENTATION_POLICY_EMAIL.md](SOURCE_AND_PRESENTATION_POLICY_EMAIL.md)

## Запреты (напоминание)

- Не показывать гостю `intakeSource` и прочие оператор-only поля в публичном JSON.
- Не подменять assisted booking «кнопкой оплаты».
- Не публиковать отзывы без прохождения модерации.

## Статус

Пакет отражён в коде `apps/web` (контент-модули, компоненты, страницы) и в API (санитизация программ, `GET /reviews/public?programId=`).
