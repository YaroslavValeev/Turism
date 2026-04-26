/**
 * Схлопывание дубликатов «одно и то же событие» в списке программ (разные сущности
 * с одними датами/гео после парсинга соцсетей и т.д.).
 *
 * Сигнатура события: окно дат, длительность, регион, уточнение локации, организатор, дисциплина.
 * Для пропущенного организатора подпись всё равно совпадёт, если остальное совпадает
 * (типично — несколько «постов» об одном кэмпе).
 *
 * «Победить» в группе: карточка с более полной коммерческой/операторской приоритетом
 * (цена, медиа, витринная пометка, не сырой автопост).
 */

function norm(s: string | null | undefined): string {
  return String(s ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[·,;|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function dayKey(iso: string | null | undefined): string {
  const t = String(iso ?? "").trim();
  if (!t) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return norm(t);
  return d.toISOString().slice(0, 10);
}

function organizerKey(p: {
  organizer?: { id?: string; displayName: string } | null;
}): string {
  const id = p.organizer?.id?.trim();
  if (id) return `id:${id}`;
  return norm(p.organizer?.displayName) || "";
}

/** «Качество» сущности для витрины: что выглядит ближе к нормальной карточке, а не к сырому сниппету. */
function listingQualityScore(p: {
  priceFromRub: number | null;
  isStarred?: boolean;
  media?: { id?: string; url: string; mediaType: string }[];
  autoPublished?: boolean;
  sourceType?: string | null;
  title: string;
}): number {
  let s = 0;
  if (typeof p.priceFromRub === "number" && p.priceFromRub > 0) s += 5;
  if (p.isStarred) s += 2;
  const m = p.media?.length ?? 0;
  s += Math.min(3, m);
  if (p.autoPublished === false) s += 1;
  const st = (p.sourceType ?? "").toLowerCase();
  if (st && /instagram|telegram|vk|social|raw|ingestion/.test(st)) s -= 1;
  if (st && (st === "site" || st === "operator" || st === "manual" || st === "organizer")) s += 1;
  const t = p.title.replace(/\s+/g, " ").trim();
  if (t.length >= 24 && t.length <= 200) s += 1;
  if (t.length < 18) s -= 0.5;
  return s;
}

/**
 * Стабильная сигнатура одного «события/выезда» для витрины.
 * Не использует title — дубликаты с разными подписи поста схлопываются.
 */
export function programEventDisplaySignature(p: {
  startDate: string;
  endDate: string;
  durationDays: number;
  region: string;
  exactLocation?: string | null;
  discipline: string;
  organizer?: { id?: string; displayName: string } | null;
}): string {
  return [
    dayKey(p.startDate),
    dayKey(p.endDate),
    String(p.durationDays),
    norm(p.region),
    norm(p.exactLocation) || "",
    organizerKey(p) || "",
    norm(p.discipline) || "—",
  ].join("\u241F");
}

type SigProgram = { id: string; title: string; priceFromRub: number | null; discipline: string; region: string; startDate: string; endDate: string; durationDays: number; exactLocation?: string | null; isStarred?: boolean; media?: { id?: string; url: string; mediaType: string }[]; autoPublished?: boolean; sourceType?: string | null; organizer?: { id?: string; displayName: string } | null };

export function dedupeProgramListingsByEvent<T extends SigProgram>(programs: T[]): T[] {
  if (programs.length < 2) return programs;
  const best = new Map<string, T>();
  for (const p of programs) {
    const sig = programEventDisplaySignature(p);
    const prev = best.get(sig);
    if (!prev) {
      best.set(sig, p);
      continue;
    }
    const a = listingQualityScore(prev);
    const b = listingQualityScore(p);
    if (b > a) best.set(sig, p);
    else if (b === a) {
      if (p.id < prev.id) best.set(sig, p);
    }
  }
  const seen = new Set<T>();
  const order: T[] = [];
  for (const p of programs) {
    const chosen = best.get(programEventDisplaySignature(p))!;
    if (!seen.has(chosen)) {
      seen.add(chosen);
      order.push(chosen);
    }
  }
  return order;
}
