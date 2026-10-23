import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import ts from "typescript";
import { isCatalogProgram } from "./catalog";
import { getDisciplineDisplay } from "./disciplineLabels";
import { dedupeProgramListingsByEvent } from "./dedupeProgramListingsByEvent";
import { isOnRequestProgram } from "./programSchedule";
import { WEEKEND_PRESET_TITLES, weekendRange } from "./weekendRange";
import {
  catalogQuery,
  EMPTY_FILTERS,
  filterCatalog,
  localDate,
  parseCatalogFilters,
  participantLevel,
  safeCatalogReturn,
  validDate,
} from "./catalog";

const now = new Date(2026, 8, 15, 12);
const qaTour = (id: string, title: string, extra = {}) => ({
  id, title, priceFromRub: null, discipline: "trekking", region: "Камчатка",
  startDate: "2026-10-01", endDate: "2026-10-02", durationDays: 2,
  organizer: { id: "organizer", displayName: "БЕАРТРО" }, ...extra,
});

test("different on-request tours remain distinct during display deduplication", () => {
  const tours = [qaTour("lake", "Начикинское озеро", { scheduleType: "on_request" }),
    qaTour("mountain", "Вачкажец", { scheduleType: "on_request" }),
    qaTour("culture", "Культура коренных народов", { scheduleType: "on_request", discipline: "wildlife" })];
  assert.deepEqual(dedupeProgramListingsByEvent(tours).map(p => p.id), ["lake", "mountain", "culture"]);
});

test("same titles do not justify collapsing distinct on-request records", () => {
  const a = qaTour("a", "Индивидуальный тур", { scheduleType: "on_request" });
  assert.equal(dedupeProgramListingsByEvent([a, { ...a, id: "b" }]).length, 2);
  assert.equal(dedupeProgramListingsByEvent([a, { ...a }]).length, 1);
});

test("same-source dated events still dedupe with the existing quality preference", () => {
  const a = qaTour("a", "Поездка на вулкан, дата подтверждена", { sourceUrl: "https://organizer.example.invalid/tours/volcano" });
  assert.deepEqual(dedupeProgramListingsByEvent([a, { ...a, id: "b", priceFromRub: 10000 }]).map(p => p.id), ["b"]);
});

test("on-request tour never disappears behind a matching dated event", () => {
  const a = qaTour("a", "По запросу", { scheduleType: "on_request" });
  assert.deepEqual(dedupeProgramListingsByEvent([a, qaTour("b", "Подтверждённый выезд")]).map(p => p.id), ["a", "b"]);
});
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

test("the homepage catalogue keeps empty filters empty through its actual render wiring", async (t) => {
  // These callbacks are deliberately read from the page: testing filterCatalog alone
  // missed the page's fallback that replaced zero matches with unrelated programs.
  const source = readFileSync(resolve(__dirname, "../app/home-page.tsx"), "utf8");
  const file = ts.createSourceFile("home-page.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const functions = new Map<string, ts.FunctionDeclaration>();
  const callbacks = new Map<string, ts.ArrowFunction>();
  let renderedPrograms: ts.Expression | undefined;
  const visit = (node: ts.Node) => {
    if (ts.isFunctionDeclaration(node) && node.name) functions.set(node.name.text, node);
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer && ts.isCallExpression(node.initializer)
      && node.initializer.expression.getText(file) === "useMemo" && node.initializer.arguments[0] && ts.isArrowFunction(node.initializer.arguments[0])) {
      callbacks.set(node.name.text, node.initializer.arguments[0]);
    }
    if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(file) === "ExpandableProgramCatalog") {
      const attribute = node.attributes.properties.find((p): p is ts.JsxAttribute => ts.isJsxAttribute(p) && p.name.getText(file) === "programs");
      if (attribute?.initializer && ts.isJsxExpression(attribute.initializer)) renderedPrograms = attribute.initializer.expression;
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  assert.ok(renderedPrograms, "the homepage must pass its matching list to the expandable catalogue");
  const helpers = ["levelMatchesOne", "levelMatchesAny", "normScope", "disciplineSearchText", "startOfDay", "programStartsWithinDays", "seasonOfProgramStart", "regionSearchText", "programBlob"];
  const code = [
    ...helpers.map((name) => {
      assert.ok(functions.has(name), `homepage helper ${name} not found`);
      return functions.get(name)!.getText(file);
    }),
    ...["catalogPrograms", "filtered", "programGrid"].flatMap((name) => {
      const callback = callbacks.get(name);
      return callback ? [`const ${name} = (${callback.getText(file)})();`] : [];
    }),
    `return ${renderedPrograms.getText(file)};`,
  ].join("\n");
  const compiled = ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
  const evaluate = new Function("getDisciplineDisplay", "isOnRequestProgram", "localDate", "Date", "weekendRange", "WEEKEND_PRESET_TITLES", "state", `const { selectedDisciplines, appliedRegionQuery, programsCatalogUnique, levelFilters, nearestStartsOnly, seasonFilter, dateFrom, dateTo, scenarioExtra, weekendPreset } = state;\n${compiled}`);
  const clock = class extends Date {
    constructor(value?: string | number) { super(value ?? new Date(2026, 9, 18, 12).valueOf()); }
  };
  const programs = [
    qaTour("match", "Кэмп", { discipline: "wakesurf", region: "Краснодар", startDate: "2026-10-25", endDate: "2026-10-31", levelRequired: "intermediate" }),
    qaTour("other", "Другой спорт", { discipline: "ski", region: "Алтай", startDate: "2026-11-20", endDate: "2026-11-25" }),
    qaTour("unknown", "Дисциплина уточняется", { discipline: "Unknown", startDate: "2026-11-01", endDate: "2026-11-02" }),
  ];
  const defaults = { selectedDisciplines: [], appliedRegionQuery: "", programsCatalogUnique: programs, levelFilters: [], nearestStartsOnly: false, seasonFilter: "", dateFrom: "", dateTo: "", scenarioExtra: null, weekendPreset: null };
  const cases = [
    { name: "reset shows every program", filters: {}, ids: ["match", "other", "unknown"] },
    { name: "existing discipline", filters: { selectedDisciplines: ["Вейксерф"] }, ids: ["match"] },
    { name: "nonexistent discipline", filters: { selectedDisciplines: ["несуществующая дисциплина"] }, ids: [] },
    { name: "nonexistent region", filters: { appliedRegionQuery: "несуществующий регион" }, ids: [] },
    { name: "unclassified program remains selectable", filters: { selectedDisciplines: ["Unknown"] }, ids: ["unknown"] },
    { name: "combined matching filters", filters: { selectedDisciplines: ["Вейксерф"], appliedRegionQuery: "Краснодар", dateFrom: "2026-10-25", dateTo: "2026-10-25", levelFilters: ["intermediate"] }, ids: ["match"] },
    { name: "combined dates with no matches", filters: { selectedDisciplines: ["Вейксерф"], appliedRegionQuery: "Краснодар", dateFrom: "2099-01-01", dateTo: "2099-01-02" }, ids: [] },
    { name: "combined level with no matches", filters: { selectedDisciplines: ["Вейксерф"], appliedRegionQuery: "Краснодар", levelFilters: ["expert"] }, ids: [] },
    { name: "empty weekend does not show later starts", filters: { weekendPreset: "this-weekend", dateFrom: "2026-10-18", dateTo: "2026-10-18" }, ids: [] },
  ];
  for (const scenario of cases) {
    await t.test(scenario.name, () => {
      const result = evaluate(getDisciplineDisplay, isOnRequestProgram, localDate, clock, weekendRange, WEEKEND_PRESET_TITLES, { ...defaults, ...scenario.filters });
      assert.deepEqual(result.map((program: { id: string }) => program.id), scenario.ids);
    });
  }
});
