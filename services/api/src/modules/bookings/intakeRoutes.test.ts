import express from "express";
import { createHash } from "node:crypto";
import type { AddressInfo } from "node:net";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "@mywave/config";
import { prisma } from "../../lib/prisma";
import { bookingsRoutes } from "./routes";
import { createDealForBooking } from "../deals/dealService";
import { emitBackendAnalyticsEventBestEffort } from "../analytics/service";

vi.mock("../../lib/prisma", () => ({ prisma: {
  program: { findUnique: vi.fn() },
  booking: { findFirst: vi.fn(), create: vi.fn() },
  contentItem: { findUnique: vi.fn() },
  $executeRaw: vi.fn(),
  $transaction: vi.fn(),
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
  app.use((_error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(500).json({ error: "internal" });
  });
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
    vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => callback(prisma));
    vi.mocked(prisma.$executeRaw).mockResolvedValue(1);
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
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("retains literal consent enforcement before database access", async () => {
    for (const legalConsent of [undefined, false, null, "true", 1]) {
      const result = await post({ ...valid, legalConsent });
      expect(result.status).toBe(400);
      expect(result.data.error).toBe("legal_consent_required");
    }
    expect(prisma.program.findUnique).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
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
    expect(createDealForBooking).not.toHaveBeenCalled();
    expect(emitBackendAnalyticsEventBestEffort).not.toHaveBeenCalled();
  });

  it("still hides unavailable programs and accepts nullable optional fields", async () => {
    vi.mocked(prisma.program.findUnique).mockResolvedValue(null);
    expect((await post({ ...valid, notes: null, sourceChannel: null })).status).toBe(404);
    expect(prisma.booking.create).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("does not accept inquiries for completed published or archived detail pages", async () => {
    for (const publishStatus of ["published", "archived"]) {
      vi.mocked(prisma.program.findUnique).mockResolvedValue({
        id: "program-id", organizerId: "organizer-id", publishStatus,
        startDate: new Date(Date.now() - 3 * 86_400_000), endDate: new Date(Date.now() - 2 * 86_400_000),
        organizer: { verificationStatus: "verified" },
      } as any);
      expect((await post(valid)).status).toBe(404);
    }
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.booking.create).not.toHaveBeenCalled();
    expect(createDealForBooking).not.toHaveBeenCalled();
    expect(emitBackendAnalyticsEventBestEffort).not.toHaveBeenCalled();
  });

  it("locks the validated identity before looking up and creating within a ReadCommitted transaction", async () => {
    const result = await post({ ...valid, programId: " program-id ", guestContact: " qa@example.invalid " });
    expect(result.status).toBe(201);
    const digest = createHash("sha256").update(JSON.stringify([valid.programId, valid.guestContact])).digest();
    const [sql, firstKey, secondKey] = vi.mocked(prisma.$executeRaw).mock.calls[0]!;
    expect(Array.from(sql as TemplateStringsArray).join("?")).toBe("SELECT pg_advisory_xact_lock(?::int, ?::int)");
    expect([firstKey, secondKey]).toEqual([digest.readInt32BE(0), digest.readInt32BE(4)]);
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "ReadCommitted", maxWait: 10_000, timeout: 10_000,
    });
    expect(vi.mocked(prisma.$executeRaw).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(prisma.booking.findFirst).mock.invocationCallOrder[0]!);
    expect(vi.mocked(prisma.booking.findFirst).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(prisma.booking.create).mock.invocationCallOrder[0]!);
    expect(vi.mocked(prisma.booking.create).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(createDealForBooking).mock.invocationCallOrder[0]!);
  });

  it("scopes independent locks by both program and trimmed contact without changing case semantics", async () => {
    for (const body of [valid, { ...valid, guestContact: "QA@example.invalid" }, { ...valid, programId: "other-program" }]) {
      expect((await post(body)).status).toBe(201);
    }
    const keys = vi.mocked(prisma.$executeRaw).mock.calls.map(([, a, b]) => `${a}:${b}`);
    expect(new Set(keys).size).toBe(3);
    expect(vi.mocked(prisma.booking.findFirst).mock.calls[1]![0].where?.guestContact).toBe("QA@example.invalid");
  });

  it("forwards transaction failures without a successful booking response or post-commit effects", async () => {
    vi.mocked(prisma.$executeRaw).mockRejectedValueOnce(new Error("database failure"));
    const result = await post(valid);
    expect(result).toEqual({ status: 500, data: { error: "internal" } });
    expect(prisma.booking.findFirst).not.toHaveBeenCalled();
    expect(prisma.booking.create).not.toHaveBeenCalled();
    expect(createDealForBooking).not.toHaveBeenCalled();
    expect(emitBackendAnalyticsEventBestEffort).not.toHaveBeenCalled();
  });
});
