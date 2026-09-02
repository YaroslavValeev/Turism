import express from "express";
import type { Server } from "node:http";
import jwt from "jsonwebtoken";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "@mywave/config";

const mocks = vi.hoisted(() => ({
  programFindUnique: vi.fn(),
  programUpdate: vi.fn(),
  publishedProgramUpdateMany: vi.fn(),
  writeAuditLog: vi.fn(),
  notifySubscribers: vi.fn(),
}));

vi.mock("../../lib/prisma", () => ({
  prisma: {
    program: { findUnique: mocks.programFindUnique },
    $transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback({
      program: { update: mocks.programUpdate },
      publishedProgram: { updateMany: mocks.publishedProgramUpdateMany },
    })),
  },
}));
vi.mock("../../lib/audit", () => ({ writeAuditLog: mocks.writeAuditLog }));
vi.mock("../subscriptions/notifier", () => ({
  notifySubscribersOnProgramPublished: mocks.notifySubscribers,
}));

import { programsRoutes } from "./routes";

const env = {
  ADMIN_JWT_SECRET: "program-routes-test-admin-secret",
} as Env;

const existing = {
  id: "program-1",
  publishStatus: "draft",
  reviewStatus: "auto_pending",
  autoPublished: true,
  title: "Future camp",
  organizerId: "organizer-1",
  discipline: "kite",
  region: "Region",
  startDate: new Date("2026-10-01T00:00:00.000Z"),
  endDate: new Date("2026-10-02T00:00:00.000Z"),
  levelRequired: "all_levels",
  riskLevel: "medium",
  gearRequirements: "Personal equipment",
  medicalLimitations: "",
  cancellationRules: "Confirm with organizer",
  audienceFit: "Participants",
  itineraryDayByDay: null,
  inclusions: null,
  organizerName: "Organizer",
  intakeSource: "ingestion_auto",
  sourceUrl: "https://t.me/source/1",
  media: [{ id: "media-1", url: "https://cdn.example.org/image.jpg" }],
  organizer: { displayName: "Organizer" },
};

function adminToken(): string {
  return jwt.sign({ sub: "admin-1", role: "admin" }, env.ADMIN_JWT_SECRET);
}

async function closeServer(server: Server): Promise<void> {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}

describe("program publish lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.programFindUnique.mockResolvedValue(existing);
    mocks.programUpdate.mockResolvedValue({ ...existing, publishStatus: "published", reviewStatus: "ok" });
    mocks.publishedProgramUpdateMany.mockResolvedValue({ count: 1 });
    mocks.writeAuditLog.mockResolvedValue(undefined);
    mocks.notifySubscribers.mockResolvedValue(undefined);
  });

  it("marks an operator-published ingestion program reviewed and synchronizes its trace link", async () => {
    const app = express();
    app.use(express.json());
    app.use("/programs", programsRoutes(env));
    const server = await new Promise<Server>((resolve) => {
      const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
    });
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Test server did not bind");

    try {
      const response = await fetch(`http://127.0.0.1:${address.port}/programs/program-1/publish-status`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${adminToken()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ publishStatus: "published" }),
      });

      expect(response.status).toBe(200);
      expect(mocks.programUpdate).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: "program-1" },
        data: { publishStatus: "published", reviewStatus: "ok" },
      }));
      expect(mocks.publishedProgramUpdateMany).toHaveBeenCalledWith({
        where: { programId: "program-1" },
        data: { publishStatus: "published" },
      });
      expect(mocks.notifySubscribers).toHaveBeenCalledOnce();
    } finally {
      await closeServer(server);
    }
  });
});
