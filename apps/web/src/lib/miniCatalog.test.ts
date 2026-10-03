import assert from "node:assert/strict";
import test from "node:test";
import { miniCatalogQuery, miniEntry, miniPrograms, readMiniCatalog } from "./miniCatalog";
import type { CatalogProgram } from "./catalog";

const program = (id: string, day: string, extra: Partial<CatalogProgram> = {}): CatalogProgram => ({
  id, title: `Поездка ${id}`, discipline: "skiing", region: "Камчатка", startDate: `${day}T00:00:00Z`,
  endDate: `${day}T00:00:00Z`, durationDays: 1, priceFromRub: null, levelRequired: "beginner", ...extra,
});

test("entry reads Telegram query/hash and preserves explicit dates and filters", () => {
  assert.equal(miniEntry("?tgWebAppStartParam=2w").preset, "2w");
  assert.equal(miniEntry("?preset=month", "#tgWebAppStartParam=2w").preset, "2w");
  assert.equal(miniEntry("?preset=month", "", "next-weekend").preset, "next-weekend");
  assert.deepEqual(miniEntry("?from=2026-10-03&to=2026-10-10&discipline=skiing&level=beginner").range, { from: "2026-10-03", to: "2026-10-10" });
  assert.equal(miniEntry("?from=2026-10-10&to=2026-10-03&level=garbage").range, null);
  assert.equal(miniEntry("?level=garbage").level, "");
});

test("catalog validates shape and deduplicates before filtering", () => {
  const p = program("a", "2026-10-03");
  assert.equal(readMiniCatalog([p, { ...p, id: "b" }]).length, 1);
  assert.throws(() => readMiniCatalog({ items: [] }));
  assert.throws(() => readMiniCatalog([{ id: "incomplete" }]));
  assert.deepEqual(readMiniCatalog([]), []);
});

test("combined filters include boundaries, exclude past/on-request, and keep sorted results", () => {
  const programs = [program("later", "2026-10-10"), program("first", "2026-10-03"),
    program("past", "2026-10-02"), program("request", "2026-10-04", { scheduleType: "on_request" }),
    program("other", "2026-10-04", { discipline: "mtb" }), program("expert", "2026-10-05", { levelRequired: "expert" })];
  assert.deepEqual(miniPrograms(programs, { from: "2026-10-03", to: "2026-10-10" }, "skiing", "beginner", "2026-10-03").map((p) => p.id), ["first", "later"]);
  assert.equal(miniPrograms(programs, { from: "2026-10-11", to: "2026-10-12" }, "", "", "2026-10-03").length, 0);
  assert.equal(miniPrograms(programs, null, "", "", "").length, 0);
});

test("catalog transition keeps both dates and filters but never Telegram auth material", () => {
  const q = new URLSearchParams(miniCatalogQuery({ from: "2026-10-03", to: "2026-10-16" }, "skiing", "beginner", "utm_source=telegram&tgWebAppData=secret&preset=2w"));
  assert.equal(q.get("to"), "2026-10-16");
  assert.equal(q.get("level"), "beginner");
  assert.equal(q.get("discipline"), "skiing");
  assert.equal(q.get("utm_source"), "telegram");
  assert.equal(q.has("tgWebAppData"), false);
});
