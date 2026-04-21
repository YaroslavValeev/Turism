/** Сопоставление подписок с программой по filters (JSON). */

export type NotifyFilters = {
  discipline?: string | null;
  region?: string | null;
  seasonMonth?: number | null;
};

function norm(s: string): string {
  return s.trim().toLowerCase();
}

export function parseNotifyFilters(raw: unknown): NotifyFilters {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return {};
  const o = raw as Record<string, unknown>;
  return {
    discipline: o.discipline == null ? undefined : String(o.discipline),
    region: o.region == null ? undefined : String(o.region),
    seasonMonth: o.seasonMonth == null || o.seasonMonth === "" ? undefined : Number(o.seasonMonth),
  };
}

export function subscriptionMatchesProgramForEvent(
  subscriptionType: string,
  eventType: string,
  filtersJson: unknown,
  program: { discipline: string; region: string; startDate: Date },
): boolean {
  if (eventType === "program_upcoming_start" && subscriptionType !== "seasonal") return false;
  if (eventType === "program_dates_updated" && subscriptionType !== "program_updates") return false;

  const f = parseNotifyFilters(filtersJson);
  if (f.discipline != null && String(f.discipline).trim() !== "") {
    const want = norm(String(f.discipline));
    const disc = norm(program.discipline);
    if (!disc.includes(want) && !want.includes(disc)) return false;
  }
  if (f.region != null && String(f.region).trim() !== "") {
    const want = norm(String(f.region));
    const reg = norm(program.region);
    if (!reg.includes(want)) return false;
  }
  if (f.seasonMonth != null && Number.isFinite(f.seasonMonth)) {
    const m = program.startDate.getUTCMonth() + 1;
    if (m !== f.seasonMonth) return false;
  }
  return true;
}
