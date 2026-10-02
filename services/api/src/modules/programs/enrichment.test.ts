import { describe, expect, it } from "vitest";
import {
  normalizeHotelName,
  pickPublicEnrichment,
  validateEnrichmentInput,
  type EnrichmentRowLike,
} from "./enrichment";

const SOURCES = [{ url: "https://sheregesh.ru/hotels", title: "Шерегеш — размещение", accessedAt: "2026-10-01" }];
const LOCATION = { label: "Сектор Е, Шерегеш", lat: 52.9467, lng: 87.9767 };
const LONG_TEXT =
  "Трансфер из аэропорта Новокузнецка до Шерегеша занимает около трёх часов; есть рейсовые автобусы и такси по предзаказу.";

function top(i: number, overrides: Record<string, unknown> = {}) {
  return {
    name: `Отель Гора ${i}`,
    group: "top",
    siteUrl: `https://hotel-gora-${i}.ru`,
    aggregator: { name: "yandex_travel", url: `https://travel.yandex.ru/hotels/kemerovo-oblast/gora-${i}/`, rating: 4.7, ratingScale: 5, reviewsCount: 120 },
    ...overrides,
  };
}

function nearby(i: number, overrides: Record<string, unknown> = {}) {
  return {
    name: `Гостевой дом ${i}`,
    group: "nearby",
    aggregator: { name: "ostrovok", url: `https://ostrovok.ru/hotel/russia/sheregesh/gd-${i}/` },
    distanceKm: 0.8,
    ...overrides,
  };
}

function accommodation(hotels: unknown[], extra: Record<string, unknown> = {}) {
  return validateEnrichmentInput("accommodation", { locationPoint: LOCATION, hotels, ...extra }, SOURCES);
}

describe("validateEnrichmentInput — accommodation v2", () => {
  it("accepts top + nearby groups and normalizes the payload", () => {
    const result = accommodation([top(1), nearby(1)], { summary: " Гостиницы у подъёмников " });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.content).toMatchObject({
      summary: "Гостиницы у подъёмников",
      locationPoint: LOCATION,
      hotels: [{ name: "Отель Гора 1", group: "top" }, { name: "Гостевой дом 1", group: "nearby", distanceKm: 0.8 }],
    });
  });

  it("requires locationPoint.label and paired coordinates", () => {
    expect(validateEnrichmentInput("accommodation", { hotels: [top(1)] }, SOURCES).ok).toBe(false);
    expect(accommodation([top(1)], { locationPoint: { label: " " } }).ok).toBe(false);
    expect(accommodation([top(1)], { locationPoint: { label: "Шерегеш", lat: 52.9 } }).ok).toBe(false);
    expect(accommodation([top(1)], { locationPoint: { label: "Шерегеш" } }).ok).toBe(true);
  });

  it("requires aggregator rating with scale for top hotels", () => {
    expect(accommodation([top(1, { aggregator: undefined })]).ok).toBe(false);
    expect(accommodation([top(1, { aggregator: { name: "yandex_travel", url: "https://travel.yandex.ru/h/1" } })]).ok).toBe(false);
  });

  it("requires 0 < distanceKm <= 5 for nearby hotels", () => {
    expect(accommodation([nearby(1, { distanceKm: undefined })]).ok).toBe(false);
    expect(accommodation([nearby(1, { distanceKm: 0 })]).ok).toBe(false);
    expect(accommodation([nearby(1, { distanceKm: 5.1 })]).ok).toBe(false);
    expect(accommodation([nearby(1, { distanceKm: 5 })]).ok).toBe(true);
  });

  it("limits each group to 5 and total to 10", () => {
    expect(accommodation([1, 2, 3, 4, 5, 6].map((i) => top(i))).ok).toBe(false);
    expect(accommodation([1, 2, 3, 4, 5, 6].map((i) => nearby(i))).ok).toBe(false);
    expect(accommodation([...[1, 2, 3, 4, 5].map((i) => top(i)), ...[1, 2, 3, 4, 5].map((i) => nearby(i))]).ok).toBe(true);
  });

  it("rejects duplicate hotels across groups by normalized name", () => {
    const result = accommodation([top(1, { name: "«Отель Гора» 1" }), nearby(1, { name: "отель  гора-1" })]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.join(" ")).toMatch(/дубль отеля hotels\[0\] по названию/);
  });

  it("rejects duplicate hotels across groups by site or aggregator url", () => {
    const bySite = accommodation([top(1), nearby(1, { siteUrl: "https://www.hotel-gora-1.ru/" })]);
    expect(bySite.ok).toBe(false);
    const byAggregator = accommodation([
      top(1),
      nearby(1, { aggregator: { name: "yandex_travel", url: "https://travel.yandex.ru/hotels/kemerovo-oblast/gora-1?utm=x" } }),
    ]);
    expect(byAggregator.ok).toBe(false);
  });

  it("rejects aggregator host mismatch and lookalike hosts", () => {
    const mismatch = accommodation([top(1, { aggregator: { name: "ostrovok", url: "https://travel.yandex.ru/hotels/x/", rating: 9, ratingScale: 10 } })]);
    expect(mismatch.ok).toBe(false);
    if (!mismatch.ok) expect(mismatch.errors.join(" ")).toMatch(/хост не совпадает с ostrovok\.ru/);
    const lookalike = accommodation([top(1, { aggregator: { name: "yandex_travel", url: "https://travel.yandex.ru.evil.com/x", rating: 4, ratingScale: 5 } })]);
    expect(lookalike.ok).toBe(false);
    const subdomain = accommodation([top(1, { aggregator: { name: "ostrovok", url: "https://www.ostrovok.ru/hotel/x/", rating: 9.1, ratingScale: 10 } })]);
    expect(subdomain.ok).toBe(true);
  });

  it("rejects rating outside 0..scale", () => {
    expect(accommodation([top(1, { aggregator: { name: "yandex_travel", url: "https://travel.yandex.ru/h/", rating: 5.5, ratingScale: 5 } })]).ok).toBe(false);
  });

  it("rejects private and localhost URLs", () => {
    expect(validateEnrichmentInput("transfer", { text: LONG_TEXT }, [{ url: "http://localhost/x", accessedAt: "2026-10-01" }]).ok).toBe(false);
    expect(validateEnrichmentInput("transfer", { text: LONG_TEXT }, [{ url: "http://192.168.1.5/x", accessedAt: "2026-10-01" }]).ok).toBe(false);
    expect(accommodation([top(1, { siteUrl: "http://10.0.0.1/" })]).ok).toBe(false);
    expect(validateEnrichmentInput("transfer", { text: LONG_TEXT }, [{ url: "ftp://sheregesh.ru/x", accessedAt: "2026-10-01" }]).ok).toBe(false);
  });

  it("normalizes hotel names for duplicate detection", () => {
    expect(normalizeHotelName("  «Ёлка» Отель ")).toBe(normalizeHotelName("елка отель"));
  });
});

describe("validateEnrichmentInput — transfer / equipment", () => {
  it("enforces text length limits", () => {
    expect(validateEnrichmentInput("transfer", { text: "Коротко" }, SOURCES).ok).toBe(false);
    expect(validateEnrichmentInput("equipment", { text: "a".repeat(1501) }, SOURCES).ok).toBe(false);
    expect(validateEnrichmentInput("equipment", { text: "a".repeat(50) }, SOURCES).ok).toBe(true);
    expect(validateEnrichmentInput("transfer", { text: LONG_TEXT }, SOURCES).ok).toBe(true);
  });

  it("requires at least one source and a known field", () => {
    expect(validateEnrichmentInput("transfer", { text: LONG_TEXT }, []).ok).toBe(false);
    expect(validateEnrichmentInput("transfer", { text: LONG_TEXT }, [{ url: "https://a.ru/x" }]).ok).toBe(false);
    expect(validateEnrichmentInput("food", { text: LONG_TEXT }, SOURCES).ok).toBe(false);
  });
});

describe("pickPublicEnrichment", () => {
  const rows: EnrichmentRowLike[] = [
    { field: "accommodation", status: "approved", contentJson: { locationPoint: LOCATION, hotels: [top(1)] }, sourcesJson: SOURCES, checkedAt: new Date("2026-10-01T00:00:00Z") },
    { field: "transfer", status: "approved", contentJson: { text: LONG_TEXT }, sourcesJson: SOURCES, checkedAt: "2026-10-01" },
    { field: "transfer", status: "approved", contentJson: { text: `${LONG_TEXT} Старое.` }, sourcesJson: SOURCES, checkedAt: "2026-09-01" },
    { field: "equipment", status: "draft", contentJson: { text: "a".repeat(60) }, sourcesJson: SOURCES, checkedAt: "2026-10-01" },
  ];

  it("returns every approved field regardless of organizer data, first row per field wins", () => {
    const result = pickPublicEnrichment(rows);
    expect(Object.keys(result).sort()).toEqual(["accommodation", "transfer"]);
    expect(result.accommodation).toMatchObject({ locationPoint: LOCATION, hotels: [{ name: "Отель Гора 1" }], checkedAt: "2026-10-01T00:00:00.000Z" });
    expect(result.transfer).toMatchObject({ text: LONG_TEXT });
    expect(result.accommodation?.sources[0].url).toBe("https://sheregesh.ru/hotels");
  });

  it("drops approved rows whose stored content is invalid (e.g. legacy v1 accommodation)", () => {
    expect(pickPublicEnrichment([{ ...rows[1], sourcesJson: [] }])).toEqual({});
    expect(pickPublicEnrichment([{ ...rows[0], contentJson: { hotels: [{ name: "x" }] } }])).toEqual({});
  });
});
