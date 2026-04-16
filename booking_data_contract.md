# Booking Data Contract

## Booking object must include
- booking_id
- created_at
- source_channel
- source_campaign
- partner_id (optional)
- user_id / guest_contact
- organizer_id
- program_id
- lead_owner
- booking_status
- first_response_at
- booked_at
- completed_at
- cancellation_reason
- refund_amount_rub
- gmv_rub
- expected_commission_rub
- accrued_commission_rub
- collected_commission_rub
- proof_of_completion
- notes

## Invariants
- organizer_id is required
- program_id is required
- booking_status is required
- gmv_rub cannot be negative
- commission fields are empty until deal evidence appears
- completed_at only if booking_status = completed
