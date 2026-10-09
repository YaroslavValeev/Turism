import express from "express";
import type { AddressInfo } from "node:net";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "@mywave/config";
import { prisma } from "../../lib/prisma";
import { bookingsRoutes } from "./routes";

vi.mock("../../lib/prisma", () => ({ prisma: {
  program: { findUnique: vi.fn() },
  booking: { findFirst: vi.fn(), create: vi.fn() },
} }));
vi.mock("../deals/dealService", () => ({
  resolveContentItemIdForAttribution: () => null,
  createDealForBooking: vi.fn(), syncDealFromBooking: vi.fn(),
}));
vi.mock("../analytics/service", () => ({ emitBackendAnalyticsEventBestEffort: vi.fn() }));

const env = { ADMIN_JWT_SECRET: "qa-only", PUBLIC_RATE_LIMIT_WINDOW_MS: 60_000, PUBLIC_RATE_LIMIT_MAX: 80 } as Env;
const valid = { programId: "program-id", guestContact: "qa@example.invalid", legalConsent: true };

async function post(body: unknown) {
  const app = express();
  app.use(express.json({ strict: false }));
  app.use("/bookings", bookingsRoutes(env));
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  try {
    const { port } = server.address() as AddressInfo;
    const response = await fetch(`http://127.0.0.1:${port}/bookings`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
    });
    return { status: response.status, data: await response.json() };
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
}

describe("booking intake HTTP regression", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.program.findUnique).mockResolvedValue({
      id: "program-id", organizerId: "organizer-id", publishStatus: "published", reviewStatus: "ok",
      startDate: new Date(), endDate: new Date(Date.now() + 86_400_000),
      organizer: { verificationStatus: "verified" },
    } as any);
    vi.mocked(prisma.booking.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.booking.create).mockImplementation(async (args: any) => ({ id: "booking-id", ...args.data }));
  });

  it("rejects malformed input before all database operations", async () => {
    for (const body of [null, [], {}, { ...valid, guestContact: " \t\u00a0" },
      { ...valid, guestContact: [] }, { ...valid, programId: {} },
      { ...valid, notes: 1 }, { ...valid, sourceCampaign: [] },
      { ...valid, guestContact: "a".repeat(255) }]) {
      expect((await post(body)).status).toBe(400);
    }
    expect(prisma.program.findUnique).not.toHaveBeenCalled();
    expect(prisma.booking.findFirst).not.toHaveBeenCalled();
    expect(prisma.booking.create).not.toHaveBeenCalled();
  });

  it("retains literal consent enforcement before database access", async () => {
    for (const legalConsent of [undefined, false, null, "true", 1]) {
      const result = await post({ ...valid, legalConsent });
      expect(result.status).toBe(400);
      expect(result.data.error).toBe("legal_consent_required");
    }
    expect(prisma.program.findUnique).not.toHaveBeenCalled();
  });

  it("creates a valid inquiry with normalized contact and unchanged attribution", async () => {
    const result = await post({ ...valid, programId: " program-id ", guestContact: " qa@example.invalid ",
      sourceChannel: "program_page", notes: " question ", utmSource: "telegram", entryType: "program", entryId: "program-id" });
    expect(result.status).toBe(201);
    expect(vi.mocked(prisma.booking.create).mock.calls[0]![0].data).toMatchObject({
      programId: "program-id", guestContact: "qa@example.invalid", organizerId: "organizer-id",
      sourceChannel: "program_page", bookingStatus: "new", utmSource: "telegram", legalConsentAt: expect.any(Date),
    });
  });

  it("keeps the duplicate response for a contact with surrounding whitespace", async () => {
    vi.mocked(prisma.booking.findFirst).mockResolvedValue({ id: "existing-id" } as any);
    const result = await post({ ...valid, guestContact: " qa@example.invalid " });
    expect(result).toEqual({ status: 409, data: { error: "Duplicate booking request", bookingId: "existing-id" } });
    expect(vi.mocked(prisma.booking.findFirst).mock.calls[0]![0].where).toMatchObject({ guestContact: "qa@example.invalid" });
    expect(prisma.booking.create).not.toHaveBeenCalled();
  });

  it("still hides unavailable programs and accepts nullable optional fields", async () => {
    vi.mocked(prisma.program.findUnique).mockResolvedValue(null);
    expect((await post({ ...valid, notes: null, sourceChannel: null })).status).toBe(404);
    expect(prisma.booking.create).not.toHaveBeenCalled();
  });
});
