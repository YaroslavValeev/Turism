# Economics overview (`GET /admin/economics/overview`)

Admin-only JSON-сводка для owner: цепочка **UGC → reward → referral → booking → discount → commission** и оценка распределения «стоимости» скидки (Model A).

**Ритм проверок и алерты (owner):** см. [`OWNER_ECONOMICS_RHYTHM.md`](./OWNER_ECONOMICS_RHYTHM.md).

## Как вызывать

- **URL:** `GET /admin/economics/overview`
- **Auth:** тот же admin JWT, что и для остальных `/admin/*`.
- **Query (опционально):**
  - `date_from`, `date_to` — ISO-8601 или распознаваемая дата; если не заданы — **последние 30 дней** (UTC-границы: от начала дня −30 до конца «сегодня»).
  - `programId`, `organizerId` — сузить booking/UGC/reward scope.

Ответ структурирован под будущий экспорт (без CSV в MVP): блоки `aggregates`, `funnel`, `unit_economics`, `top_lists`, `methodology`.

## Как читать метрики

| Блок | Смысл |
|------|--------|
| `aggregates` | Суммы и счётчики в выбранном периоде по **booking.createdAt** и связанным сущностям. |
| `funnel` | Воронка роста: одобренный UGC → выданные rewards → визиты по рефералу → брони с кодом → скидки → завершённые со скидкой. |
| `unit_economics` | Средние чеки и **оценка** разложения скидки между платформой и организатором через долю комиссии в финале. |
| `top_lists` | Топ программ (скидка / комиссия), топ кодов по броням, топ организаторов по использованию reward. |

### Источники (важно для согласованности)

- **Суммы по брони:** `Booking.originalAmountRub`, `discountAmountRub`, `finalAmountRub`, `refundedAmountRub`.
- **Комиссия:** строки `Commission` по броням в фильтре; в сумму входит `commissionCollectedRub`, иначе `commissionAmountRub` (как в billing snapshot на уровне строки).
- **Referral visits:** события `AnalyticsEvent` с `event_name = referral_landing` (пишется при переходе на `/public/referral/:code`, если `ANALYTICS_ENABLED`). До включения аналитики и до даты инструментирования визиты по периоду могут быть **нулевыми**.
- **Истёкшие rewards:** число записей в `AuditLog` с `reason = expires_at_reached` за период (при фильтре program/organizer — только по user_reward, попадающим в scope UGC).

## Здоровые ориентиры (MVP, не SLA)

- **discount_to_completed_pct** не должен долго оставаться крайне низким при высоком `bookings_with_discount`: много скидок, но мало доведённых до `completed` — проверять статусы, отмены, качество лидов.
- **total_discount_rub** при низкой доле `completed` и высоком **total_refunded_rub** — сигнал пересмотреть политику отмен и доверие к «мягким» броням.
- **total_rewards_expired** рост при стабильном grant — смотреть сроки reward и напоминания.
- **total_rewards_recovered** с высокой долей `organizer_cancelled` (см. отдельные отчёты по cancellationKind) — операционная нагрузка на доверие и повторные брони.

## Тревожные паттерны

1. **Очень высокий `total_discount_rub` при низком `completed_bookings_with_discount` и низкой конверсии в commission** — риск «платим скидкой без выручки».
2. **Высокий expiry rate** (rewards expired / rewards granted за смежные периоды) при низком usage — ослабить срок или усилить коммуникации.
3. **Высокий recovered rate** в связке с отменами организатора — проверять качество программ и политику отмен.
4. **referral_visits ≈ 0** при реальном трафике по ссылкам — проверить `ANALYTICS_ENABLED` и наличие событий после деплоя.
5. **Расхождение commission:** сверять `aggregates.total_commission_rub` с отчётами billing по тем же броням; при расхождениях смотреть строки `Commission` и статусы reconciliation.

## 5 метрик для еженедельного обзора owner

1. **`aggregates.total_final_rub` и `total_commission_rub`** — выручка и комиссия платформы в одном окне.
2. **`funnel.derived.visit_to_booking_pct`** — эффективность реферального трафика (при ненулевых visits).
3. **`unit_economics.avg_discount_share_pct`** — насколько агрессивна скидка относительно оригинала.
4. **`funnel.derived.discount_to_completed_pct`** — доходят ли сделки со скидкой до завершения.
5. **`top_lists.top_programs_by_discount` vs `top_programs_by_commission`** — где скидка высокая, а комиссия нет — точка решения по программе/организатору.

## Guardrails (самозащита экономики)

- **Состояние и пороги:** `GET /admin/economics/guardrails` — `enabled`, `thresholds`, `global_discount_guardrail`, списки `programs_limited` и `referral_codes_low_quality`.
- **Пересчёт флагов программ/referral + expiry health (audit):** `POST /admin/economics/guardrails/run`.
- **Глобально:** при средней доле скидки выше `ECON_MAX_DISCOUNT_SHARE` за lookback — новые `UserReward` уменьшаются (`ECON_GLOBAL_REWARD_ACTION=reduce` + `ECON_GLOBAL_REWARD_REDUCE_BPS`) или не создаются (`suspend`); referral-код при approve всё равно выдаётся.
- **По программе (job):** при `discount > ratio × commission` или низком `discount_to_completed` — `Program.economicsRewardSuspended`, grant UGC блокируется; apply скидки на бронь этой программы — тоже блокируется (audit).
- **Referral:** коды с `visits ≥ ECON_REFERRAL_CODE_MIN_VISITS` и конверсией \< `ECON_MIN_REFERRAL_CONVERSION` помечаются `economicsLowQuality` (логика reward на них — позже).
- **Expiry:** только предупреждение в `audit_logs` при превышении `ECON_EXPIRY_HEALTH_RATIO`, без авто-изменения reminder.

Отключение: **`ECON_GUARDRAILS_ENABLED=0`**.

## Ограничения MVP

- Нет когорт, retention, CAC, графиков и внешних BI.
- **reward_cost_*** — оценка через долю комиссии в `final`, не бухгалтерская себестоимость.
- Визиты по периоду зависят от analytics; счётчик на `ReferralCode` остаётся lifetime-справочником.

---

## Связь с ритмом owner

Ежедневные и еженедельные проверки из этого runbook собраны в операционный чеклист: **[`OWNER_ECONOMICS_RHYTHM.md`](./OWNER_ECONOMICS_RHYTHM.md)**.
