# Release Observability Checklist

## Before staging sign-off
- event tracking for new features defined
- key dashboard metrics unaffected
- admin queues updated if needed
- smoke test cases updated

## Before production
- logs enabled
- error tracking enabled
- funnel events visible
- alerts for booking flow failures active
- rollback path documented

## First 24h after release
- watch inquiry drop
- watch lead status anomalies
- watch commission field failures
- watch notification delivery failures
- watch incident spike
