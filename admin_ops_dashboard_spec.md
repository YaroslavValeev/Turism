# Admin / Ops Dashboard Spec

## Main dashboard blocks

### 1. Founder summary
- completed bookings this week
- active organizers
- verified organizers
- GMV
- accrued commission
- collected commission
- critical incidents
- critical bugs

### 2. Booking operations queue
Filters:
- status
- age
- organizer
- discipline
- region
- owner
- partner source

Columns:
- booking_id
- user
- organizer
- program
- status
- created_at
- first_response_at
- owner
- risk_flag

### 3. Organizer health queue
Columns:
- organizer
- verification status
- response rate
- complaints
- completed deals
- reviews count
- trust score

### 4. Program quality queue
Columns:
- program
- publish status
- missing fields
- safety completeness
- media completeness
- cancellation completeness

### 5. Revenue queue
Columns:
- booking_id
- organizer
- gmv
- commission accrued
- collected
- reconciliation status

### 6. Incidents queue
Columns:
- incident_id
- severity
- type
- booking/program/organizer
- owner
- SLA deadline
