# Pilot Monitoring Plan

Короткий план фазы **Pilot Launch Monitoring** после закрытия gate ([SPRINT2_CHECKPOINT_5_REPORT.md](SPRINT2_CHECKPOINT_5_REPORT.md) — GO WITH GUARDRAILS). См. также [docs/PILOT_LAUNCH_MONITORING_START_EMAIL.md](docs/PILOT_LAUNCH_MONITORING_START_EMAIL.md).

---

## 1. Pilot scope

Канон: [startup_config.md](startup_config.md) §2.

| Элемент | Значение |
|---------|----------|
| Pilot wedge | Wakesurf-first |
| Anchor locations | Krasnodar, Dubai, Bodrum |
| Режим | Operator-assisted only (ручная обработка заявок) |
| Масштаб | 1–2 организатора, небольшое число pilot programs |
| Вне scope пилота | Public payment, self-serve booking, public reviews, расширение public auth, широкий каталог |

---

## 2. Active organizers / programs

**Заполнить после очистки непилотных тестовых данных** (в первую очередь убрать/скрыть/пометить записи вроде «Горные лыжи / Альпы» — см. [docs/SPRINT2_CHECKPOINT_5_FINAL_DECISION_EMAIL.md](docs/SPRINT2_CHECKPOINT_5_FINAL_DECISION_EMAIL.md)).

| Organizer (displayName) | Organizer id | verificationStatus | Program (title) | Program id | discipline | region | publishStatus |
|-------------------------|--------------|--------------------|-----------------|------------|------------|--------|---------------|
| *(заполнить)* | | | | | Wakesurf / pilot | Krasnodar / Dubai / Bodrum | published |

Источник данных: admin `/organizers`, `/programs` или API после приведения контура к pilot truth.

---

## 3. Guardrails applied

Обязательные guardrails (см. [docs/PILOT_LAUNCH_MONITORING_START_EMAIL.md](docs/PILOT_LAUNCH_MONITORING_START_EMAIL.md) и §8 [SPRINT2_CHECKPOINT_5_REPORT.md](SPRINT2_CHECKPOINT_5_REPORT.md)):

1. Оператор следует [docs/PILOT_OPERATOR_RUNBOOK.md](docs/PILOT_OPERATOR_RUNBOOK.md) и [docs/PILOT_GO_NOGO.md](docs/PILOT_GO_NOGO.md).
2. В pilot-видимом контуре только pilot-relevant организаторы и программы (очистка/скрытие непилотных данных).
3. Всё трение фиксируется в friction log (§5).
4. Нет public payment.
5. Нет self-serve booking.
6. Нет public reviews (публичный слой отзывов не расширять).
7. Нет расширения public auth.

---

## 4. Metrics to watch

| Сигнал | Как смотреть |
|--------|----------------|
| Booking progression by status | Admin `/bookings`, карточка `/bookings/[id]`; распределение по `bookingStatus` |
| First response speed | Время от `new` до первого осмысленного шага оператора (reviewed / sent_to_organizer и т.д.) — фиксировать вручную по заявкам |
| Verification completion | Admin `/organizers`; переходы listed → checked и выше по [docs/VERIFICATION_RUNBOOK.md](docs/VERIFICATION_RUNBOOK.md) |
| Commission reconciliation | Admin `/commissions`; соответствие [docs/COMMISSION_RUNBOOK.md](docs/COMMISSION_RUNBOOK.md) |
| Operator confusion points | Вносить в friction log (тип operator UX) |
| Incident / review edge cases | Очереди `/incidents`, `/reviews`; если пусто — отметить «кейсов нет за период» |

Дополнительно при необходимости: GET `/metrics/admin/funnel` (если используется в ops).

---

## 5. Friction log format

Минимум четыре типа трения:

- **booking** — заявки, статусы, handoff
- **verification** — evidence, статусы организатора
- **commission** — начисление, сверка, дубликаты
- **operator UX** — непонятные экраны, лишние клики, отсутствие подсказок

**Поля записи:**

| Поле | Описание |
|------|----------|
| Дата/время | Когда замечено |
| Тип | booking \| verification \| commission \| operator UX |
| Контекст | Страница admin, при наличии — booking id / organizer id |
| Описание | Кратко что пошло не так или что неясно |
| Severity | low \| med \| high |

Вести в отдельном файле или таблице по согласованию с Owner (например `docs/PILOT_FRICTION_LOG.md` или внешняя таблица).

---

## 6. Escalation rules

Полный перечень: [escalation_rules.md](escalation_rules.md).

**Для pilot (выжимка):**

- Safety, fraud, угроза здоровью, юридические риски, прод-баг, ломающий booking flow → **немедленно** Founder.
- Организатор не отвечает, массовые отмены, всплеск жалоб, спор ops/legal → **в течение 24h** Founder.
- Мелкий UI, опечатки, рутинный handoff → без эскалации, по runbook.

Не расширять продуктовый scope под эскалацию без решения Owner/GM.

---

## 7. Next decision point

- **Еженедельный** короткий sync Owner/GM: friction log + метрики из §4, решение «продолжать pilot / приостановить / снять guardrail X».
- **Пороги и календарь** (N завершённых booking, дата окончания фазы) — **уточнить с Owner** и записать здесь после согласования.

После накопления сигналов — отдельное управленческое решение о расширении пилота или переходе к следующему этапу (не новый large feature checkpoint без решения GM).
