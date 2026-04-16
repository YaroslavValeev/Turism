# Migration Strategy

## Principle
Migrations must be additive-first.
Avoid destructive schema changes during MVP unless strictly necessary.

## Rules
- every migration has rollback note
- no enum/status change without data migration plan
- canonical status additions require:
  1. schema update
  2. backend validation update
  3. admin UI update
  4. analytics update
  5. QA coverage update

## Data migration priorities
1. organizers
2. programs
3. bookings
4. reviews
5. incidents
6. commissions

## Safe rollout pattern
- add columns
- backfill
- switch reads
- switch writes
- clean up later
