import assert from "node:assert/strict";
import test from "node:test";
import { availableTours, tourDiscipline, tourFilterChips } from "./tourFilters";
import { programToTourCard } from "../components/toursFilmstripModel";

const now = new Date("2026-10-17T12:00:00");
const tour = (id: string, discipline = "kite", fields = {}) => ({
  id, discipline, region: "Краснодарский край", exactLocation: "Анапа",
  startDate: "2026-10-20", endDate: "2026-10-24", ...fields,
});

test("chips contain only actual disciplines, merge translated aliases and count the matching tours", () => {
  const programs = [tour("a", "freeride"), tour("b", "Фрирайд"), tour("c", "kite"), tour("d", "Unknown"), tour("e", "wildlife")];
  const chips = tourFilterChips(programs);
  assert.deepEqual(chips, [
    { id: "all", label: "Все", count: 5 },
    { id: "discipline:кайтсерфинг", label: "Кайтсерфинг", count: 1 },
    { id: "discipline:фрирайд", label: "Фрирайд", count: 2 },
  ]);
  for (const chip of chips.slice(1)) {
    assert.equal(programs.filter((p) => tourDiscipline(p.discipline)?.id === chip.id).length, chip.count);
  }
  assert.deepEqual(tourFilterChips([]), [{ id: "all", label: "Все", count: 0 }]);
});

test("dates and region determine the available chips before a discipline is selected", () => {
  const programs = [tour("near", "kite"), tour("far", "ski", { startDate: "2026-12-20", endDate: "2026-12-24" }), tour("other", "mtb", { region: "Карелия", exactLocation: null })];
  const filtered = availableTours(programs, { dateWindow: "30", region: "Анапа" }, now);
  assert.deepEqual(filtered.map((p) => p.id), ["near"]);
  assert.deepEqual(tourFilterChips(filtered).map((c) => c.label), ["Все", "Кайтсерфинг"]);
  assert.equal(availableTours(programs, { dateWindow: "", region: "несуществующий" }, now).length, 0);
});

test("an on-request season overlapping the selected window remains available with its actual schedule", () => {
  const programs = [
    tour("season", "trekking", { startDate: "2026-06-01", endDate: "2026-10-31", scheduleType: "on_request" }),
    tour("next-season", "ski", { startDate: "2026-12-01", endDate: "2027-03-31", scheduleType: "on_request" }),
    tour("ongoing", "kite", { startDate: "2026-10-15", endDate: "2026-10-20" }),
    tour("fixed"),
  ];
  assert.deepEqual(availableTours(programs, { dateWindow: "30", region: "" }, now).map((p) => p.id), ["fixed", "season"]);
  assert.deepEqual(availableTours(programs, { dateWindow: "", region: "" }, now).map((p) => p.id), ["ongoing", "fixed", "season", "next-season"]);
});

test("expired and invalid dates never create available buttons; date boundaries are inclusive", () => {
  const programs = [
    tour("today", "mtb", { startDate: "2026-10-17", endDate: "2026-10-17" }),
    tour("boundary", "ski", { startDate: "2026-11-16", endDate: "2026-11-20" }),
    tour("outside", "snowmobile", { startDate: "2026-11-17", endDate: "2026-11-20" }),
    tour("past", "wakesurf", { startDate: "2026-10-15", endDate: "2026-10-16" }),
    tour("invalid", "kite", { startDate: "invalid" }),
    tour("reversed", "kite", { endDate: "2026-10-19" }),
    tour("impossible", "kite", { startDate: "2026-02-30" }),
  ];
  assert.deepEqual(availableTours(programs, { dateWindow: "30", region: "" }, now).map((p) => p.id), ["today", "boundary"]);
});

test("discipline matching does not guess from audience or similar text and preserves combined disciplines", () => {
  assert.notEqual(tourDiscipline("wakesurf")?.id, tourDiscipline("kite")?.id);
  assert.equal(tourDiscipline("  Freeride ")?.id, tourDiscipline("фрирайд")?.id);
  assert.equal(tourDiscipline("Фрирайд / скитур")?.label, "Фрирайд / скитур");
});

test("a real tour card uses its catalog discipline instead of the old fallback wakesurf badge", () => {
  const program = { ...tour("real", "kite"), title: "Выезд на море", durationDays: 5, levelRequired: null, priceFromRub: null, audienceFit: null };
  assert.equal(programToTourCard(program, 0).badge?.label, "Кайтсерфинг");
  assert.equal(programToTourCard({ ...program, discipline: "Unknown" }, 0).badge, null);
});
