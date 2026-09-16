import assert from "node:assert/strict";
import test from "node:test";
import { isCatalogProgram } from "./catalog";
import {
  catalogQuery,
  EMPTY_FILTERS,
  filterCatalog,
  parseCatalogFilters,
  participantLevel,
  safeCatalogReturn,
  validDate,
} from "./catalog";

const now = new Date(2026, 8, 15, 12);
test("malformed catalogue records do not reach the renderer", () => {
  assert.equal(isCatalogProgram(null), false);
  assert.equal(isCatalogProgram({ title: "incomplete" }), false);
  assert.equal(isCatalogProgram({ ...festival, startDate: null }), false);
  assert.equal(isCatalogProgram({ ...festival, media: [{ url: null }] }), false);
  assert.equal(isCatalogProgram(festival), true);
});
const festival = {
  id: "kite",
  title: "Кайт-фестиваль",
  discipline: "kite",
  region: "Краснодарский край",
  exactLocation: "Бугазская коса",
  startDate: "2026-09-18",
  endDate: "2026-09-27",
  durationDays: 10,
  priceFromRub: null,
  levelRequired: "all_levels",
  formatType: "festival",
};
test("an empty regional result never widens to another region", () => {
  assert.deepEqual(
    filterCatalog([festival], { ...EMPTY_FILTERS, region: "Алтай" }, now),
    [],
  );
});
test("sport filter does not treat a kite festival as wakesurf", () => {
  assert.deepEqual(
    filterCatalog(
      [festival],
      { ...EMPTY_FILTERS, disciplines: ["Вейксерф"] },
      now,
    ),
    [],
  );
  assert.equal(
    filterCatalog(
      [festival],
      { ...EMPTY_FILTERS, disciplines: ["Кайтсерфинг"] },
      now,
    ).length,
    1,
  );
});
test("combined location links match without punctuation mismatch", () => {
  assert.equal(
    filterCatalog(
      [festival],
      { ...EMPTY_FILTERS, region: "Краснодарский край · Бугазская коса" },
      now,
    ).length,
    1,
  );
});
test("dates, multi-values and attribution survive a link roundtrip", () => {
  const f = {
    ...EMPTY_FILTERS,
    disciplines: ["kite", "sup"],
    levels: ["beginner"],
    from: "2026-09-15",
    to: "2026-09-30",
    format: "festival",
    nearest: true,
  };
  const query = catalogQuery(f, "utm_source=partner&region=old");
  assert.deepEqual(parseCatalogFilters(query), f);
  assert.equal(new URLSearchParams(query).get("utm_source"), "partner");
});
test("invalid, inverted and expired dates do not return live offers", () => {
  assert.equal(validDate("2026-02-30"), "");
  assert.deepEqual(
    filterCatalog(
      [festival],
      { ...EMPTY_FILTERS, from: "2026-10-01", to: "2026-09-01" },
      now,
    ),
    [],
  );
  assert.deepEqual(
    filterCatalog([{ ...festival, endDate: "2026-09-10" }], EMPTY_FILTERS, now),
    [],
  );
});
test("festival all-levels is not a beginner promise", () => {
  assert.deepEqual(
    filterCatalog([festival], { ...EMPTY_FILTERS, levels: ["beginner"] }, now),
    [],
  );
  assert.equal(
    participantLevel(festival, "Любой"),
    "Зависит от категории участия",
  );
});
test("legacy format links keep format semantics", () => {
  assert.equal(parseCatalogFilters("discipline=clinic").format, "clinic");
  assert.deepEqual(parseCatalogFilters("discipline=clinic").disciplines, []);
});
test("return paths cannot navigate to another origin or arbitrary app page", () => {
  for (const path of [
    "//example.com",
    "/\\example.com",
    "https://example.com",
    "/organizers/program",
  ])
    assert.equal(safeCatalogReturn(path), "/#programs");
  assert.equal(
    safeCatalogReturn("/?region=Алтай#programs"),
    "/?region=Алтай#programs",
  );
});
