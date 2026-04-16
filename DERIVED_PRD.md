# DERIVED_PRD — Product Requirements Document

Документ синтезирован из существующих материалов проекта (Kits v2–v6, IMPLEMENTATION_BLUEPRINT, canonical models, first_100_bookings_plan, north_star_tree, legal docs).  
**Статус:** derived source of truth до появления оригинального prd.md.

---

## 1. Что за продукт

**MyWave Travel** — trust-first платформа для спортивно-тренировочных выездов (кэмпы, клиники, туры по экстремальным дисциплинам и активному отдыху).

**Роль платформы:** информационный посредник между пользователями и организаторами. Не туроператор, не продавец туров.

**Модель монетизации:** комиссия только с реально состоявшейся сделки.

**Запуск:** assisted booking + manual verification организаторов.

---

## 2. Для кого

| Сегмент | Потребность |
|---------|-------------|
| Участники | Поиск программ, заявка на бронирование, доверие к организатору |
| Организаторы | Размещение программ, получение заявок, работа с лидами |
| Платформа (ops) | Обработка заявок, верификация, moderation, commission tracking |

---

## 3. MVP Scope

### В scope MVP

1. **Organizers** — CRUD, verification statuses, pipeline
2. **Programs** — CRUD, publish workflow, карточка по program_card_schema
3. **Public catalog** — список программ, фильтры, страница программы
4. **Booking (assisted)** — форма заявки, передача лида организатору, статусы, admin queue
5. **Trust** — reviews (после completed), incidents, verification evidence
6. **Revenue** — deal confirmation, GMV, commission accrual, reconciliation queue
7. **Admin** — organizers queue, programs moderation, bookings queue, incidents, commissions

### Не в scope MVP (Phase A, 0–10 bookings)

- User accounts (assisted booking без обязательной регистрации)
- Онлайн-оплата через платформу (оплата напрямую организатору)
- Автоматизация lead scoring
- Публичный growth dashboard
- Сложные referral/repeat механики

---

## 4. Канонические сущности

- **Organizer** — поставщик программ
- **Program** — конкретная поездка/кэмп/клиника
- **Booking** — канонический объект сделки (от заявки до completed); Lead = early-stage booking
- **Review** — отзыв после completed booking
- **Incident** — жалоба, safety-кейс, refund-конфликт
- **Commission Record** — начисление и сбор комиссии

---

## 5. Ключевые ограничения

1. **Платформа** — информационный посредник, не несёт ответственности за качество и безопасность программ.
2. **Оплата** — напрямую организатору; на MVP платформа не принимает платежи.
3. **Verified organizer** — личный опыт взаимодействия + медиа + ≥10 отзывов + рейтинг (decision_log).
4. **Комиссия** — только с состоявшейся сделки; accrual только после completed/paid_off_platform + evidence.
5. **Audit** — все изменения verification_status, publish_status, booking_status, commission — в audit log.
6. **Safety** — risk disclosure, informed consent — обязательны; организатор несёт ответственность.

---

## 6. Цели и KPI

**North Star:** количество состоявшихся бронирований у verified organizers.

**Phase A (0–10):** 3 организатора, 10–20 карточек, 5–10 состоявшихся сделок.  
**Phase B (10–30):** conversion contacted→booked > 20%, 50%+ карточек с отзывами.  
**Phase C (30–100):** 100 completed bookings, complaints < 5 на 100, verified ≥ 30% supply.

---

## 7. Границы продукта

- Не изобретать новые сущности и статусы сверх canonical.
- Не нарушать legal constraints (terms_of_use, privacy_policy, cancellation_policy, responsibility_allocation).
- Publish gate: программа не публикуется без safety/cancellation полей.
- Commission accrual только при наличии deal evidence.

---

*Source: IMPLEMENTATION_BLUEPRINT, canonical_entity_model, canonical_status_models, first_100_bookings_plan, north_star_tree, decision_log, legal docs.*
