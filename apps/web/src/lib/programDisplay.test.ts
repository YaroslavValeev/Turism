import assert from "node:assert/strict";
import test from "node:test";

import {
  displayValue,
  durationDaysLabel,
  formatDateRangeRu,
  formatDateRu,
  formatDateTimeMsk,
  humanLabel,
  joinDisplayParts,
  reviewsCountLabel,
  summarizeLines,
} from "./programDisplay";

test("displayValue hides technical empty values", () => {
  for (const v of [null, undefined, "", "  ", "Unknown", "unknown", "undefined", "null", "NaN", "N/A", "—", NaN, {}, []]) {
    assert.equal(displayValue(v), null, `expected null for ${String(v)}`);
  }
  assert.equal(displayValue("  Казахстан "), "Казахстан");
  assert.equal(displayValue(7), "7");
  assert.equal(displayValue("Unknown Lake"), "Unknown Lake");
});

test("humanLabel hides untranslated technical enums", () => {
  const dict: Record<string, string> = { beginner: "Новичок" };
  const translate = (v: string) => dict[v] ?? v;
  assert.equal(humanLabel("beginner", translate), "Новичок");
  assert.equal(humanLabel("some_enum", translate), null);
  assert.equal(humanLabel("unknown", translate), null);
  assert.equal(humanLabel(null, translate), null);
  assert.equal(humanLabel("Средний", translate), "Средний");
  assert.equal(humanLabel("x", () => "—"), null);
});

test("joinDisplayParts skips empty, technical and duplicate parts", () => {
  assert.equal(joinDisplayParts(["Казахстан", null, "Unknown", "Капчагай", "казахстан"]), "Казахстан · Капчагай");
  assert.equal(joinDisplayParts([undefined, "null", ""]), null);
});

test("formatDateRangeRu formats ranges without timezone shifts", () => {
  assert.equal(formatDateRangeRu("2026-09-27T00:00:00.000Z", "2026-10-03T00:00:00.000Z"), "27 сентября — 3 октября 2026");
  assert.equal(formatDateRangeRu("2026-10-03", "2026-10-09"), "3 — 9 октября 2026");
  assert.equal(formatDateRangeRu("2026-12-28", "2027-01-04"), "28 декабря 2026 — 4 января 2027");
  assert.equal(formatDateRangeRu("2026-10-03", "2026-10-03"), "3 октября 2026");
  assert.equal(formatDateRangeRu("2026-09-27", "2026-10-03", { short: true }), "27 сен — 3 окт");
  assert.equal(formatDateRangeRu("2026-10-03", "2026-10-09", { short: true }), "3 — 9 окт");
  assert.equal(formatDateRangeRu("garbage", "2026-10-03"), null);
  assert.equal(formatDateRangeRu(null, null), null);
});

test("formatDateRu and formatDateTimeMsk are deterministic", () => {
  assert.equal(formatDateRu("2026-10-01T23:30:00.000Z"), "1 октября 2026");
  assert.equal(formatDateRu("not a date"), null);
  assert.equal(formatDateTimeMsk("2026-10-01T21:30:00.000Z"), "02.10.2026, 00:30 МСК");
  assert.equal(formatDateTimeMsk(null), null);
});

test("durationDaysLabel pluralizes and hides invalid values", () => {
  assert.equal(durationDaysLabel(1), "1 день");
  assert.equal(durationDaysLabel(3), "3 дня");
  assert.equal(durationDaysLabel(7), "7 дней");
  assert.equal(durationDaysLabel(11), "11 дней");
  assert.equal(durationDaysLabel(0), null);
  assert.equal(durationDaysLabel(NaN), null);
  assert.equal(durationDaysLabel(null), null);
});

test("reviewsCountLabel and summarizeLines", () => {
  assert.equal(reviewsCountLabel(1), "1 отзыв");
  assert.equal(reviewsCountLabel(4), "4 отзыва");
  assert.equal(reviewsCountLabel(20), "20 отзывов");
  assert.deepEqual(summarizeLines(["a", "null", "b", "c", "d"], 2), { shown: ["a", "b"], rest: 2 });
  assert.deepEqual(summarizeLines([], 3), { shown: [], rest: 0 });
});
