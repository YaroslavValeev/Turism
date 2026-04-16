# Commission Data Contract

## Commission accrual rules
Комиссия начисляется только после реально состоявшейся сделки.

## Required evidence for accrual
- booking_id
- organizer confirmation
- deal amount
- deal completion proof
- applicable commission rule

## Fields
- commission_record_id
- booking_id
- organizer_id
- program_id
- gmv_rub
- commission_rate_pct
- commission_fixed_rub
- commission_accrued_rub
- commission_collected_rub
- invoice_status
- payment_due_date
- payment_received_date
- reconciliation_status

## Reconciliation statuses
- pending_evidence
- accrued
- invoiced
- partially_paid
- paid
- disputed
- written_off
