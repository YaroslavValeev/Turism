import type { ExploreHubType, ManualExploreHub } from "./exploreTypes";
import { normToken, valueToDefaultSlug } from "./exploreSlugify";

/**
 * Ручной mapping: варианты (регистр, язык, написания) → один slug.
 * Пополняется по мере наполнения каталога.
 */
export const MANUAL_EXPLORE_HUBS: Record<ExploreHubType, ManualExploreHub[]> = {
  discipline: [
    {
      slug: "freeride",
      label: "Фрирайд",
      variants: ["freeride", "фрирайд", "фри-райд", "FreeRide", "free ride", "FR"],
    },
    {
      slug: "wakesurf",
      label: "Вейксерф",
      variants: ["wakesurf", "вейксерф", "wake surf", "wake", "Wakesurf", "WAKE"],
    },
    {
      slug: "kite",
      label: "Кайт",
      variants: ["kite", "кайт", "kitesurf", "кайтсерф", "kiteboarding"],
    },
    {
      slug: "mtb",
      label: "MTB",
      variants: ["mtb", "мтб", "mountain bike", "enduro", "эндуро", "all mountain", "gravity"],
    },
    {
      slug: "ski",
      label: "Горные лыжи",
      variants: ["ski", "skiing", "лыжи", "горнолыж", "gornolyzh"],
    },
    {
      slug: "snowboard",
      label: "Сноуборд",
      variants: ["snowboard", "сноуборд", "snow", "riders"],
    },
  ],
  region: [
    {
      slug: "caucasus",
      label: "Кавказ",
      variants: [
        "кавказ",
        "Caucasus",
        "Kavkaz",
        "кабардино-балкария",
        "dombay",
        "домбай",
        "elbrus",
        "эльбрус",
        "southern russia",
      ],
    },
    {
      slug: "siberia",
      label: "Сибирь",
      variants: ["siberia", "сибирь", "Siberia", "irkutsk", "irkutsk region", "байкал", "baikal", "Krasnoyarsk", "Sheregesh", "шерегеш"],
    },
    {
      slug: "karelia",
      label: "Карелия",
      variants: ["karelia", "карелия", "Karelia", "Karelija"],
    },
    {
      slug: "moscow-region",
      label: "Московский регион",
      variants: [
        "moscow",
        "москва",
        "moscow region",
        "подмосковье",
        "подмосков",
        "moscow-oblast",
        "Moscow",
      ],
    },
  ],
  season: [
    { slug: "winter", label: "Зима", variants: ["winter", "зима", "winter-2024", "2024-winter", "w"] },
    { slug: "summer", label: "Лето", variants: ["summer", "лето", "s"] },
    { slug: "spring", label: "Весна", variants: ["spring", "весна"] },
    { slug: "autumn", label: "Осень", variants: ["autumn", "осень", "fall"] },
  ],
};

const manualByTypeAndSlug: Record<ExploreHubType, Map<string, ManualExploreHub>> = {
  discipline: new Map(),
  region: new Map(),
  season: new Map(),
};

for (const t of ["discipline", "region", "season"] as ExploreHubType[]) {
  for (const h of MANUAL_EXPLORE_HUBS[t]) {
    manualByTypeAndSlug[t].set(h.slug, h);
  }
}

export function getManualHub(type: ExploreHubType, slug: string): ManualExploreHub | null {
  return manualByTypeAndSlug[type].get(slug) ?? null;
}

function findManualByRawValue(type: ExploreHubType, raw: string): ManualExploreHub | null {
  const n = normToken(raw);
  if (!n) return null;
  for (const h of MANUAL_EXPLORE_HUBS[type]) {
    for (const v of h.variants) {
      if (normToken(v) === n) return h;
    }
  }
  return null;
}

/** Стабильный slug в URL из произвольного значения в БД. */
export function rawStringToHubSlug(type: ExploreHubType, raw: string): string {
  if (!raw?.trim()) return "";
  const fromManual = findManualByRawValue(type, raw);
  if (fromManual) return fromManual.slug;
  return valueToDefaultSlug(raw);
}

/** Список строк для Prisma: ручной набор + исходная строка (если не в manual). */
export function matchValuesForFilter(type: ExploreHubType, rawSample: string): string[] {
  if (!rawSample?.trim()) return [];
  const m = findManualByRawValue(type, rawSample);
  if (m) return [...new Set(m.variants)];
  return [rawSample.trim()];
}

/**
 * Собрать OR-строки для бакета с несколькими исходными raw из БД,
 * схлопнув в один набор вариантов.
 */
export function matchValuesForRaws(type: ExploreHubType, raws: string[]): string[] {
  const s = new Set<string>();
  for (const r of raws) {
    for (const v of matchValuesForFilter(type, r)) s.add(v);
  }
  return [...s];
}
