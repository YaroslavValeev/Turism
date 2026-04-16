# Canonical Entity Model

## 1. Organizer
Кто проводит программу.
Обязательные домены:
- identity
- legal status
- contacts
- verification evidence
- trust signals
- payout / commission logic
- response discipline

## 2. Program
Конкретная поездка / кэмп / clinic / training offer.
Обязательные домены:
- discipline
- region / location
- dates
- duration
- level
- risk
- inclusions / exclusions
- price
- itinerary
- media
- organizer link
- cancellation rules

## 3. Lead
Сигнал интереса до подтверждённого бронирования.
Источник:
- landing / program page / referral / partner / TG / content / direct

## 4. Booking
Канонический объект сделки.
Вокруг него строятся:
- статусы
- уведомления
- ops handoff
- revenue attribution
- refunds
- reviews
- commission

## 5. Review
Пост-фактум доказательство trust.
Связан с:
- organizer
- program
- completed booking

## 6. Verification Evidence
Набор доказательств для listed / checked / verified / trusted.

## 7. Complaint / Incident
Отдельный объект для жалоб, safety-кейсов, refund-конфликтов, fraud signals.

## 8. Commission Record
Фиксирует:
- completed deal
- GMV
- commission rate
- accrued
- collected
- reconciliation status
