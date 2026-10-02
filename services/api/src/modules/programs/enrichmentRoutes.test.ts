import express from "express";
import type { Server } from "node:http";
import jwt from "jsonwebtoken";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "@mywave/config";

const mocks = vi.hoisted(() => ({
  programFindUnique: vi.fn(),
  enrichmentFindUnique: vi.fn(),
  enrichmentFindMany: vi.fn(),
  enrichmentCreate: vi.fn(),
  enrichmentUpdate: vi.fn(),
  enrichmentUpdateMany: vi.fn(),
  writeAuditLog: vi.fn(),
}));

vi.mock("../../lib/prisma", () => {
  const programEnrichment = {
    findUnique: mocks.enrichmentFindUnique,
    findMany: mocks.enrichmentFindMany,
    create: mocks.enrichmentCreate,
    update: mocks.enrichmentUpdate,
    updateMany: mocks.enrichmentUpdateMany,
  };
  return {
    prisma: {
      program: { findUnique: mocks.programFindUnique },
      programEnrichment,
      $transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback({ programEnrichment })),
    },
  };
});
vi.mock("../../lib/audit", () => ({ writeAuditLog: mocks.writeAuditLog }));
vi.mock("../subscriptions/notifier", () => ({ notifySubscribersOnProgramPublished: vi.fn() }));

import { programsRoutes } from "./routes";

const env = { ADMIN_JWT_SECRET: "enrichment-routes-test-secret" } as Env;
const SOURCES = [{ url: "https://sheregesh.ru/transfer", accessedAt: "2026-10-01" }];
const TEXT = "Из аэропорта Новокузнецка до Шерегеша ходят рейсовые автобусы и такси, дорога занимает около трёх часов.";

const draftRow = {
  id: "enr-2",
  programId: "program-1",
  field: "transfer",
  status: "draft",
  contentJson: { text: TEXT },
  sourcesJson: SOURCES,
  checkedAt: new Date("2026-10-01T00:00:00Z"),
};

let server: Server;
let baseUrl: string;

function token(): string {
  return jwt.sign({ sub: "owner-1", role: "admin" }, env.ADMIN_JWT_SECRET);
}

async function call(path: string, body?: unknown, auth = true): Promise<Response> {
  return fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(auth ? { Authorization: `Bearer ${token()}` } : {}) },
    body: JSON.stringify(body ?? {}),
  });
}

beforeEach(async () => {
  vi.clearAllMocks();
  mocks.writeAuditLog.mockResolvedValue(undefined);
  const app = express();
  app.use(express.json());
  app.use("/programs", programsRoutes(env));
  server = await new Promise<Server>((resolve) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server did not bind");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterEach(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
});

describe("POST /programs/enrichments/:eid/approve", () => {
  it("retires the previously approved row for the same field and records the reviewer", async () => {
    mocks.enrichmentFindUnique.mockResolvedValue(draftRow);
    mocks.enrichmentUpdateMany.mockResolvedValue({ count: 1 });
    mocks.enrichmentUpdate.mockImplementation(async ({ data }) => ({ ...draftRow, ...data }));

    const response = await call("/programs/enrichments/enr-2/approve");
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ status: "approved", reviewedByUserId: "owner-1", retiredCount: 1 });

    expect(mocks.enrichmentUpdateMany).toHaveBeenCalledWith({
      where: { programId: "program-1", field: "transfer", status: "approved", id: { not: "enr-2" } },
      data: { status: "retired" },
    });
    expect(mocks.enrichmentUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "enr-2" },
      data: expect.objectContaining({ status: "approved", reviewedByUserId: "owner-1", reviewedAt: expect.any(Date) }),
    }));
    expect(mocks.writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      entityType: "program_enrichment",
      entityId: "enr-2",
      newValue: "approved",
      changedBy: "owner-1",
    }));
  });

  it("refuses to approve a non-draft row", async () => {
    mocks.enrichmentFindUnique.mockResolvedValue({ ...draftRow, status: "rejected" });
    const response = await call("/programs/enrichments/enr-2/approve");
    expect(response.status).toBe(409);
    expect(mocks.enrichmentUpdate).not.toHaveBeenCalled();
    expect(mocks.enrichmentUpdateMany).not.toHaveBeenCalled();
  });

  it("refuses to approve a draft whose stored content became invalid", async () => {
    mocks.enrichmentFindUnique.mockResolvedValue({ ...draftRow, sourcesJson: [] });
    const response = await call("/programs/enrichments/enr-2/approve");
    expect(response.status).toBe(400);
    expect(mocks.enrichmentUpdate).not.toHaveBeenCalled();
  });

  it("requires admin auth", async () => {
    const response = await call("/programs/enrichments/enr-2/approve", {}, false);
    expect(response.status).toBe(401);
    expect(mocks.enrichmentFindUnique).not.toHaveBeenCalled();
  });
});

describe("POST /programs/enrichments/:eid/reject", () => {
  it("requires a reason", async () => {
    const response = await call("/programs/enrichments/enr-2/reject", { reason: "  " });
    expect(response.status).toBe(400);
    expect(mocks.enrichmentUpdate).not.toHaveBeenCalled();
  });

  it("rejects a draft with the reason and audits it", async () => {
    mocks.enrichmentFindUnique.mockResolvedValue(draftRow);
    mocks.enrichmentUpdate.mockImplementation(async ({ data }) => ({ ...draftRow, ...data }));
    const response = await call("/programs/enrichments/enr-2/reject", { reason: "Устаревшее расписание автобусов" });
    expect(response.status).toBe(200);
    expect(mocks.enrichmentUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "rejected", rejectionReason: "Устаревшее расписание автобусов", reviewedByUserId: "owner-1" }),
    }));
    expect(mocks.writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      entityId: "enr-2",
      oldValue: "draft",
      newValue: "rejected",
      reason: "Устаревшее расписание автобусов",
    }));
  });
});

describe("POST /programs/:id/enrichments", () => {
  it("always creates a draft and validates the payload", async () => {
    mocks.programFindUnique.mockResolvedValue({ id: "program-1" });
    mocks.enrichmentCreate.mockImplementation(async ({ data }) => ({ id: "enr-3", ...data }));

    const bad = await call("/programs/program-1/enrichments", { field: "transfer", content: { text: "коротко" }, sources: SOURCES, checkedAt: "2026-10-01" });
    expect(bad.status).toBe(400);

    const ok = await call("/programs/program-1/enrichments", {
      field: "transfer",
      status: "approved",
      content: { text: TEXT },
      sources: SOURCES,
      checkedAt: "2026-10-01",
    });
    expect(ok.status).toBe(201);
    expect(mocks.enrichmentCreate).toHaveBeenCalledTimes(1);
    expect(mocks.enrichmentCreate.mock.calls[0][0].data).toMatchObject({ status: "draft", programId: "program-1", field: "transfer" });
  });
});
