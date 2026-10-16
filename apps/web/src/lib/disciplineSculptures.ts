export type DisciplineCarouselItem = { label: string; href: string };

// Visible ink bounds in the approved 400 × 440 assets. Cropping is done in CSS;
// source images stay byte-for-byte unchanged, including the Ka-62 ski baskets.
export const sculptureBounds: Record<string, { x: number; y: number; width: number; height: number }> = {
  wakesurf: { x: 14, y: 0, width: 371, height: 440 },
  kite: { x: 20, y: 0, width: 359, height: 440 },
  mtb: { x: 14, y: 0, width: 372, height: 440 },
  climbing: { x: 101, y: 0, width: 197, height: 440 },
  "ski-tour": { x: 49, y: 0, width: 302, height: 440 },
  snowmobile: { x: 0, y: 79, width: 400, height: 282 },
  trekking: { x: 63, y: 0, width: 274, height: 440 },
  expedition: { x: 62, y: 0, width: 276, height: 440 },
  "heli-ski-ka62-baskets": { x: 0, y: 123, width: 400, height: 193 },
  "freeride-snowboard": { x: 0, y: 93, width: 400, height: 254 },
  "ski-alpine-v2": { x: 0, y: 31, width: 400, height: 377 },
};

export function sculptureFor(label: string): string | null {
  const value = label.toLowerCase().replace(/ё/g, "е");
  if (/вейксерф|wakesurf/.test(value)) return "wakesurf";
  if (/кайт|kite/.test(value)) return "kite";
  if (/маунтинбайк|mtb|велосипед/.test(value)) return "mtb";
  if (/скалолаз|альпинизм|climbing/.test(value)) return "climbing";
  if (/снегоход|snowmobile/.test(value)) return "snowmobile";
  if (/экспедиц|expedition/.test(value)) return "expedition";
  if (/трекинг|trekking|поход/.test(value)) return "trekking";
  if (/хели-ски|хелиски|heli[- ]?ski/.test(value)) return "heli-ski-ka62-baskets";
  if (/фрирайд|freeride/.test(value)) return "freeride-snowboard";
  if (/скитур|ски-тур|ski[- ]?tour/.test(value)) return "ski-tour";
  if (/лыж|ski/.test(value)) return "ski-alpine-v2";
  return null;
}

/** Space repeated silhouettes around the ring, including the last/first seam. */
export function arrangeDisciplineItems(source: DisciplineCarouselItem[]): DisciplineCarouselItem[] {
  const groups = new Map<string | null, DisciplineCarouselItem[]>();
  for (const item of source) {
    if (/^(дикая природа|wildlife)$/i.test(item.label.trim())) continue;
    const key = sculptureFor(item.label);
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  const result = [...groups.values()].map((group) => group[0]);
  for (const [key, group] of groups) {
    for (const item of group.slice(1)) {
      const positions = result.flatMap((entry, index) => sculptureFor(entry.label) === key ? [index] : []);
      const gaps = positions.map((start, index) => ({ start, length: (positions[(index + 1) % positions.length] - start + result.length) % result.length || result.length }));
      const largest = gaps.reduce((best, gap) => gap.length > best.length ? gap : best);
      const insertion = (largest.start + Math.max(1, Math.ceil(largest.length / 2))) % result.length;
      result.splice(insertion, 0, item);
    }
  }
  const first = result.findIndex((item) => /вейксерф|wakesurf/i.test(item.label));
  return first > 0 ? [...result.slice(first), ...result.slice(0, first)] : result;
}
