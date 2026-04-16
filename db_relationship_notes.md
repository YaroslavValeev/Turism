# DB Relationship Notes

## Core relationships
- Organizer 1:N Program
- Program 1:N Booking
- Organizer 1:N Booking (derived via Program but useful for queries)
- Booking 0..1 Review
- Organizer 1:N VerificationEvidence
- Organizer 1:N Incident
- Booking 1:N Incident (optional)
- Booking 0..1 CommissionRecord

## Why this shape
- booking is the canonical revenue object
- program is the canonical catalog object
- organizer is the canonical trust / supply object
- review and commission are post-booking artifacts

## Query priorities
Must be easy to query:
- all bookings by organizer
- all programs by verification tier
- all completed bookings needing review request
- all completed bookings missing commission accrual
- all incidents by severity / owner
