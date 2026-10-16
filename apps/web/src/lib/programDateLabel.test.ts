import assert from "node:assert/strict";
import test from "node:test";
import { programDateLabel } from "./programDateLabel";

test("a date range stays readable without repeating the month", () => {
  assert.equal(programDateLabel({ startDate: "2026-10-17", endDate: "2026-10-24" }), "17 — 24 октября 2026");
});
test("single-day, cross-month and cross-year programs retain their actual dates", () => {
  assert.equal(programDateLabel({ startDate: "2026-10-17", endDate: "2026-10-17" }), "17 октября 2026");
  assert.equal(programDateLabel({ startDate: "2026-10-30", endDate: "2026-11-02" }), "30 октября — 2 ноября 2026");
  assert.equal(programDateLabel({ startDate: "2026-12-30", endDate: "2027-01-04" }), "30 декабря 2026 — 4 января 2027");
});
test("a seasonal on-request window is never presented as a confirmed departure", () => {
  assert.equal(programDateLabel({ startDate: "2026-06-01", endDate: "2026-09-30", scheduleType: "on_request", seasonLabel: "июнь–сентябрь" }), "По запросу · сезон июнь–сентябрь");
});
test("invalid or reversed dates have an explicit fallback", () => {
  assert.equal(programDateLabel({ startDate: "invalid", endDate: "2026-10-24" }), "Даты уточняются");
  assert.equal(programDateLabel({ startDate: "2026-10-24", endDate: "2026-10-17" }), "Даты уточняются");
});
test("calendar dates do not shift when the visitor is in another timezone", () => {
  const previous = process.env.TZ;
  try {
    process.env.TZ = "America/Los_Angeles";
    assert.equal(programDateLabel({ startDate: "2026-10-17T00:00:00Z", endDate: "2026-10-24T00:00:00Z" }), "17 — 24 октября 2026");
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
});
