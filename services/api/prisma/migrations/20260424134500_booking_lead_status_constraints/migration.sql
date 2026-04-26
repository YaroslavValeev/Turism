ALTER TABLE "bookings"
  ADD CONSTRAINT "bookings_booking_status_check"
  CHECK (
    "bookingStatus" IN (
      'created',
      'new',
      'reviewed',
      'sent_to_organizer',
      'contacted',
      'offer_sent',
      'booked',
      'paid_partial',
      'paid_full',
      'paid_off_platform',
      'completed',
      'canceled',
      'cancelled_user',
      'cancelled_organizer',
      'refunded_partial',
      'refunded_full',
      'refund_pending',
      'refund_done',
      'disputed'
    )
  ) NOT VALID;

ALTER TABLE "leads"
  ADD CONSTRAINT "leads_lead_status_check"
  CHECK (
    "leadStatus" IN ('new', 'contacted', 'qualified', 'rejected')
  ) NOT VALID;
