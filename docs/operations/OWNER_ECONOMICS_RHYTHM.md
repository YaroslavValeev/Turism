# Owner / admin: ритм работы с economics и governance

Один документ для **регулярного** управления экономикой платформы (guardrails, overrides, rewards, комиссии). Не заменяет PRD и ADR — фиксирует **ритм проверок** и **правила реакции**.

**Связанные материалы:**

| Документ | Зачем |
|----------|--------|
| [`ECONOMICS_OVERVIEW_RUNBOOK.md`](./ECONOMICS_OVERVIEW_RUNBOOK.md) | Как читать `GET /admin/economics/overview`, блоки `aggregates` / `funnel` / `top_lists`, здоровые ориентиры |
| [`ECONOMICS_ADMIN_API.md`](./ECONOMICS_ADMIN_API.md) | API overrides, preview, effective, guardrails job |
| [`GOVERNANCE_ALERTS_V1.md`](./GOVERNANCE_ALERTS_V1.md) | Автоалерты economics (critical / warning, Telegram, email, digest) |
| [`../qa/BROWSER_CHECK_ROUTES.md`](../qa/BROWSER_CHECK_ROUTES.md) | Ручной smoke UI `/admin/economics/*` |
| [`../qa/UGC_REWARD_HARDENING.md`](../qa/UGC_REWARD_HARDENING.md) | Жизненный цикл reward, expiry, recovery |

---

## 1. Каждый день (≈ 10–15 минут)

**Где смотреть:** админка **`/admin/economics`** + при необходимости **`GET /admin/economics/overview`** за последние 7 дней (сравнение с предыдущей неделей — на глаз или в заметках).

| Чек | Что смотреть | Зачем |
|-----|----------------|--------|
| **Guardrails job** | После ручного `POST /admin/economics/guardrails/run` или по расписанию — **triggers** в ответе job (если смотрите логи/аудит) | Поймать `program_override_expired`, `expiry_health_watch`, повторные срабатывания по одной программе |
| **programs_overridden / referrals_overridden** | Карточки и таблицы на `/admin/economics` | Не накапливать «вечные» ручные режимы без review |
| **programs early warning + programs limited** | Те же карточки / списки | Ранний сигнал до suspend; кто уже под ограничением |
| **Rewards expiring soon** | В overview: динамика **granted vs expired**; напоминания по UGC — см. [`NOTIFICATIONS_MVP.md`](../qa/NOTIFICATIONS_MVP.md) / ops job | Не терять выданные бонусы из‑за молчания |
| **Job failures** | Логи API, `/jobs`, алерты ops (если настроены) | Падение `guardrails`, `run-reward-expiry`, ingestion — **блокер** для доверия к цифрам |
| **rewards_recovered / not_recovered** | Overview + [`UGC_REWARD_RECOVERY.md`](../qa/UGC_REWARD_RECOVERY.md) | Всплеск **organizer_cancelled** + recovery — давление на доверие и повторные брони |
| **Резкие скачки** | `aggregates.total_discount_rub`, `total_commission_rub` день-к-дню | Аномалия, баг, акция или смена микса программ — разобрать до конца дня |

**Минимальный ежедневный порядок:** открыть **`/admin/economics`** → убедиться, что списки override/EW осмысленны → при сомнении открыть **overview** за 7 дней → зафиксировать 1 строку в журнале owner (если ведёте).

---

## 2. Раз в неделю (≈ 30–45 минут)

**Где:** `GET /admin/economics/overview` с **`date_from` / `date_to`** = календарная неделя (или скользящие 7 дней) + **`/admin/economics`** для порогов env.

| Метрика / блок | Поле / раздел | Действие |
|----------------|----------------|----------|
| **Выручка и комиссия** | `aggregates.total_final_rub`, `total_commission_rub` | Тренд к прошлой неделе; расхождение с billing — см. runbook overview |
| **Доля скидки** | `unit_economics.avg_discount_share_pct` | Сравнить с `global_discount_guardrail` и `ECON_MAX_DISCOUNT_SHARE` |
| **Воронка реферала** | `funnel.derived.visit_to_booking_pct` | При нулевых visits — проверить `ANALYTICS_ENABLED` и события |
| **Доведение сделок** | `funnel.derived.discount_to_completed_pct` | Низко при высоком числе броней со скидкой — разбор программ/статусов |
| **Топы** | `top_lists.top_programs_by_discount` vs `top_programs_by_commission` | «Скидка есть — комиссии мало» → приоритет разбора |
| **EW и completion** | `/admin/economics`: early warning, programs_limited; в overview — низкий **discount_to_completed** | Решение: контент организатора, даты, коммуникация **до** ручного suspend |

---

## 3. Раз в месяц (≈ 1–2 часа)

| Тема | Что сделать |
|------|-------------|
| **Пороги env** | Сверить `ECON_*` из deploy с фактом: не «в ноль» и не «вечный panic»; зафиксировать изменения в changelog ops |
| **Политика overrides** | Список всех активных program/referral override: каждый либо с датой окончания, либо явно заведён как exceptional с владельцем |
| **Комиссии и сверка** | Выборочная сверка commission vs overview; backlog reconciliation — [`ADR-008`](../decisions/ADR-008-commission-reconciliation-strategy.md) |
| **UGC / reward policy** | Сроки reward, напоминания, доля expired — нужна ли корректировка коммуникаций |
| **Ретроспектива инцидентов** | Повторяющиеся guardrails на одной программе, массовые отмены — урок в playbook |

---

## 4. Сигналы: ручной override vs только наблюдение

**Ручной override** (программа: `force_*` / referral: `force_*`) — только когда:

- есть **явная бизнес-причина** (согласованный риск, инцидент, пилот);
- срок **до** задан (или редкий **indefinite** по политике);
- сделан **preview** и зафиксирован **reason** в audit.

**Только наблюдение** (без override):

- разовый **early warning** без деградации completion;
- программа в **recovery** множителя (шаг вверх по job);
- глобальный **reduce** новых rewards при превышении доли скидки — система уже защищается;
- **expiry health watch** в audit — мониторинг, не автоматический stop.

**Таблица «сигнал → действие owner»** — см. [раздел 8](#8-сигнал--действие-owner-краткая-таблица).

---

## 5. Тревожные пороги (alert thresholds)

Числа ниже — **ориентиры для ручного разбора**, не автоматические алерты в коде (v1). Подстройте под масштаб платформы.

| Сигнал | Порог / условие | Смысл |
|--------|------------------|--------|
| **Expired / granted** | Доля expired к granted за период **выше** `ECON_EXPIRY_HEALTH_RATIO` (см. audit `expiry_health_watch`) или рост **2×** к прошлой неделе | Невостребованные бонусы или слишком короткий срок |
| **Recovered при organizer_cancelled** | Доля **recovered** от всех recovery-событий **> 50%** при росте отмен организатора | Давление на «мягкие» брони и доверие |
| **Скидка при низком completed** | `total_discount_rub` ↑ **> 20%** WoW при **discount_to_completed_pct** в нижней трети исторического коридора | Платим скидкой без выручки |
| **Много ручных override** | **> N** активных program override одновременно (N задайте: 3 для пилота, 10+ для зрелости) или рост **+3** за неделю | Риск «ручного крана» вместо продукта и порогов |
| **Повтор guardrails на одной программе** | **≥ 3** audit/job-срабатывания с изменением множителя/причины по **одной** `programId` за 7 дней | Нужен разбор программы/организатора, не бесконечный soft |

**Blocker-инциденты** (остановить разбор коммерции до выяснения):

- массовые **ошибки** в `total_commission_rub` / billing vs bookings;
- **grant/apply** блокируется у многих программ из‑за бага, а не из‑за метрик;
- **падение** критичных jobs несколько дней подряд без реакции.

---

## 6. План доставки алертов (v1 → v2)

| Тип | Сейчас (v1) | Позже (v2) |
|-----|-------------|------------|
| Override / EW / limited | **Админка** `/admin/economics` + ежедневный визит owner | Telegram digest 1×/день |
| Expiry health, guardrail audit | **Audit log** + ручной просмотр при недельном обзоре | Email weekly digest |
| Overview резкие скачки | **Ручное** сравнение периодов в overview | Пороговые уведомления в ops-канал |
| Blocker | **Немедленно** вручную (логи, инцидент) | Pager / выделенный ops-чат |

---

## 7. Шпаргалка: режимы override и вмешательство

Используйте только после **preview** на странице программы ([`ECONOMICS_ADMIN_API`](./ECONOMICS_ADMIN_API.md)).

| Режим | Когда ставить |
|--------|----------------|
| **force_soft** | Нужно **слегка** снизить нагрузку на reward по программе без полного стопа; метрики ухудшились, но нет злоупотребления |
| **force_hard** | Скидка/commission **устойчиво** в красной зоне; нужен жёсткий потолок до исправления контента/условий |
| **force_suspend** | **Стоп** новых grant/apply по reward на программе: инцидент, договорённость с организатором, временный мораторий |
| **force_full** | Временное **восстановление** 100% после ошибочного auto-limit (кратко, с датой «до») |
| **Снять override** | Метрики стабилизировались, контент/процесс исправлены; дать **job** восстановить авто-состояние (immediate recompute после clear) |
| **Не вмешиваться** | Только EW или пошаговый recovery множителя; глобальный reduce; разовый expiry watch **без** тренда |

**Referral:** `force_low_quality` — когда вручную фиксируете плохой код после разбора; `force_normal` — откат ошибочной низкой оценки. Бессрочный override — только как **exceptional** с записью владельца.

---

## 8. Сигнал → действие owner (краткая таблица)

| Сигнал | Действие |
|--------|----------|
| Early warning, completion в норме | Наблюдение; проверить через неделю |
| Early warning + падает completion | Разбор программы; контент организатора; при необходимости **force_soft** с TTL |
| Program suspended авто | Срочный разбор; коммуникация с организатором; **force_full** кратко или исправление причин → **clear** |
| Много override одновременно | Review списка; снять устаревшие; не добавлять новые без причины |
| Один program_id в audit guardrails много раз за неделю | Root cause; не крутить override туда-сюда |
| Высокий expired/granted | Политика сроков reward + напоминания; не обязательно override программы |
| Высокий recovered + organizer_cancelled | Качество листинга и отмен; не только economics knob |
| Резкий рост discount без commission | Overview + топы программ; возможен сдвиг микса или баг |
| referral_visits ≈ 0 при трафике | Analytics / инструментирование — не economics override |

---

## 9. До production governance v2

- Автоматические **уведомления** по порогам (Telegram/email) с подавлением дублей.
- **Дашборды** с WoW/MoM без ручного сравнения периодов.
- **RBAC**: кто может indefinite и suspend.
- Связка **commission reconciliation** ↔ economics overview в одном отчёте.
- Когорты / retention по reward — вне MVP v1.

---

*Документ можно обновлять при смене `ECON_*` или по итогам инцидентов; дата последнего согласования — в commit message.*
