import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { Program, ProgramMedia } from "@prisma/client";
import { canPublish, canPublishAutopilot, programIncludeForPublishGate } from "./publishGate";

type GateInput = Parameters<typeof canPublishAutopilot>[0];

function programFixture(overrides: Partial<GateInput> = {}): GateInput {
  const media: ProgramMedia[] = [
    {
      id: "media_test_1",
      programId: "prog_test_1",
      mediaType: "image",
      url: "https://cdn.example.com/cover.jpg",
      caption: null,
    },
  ];
  const base = {
    id: "prog_test_1",
    organizerId: "org_test_1",
    title: "Выездной кэмп wakesurf Красная Поляна",
    discipline: "wakesurf",
    region: "Сочи",
    exactLocation: null,
    startDate: new Date("2026-07-01T00:00:00.000Z"),
    endDate: new Date("2026-07-05T00:00:00.000Z"),
    durationDays: 5,
    formatType: null,
    audienceFit: "Новички",
    levelRequired: "beginner",
    riskLevel: "medium",
    priceFromRub: null,
    capacityTotal: null,
    spotsAvailable: null,
    isStarred: false,
    currency: "RUB",
    inclusions: "Проживание",
    exclusions: null,
    gearRequirements: "Гидрокостюм",
    medicalLimitations: "",
    itineraryDayByDay: null,
    organizerName: "Организатор",
    trustReason: null,
    reviewsSummary: null,
    cancellationRules: "Возврат по правилам оферты",
    whatHappensAfterBooking: null,
    cta: "Заявка",
    autoPublished: false,
    sourceId: null,
    sourceType: null,
    sourceUrl: "https://partner.example/events/camp",
    ingestedAt: null,
    updatedFromSourceAt: null,
    reviewStatus: "ok",
    publishStatus: "draft",
    createdAt: new Date(),
    updatedAt: new Date(),
    intakeSource: "ingestion_auto",
    media,
    organizer: { displayName: "Partner Camp" },
  } as unknown as Program & { media: ProgramMedia[]; organizer: { displayName: string } };
  return { ...base, ...overrides };
}

describe("canPublishAutopilot", () => {
  beforeEach(() => {
    delete process.env.INGESTION_E2E_FORCE_GATE;
  });
  afterEach(() => {
    delete process.env.INGESTION_E2E_FORCE_GATE;
  });

  it("пропускает типичную ingestion-карточку с медиа и обязательными полями", () => {
    const r = canPublishAutopilot(programFixture());
    expect(r.ok).toBe(true);
    expect(r.missing).toEqual([]);
  });

  it("не пропускает без медиа/ссылки/контента (source_url_or_content_or_media)", () => {
    const r = canPublishAutopilot(
      programFixture({
        sourceUrl: null,
        cta: null,
        media: [],
        inclusions: null,
        audienceFit: null,
        itineraryDayByDay: null,
      }),
    );
    expect(r.ok).toBe(false);
    expect(r.missing).toContain("source_url_or_content_or_media");
  });

  it("блокирует synthetic по organizer.displayName", () => {
    const r = canPublishAutopilot(
      programFixture({
        organizer: { displayName: "Demo organizer" },
      }),
    );
    expect(r.ok).toBe(false);
    expect(r.missing).toContain("synthetic_markers_detected");
  });

  it.each([
    { field: "gearRequirements", value: "Требует ручного заполнения оператором." },
    { field: "itineraryDayByDay", value: "<style>@media (min-width: 600px) { .card {} }</style>" },
    { field: "audienceFit", value: "font-family: Arial; min-width: 320px; tildacdn.com/raw.css" },
  ])("блокирует placeholder или scraped markup в $field", ({ field, value }) => {
    const r = canPublishAutopilot(programFixture({ [field]: value }));
    expect(r.ok).toBe(false);
    expect(r.missing).toContain("placeholder_or_scraped_markup_detected");
  });

  it("разрешает явное нейтральное unknown-значение", () => {
    const r = canPublishAutopilot(programFixture({ gearRequirements: "Уточняется у организатора после заявки" }));
    expect(r.missing).not.toContain("placeholder_or_scraped_markup_detected");
  });

  it("при INGESTION_E2E_FORCE_GATE=1 всегда отказ (детерминированный e2e)", () => {
    process.env.INGESTION_E2E_FORCE_GATE = "1";
    const r = canPublishAutopilot(programFixture());
    expect(r.ok).toBe(false);
    expect(r.missing).toContain("e2e_forced_gate");
  });
});

describe("manual publish content quality", () => {
  it("не пропускает операторский placeholder в публичную карточку", () => {
    const r = canPublish(programFixture({ cancellationRules: "TODO: добавить оператором" }));
    expect(r.ok).toBe(false);
    expect(r.missing).toContain("placeholder_or_scraped_markup_detected");
  });
});

describe("programIncludeForPublishGate", () => {
  it("включает media и organizer для Prisma-gate", () => {
    expect(programIncludeForPublishGate).toEqual({
      media: true,
      organizer: { select: { displayName: true } },
    });
  });
});
