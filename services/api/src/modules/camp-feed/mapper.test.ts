import { describe, expect, it } from "vitest";
import type { Env } from "@mywave/config";
import type { CampProgramRow } from "./mapper";
import { mapProgramToCamp, normalizeAvailabilityStatus, normalizeSports, resolveProgramIdFromCampId } from "./mapper";

const env = {
  PUBLIC_WEB_BASE_URL: "https://mywavetour.ru",
} as Env;

function row(overrides: Partial<CampProgramRow> = {}): CampProgramRow {
  const base = {
    id: "prog_123",
    organizerId: "org_1",
    title: "Wake Camp Turkey October",
    discipline: "wakesurf / wakeboard",
    region: "Antalya",
    exactLocation: "Wake spot name",
    startDate: new Date("2026-10-10T00:00:00.000Z"),
    endDate: new Date("2026-10-17T00:00:00.000Z"),
    durationDays: 8,
    formatType: "camp",
    audienceFit: "Short camp description",
    levelRequired: "beginner, intermediate",
    riskLevel: "medium",
    priceFromRub: 1200,
    capacityTotal: 12,
    spotsAvailable: 2,
    isStarred: false,
    currency: "EUR",
    inclusions: "coaching; boat sets",
    exclusions: "flight",
    gearRequirements: null,
    medicalLimitations: null,
    itineraryDayByDay: "Full camp description",
    organizerName: "Organizer Name",
    trustReason: null,
    reviewsSummary: null,
    cancellationRules: null,
    whatHappensAfterBooking: null,
    cta: null,
    intakeSource: "admin_manual",
    autoPublished: false,
    sourceId: "source_1",
    sourceType: "site",
    sourceUrl: "https://partner.example/camp",
    ingestedAt: null,
    updatedFromSourceAt: new Date("2026-07-07T10:30:00.000Z"),
    reviewStatus: "ok",
    publishStatus: "published",
    createdAt: new Date("2026-07-01T00:00:00.000Z"),
    updatedAt: new Date("2026-07-06T10:30:00.000Z"),
    media: [
      { id: "m1", programId: "prog_123", mediaType: "image", url: "/ingestion-media/camp.jpg", caption: null },
      { id: "m2", programId: "prog_123", mediaType: "video", url: "https://cdn.example/video.mp4", caption: null },
    ],
    organizer: { id: "org_1", displayName: "Organizer Display", verificationStatus: "verified" },
    source: { id: "source_1", name: "Partner", urlOrHandle: "https://partner.example", country: "Turkey", region: "Antalya", language: "ru" },
  } as CampProgramRow;
  return { ...base, ...overrides };
}

describe("camp mapper", () => {
  it("maps Program rows to the Camp contract", () => {
    const camp = mapProgramToCamp(row(), env);
    expect(camp).toMatchObject({
      id: "tour_prog_123",
      title: "Wake Camp Turkey October",
      sport: ["wakesurf", "wakeboard"],
      level: ["beginner", "intermediate"],
      country: "Turkey",
      region: "Antalya",
      start_date: "2026-10-10",
      end_date: "2026-10-17",
      duration_days: 8,
      price_from: 1200,
      currency: "EUR",
      included: ["coaching", "boat sets"],
      not_included: ["flight"],
      organizer_name: "Organizer Name",
      booking_url: "https://partner.example/camp",
      availability_status: "few_spots",
      publication_status: "published",
      audience_language: ["ru"],
      content_rights_status: "partner_allowed",
      source_url: "https://partner.example/camp",
      updated_at: "2026-07-07T10:30:00.000Z",
    });
    expect(camp?.cover_image_url).toBe("https://mywavetour.ru/ingestion-media/camp.jpg");
    expect(camp?.video_url).toBe("https://cdn.example/video.mp4");
  });

  it("drops non-wake programs from the camp feed", () => {
    expect(mapProgramToCamp(row({ discipline: "skiing", title: "Snow Camp" }), env)).toBeNull();
  });

  it("normalizes wake sport aliases", () => {
    expect(normalizeSports({ discipline: "Вейксерф / вейкборд", title: "", formatType: null, audienceFit: null })).toEqual([
      "wakesurf",
      "wakeboard",
    ]);
  });

  it("normalizes availability from capacity fields", () => {
    expect(normalizeAvailabilityStatus({ spotsAvailable: 0, capacityTotal: 10, publishStatus: "published" })).toBe("sold_out");
    expect(normalizeAvailabilityStatus({ spotsAvailable: 1, capacityTotal: 10, publishStatus: "published" })).toBe("few_spots");
    expect(normalizeAvailabilityStatus({ spotsAvailable: 8, capacityTotal: 10, publishStatus: "published" })).toBe("available");
    expect(normalizeAvailabilityStatus({ spotsAvailable: null, capacityTotal: null, publishStatus: "published" })).toBe("unknown");
  });

  it("accepts both external camp id and raw program id for detail lookup", () => {
    expect(resolveProgramIdFromCampId("tour_prog_123")).toBe("prog_123");
    expect(resolveProgramIdFromCampId("prog_123")).toBe("prog_123");
  });
});
