import assert from "node:assert/strict";
import test from "node:test";
import { dedupeProgramListingsByEvent } from "./dedupeProgramListingsByEvent";

function program(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id, title: "Mountain course", discipline: "climbing", region: "mountains",
    exactLocation: null as string | null, startDate: "2026-10-29T12:00:00Z",
    endDate: "2026-11-08T12:00:00Z", durationDays: 11, priceFromRub: null as number | null,
    organizer: { id: "organizer", displayName: "Organizer" }, sourceType: "site",
    sourceUrl: "https://organizer.example.invalid/courses/mountain", scheduleType: "fixed",
    ...overrides,
  };
}
const ids = (rows: ReturnType<typeof program>[]) => dedupeProgramListingsByEvent(rows).map(p => p.id);

test("keeps different courses with the same organizer, dates and region", () => {
  assert.deepEqual(ids([
    program("turkey", { title: "Climbing school in Turkey", sourceUrl: "https://organizer.example.invalid/climb/turkey" }),
    program("ossetia", { title: "First ascents in Ossetia", sourceUrl: "https://organizer.example.invalid/alp/ossetia" }),
    program("trad", { title: "Trad routes in Ingushetia", sourceUrl: "https://organizer.example.invalid/trad/ingushetia" }),
  ]), ["turkey", "ossetia", "trad"]);
});
test("keeps Kazakhstan and Mamay rather than guessing from organizer date window", () => {
  assert.deepEqual(ids([
    program("mamay", { title: "Mamay ski tour", sourceUrl: "https://organizer.example.invalid/routs/mamay" }),
    program("kazakhstan", { title: "Kazakhstan catski", sourceUrl: "https://organizer.example.invalid/routs/ridder" }),
  ]), ["mamay", "kazakhstan"]);
});
test("keeps two race announcements in the same city on the same day", () => {
  assert.deepEqual(ids([
    program("race-one", { title: "Enduro Nation", discipline: "Unknown", sourceType: "telegram", sourceUrl: "https://social.example.invalid/races/2878" }),
    program("race-two", { title: "Beyond the edge", discipline: "Unknown", sourceType: "telegram", sourceUrl: "https://social.example.invalid/races/2871" }),
  ]), ["race-one", "race-two"]);
});
test("different source URLs remain distinct even when titles match", () => {
  assert.deepEqual(ids([program("a"), program("b", { sourceUrl: "https://organizer.example.invalid/courses/other" })]), ["a", "b"]);
});
test("different titles remain distinct even if a shared page lists both programs", () => {
  assert.deepEqual(ids([program("a"), program("b", { title: "Another mountain course" })]), ["a", "b"]);
});
for (const [field, value] of Object.entries({
  discipline: "trekking", exactLocation: "another valley", region: "other region",
  startDate: "2026-11-01T12:00:00Z", endDate: "2026-11-10T12:00:00Z", durationDays: 10,
  organizer: { id: "other-organizer", displayName: "Organizer" },
})) {
  test(`does not merge distinct ${field}`, () => {
    assert.deepEqual(ids([program("a"), program("b", { [field]: value })]), ["a", "b"]);
  });
}
for (const sourceUrl of [null, "", "not a URL", "/relative-course", "javascript:alert(1)", "https://organizer.example.invalid/", "https://user:password@organizer.example.invalid/course"]) {
  test(`missing or non-specific source does not prove duplication: ${String(sourceUrl).split(":")[0]}`, () => {
    assert.deepEqual(ids([program("a", { sourceUrl }), program("b", { sourceUrl })]), ["a", "b"]);
  });
}
test("on-request tours keep separate IDs even with matching titles, URLs and season dates", () => {
  assert.deepEqual(ids([program("a", { scheduleType: "on_request" }), program("b", { scheduleType: "on_request" })]), ["a", "b"]);
});
test("same item, title and event retain the commercially fuller record without mutating inputs", () => {
  const a = program("a"); const b = program("b", { priceFromRub: 50000 });
  const input = [a, b]; const snapshot = structuredClone(input);
  assert.deepEqual(ids(input), ["b"]); assert.deepEqual(input, snapshot);
  assert.equal(dedupeProgramListingsByEvent(input)[0], b);
});
test("same-item ties are deterministic independent of input order", () => {
  assert.deepEqual(ids([program("z"), program("a")]), ["a"]);
  assert.deepEqual(ids([program("a"), program("z")]), ["a"]);
});
test("normalizes title case/whitespace without discarding query or fragment identity", () => {
  assert.deepEqual(ids([program("a"), program("b", { title: " MOUNTAIN   COURSE " })]), ["a"]);
  assert.deepEqual(ids([program("a"), program("b", { sourceUrl: "https://organizer.example.invalid/courses/mountain?session=other" })]), ["a", "b"]);
  assert.deepEqual(ids([program("a"), program("b", { sourceUrl: "https://organizer.example.invalid/courses/mountain#other" })]), ["a", "b"]);
});
test("blank titles are not enough evidence to collapse different rows", () => {
  assert.deepEqual(ids([program("a", { title: " " }), program("b", { title: " " })]), ["a", "b"]);
});
