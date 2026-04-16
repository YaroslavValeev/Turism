# Coding Standards

## General
- one source of truth for enums and statuses
- no duplicated business logic between web/admin/api
- every state mutation must be explicit
- every financial mutation must be audited

## API
- validate all inputs
- reject invalid status transitions
- role-based authorization on mutating endpoints
- return structured errors

## Frontend
- do not hardcode statuses
- consume canonical enums from shared-types
- program card must degrade gracefully if optional fields missing
- admin queues must highlight risk / blocker items

## Jobs / automation
- idempotent where possible
- retries with limits
- log job outcome
- no silent failures

## Data / analytics
- event names stable
- properties documented
- no breaking metric changes without migration note
