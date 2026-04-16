# Audit Log Spec

## Must be logged
- organizer verification status changes
- program publish status changes
- booking status changes
- refund decisions
- complaint severity changes
- commission accrual / payment changes
- manual overrides in admin

## Audit log fields
- audit_id
- entity_type
- entity_id
- changed_field
- old_value
- new_value
- changed_by
- changed_at
- reason
