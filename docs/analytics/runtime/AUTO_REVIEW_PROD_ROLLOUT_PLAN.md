# Controlled prod rollout plan: auto review request MVP

## Preconditions (must-pass on staging)

- `completed -> review request` stable for repeated runs
- idempotency confirmed (`bookingId` unique request, no duplicate review submits)
- reminder policy bounded and non-duplicating
- delivery status visible (`queued/sent/delivery_failed/skipped_*`)
- no critical UX/ops defects in review and moderation flow

## Rollout phases

1. **Phase A — dry run in prod (no external send)**
   - Enable request creation on `completed`.
   - Keep dispatch in safe mode (record status only) for first day.
   - Monitor request volume and statuses.

2. **Phase B — limited send cohort**
   - Enable real delivery for small share/certain organizers.
   - Monitor `delivery_failed`, duplicate rate, moderation queue load.

3. **Phase C — full send**
   - Expand delivery to all eligible completed bookings.
   - Keep reminders capped and stop-on-review rule active.

## Monitoring checklist

- Request creation count vs completed bookings
- Sent/failed/skipped distribution
- Reminder sends per booking (no > max policy)
- Review submit conversion
- Duplicate submit conflict rate
- Moderation backlog and publish latency

## Rollback switches

- Disable dispatch job (`/jobs/run-review-reminders` automation off)
- Keep creation on but freeze send (`queued` only)
- Full rollback: disable trigger in booking completion path

## Ownership

- Product: review UX and reminders cadence
- Ops: scheduler/job execution and incident response
- Engineering: delivery adapter, idempotency guarantees, observability
