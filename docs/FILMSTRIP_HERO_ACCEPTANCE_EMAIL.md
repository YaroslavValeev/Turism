# FILMSTRIP_HERO_ACCEPTANCE_EMAIL.md

Тема: Filmstrip hero accepted — freeze current structure and do not open webp task now

Привет.

## Filmstrip hero — Accepted

### Что принято

Принята текущая реализация первого экрана:

- unified hero structure: headline → filmstrip → CTA
- Wakesurf-first emphasis
- 5-frame composition
- removal of duplicated intro text inside filmstrip block
- updated frame texts
- centered initial frame
- current spacing and hero structure

### Что это означает

Первый экран считаем продуктово достаточным для текущего pilot stage.

## Решение по следующему шагу

Скрипт экспорта `.webp` и автоматизацию hero asset pipeline **сейчас не делаем**.

## Почему

Мы уже находимся в фазе:

- pilot monitoring
- first signal collection

Новый mini-sprint на asset/export polish сейчас не нужен, если:

- нет явной performance problem
- нет сигнала из monitoring / analytics / CWV

## Что делать дальше

1. freeze current hero structure
2. do not expand visual scope
3. continue limited pilot
4. collect first real signals
5. prepare `FIRST_SIGNAL_REPORT.md`

## Что не делать

- не открывать новый asset-pipeline checkpoint
- не добавлять webp export task прямо сейчас
- не менять hero structure без реального сигнала
- не раздувать polish beyond pilot needs

## Когда вернуться к webp/export

Только если:

- hero loading becomes a real issue
- performance / CWV signal appears
- monitoring shows asset-related friction

До этого считаем текущий filmstrip hero достаточным.
