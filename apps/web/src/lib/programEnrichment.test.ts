import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  aggregatorLinkLabel,
  enrichmentCaption,
  formatDistanceKm,
  formatEnrichmentDate,
  isAccommodationEnrichment,
  isSafeHttpUrl,
  sourceLinkLabel,
  splitHotelGroups,
} from "./programEnrichment";

describe("programEnrichment formatters", () => {
  it("formats checkedAt as dd.mm.yyyy in the recommendation caption", () => {
    assert.equal(formatEnrichmentDate("2026-10-01T00:00:00.000Z"), "01.10.2026");
    assert.equal(formatEnrichmentDate("not a date"), "");
    assert.equal(enrichmentCaption("2026-03-09"), "Рекомендации MyWave · по открытым источникам, проверено 09.03.2026");
  });

  it("shows aggregator rating only with a scale from the source", () => {
    assert.equal(
      aggregatorLinkLabel({ name: "yandex_travel", url: "https://travel.yandex.ru/h", rating: 4.7, ratingScale: 5 }),
      "Яндекс Путешествия · 4,7/5",
    );
    assert.equal(aggregatorLinkLabel({ name: "ostrovok", url: "https://ostrovok.ru/h", rating: 9, ratingScale: 10 }), "Островок · 9/10");
    assert.equal(aggregatorLinkLabel({ name: "ostrovok", url: "https://ostrovok.ru/h", rating: 9 }), "Островок");
  });

  it("formats distances and splits hotel groups", () => {
    assert.equal(formatDistanceKm(0.8), "~0,8 км");
    assert.equal(formatDistanceKm(3), "~3 км");
    assert.equal(formatDistanceKm(undefined), "");
    const groups = splitHotelGroups([
      { name: "A", group: "top" },
      { name: "B", group: "nearby", distanceKm: 1 },
      { name: "C", group: "top" },
    ]);
    assert.deepEqual(groups.top.map((h) => h.name), ["A", "C"]);
    assert.deepEqual(groups.nearby.map((h) => h.name), ["B"]);
  });

  it("labels sources and guards URLs", () => {
    assert.equal(sourceLinkLabel({ url: "https://www.sheregesh.ru/x", accessedAt: "2026-10-01" }), "sheregesh.ru");
    assert.equal(sourceLinkLabel({ url: "https://a.ru", title: " Гид ", accessedAt: "2026-10-01" }), "Гид");
    assert.equal(isSafeHttpUrl("javascript:alert(1)"), false);
    assert.equal(isSafeHttpUrl("https://ostrovok.ru/"), true);
  });

  it("distinguishes accommodation from text enrichments", () => {
    assert.equal(isAccommodationEnrichment({ locationPoint: { label: "x" }, hotels: [], sources: [], checkedAt: "" }), true);
    assert.equal(isAccommodationEnrichment({ text: "x", sources: [], checkedAt: "" }), false);
  });
});
