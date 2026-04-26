import { describe, expect, it } from "vitest";
import {
  aggregateContentEntryBookings,
  entryBucketKey,
  effectiveEntryFromBooking,
  parseSourceCampaign,
  parseTrackingFromNotes,
} from "./bookingEntryTracking";

describe("parseSourceCampaign", () => {
  it("парсит pipe-строку из intake", () => {
    const s =
      "g4_entry_tracking|utm_source=internal|utm_medium=content|entry_type=blog|entry_id=cm_abc|explore_type=discipline|explore_slug=freeride";
    const p = parseSourceCampaign(s);
    expect(p.entryType).toBe("blog");
    expect(p.entryId).toBe("cm_abc");
    expect(p.utmSource).toBe("internal");
    expect(p.utmMedium).toBe("content");
    expect(p.exploreType).toBe("discipline");
  });
  it("парсит explore из intake", () => {
    const s =
      "g4_entry_tracking|utm_source=internal|utm_medium=content|entry_type=explore|entry_id=discipline:freeride|explore_type=discipline|explore_slug=freeride";
    const p = parseSourceCampaign(s);
    expect(p.entryType).toBe("explore");
    expect(p.entryId).toBe("discipline:freeride");
    expect(p.exploreType).toBe("discipline");
    expect(p.exploreSlug).toBe("freeride");
  });
});

describe("parseTrackingFromNotes", () => {
  it("достаёт трекинг из notes", () => {
    const notes = `User text\n\n[tracking] entry_type=blog, entry_id=post1, utm_source=internal, utm_medium=content`;
    const p = parseTrackingFromNotes(notes);
    expect(p.entryType).toBe("blog");
    expect(p.entryId).toBe("post1");
  });
});

describe("effectiveEntryFromBooking", () => {
  it("мёрджит sourceCampaign и notes (приоритет sourceCampaign)", () => {
    const p = effectiveEntryFromBooking({
      sourceCampaign: "entry_type=program|entry_id=pid1|utm_source=internal",
      notes: "[tracking] entry_type=blog, entry_id=old",
    });
    expect(p.entryType).toBe("program");
    expect(p.entryId).toBe("pid1");
  });
});

describe("aggregateContentEntryBookings", () => {
  it("суммирует по entry_type+entry_id", () => {
    const t0 = new Date("2026-01-10T10:00:00.000Z");
    const t1 = new Date("2026-01-11T10:00:00.000Z");
    const { totals, rows } = aggregateContentEntryBookings([
      { sourceCampaign: "entry_type=blog|entry_id=a", notes: null, createdAt: t0 },
      { sourceCampaign: "entry_type=blog|entry_id=a", notes: null, createdAt: t1 },
      { sourceCampaign: null, notes: null, createdAt: t1 },
    ]);
    expect(totals.bookingsInRange).toBe(3);
    expect(totals.withEntryPair).toBe(2);
    expect(totals.noEntryTracking).toBe(1);
    expect(rows[0].bookingCount).toBe(2);
    expect(rows[0].entryType).toBe("blog");
    expect(rows[0].entryId).toBe("a");
  });
});

describe("entryBucketKey", () => {
  it("возвращает null без пары", () => {
    expect(
      entryBucketKey({
        entryType: "blog",
        entryId: null,
        utmSource: null,
        utmMedium: null,
        exploreType: null,
        exploreSlug: null,
      }),
    ).toBeNull();
  });
  it("возвращает стабильный ключ", () => {
    const k = entryBucketKey({
      entryType: "blog",
      entryId: "x",
      utmSource: "internal",
      utmMedium: "content",
      exploreType: null,
      exploreSlug: null,
    });
    expect(k).toBe("blog\tx");
  });
});
