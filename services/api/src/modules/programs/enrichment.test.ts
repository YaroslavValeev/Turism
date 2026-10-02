import { describe, expect, it } from "vitest";
import {
  organizerFieldsFromProgram,
  pickPublicEnrichment,
  validateEnrichmentInput,
  type EnrichmentRowLike,
} from "./enrichment";

const SOURCES = [{ url: "https://sheregesh.ru/hotels", title: "Шерегеш — размещение", accessedAt: "2026-10-01" }];
const LONG_TEXT =
  "Трансфер из аэропорта Новокузнецка до Шерегеша занимает около трёх часов; есть рейсовые автобусы и такси по предзаказу.";

function hotel(overrides: Record<string, unknown> = {}) {
  return {
    name: "Отель Гора",
    siteUrl: "https://hotel-gora.example.ru",
    aggregator: { name: "yandex_travel", url: "https://travel.yandex.ru/hotels/kemerovo-oblast/gora/", rating: 4.7, ratingScale: 5, reviewsCount: 120 },
    ...overrides,
  };
}

describe("validateEnrichmentInput", () => {
  it("accepts a valid accommodation payload and normalizes it", () => {
    const result = validateEnrichmentInput("accommodation", { summary: " Гостиницы у подъёмников ", hotels: [hotel()] }, SOURCES);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.content).toMatchObject({ summary: "Гостиницы у подъёмников", hotels: [{ name: "Отель Гора" }] });
    expect(result.sources).toHaveLength(1);
  });

  it("accepts ostrovok subdomain hosts", () => {
    const result = validateEnrichmentInput(
      "accommodation",
      { hotels: [hotel({ aggregator: { name: "ostrovok", url: "https://www.ostrovok.ru/hotel/russia/sheregesh/x/", rating: 9.1, ratingScale: 10 } })] },
      SOURCES,
    );
    expect(result.ok).toBe(true);
  });

  it("rejects aggregator host mismatch", () => {
    const result = validateEnrichmentInput(
      "accommodation",
      { hotels: [hotel({ aggregator: { name: "ostrovok", url: "https://travel.yandex.ru/hotels/x/" } })] },
      SOURCES,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.join(" ")).toMatch(/хост не совпадает с ostrovok\.ru/);
  });

  it("rejects lookalike aggregator hosts", () => {
    const result = validateEnrichmentInput(
      "accommodation",
      { hotels: [hotel({ aggregator: { name: "yandex_travel", url: "https://travel.yandex.ru.evil.com/x" } })] },
      SOURCES,
    );
    expect(result.ok).toBe(false);
  });

  it("rejects private and localhost URLs", () => {
    expect(validateEnrichmentInput("transfer", { text: LONG_TEXT }, [{ url: "http://localhost/x", accessedAt: "2026-10-01" }]).ok).toBe(false);
    expect(validateEnrichmentInput("transfer", { text: LONG_TEXT }, [{ url: "http://192.168.1.5/x", accessedAt: "2026-10-01" }]).ok).toBe(false);
    expect(validateEnrichmentInput("accommodation", { hotels: [hotel({ siteUrl: "http://10.0.0.1/" })] }, SOURCES).ok).toBe(false);
    expect(validateEnrichmentInput("transfer", { text: LONG_TEXT }, [{ url: "ftp://sheregesh.ru/x", accessedAt: "2026-10-01" }]).ok).toBe(false);
  });

  it("rejects more than 10 hotels", () => {
    const hotels = Array.from({ length: 11 }, (_, i) => hotel({ name: `Отель ${i}` }));
    const result = validateEnrichmentInput("accommodation", { hotels }, SOURCES);
    expect(result.ok).toBe(false);
  });

  it("rejects rating outside 0..scale and rating without scale", () => {
    const out = validateEnrichmentInput(
      "accommodation",
      { hotels: [hotel({ aggregator: { name: "yandex_travel", url: "https://travel.yandex.ru/h/", rating: 5.5, ratingScale: 5 } })] },
      SOURCES,
    );
    expect(out.ok).toBe(false);
    const noScale = validateEnrichmentInput(
      "accommodation",
      { hotels: [hotel({ aggregator: { name: "yandex_travel", url: "https://travel.yandex.ru/h/", rating: 4 } })] },
      SOURCES,
    );
    expect(noScale.ok).toBe(false);
  });

  it("enforces text length limits for transfer/equipment", () => {
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
    { field: "accommodation", status: "approved", contentJson: { hotels: [hotel()] }, sourcesJson: SOURCES, checkedAt: new Date("2026-10-01T00:00:00Z") },
    { field: "transfer", status: "approved", contentJson: { text: LONG_TEXT }, sourcesJson: SOURCES, checkedAt: "2026-10-01" },
    { field: "equipment", status: "draft", contentJson: { text: "a".repeat(60) }, sourcesJson: SOURCES, checkedAt: "2026-10-01" },
  ];

  it("returns only approved rows for fields the organizer left empty", () => {
    const result = pickPublicEnrichment({ accommodation: null, transfer: "Трансфер из Таштагола включён", equipment: null }, rows);
    expect(Object.keys(result)).toEqual(["accommodation"]);
    expect(result.accommodation).toMatchObject({ hotels: [{ name: "Отель Гора" }], checkedAt: "2026-10-01T00:00:00.000Z" });
    expect(result.accommodation?.sources[0].url).toBe("https://sheregesh.ru/hotels");
  });

  it("treats collector placeholders as empty organizer values", () => {
    const result = pickPublicEnrichment({ transfer: "Требует ручного заполнения" }, rows);
    expect(result.transfer).toBeDefined();
  });

  it("drops approved rows whose stored content is invalid", () => {
    const result = pickPublicEnrichment({}, [{ ...rows[1], sourcesJson: [] }]);
    expect(result).toEqual({});
  });

  it("derives organizer values from labeled lines and gear", () => {
    expect(
      organizerFieldsFromProgram({ inclusions: "Ски-пасс\nПроживание: отель у склона", gearRequirements: "  " }),
    ).toEqual({ accommodation: "отель у склона", transfer: null, equipment: "  " });
  });
});
