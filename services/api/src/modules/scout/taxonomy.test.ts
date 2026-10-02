import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MANUAL_EXPLORE_HUBS } from "@mywave/explore-links";
import {
  ACTIVITY_FORMATS,
  AI_TOUR_DISCIPLINE_IDS,
  DISCIPLINES,
  ORGANIZER_KINDS,
  SCOUT_AREAS,
  disciplineLabelRu,
  normalizeToken,
  resolveDiscipline,
  resolveDisciplines,
  resolveFormat,
  resolveOrganizerKinds,
  resolveScoutArea,
} from "@mywave/shared-types";
import { TOUR_DISCIPLINES } from "../ingestion/tourCatalog";
import { DISCIPLINE_KEYWORDS } from "../ingestion/service";

type OsintProposal = { region: string; kind: string; disciplines: string[] };

const osintProposals = JSON.parse(
  readFileSync(new URL("../../../prisma/source_proposals_osint_2026-09-29.json", import.meta.url), "utf8"),
) as OsintProposal[];

/** Значения OSINT, которые описывают не дисциплину и не формат (слишком общие или вне каталога). */
const NOT_A_DISCIPLINE = [
  "активные туры",
  "активный отдых",
  "обучение",
  "автотуры",
  "водный туризм",
  "горные маршруты",
  "горные туры",
  "рыбалка",
];

function keysOf(def: { id: string; labelRu: string; labelEn?: string; aliases: readonly string[] }): string[] {
  return [...new Set([def.id, def.labelRu, def.labelEn ?? "", ...def.aliases].map(normalizeToken).filter(Boolean))];
}

function expectNoCrossCollisions(defs: readonly { id: string; labelRu: string; labelEn?: string; aliases: readonly string[] }[]) {
  const owner = new Map<string, string>();
  for (const def of defs) {
    for (const key of keysOf(def)) {
      const prev = owner.get(key);
      expect(prev === undefined || prev === def.id, `"${key}" принадлежит и ${prev}, и ${def.id}`).toBe(true);
      owner.set(key, def.id);
    }
  }
}

describe("taxonomy: disciplines", () => {
  it("ids unique and kebab-case latin", () => {
    const ids = DISCIPLINES.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z]+(-[a-z]+)*$/);
  });

  it("aliases/labels do not collide across disciplines or with other ids", () => {
    expectNoCrossCollisions(DISCIPLINES);
  });

  it("TOUR_DISCIPLINES (tourCatalog) equals aiTour disciplines in the same order", () => {
    expect([...AI_TOUR_DISCIPLINE_IDS]).toEqual([...TOUR_DISCIPLINES]);
  });

  it("every DISCIPLINE_KEYWORDS key in ingestion/service resolves to itself", () => {
    for (const key of Object.keys(DISCIPLINE_KEYWORDS)) expect(resolveDiscipline(key)).toBe(key);
  });

  it("DISCIPLINE_KEYWORDS values resolve to their key", () => {
    for (const [key, words] of Object.entries(DISCIPLINE_KEYWORDS)) {
      for (const w of words) expect(resolveDiscipline(w), w).toBe(key);
    }
  });

  it("matching is case-insensitive and ё-insensitive", () => {
    expect(resolveDiscipline("  ФРИРАЙД ")).toBe("freeride");
    expect(resolveDiscipline("полёты на параплане")).toBe("paragliding");
    expect(resolveDiscipline("Горные   лыжи")).toBe("ski");
  });

  it.each([
    ["Wakesurf", "wakesurf"],
    ["Kite", "kite"],
    ["Ski", "ski"],
    ["Surf", "surf"],
    ["MTB", "mtb"],
    ["Snowboard", "snowboard"],
    ["Expedition", "expedition"],
    ["Freeride", "freeride"],
    ["kitesurfing", "kite"],
    ["kitesurf", "kite"],
    ["кайтсерфинг", "kite"],
    ["skiing", "ski"],
    ["skitour", "ski-tour"],
    ["ski tour", "ski-tour"],
    ["скитур", "ski-tour"],
    ["ски-тур", "ski-tour"],
    ["трекинг", "trekking"],
    ["треккинг", "trekking"],
    ["сапбординг", "sup"],
    ["SUP", "sup"],
    ["фрирайд", "freeride"],
    ["хели-ски", "heli-ski"],
    ["хелиски", "heli-ski"],
    ["горные лыжи", "ski"],
    ["альпинизм", "mountaineering"],
    ["восхождения", "mountaineering"],
    ["велотуризм", "mtb"],
    ["bikepacking", "mtb"],
    ["яхтинг", "sailing"],
    ["yachting", "sailing"],
    ["дикая природа", "wildlife"],
    ["экспедиции", "expedition"],
    ["Kite / camp", "kite"],
    ["Wake / multi", "wakesurf"],
    ["Snow / multi", "snowboard"],
    ["SUP / festival", "sup"],
    ["велотуризм / bikepacking", "mtb"],
  ])("legacy %s → %s", (raw, id) => {
    expect(resolveDiscipline(raw)).toBe(id);
  });

  it("splits compound values into disciplines and formats", () => {
    expect(resolveDisciplines("Kite / camp")).toEqual({ disciplines: ["kite"], formats: ["camp"] });
    expect(resolveDisciplines("Wake / multi")).toEqual({ disciplines: ["wakesurf", "multisport"], formats: [] });
    expect(resolveDisciplines("SUP / festival")).toEqual({ disciplines: ["sup"], formats: ["festival"] });
    expect(resolveDisciplines("Экспедиция / дикая природа")).toEqual({ disciplines: ["expedition", "wildlife"], formats: [] });
    expect(resolveDisciplines("велотуризм / bikepacking")).toEqual({ disciplines: ["mtb"], formats: [] });
    expect(resolveDisciplines("kite + wing; surf, camp")).toEqual({ disciplines: ["kite", "wing", "surf"], formats: ["camp"] });
    expect(resolveDisciplines("")).toEqual({ disciplines: [], formats: [] });
  });

  it("enduro: bare enduro is moto-enduro, bike enduro only when explicit (owner decision)", () => {
    expect(resolveDiscipline("эндуро")).toBe("moto-enduro");
    expect(resolveDiscipline("Enduro")).toBe("moto-enduro");
    expect(resolveDiscipline("enduro")).toBe("moto-enduro");
    expect(resolveDiscipline("велоэндуро")).toBe("mtb");
    expect(resolveDiscipline("mtb enduro")).toBe("mtb");
    expect(resolveDiscipline("enduro mtb")).toBe("mtb");
    expect(resolveDiscipline("эндуро mtb")).toBe("mtb");
  });

  it("disciplineLabelRu returns canonical label or trimmed raw", () => {
    expect(disciplineLabelRu("kite")).toBe("Кайтсерфинг");
    expect(disciplineLabelRu("Wakesurf")).toBe("Вейксерф");
    expect(disciplineLabelRu("  рыбалка ")).toBe("рыбалка");
    expect(disciplineLabelRu(null)).toBe("");
  });

  it("all OSINT disciplines resolve to a discipline/format or are explicitly not a discipline", () => {
    const unresolved = new Set<string>();
    for (const p of osintProposals) {
      for (const raw of p.disciplines) {
        const r = resolveDisciplines(raw);
        if (!r.disciplines.length && !r.formats.length && !NOT_A_DISCIPLINE.includes(normalizeToken(raw))) unresolved.add(raw);
      }
    }
    expect([...unresolved]).toEqual([]);
  });

  it("NOT_A_DISCIPLINE entries really do not resolve (keep the list honest)", () => {
    for (const raw of NOT_A_DISCIPLINE) {
      expect(resolveDisciplines(raw), raw).toEqual({ disciplines: [], formats: [] });
    }
  });

  it("explore hub discipline slugs and variants resolve to the hub slug (documented exceptions)", () => {
    // enduro/эндуро в exploreMap сейчас означают MTB; по решению владельца это moto-enduro.
    // exploreMap будет исправлен в отдельном PR потребителей, здесь фиксируем расхождение.
    // riders — не дисциплина, остаётся только в explore-хабе.
    const EXPECTED_DIVERGENCE: Record<string, string | null> = {
      enduro: "moto-enduro",
      эндуро: "moto-enduro",
      riders: null,
    };
    for (const hub of MANUAL_EXPLORE_HUBS.discipline) {
      expect(resolveDiscipline(hub.slug), hub.slug).toBe(hub.slug);
      for (const variant of hub.variants) {
        const key = normalizeToken(variant);
        const expected = key in EXPECTED_DIVERGENCE ? EXPECTED_DIVERGENCE[key] : hub.slug;
        expect(resolveDiscipline(variant), `${hub.slug}: ${variant}`).toBe(expected);
      }
    }
  });

  it("camp-feed sport terms resolve to wakesurf/wakeboard", () => {
    // Копия списков из camp-feed/mapper.ts normalizeSports (там они не экспортируются).
    const wakesurfTerms = ["wakesurf", "wake surf", "вейксерф", "вейк-серф", "вейк серф"];
    const wakeboardTerms = ["wakeboard", "wake board", "вейкборд", "вейк-борд", "вейк борд"];
    for (const t of wakesurfTerms) expect(resolveDiscipline(t), t).toBe("wakesurf");
    for (const t of wakeboardTerms) expect(resolveDiscipline(t), t).toBe("wakeboard");
  });
});

describe("taxonomy: formats", () => {
  it("ids unique and no alias collisions", () => {
    expect(new Set(ACTIVITY_FORMATS.map((f) => f.id)).size).toBe(ACTIVITY_FORMATS.length);
    expectNoCrossCollisions(ACTIVITY_FORMATS);
  });

  it.each([
    ["camp", "camp"],
    ["кэмп", "camp"],
    ["trip", "tour"],
    ["поездка", "tour"],
    ["тренировочные сборы", "training"],
    ["горные тренировочные сборы", "training"],
    ["competition", "race"],
    ["Соревнования", "race"],
    ["лавинные курсы", "course"],
    ["festival", "festival"],
  ])("%s → %s", (raw, id) => {
    expect(resolveFormat(raw)).toBe(id);
  });
});

describe("taxonomy: organizer kinds", () => {
  it("ids unique", () => {
    expect(new Set(ORGANIZER_KINDS.map((k) => k.id)).size).toBe(ORGANIZER_KINDS.length);
  });

  it("splits and maps free-text kinds", () => {
    expect(resolveOrganizerKinds("туроператор/горная школа")).toEqual(["tour_operator", "school"]);
    expect(resolveOrganizerKinds("туроператор/команда горных гидов")).toEqual(["tour_operator", "guide_team"]);
    expect(resolveOrganizerKinds("горный клуб/школа/туры")).toEqual(["club", "school"]);
    expect(resolveOrganizerKinds("туроператор/горно-спортивная база")).toEqual(["tour_operator", "base"]);
    expect(resolveOrganizerKinds("организатор активных туров")).toEqual(["tour_operator"]);
    expect(resolveOrganizerKinds("фрирайд-организатор")).toEqual(["event_organizer"]);
    expect(resolveOrganizerKinds("служба инструкторов")).toEqual(["instructor_service"]);
    expect(resolveOrganizerKinds("клуб + школа, гиды")).toEqual(["club", "school", "guide_team"]);
    expect(resolveOrganizerKinds("")).toEqual([]);
  });

  it("every OSINT kind maps to at least one organizer kind", () => {
    for (const p of osintProposals) expect(resolveOrganizerKinds(p.kind).length, p.kind).toBeGreaterThan(0);
  });
});

describe("taxonomy: scout areas", () => {
  it("ids unique kebab-case, 3 zones in wave 1 and 9 in wave 2", () => {
    const ids = SCOUT_AREAS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z]+(-[a-z]+)*$/);
    expect(SCOUT_AREAS.filter((a) => a.wave === 1).map((a) => a.id)).toEqual(["kamchatka", "altai", "elbrus"]);
    expect(SCOUT_AREAS.filter((a) => a.wave === 2)).toHaveLength(9);
  });

  it("aliases do not collide across zones", () => {
    expectNoCrossCollisions(SCOUT_AREAS);
  });

  it("macro matches an explore region hub slug or a documented placeholder", () => {
    const hubSlugs = new Set(MANUAL_EXPLORE_HUBS.region.map((h) => h.slug));
    const placeholders = new Set(["far-east", "north"]);
    for (const area of SCOUT_AREAS) expect(hubSlugs.has(area.macro) || placeholders.has(area.macro), area.id).toBe(true);
  });

  it("every zone resolves by id, labelRu and each alias", () => {
    for (const area of SCOUT_AREAS) {
      expect(resolveScoutArea(area.id)).toBe(area.id);
      expect(resolveScoutArea(area.labelRu)).toBe(area.id);
      for (const alias of area.aliases) expect(resolveScoutArea(alias), alias).toBe(area.id);
    }
  });

  it.each([
    ["Хибины", "khibiny-kola"],
    ["Кольский", "khibiny-kola"],
    ["Курилы", "sakhalin-kurils"],
    ["Сахалин", "sakhalin-kurils"],
    ["Мурманская область", "khibiny-kola"],
    ["Республика Бурятия", "baikal"],
    ["Кемеровская область — Кузбасс", "sheregesh"],
  ])("%s → %s", (raw, id) => {
    expect(resolveScoutArea(raw)).toBe(id);
  });

  it("ambiguous subject (two zones) does not resolve", () => {
    expect(resolveScoutArea("Карачаево-Черкесская Республика")).toBeNull();
  });

  it("all OSINT regions resolve", () => {
    for (const p of osintProposals) expect(resolveScoutArea(p.region), p.region).not.toBeNull();
  });
});
