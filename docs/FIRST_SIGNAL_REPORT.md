# First Signal Report — MyWave Travel (пилот)

**Назначение:** зафиксировать первые наблюдаемые сигналы после выхода публичной витрины в pilot-ready состоянии. Обновлять по решению Owner / Ops (например раз в 1–2 недели пилота).

**Статус шаблона:** черновик для заполнения · не заменяет [PILOT_MONITORING_PLAN.md](PILOT_MONITORING_PLAN.md).

---

## 1. Период и контекст

| Поле | Значение |
|------|----------|
| Период наблюдения | 2026-03-27 → 2026-03-30 (первый post-launch срез) |
| Версия витрины / деплой | local env (`APP_ENV=local`), API `http://localhost:3001`, snapshot из `services/api/scripts/pilot_signals_snapshot.cjs` на 2026-03-30T12:41:53.845Z |
| Канон пилота | Wakesurf-first, см. [startup_config.md](../startup_config.md) |

---

## 2. Активные организаторы и программы

| Метрика | Значение |
|---------|----------|
| Организаторы в контуре (verified / trusted / listed) | 4 (`trusted_by_platform`: 4) |
| Опубликованные программы (published) | 3 |
| Программы в фокусе пилота (Wakesurf + Krasnodar) | 3 |

_Краткие примечания:_ все опубликованные программы в текущем срезе соответствуют pilot wedge (`nonPilotPublished = 0`). По заявкам активность пока концентрируется на `WaveLine Weekend Progress Camp BR-095201` (оба booking относятся к этой программе).

---

## 3. Guardrails (что соблюдалось)

- [x] Публично не отображается `Program.intakeSource` и прочие оператор-only поля  
  Проверка: `GET /programs` (2026-03-30), в public payload поля `intakeSource` нет.
- [x] Заявки только assisted booking; нет public payment на сайте  
  Проверка: текущий контур booking в БД (`bookingsTotal=2`, `sourceChannel=program_page`) и зафиксированный pilot режим в каноне (`assisted only`).
- [x] Отзывы на сайте только после модерации (`approved`)  
  Проверка: `reviewsTotal=1`, `approvedReviews=1`; `GET /reviews/public?programId=...` возвращает только approved запись.
- [x] Фокус каталога в рамках объявленного pilot wedge  
  Проверка: `publishedPrograms=3`, `pilotFocusPrograms=3`, `nonPilotPublished=0`.

_Отклонения:_ критичных отклонений в срезе не зафиксировано.

---

## 4. Сигналы спроса и трения (friction)

| Сигнал | Наблюдение |
|--------|------------|
| Заходы на лендинг / программы | В этом срезе web-аналитика не подключена как источник; используем прокси-сигнал по bookings из API/БД. |
| Заявки (кол-во, конверсия из просмотра программы) | 2 заявки всего (`completed=1`, `new=1`), обе с `sourceChannel=program_page`. |
| Время ответа оператора | По 1 завершённой заявке: `firstResponseAt` через ~6.5 сек после `createdAt`; по 1 заявке в `new` — `firstResponseAt=null` (ещё не обработана на момент snapshot). |
| Отказы / неподходящий fit | В текущем срезе явных отказов/cancelled-статусов нет. |

---

## 5. Блокеры

Критичных блокеров, останавливающих pilot, в срезе нет.  
Операционный риск для наблюдения: есть необработанная заявка в статусе `new` без `firstResponseAt`.

---

## 6. Боль оператора

- У заявок не заполнен `leadOwner` (2/2), что затрудняет прозрачность ответственности при ручном сопровождении.
- Одна заявка остаётся в `new` без первого ответа на момент среза — потенциальная точка трения по SLA оператора.

---

## 7. Рекомендации на следующий цикл

1. Ввести простой операционный ритуал на период пилота: ежедневно закрывать все `new` в течение целевого SLA и фиксировать `firstResponseAt`.
2. Начать минимальный friction log по формату из [PILOT_MONITORING_PLAN.md](../PILOT_MONITORING_PLAN.md) (booking / verification / commission / operator UX) с привязкой к id.
3. Добавить owner-дисциплину по заявкам: проставлять `leadOwner` для каждой новой заявки.
4. На следующем срезе добавить источник трафика (analytics), чтобы перестать использовать bookings как единственный прокси спроса.

**Owner decision:** требуется после следующего среза (с обновлённым friction log и SLA-фактом по новым заявкам).

---

## 8. Ссылки на артефакты

- Приёмка публичного UX: [PUBLIC_WAKESURF_UX_ACCEPTANCE_EMAIL.md](PUBLIC_WAKESURF_UX_ACCEPTANCE_EMAIL.md)
- Контент-пак: [WAKESURF_FIRST_PUBLIC_CONTENT_EMAIL.md](WAKESURF_FIRST_PUBLIC_CONTENT_EMAIL.md)
- Polish pass: [PUBLIC_WAKESURF_UX_POLISH_EMAIL.md](PUBLIC_WAKESURF_UX_POLISH_EMAIL.md)
- Freeze и phase lock: [FILMSTRIP_HERO_ACCEPTANCE_EMAIL.md](FILMSTRIP_HERO_ACCEPTANCE_EMAIL.md), [PILOT_MONITORING_ONLY_EMAIL.md](PILOT_MONITORING_ONLY_EMAIL.md), [PILOT_SIGNALS_PHASE_LOCK_EMAIL.md](PILOT_SIGNALS_PHASE_LOCK_EMAIL.md)
- Monitoring plan: [../PILOT_MONITORING_PLAN.md](../PILOT_MONITORING_PLAN.md)
- Фактический snapshot (скрипт): `services/api/scripts/pilot_signals_snapshot.cjs`
