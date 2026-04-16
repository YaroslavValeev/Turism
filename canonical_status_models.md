# Canonical Status Models

## 1. Booking Status Model
Использовать только этот канонический набор:

- new
- reviewed
- sent_to_organizer
- contacted
- offer_sent
- booked
- paid_off_platform
- completed
- cancelled_user
- cancelled_organizer
- refund_pending
- refund_done

### Правила
- booking не может перескочить из new сразу в completed
- refund_possible только из booked / paid_off_platform / completed / cancelled_*
- review_request отправляется только после completed
- commission_accrual разрешён только после completed или paid_off_platform + deal confirmation

## 2. Organizer Verification Status
- listed
- checked
- verified
- trusted_by_platform
- paused
- rejected

## 3. Program Publication Status
- draft
- internal_review
- needs_fix
- approved
- published
- paused
- archived

## 4. Complaint / Incident Status
- open
- triaged
- investigating
- waiting_on_organizer
- waiting_on_user
- resolved
- escalated
- closed

## 5. Commission Reconciliation Status
- pending_evidence
- accrued
- invoiced
- partially_paid
- paid
- disputed
- written_off

### Допустимые переходы (canonical)
- Рекомендуемый путь: pending_evidence → accrued → invoiced → partially_paid → paid.
- Из любого статуса допустимы переходы в disputed или written_off по решению ops.
- paid, disputed, written_off — финальные (без автоматического перехода в другой статус в рамках runbook).
