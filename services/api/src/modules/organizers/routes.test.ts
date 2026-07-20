import express from "express";
import type { Server } from "node:http";
import jwt from "jsonwebtoken";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "@mywave/config";

const mocks = vi.hoisted(() => ({
  organizerFindMany: vi.fn(),
  organizerFindUnique: vi.fn(),
  organizerUpdate: vi.fn(),
  organizerEvidenceFindMany: vi.fn(),
  organizerBillingProfileFindUnique: vi.fn(),
  organizerContractFindMany: vi.fn(),
  analyticsEventCount: vi.fn(),
  leadCount: vi.fn(),
  bookingCount: vi.fn(),
  reviewCount: vi.fn(),
  reviewAggregate: vi.fn(),
  organizerScoreSnapshotFindFirst: vi.fn(),
  programScoreSnapshotFindMany: vi.fn(),
  deriveOrganizerPrivileges: vi.fn(),
}));

vi.mock("../../lib/prisma", () => ({
  prisma: {
    organizer: {
      findMany: mocks.organizerFindMany,
      findUnique: mocks.organizerFindUnique,
      update: mocks.organizerUpdate,
    },
    organizerVerificationEvidence: { findMany: mocks.organizerEvidenceFindMany },
    organizerBillingProfile: { findUnique: mocks.organizerBillingProfileFindUnique },
    organizerContract: { findMany: mocks.organizerContractFindMany },
    analyticsEvent: { count: mocks.analyticsEventCount },
    lead: { count: mocks.leadCount },
    booking: { count: mocks.bookingCount },
    review: { count: mocks.reviewCount, aggregate: mocks.reviewAggregate },
    organizerScoreSnapshot: { findFirst: mocks.organizerScoreSnapshotFindFirst },
    programScoreSnapshot: { findMany: mocks.programScoreSnapshotFindMany },
  },
}));

vi.mock("../../lib/audit", () => ({ writeAuditLog: vi.fn() }));
vi.mock("../analytics/service", () => ({ emitBackendAnalyticsEventBestEffort: vi.fn() }));
vi.mock("../billing/service", () => ({ deriveOrganizerPrivileges: mocks.deriveOrganizerPrivileges }));

import { organizersRoutes } from "./routes";

const env = {
  ADMIN_JWT_SECRET: "organizer-routes-test-admin-secret",
} as Env;

const privateOrganizer = {
  id: "organizer-1",
  displayName: "Wave Camp",
  legalStatus: "ooo",
  contactEmail: "private@example.test",
  contactPhone: "+70000000000",
  responseScore: 99,
  verificationStatus: "verified",
  onboardingStatus: "active",
  billingStatus: "billing_connected",
  privilegeStatus: "active",
  commissionRateBps: 300,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-02T00:00:00.000Z"),
};

function adminToken(): string {
  return jwt.sign({ sub: "admin-1", role: "admin" }, env.ADMIN_JWT_SECRET);
}

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}

async function request(path: string, token?: string, method = "GET"): Promise<{ status: number; body: unknown }> {
  const app = express();
  app.use(express.json());
  app.use("/organizers", organizersRoutes(env));

  const server = await new Promise<Server>((resolve) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    await closeServer(server);
    throw new Error("Test server did not bind to a TCP port");
  }

  try {
    const response = await fetch(`http://127.0.0.1:${address.port}${path}`, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(method === "GET" ? {} : { "Content-Type": "application/json" }),
      },
      body: method === "GET" ? undefined : "{}",
    });
    return { status: response.status, body: await response.json() };
  } finally {
    await closeServer(server);
  }
}

describe("organizer routes access control", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.organizerFindMany.mockResolvedValue([privateOrganizer]);
    mocks.organizerFindUnique.mockResolvedValue(privateOrganizer);
    mocks.organizerEvidenceFindMany.mockResolvedValue([]);
    mocks.organizerBillingProfileFindUnique.mockResolvedValue({
      organizerId: privateOrganizer.id,
      billingStatus: privateOrganizer.billingStatus,
    });
    mocks.organizerContractFindMany.mockResolvedValue([]);
    mocks.analyticsEventCount.mockResolvedValue(0);
    mocks.leadCount.mockResolvedValue(0);
    mocks.bookingCount.mockResolvedValue(0);
    mocks.reviewCount.mockResolvedValue(0);
    mocks.reviewAggregate.mockResolvedValue({ _avg: { rating: null } });
    mocks.organizerScoreSnapshotFindFirst.mockResolvedValue(null);
    mocks.programScoreSnapshotFindMany.mockResolvedValue([]);
    mocks.deriveOrganizerPrivileges.mockResolvedValue({
      onboardingStatus: "active",
      billingStatus: "billing_connected",
      privilegeStatus: "active",
      contractStatus: "signed",
    });
  });

  it("returns only the allowlisted public organizer DTO without PII", async () => {
    const response = await request("/organizers");

    expect(response.status).toBe(200);
    expect(response.body).toEqual([{
      id: privateOrganizer.id,
      displayName: privateOrganizer.displayName,
      verificationStatus: privateOrganizer.verificationStatus,
    }]);
    expect(response.body).not.toContainEqual(expect.objectContaining({ contactEmail: expect.anything() }));
    expect(response.body).not.toContainEqual(expect.objectContaining({ contactPhone: expect.anything() }));
    expect(mocks.organizerFindMany).toHaveBeenCalledWith(expect.objectContaining({
      select: { id: true, displayName: true, verificationStatus: true },
    }));
  });

  it("preserves the full organizer list for an authenticated admin", async () => {
    const response = await request("/organizers", adminToken());

    expect(response.status).toBe(200);
    expect(response.body).toEqual([expect.objectContaining({
      id: privateOrganizer.id,
      contactEmail: privateOrganizer.contactEmail,
      billingStatus: privateOrganizer.billingStatus,
    })]);
    expect(mocks.organizerFindMany).toHaveBeenCalledWith(expect.not.objectContaining({ select: expect.anything() }));
  });

  it("rejects an invalid bearer token instead of downgrading to the public list", async () => {
    const response = await request("/organizers", "invalid-token");

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: "Unauthorized", code: "INVALID_TOKEN" });
    expect(mocks.organizerFindMany).not.toHaveBeenCalled();
  });

  it.each([
    "/organizers/organizer-1",
    "/organizers/organizer-1/evidence",
    "/organizers/organizer-1/billing-profile",
    "/organizers/organizer-1/contracts",
    "/organizers/organizer-1/privileges",
    "/organizers/organizer-1/analytics/overview",
  ])("requires admin auth for sensitive GET %s", async (path) => {
    const response = await request(path);

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: "Unauthorized", code: "MISSING_TOKEN" });
  });

  it.each([
    ["POST", "/organizers"],
    ["PATCH", "/organizers/organizer-1"],
    ["POST", "/organizers/organizer-1/evidence"],
    ["PATCH", "/organizers/organizer-1/verification-status"],
    ["PATCH", "/organizers/organizer-1/billing-profile"],
    ["POST", "/organizers/organizer-1/contracts"],
    ["PATCH", "/organizers/organizer-1/contracts/contract-1"],
    ["PATCH", "/organizers/organizer-1/privileges"],
  ])("requires admin auth for state-changing %s %s", async (method, path) => {
    const response = await request(path, undefined, method);

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: "Unauthorized", code: "MISSING_TOKEN" });
  });

  it("allows an authenticated admin to read organizer detail", async () => {
    const response = await request("/organizers/organizer-1", adminToken());

    expect(response.status).toBe(200);
    expect(response.body).toEqual(expect.objectContaining({
      id: privateOrganizer.id,
      contactEmail: privateOrganizer.contactEmail,
    }));
    expect(mocks.organizerFindUnique).toHaveBeenCalledWith({ where: { id: "organizer-1" } });
  });

  it.each([
    "/organizers/organizer-1/evidence",
    "/organizers/organizer-1/billing-profile",
    "/organizers/organizer-1/contracts",
    "/organizers/organizer-1/analytics/overview",
  ])("allows an authenticated admin to read sensitive GET %s", async (path) => {
    const response = await request(path, adminToken());

    expect(response.status).toBe(200);
  });

  it("derives privileges on GET without mutating the organizer", async () => {
    const response = await request("/organizers/organizer-1/privileges", adminToken());

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      organizerId: "organizer-1",
      onboardingStatus: "active",
      billingStatus: "billing_connected",
      privilegeStatus: "active",
      contractStatus: "signed",
    });
    expect(mocks.deriveOrganizerPrivileges).toHaveBeenCalledWith("organizer-1");
    expect(mocks.organizerUpdate).not.toHaveBeenCalled();
  });
});
