import { describe, expect, it } from "vitest";
import {
  buildDraftTexts,
  collectMissingFields,
  CONTENT_DRAFT_MODEL_VERSION,
  CONTENT_DRAFT_PROMPT_VERSION,
} from "./draft.templates";

describe("draft.templates", () => {
  const base = {
    title: "Кэмп на выходные",
    eventType: "camp",
    discipline: "wakesurf",
    descriptionShort: "Коротко о событии.",
    descriptionFull: "Полное описание из источника.",
    country: "Россия",
    region: "Краснодарский край",
    city: "Сочи",
    venue: null,
    startDate: new Date("2026-05-01T00:00:00.000Z"),
    endDate: new Date("2026-05-03T00:00:00.000Z"),
    durationDays: 3,
    level: "beginner",
    priceFrom: 15000,
    currency: "RUB",
    organizerName: "Test Org",
    bookingUrl: "https://example.com/book",
    imageUrl: null,
    confidenceScore: 0.8,
  };

  it("сохраняет ссылку на источник в тексте", () => {
    const out = buildDraftTexts({
      draftType: "telegram_post",
      normalized: base,
      sourceUrl: "https://t.me/c/123/456",
      sourceName: "TG",
      missingFields: [],
    });
    expect(out.longCopy).toContain("https://t.me/c/123/456");
    expect(out.cta).toContain("https://example.com/book");
  });

  it("помечает отсутствующие поля", () => {
    const out = buildDraftTexts({
      draftType: "site_announce",
      normalized: { ...base, title: null, priceFrom: null },
      sourceUrl: null,
      sourceName: "RSS",
      missingFields: collectMissingFields({ ...base, title: null, priceFrom: null }),
    });
    expect(out.shortCopy).toContain("не извлечено");
    expect(collectMissingFields({ ...base, title: null })).toContain("title");
  });

  it("версии промпта/модели зафиксированы для воспроизводимости", () => {
    expect(CONTENT_DRAFT_PROMPT_VERSION).toMatch(/^content-draft-template-/);
    expect(CONTENT_DRAFT_MODEL_VERSION).toContain("deterministic");
  });
});
