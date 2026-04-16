# Канонический словарь метрик (Phase 2)

**Цель:** один язык для Founder, Billing, продукта и SQL-marts — без разночтений.

**Обозначения grain:** `day` (календарный UTC-день), `booking_day` (день по `Booking.updatedAt`), `organizer_day`, `global`.

**Общий принцип:** деньги и статусы брони — **истина в доменных таблицах** (`bookings`, `payments`, `refunds`, `commissions`, `organizers`, `programs`, `leads`). События `analytics_events` — для трассировки, DQ, будущей атрибуции и витрин, но **не источник истины для денег**, пока явно не введены `fact_*` таблицы.

**Owner по умолчанию:** *Product Analytics Lead* (назначить ролью в команде); до назначения — *Founder + Tech Lead совместно*.

---

## NSM

| metric_name | business_definition | formula | grain | source_of_truth | refresh_frequency | dashboard_usage | owner | caveats |
|-------------|---------------------|---------|-------|-----------------|-------------------|-----------------|-------|---------|
| `nsm_core` | Состоявшиеся бронирования у доверенных организаторов (verified/trusted) | `COUNT(bookings)` где `bookingStatus IN ('completed','paid_full')` AND `organizer.verificationStatus IN ('verified','trusted_by_platform')` | booking_day | `bookings` + `organizers` | daily MV + on-demand refresh | Founder NSM, executive | Product Analytics Lead | Ось времени сейчас по `Booking.updatedAt` (см. v1); при переходе на `fact_booking_state_at` метрика **переопределяется** |
| `nsm_extended` | Ранний сигнал спроса у доверенных организаторов | `COUNT(bookings)` где `bookingStatus IN ('booked','paid_partial')` AND organizer verified/trusted | booking_day | те же | daily MV | Founder NSM | Product Analytics Lead | `paid_partial` без `paid_full` может отражать процесс, а не качество спроса |

---

## Организаторы и каталог

| metric_name | business_definition | formula | grain | source_of_truth | refresh_frequency | dashboard_usage | owner | caveats |
|-------------|---------------------|---------|-------|-----------------|-------------------|-----------------|-------|---------|
| `active_organizers` | Организаторы, которые **реально ведут активность каталога** в окне N дней | `COUNT(DISTINCT organizer_id)` из объединения: (a) ≥1 `programs.publishStatus='published'`, (b) ≥1 `bookings` с изменением статуса за N дней, (c) ≥1 `leads` за N дней — **канон v2** (в v1 MV может отличаться; см. caveats) | rolling N=30 default | `organizers`,`programs`,`bookings`,`leads` | daily | Founder supply | Product Analytics Lead | В `METRIC_DICTIONARY.md` v1 описано иначе; **эта строка — канон Phase 2**; MV нужно синхронизировать |
| `verified_organizers` | Организаторы в статусе verified | `COUNT(*)` где `verificationStatus='verified'` | global snapshot / day snapshot | `organizers` | daily snapshot | Trust, Founder | Product Analytics Lead | Snapshot «на конец дня» vs «события за день» — разные метрики; явно помечать в UI |
| `trusted_organizers` | Организаторы trusted_by_platform | `COUNT(*)` где `verificationStatus='trusted_by_platform'` | snapshot | `organizers` | daily | Trust | Product Analytics Lead | То же |
| `active_programs` | Опубликованные программы | `COUNT(*)` где `publishStatus='published'` | global / as-of day | `programs` | daily | Founder supply | Product Analytics Lead | As-of = считать опубликованными на конец дня (для истории) |

---

## Воронка спроса

| metric_name | business_definition | formula | grain | source_of_truth | refresh_frequency | dashboard_usage | owner | caveats |
|-------------|---------------------|---------|-------|-----------------|-------------------|-----------------|-------|---------|
| `leads` | Новые лиды | `COUNT(leads)` по `Lead.createdAt` | day | `leads` | daily MV | Founder demand | Product Analytics Lead | Нужна связь lead↔program для атрибуции |
| `booked` | Переход в booked | `COUNT(bookings)` где `bookingStatus` стал `booked` в этот день | booking_day | `bookings` (+ позже fact) | daily | Founder | Product Analytics Lead | Сейчас proxy: `updatedAt` day + status=`booked` |
| `paid` | Оплачено (частично/полностью/вне платформы) | `COUNT(bookings)` где `bookingStatus IN ('paid_partial','paid_full','paid_off_platform')` **или** `paidAmountRub>0` (выбрать одно правило) | booking_day | `bookings` | daily | Founder, Billing | Product Analytics Lead | **Канон:** статусы IN (...); `paidAmountRub` — контрольная сумма, не второй источник истины |
| `completed` | Завершённые поездки/оказания услуги | `COUNT(bookings)` где `bookingStatus='completed'` | booking_day | `bookings` | daily | Founder | Product Analytics Lead | Для турпродукта «completed» должен быть согласован с ops |

---

## Деньги

| metric_name | business_definition | formula | grain | source_of_truth | refresh_frequency | dashboard_usage | owner | caveats |
|-------------|---------------------|---------|-------|-----------------|-------------------|-----------------|-------|---------|
| `gmv_gross` | Валовый объём по броням (до вычета возвратов) | `SUM(booking.paidAmountRub)` (или `SUM(payments)` — выбрать канон) | day | `bookings` или `payments` | daily | Billing, Founder | Finance Lead | **Канон Phase 2:** `SUM(payments.amountRub)` по `paidAt` для кассовой логики; `booking.paidAmountRub` — согласование |
| `net_gmv` | Чистый GMV после возвратов на уровне брони | `SUM(bookings.netAmountRub)` | day | `bookings` | daily MV | Founder | Finance Lead | Должен совпадать с `paid - refunded` на брони |
| `commission_accrued` | Начисленная комиссия | `SUM(commissions.commissionAmountRub)` где `reconciliationStatus='accrued'` | organizer_day | `commissions` | daily MV | Billing | Finance Lead | Статусная машина — источник истины |
| `commission_paid` | Выплаченная/погашенная комиссия | `SUM(...)` где `reconciliationStatus='paid'` | organizer_day | `commissions` | daily MV | Billing | Finance Lead | См. отличие paid vs invoiced |
| `refund_rate` | Доля возвратов | `refunds_amount_rub / NULLIF(payments_amount_rub,0)` (агрегат) **или** `SUM(refund)/SUM(payment)` по броням | day | `payments`,`refunds` | daily | Billing risk | Finance Lead | Не смешивать «кассу» и «бронь» без явного правила |

---

## Качество / доверие / повтор

| metric_name | business_definition | formula | grain | source_of_truth | refresh_frequency | dashboard_usage | owner | caveats |
|-------------|---------------------|---------|-------|-----------------|-------------------|-----------------|-------|---------|
| `complaint_rate` | Инциденты на объём бронирований | `complaints_created / NULLIF(bookings_same_day,0)` (MVP) | day | `incidents`,`bookings` | daily | Trust | Ops Lead | Нужна нормализация: incidents не всегда 1:1 к booking |
| `repeat_customer_rate` | Повторные обращения/брони одного клиента | `COUNT(DISTINCT users_with_2plus_bookings)/COUNT(DISTINCT users)` | month | **требуется** стабильный `traveler_key` (hash от нормализованного контакта / account id) | monthly | Cohort / Trust | Product Analytics Lead | **Сейчас в MVP нет канонического traveler_id**; PII нельзя класть в analytics_events — нужен salted hash pipeline |
| `organizer_response_time` | Время первого ответа организатора/оператора по заявке | `median(firstResponseAt - createdAt)` для `bookings` | booking | `bookings.firstResponseAt`, `createdAt` | weekly + drilldown | Trust, Organizer score | Ops Lead | Поле заполняется при статусах contacted/sent_to_organizer (см. API) |
| `organizer_completion_rate` | Доведение до completed | `COUNT(completed)/COUNT(booked)` по организатору в окне | organizer rolling 90d | `bookings` | weekly | Organizer score | Product Analytics Lead | Знаменатель «booked» должен быть согласован с определением `booked` |

---

## Синхронизация с существующим `METRIC_DICTIONARY.md` (v1)

- Документ v1 остаётся **историческим контекстом MVP**.
- **При конфликте приоритет у этого файла (Phase 2 canonical)**.
- Следующий шаг инженерии: выровнять SQL `mv_founder_daily` / API полей с колонками и формулами из таблиц выше (отдельный PR).

---

## Контрольный чеклист «нет разночтений»

1. Для каждой метрики в админке: tooltip = `metric_name` + ссылка на этот раздел.
2. Любая новая метрика: PR не принимается без строки в этом файле.
3. Любое изменение формулы: bump версии `metric_version` (ввести в Phase 2 implementation) + migration note.
