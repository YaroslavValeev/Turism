import assert from "node:assert/strict";
import test from "node:test";

import { isWeekendPreset, weekendRange } from "./weekendRange";

const at = (y: number, m: number, d: number, h = 10) => new Date(y, m - 1, d, h);

test("weekday: this weekend is the coming Fri–Sun, next is a week later", () => {
  const wed = at(2026, 9, 30);
  assert.deepEqual(weekendRange("this-weekend", wed), {
    preset: "this-weekend",
    from: "2026-10-02",
    to: "2026-10-04",
    label: "2–4 окт",
  });
  const next = weekendRange("next-weekend", wed);
  assert.equal(next.from, "2026-10-09");
  assert.equal(next.to, "2026-10-11");
});

test("friday and saturday: this weekend starts today", () => {
  assert.equal(weekendRange("this-weekend", at(2026, 10, 2)).from, "2026-10-02");
  const sat = weekendRange("this-weekend", at(2026, 10, 3, 23));
  assert.equal(sat.from, "2026-10-03");
  assert.equal(sat.to, "2026-10-04");
  assert.equal(sat.label, "3–4 окт");
});

test("sunday: next weekend is the nearest future Fri–Sun", () => {
  const sun = at(2026, 10, 4);
  assert.equal(weekendRange("this-weekend", sun).label, "4 окт");
  const next = weekendRange("next-weekend", sun);
  assert.equal(next.from, "2026-10-09");
  assert.equal(next.to, "2026-10-11");
});

test("monday after the weekend rolls forward", () => {
  assert.equal(weekendRange("this-weekend", at(2026, 10, 5)).from, "2026-10-09");
});

test("month boundary label", () => {
  assert.equal(weekendRange("this-weekend", at(2026, 10, 27)).label, "30 окт – 1 нояб");
});

test("preset guard", () => {
  assert.equal(isWeekendPreset("this-weekend"), true);
  assert.equal(isWeekendPreset("weekend"), false);
  assert.equal(isWeekendPreset(null), false);
});
