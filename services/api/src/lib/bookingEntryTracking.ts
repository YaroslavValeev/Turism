/**
 * G4.1: разбор `booking.sourceCampaign` (pipe-формат) и дублирующей строки в `notes` (`[tracking] ...`).
 * Используется в отчётах по входам без миграции схемы.
 */

export type ParsedBookingEntry = {
  entryType: string | null;
  entryId: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  exploreType: string | null;
  exploreSlug: string | null;
};

const EMPTY: ParsedBookingEntry = {
  entryType: null,
  entryId: null,
  utmSource: null,
  utmMedium: null,
  exploreType: null,
  exploreSlug: null,
};

function setFromKeyValue(out: ParsedBookingEntry, key: string, val: string): void {
  const v = val.trim();
  if (!v) return;
  switch (key) {
    case "entry_type":
      out.entryType = v;
      return;
    case "entry_id":
      out.entryId = v;
      return;
    case "utm_source":
      out.utmSource = v;
      return;
    case "utm_medium":
      out.utmMedium = v;
      return;
    case "explore_type":
      out.exploreType = v;
      return;
    case "explore_slug":
      out.exploreSlug = v;
      return;
    default:
      return;
  }
}

/** Формат хранения: `части|key=value|...` — значения с `=` берём с первого `=`. */
export function parseSourceCampaign(raw: string | null | undefined): ParsedBookingEntry {
  const out: ParsedBookingEntry = { ...EMPTY };
  if (!raw?.trim()) return out;
  for (const segment of raw.split("|")) {
    const s = segment.trim();
    if (!s.includes("=")) continue;
    const eq = s.indexOf("=");
    const key = s.slice(0, eq).trim();
    const val = s.slice(eq + 1);
    setFromKeyValue(out, key, val);
  }
  return out;
}

/** Поддержка: `[tracking] entry_type=blog, entry_id=...` в `booking.notes`. */
export function parseTrackingFromNotes(notes: string | null | undefined): ParsedBookingEntry {
  const out: ParsedBookingEntry = { ...EMPTY };
  if (!notes?.trim()) return out;
  const m = /\[tracking\]\s*([^\n]+)/i.exec(notes);
  if (!m) return out;
  for (const piece of m[1].split(",")) {
    const p = piece.trim();
    if (!p.includes("=")) continue;
    const eq = p.indexOf("=");
    const key = p.slice(0, eq).trim();
    const val = p.slice(eq + 1);
    setFromKeyValue(out, key, val);
  }
  return out;
}

export function mergeParsedEntryPrimary(
  a: ParsedBookingEntry,
  b: ParsedBookingEntry,
): ParsedBookingEntry {
  return {
    entryType: a.entryType ?? b.entryType,
    entryId: a.entryId ?? b.entryId,
    utmSource: a.utmSource ?? b.utmSource,
    utmMedium: a.utmMedium ?? b.utmMedium,
    exploreType: a.exploreType ?? b.exploreType,
    exploreSlug: a.exploreSlug ?? b.exploreSlug,
  };
}

export function effectiveEntryFromBooking(row: {
  sourceCampaign: string | null;
  notes: string | null;
}): ParsedBookingEntry {
  return mergeParsedEntryPrimary(parseSourceCampaign(row.sourceCampaign), parseTrackingFromNotes(row.notes));
}

export function entryBucketKey(p: ParsedBookingEntry): string | null {
  if (p.entryType && p.entryId) return `${p.entryType}\t${p.entryId}`;
  return null;
}

type Acc = {
  count: number;
  first: Date;
  last: Date;
  entryType: string;
  entryId: string;
  lastExploreType: string | null;
  lastExploreSlug: string | null;
};

export type ContentEntryReportRow = {
  entryType: string;
  entryId: string;
  bookingCount: number;
  firstCreatedAt: string;
  lastCreatedAt: string;
  exploreType: string | null;
  exploreSlug: string | null;
};

export type ContentEntryReportTotals = {
  bookingsInRange: number;
  withEntryPair: number;
  entryIncomplete: number;
  noEntryTracking: number;
};

export function aggregateContentEntryBookings(
  rows: Array<{ sourceCampaign: string | null; notes: string | null; createdAt: Date }>,
): { totals: ContentEntryReportTotals; rows: ContentEntryReportRow[] } {
  const map = new Map<string, Acc>();
  let withEntryPair = 0;
  let entryIncomplete = 0;
  let noEntryTracking = 0;

  for (const b of rows) {
    const p = effectiveEntryFromBooking(b);
    const key = entryBucketKey(p);
    if (!key) {
      if (p.entryType || p.entryId) entryIncomplete += 1;
      else noEntryTracking += 1;
      continue;
    }
    withEntryPair += 1;
    const existing = map.get(key);
    const t = b.createdAt;
    if (!existing) {
      map.set(key, {
        count: 1,
        first: t,
        last: t,
        entryType: p.entryType!,
        entryId: p.entryId!,
        lastExploreType: p.exploreType,
        lastExploreSlug: p.exploreSlug,
      });
    } else {
      existing.count += 1;
      if (t < existing.first) existing.first = t;
      if (t >= existing.last) {
        existing.last = t;
        if (p.exploreType) existing.lastExploreType = p.exploreType;
        if (p.exploreSlug) existing.lastExploreSlug = p.exploreSlug;
      }
    }
  }

  const list = Array.from(map.values())
    .map((a) => ({
      entryType: a.entryType,
      entryId: a.entryId,
      bookingCount: a.count,
      firstCreatedAt: a.first.toISOString(),
      lastCreatedAt: a.last.toISOString(),
      exploreType: a.lastExploreType,
      exploreSlug: a.lastExploreSlug,
    }))
    .sort((x, y) => y.bookingCount - x.bookingCount);

  return {
    totals: {
      bookingsInRange: rows.length,
      withEntryPair,
      entryIncomplete,
      noEntryTracking,
    },
    rows: list,
  };
}
