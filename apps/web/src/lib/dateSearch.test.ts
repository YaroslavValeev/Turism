import assert from "node:assert/strict";
import test from "node:test";

import {
  addDaysYmd,
  countInRange,
  effectiveRange,
  formatRange,
  monthGrid,
  nextStartAfter,
  pickDay,
  programStartDay,
  startsByDay,
} from "./dateSearch";

test("API midnight date stays on the published calendar day in any timezone", () => {
  const previous = process.env.TZ;
  try {
    process.env.TZ = "America/Los_Angeles";
    assert.equal(programStartDay({ startDate: "2026-10-03T00:00:00Z" }), "2026-10-03");
    assert.equal(programStartDay({ startDate: "2026-10-03T00:00:00Z", scheduleType: "on_request" }), null);
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
});

test("monthGrid starts on Monday and covers the whole month", () => {
  const weeks = monthGrid(2026, 9); // октябрь 2026, 1-е — четверг
  assert.equal(weeks[0]![0]!.date, "2026-09-28");
  assert.equal(weeks[0]![3]!.date, "2026-10-01");
  assert.equal(weeks[0]![3]!.inMonth, true);
  assert.equal(weeks.flat().filter((d) => d.inMonth).length, 31);
  assert.ok(weeks.every((w) => w.length === 7));
});

test("pickDay: start, end in any order, then restart", () => {
  let r = pickDay({ from: "", to: "" }, "2026-10-10");
  assert.deepEqual(r, { from: "2026-10-10", to: "" });
  r = pickDay(r, "2026-10-05");
  assert.deepEqual(r, { from: "2026-10-05", to: "2026-10-10" });
  r = pickDay(r, "2026-10-20");
  assert.deepEqual(r, { from: "2026-10-20", to: "" });
  assert.deepEqual(effectiveRange(r), { from: "2026-10-20", to: "2026-10-20" });
});

test("starts counting skips past and on-request programs", () => {
  const byDay = startsByDay(
    [
      { startDate: "2026-10-03T00:00:00.000Z" },
      { startDate: "2026-10-03T09:00:00.000Z" },
      { startDate: "2026-10-12T00:00:00.000Z" },
      { startDate: "2026-09-20T00:00:00.000Z" },
      { startDate: "2026-10-04T00:00:00.000Z", scheduleType: "on_request" },
    ],
    "2026-10-02",
  );
  assert.equal(countInRange(byDay, { from: "2026-10-02", to: "2026-10-04" }), 2);
  assert.equal(countInRange(byDay, null), 0);
  assert.equal(nextStartAfter(byDay, "2026-10-04"), "2026-10-12");
  assert.equal(nextStartAfter(byDay, "2026-10-12"), null);
});

test("date helpers", () => {
  assert.equal(addDaysYmd("2026-10-30", 3), "2026-11-02");
  assert.equal(formatRange({ from: "2026-10-30", to: "2026-11-01" }), "30 окт – 1 нояб");
  assert.equal(formatRange({ from: "2026-10-05", to: "2026-10-05" }), "5 окт");
});
