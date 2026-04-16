# Implementation Order

## Phase 0 — Foundations
1. repo skeleton
2. env handling
3. auth / roles
4. shared enums and canonical statuses
5. DB base tables
6. audit log base

## Phase 1 — Supply core
1. organizers CRUD
2. programs CRUD
3. program publish workflow
4. organizer verification workflow
5. admin moderation queues

## Phase 2 — Demand core
1. public catalog
2. program page
3. booking inquiry form
4. booking status model
5. organizer lead notification

## Phase 3 — Trust core
1. risk / safety fields in card
2. review flow
3. incident creation + escalation
4. verification evidence handling

## Phase 4 — Revenue core
1. deal confirmation
2. GMV storage
3. commission accrual
4. commission reconciliation queue
5. revenue dashboard

## Phase 5 — Automation / analytics
1. stale lead reminders
2. review request automation
3. event tracking
4. weekly dashboard aggregation
5. release observability
