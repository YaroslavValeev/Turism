# PUBLIC_UX_FINAL_ACCEPTANCE_AND_MONITORING_EMAIL.md

**Тема:** Public Wakesurf-first UX accepted — stop polish and move to first signal collection

Привет.

## Public Wakesurf-first UX — Accepted

## Minor corrections — Closed

## Что принято

Публичная витрина считается **pilot-ready**.

Приняты:

- hero
- карусель (safe area / контраст)
- секция «Как работает MyWave Travel»
- блок актуальных программ пилота (карточки)
- направление **premium-utility**
- текущий поток: лендинг → каталог → страница программы → заявка (assisted booking)

## Что зафиксировано по стенду

- Сборки `web`, `admin`, `api` проходят (`pnpm build`).
- API на **3001**, публичный сайт на **3000** — ожидаемая конфигурация для проверки витрины.
- Ошибка **`EADDRINUSE` на порту 3002** при `pnpm --filter admin start` **не блокер**: порт уже занят (часто уже запущен `pnpm dev` / другой экземпляр админки). Либо остановить процесс на 3002, либо не поднимать второй `start` на том же порту.

## Что дальше

Новый UX-checkpoint **не открываем**.

Переходим к:

# Pilot Monitoring / First Signal Collection

## Следующие шаги

1. При необходимости — clean/hide непилотных данных в публичном контуре (по политике пилота).
2. Продолжать **ограниченный пилот** в режиме **GO WITH GUARDRAILS**.
3. Логировать трение и наблюдения по **[PILOT_MONITORING_PLAN.md](PILOT_MONITORING_PLAN.md)**.
4. Заполнять **[FIRST_SIGNAL_REPORT.md](FIRST_SIGNAL_REPORT.md)** по мере появления сигналов.

## Содержимое `FIRST_SIGNAL_REPORT.md`

1. Active organizers / programs  
2. Guardrails applied  
3. Friction collected  
4. Blockers (if any)  
5. Operator pain points  
6. Next recommendation  

Шаблон: [FIRST_SIGNAL_REPORT.md](FIRST_SIGNAL_REPORT.md).

## Low-priority (не блокеры пилота)

- `GET /favicon.ico` **404** — добавить `app/favicon.ico` или `metadata.icons` в Next при желании.
- Замена градиентных обложек карусели/hero на **брендовые water/adventure** ассеты — отдельно, когда будут материалы.
- Опциональный micro-polish типографики / отступов — только если не отвлекает от сбора сигналов.

## Чего не делать

- Не открывать новый UX-checkpoint и полноценный redesign витрины.
- Не расширять pilot scope без решения Owner/GM.
- Не включать public payment и self-serve booking в рамках текущего пилота.
- Не смешивать фазу monitoring с бесконечной косметической шлифовкой.
- Не тратить время только на «косметику» до первых осмысленных сигналов пилота.

## Следующий ожидаемый артефакт

- Заполненный или регулярно обновляемый **[FIRST_SIGNAL_REPORT.md](FIRST_SIGNAL_REPORT.md)**.

Дальше работаем через **реальные сигналы пилота**, а не через новый цикл polish.

## Связанные документы

- Приёмка с minor corrections: [PUBLIC_WAKESURF_UX_ACCEPTANCE_EMAIL.md](PUBLIC_WAKESURF_UX_ACCEPTANCE_EMAIL.md)
- Контент-пак витрины: [WAKESURF_FIRST_PUBLIC_CONTENT_EMAIL.md](WAKESURF_FIRST_PUBLIC_CONTENT_EMAIL.md)
- Polish pass: [PUBLIC_WAKESURF_UX_POLISH_EMAIL.md](PUBLIC_WAKESURF_UX_POLISH_EMAIL.md)
