import { describe, expect, it } from "vitest";
import { applyEnduroRaceTaxonomy, type IngestionTaxonomy } from "./taxonomy";

const SOURCE_NAME = "Анонсы эндуро гонок";
const EMPTY_TAXONOMY: IngestionTaxonomy = {
  eventType: null,
  discipline: null,
};

describe("enduro race ingestion taxonomy", () => {
  it.each([
    "08 августа 2026 – Суперэндуро Республика Беларусь",
    'МЕСТО ПРОВЕДЕНИЯ ГОНКИ "ОХОТА НА IRBISA 2" ИЗМЕНЕНО',
    "Grand Enduro Sprint: second stage",
    "Motorcycle race championship 2026",
  ])("classifies Russian and English motorcycle race signals: %s", (text) => {
    expect(applyEnduroRaceTaxonomy(SOURCE_NAME, text, EMPTY_TAXONOMY)).toEqual({
      eventType: "race",
      discipline: "enduro",
    });
  });

  it("classifies a dated calendar row that relies on the curated source context", () => {
    expect(
      applyEnduroRaceTaxonomy(
        SOURCE_NAME,
        "15 августа 2026 – Тропа лешего Ивановская обл.",
        EMPTY_TAXONOMY,
      ),
    ).toEqual({
      eventType: "race",
      discipline: "enduro",
    });
  });

  it("replaces generic keyword false positives inside a confirmed race announcement", () => {
    expect(
      applyEnduroRaceTaxonomy(SOURCE_NAME, "Тренировка перед гонкой 26 июля 2026", {
        eventType: "training",
        discipline: null,
      }),
    ).toEqual({
      eventType: "race",
      discipline: "enduro",
    });
  });

  it("does not apply source-specific taxonomy to other sources", () => {
    const current = {
      eventType: "trip",
      discipline: "mtb",
    };

    expect(applyEnduroRaceTaxonomy("Новости мотоспорта", "Grand Enduro race", current)).toBe(current);
  });

  it.each([
    "Итоги недели и новые фотографии",
    "Скидки действуют до 15 августа 2026",
  ])("does not classify a non-event post from the curated source: %s", (text) => {
    const current = {
      eventType: null,
      discipline: null,
    };

    expect(applyEnduroRaceTaxonomy(SOURCE_NAME, text, current)).toBe(current);
  });
});
