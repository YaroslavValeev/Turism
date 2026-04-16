# Organizer Score — дизайн (Phase 2)

**Цель:** единый агрегат доверия/эффективности организатора для ранжирования, внутренних статусов и будущей логики verified/trusted (не автомат замены правил без human gate).

---

## 1) Выходы

- `organizer_score` ∈ [0, 100] (итог)
- `organizer_score_version` (int) — при изменении весов bump
- `organizer_score_components` (json) — прозрачность

---

## 2) Компоненты (0..100 каждый после нормализации)

| component | смысл | входные сигналы (MVP→v2) | нормализация |
|-----------|-------|--------------------------|--------------|
| `response_time_score` | скорость реакции | `organizer_response_time` p50 по броням организатора | лучше = выше; cap выбросов |
| `lead_to_booked_score` | конверсия лида в booked | leads с program_id + bookings | ratio → 0..100 |
| `booked_to_paid_score` | доведение до оплаты | booked → paid-* | ratio |
| `paid_to_completed_score` | завершение услуги | paid-* → completed | ratio |
| `refund_penalty` | возвраты | `refunds/payments` по organizer | штраф: снижает итог |
| `complaint_penalty` | инциденты | incidents | штраф |
| `review_score` | качество отзывов | approved reviews avg rating + volume | 0..100 |
| `profile_completeness_score` | заполненность профиля/карточек | program publish gate + organizer fields | 0..100 |
| `contract_status_bonus` | signed | organizer_contract.status | небольшой бонус |
| `billing_status_bonus` | billing_connected | organizer billing | бонус |

---

## 3) Веса (черновик, калибровка на данных)

Предложение v0 (сумма весов = 1.0):

- response_time: **0.15**
- lead_to_booked: **0.15**
- booked_to_paid: **0.15**
- paid_to_completed: **0.15**
- refund_penalty: **0.10** (входит как отрицательный вклад)
- complaint_penalty: **0.10**
- review: **0.10**
- profile completeness: **0.05**
- contract bonus: **0.03**
- billing bonus: **0.02**

Итог:

\[
organizer\_score = clamp\Big(\sum w_i \cdot component_i - penalties\Big)
\]

`penalties` — монотонные функции от доли refund/complaints (например `min(30, 100*refund_rate)`).

---

## 4) Обновление

- **Частота:** nightly + on-demand после крупных изменений статусов (опционально).
- **Идемпотентность:** строка в `organizer_scores_daily` с `(organizer_id, day, version)`.

---

## 5) Этика / риски

- Нельзя использовать score как единственный автоматический «бан» без human review.
- Прозрачность обязательна: в админке показывать вклад компонентов.
