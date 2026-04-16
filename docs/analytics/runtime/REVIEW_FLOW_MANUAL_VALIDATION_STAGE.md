# Manual validation report: auto review request (staging-first)

## Scope

- `completed -> review request` auto trigger
- idempotent queue processing
- reminder policy without duplicate spam
- token submit flow creates one review only
- moderation/public review paths remain intact

## Runtime used

- Current Docker/local runtime (`http://localhost:3001`) as staging-first contour
- Internal analytics token and admin auth available

## Scenarios and results

1. **Booking completion trigger**
   - Created booking from public program.
   - Transitioned status chain up to `completed`.
   - Result: `review_requests` entry auto-created with status `queued`.

2. **First queue processing**
   - Called `POST /reviews/requests/process` (admin).
   - Result: request moved `queued -> sent`, `processed=1`, `sent=1`.

3. **Token submit**
   - Called `POST /reviews/request/:token/submit` with rating/comment.
   - Result: review created with `moderationStatus=pending`, request moved to `skipped_review_exists`.

4. **Duplicate submit protection**
   - Repeated token submit for same booking.
   - Result: duplicate blocked (`409`), no second review created.

5. **Reminder policy behavior**
   - For a fresh sent request, forced due reminder and ran process.
   - Result: one additional send (`reminderCount=2`), `nextReminderAt=null`.
   - Re-run process: no extra send (`processed=0`), no duplicate reminders.

6. **Post-review processing**
   - Ran process after review already exists.
   - Result: queue does not resend.

## Conclusion

- Completed-to-request flow works.
- Idempotency confirmed at request creation and review submission layers.
- Reminder policy sends bounded reminders and stops.
- Delivery status is observable via `review_requests` (`queued/sent/skipped_*` + counters/error fields).

## Remaining pre-prod checks

- Verify same scenarios on dedicated staging host.
- Validate real delivery provider integration (Telegram/email/SMS) for non-mock sending.
- Confirm operational monitoring/alerts for `delivery_failed` paths.
