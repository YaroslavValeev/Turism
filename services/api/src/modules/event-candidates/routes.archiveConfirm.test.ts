import express from "express";
import type { Server } from "node:http";
import jwt from "jsonwebtoken";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "@mywave/config";

const mocks = vi.hoisted(() => ({ archive: vi.fn() }));
vi.mock("../../lib/prisma", () => ({ prisma: {} }));
vi.mock("../ingestion/service", () => ({
  approveCandidate: vi.fn(), mergeCandidateIntoCanonical: vi.fn(), publishCandidateToDraft: vi.fn(), rejectCandidate: vi.fn(),
}));
vi.mock("./reconciliation", async (original) => {
  const actual = await original<typeof import("./reconciliation")>();
  return { ...actual, archiveProgramFromCancellationCandidate: mocks.archive };
});
import { eventCandidatesRoutes } from "./routes";
import { ReconciliationError } from "./reconciliation";

const env = { ADMIN_JWT_SECRET: "archive-confirm-test-secret" } as Env;
const body = { targetProgramId: "program-1", reason: "Отмена подтверждена", confirm: "archive",
  expectedCandidateUpdatedAt: "2026-08-24T08:00:00.000Z", expectedProgramUpdatedAt: "2026-08-24T08:00:00.000Z" };
async function close(server: Server) { await new Promise<void>((resolve) => server.close(() => resolve())); }
async function request(token?: string) {
  const app = express(); app.use(express.json()); app.use("/event-candidates", eventCandidatesRoutes(env));
  const server = await new Promise<Server>((resolve) => { const value = app.listen(0, "127.0.0.1", () => resolve(value)); });
  const address = server.address(); if (!address || typeof address === "string") throw new Error("bind failed");
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/event-candidates/cancel-1/archive-confirm`, {
      method: "POST", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
  } finally { await close(server); }
}

describe("event candidate archive-confirm route", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.archive.mockResolvedValue({ ok: true, idempotent: false }); });
  it("requires admin authentication", async () => { expect((await request()).status).toBe(401); });
  it("forwards validated operator context to the transaction service", async () => {
    const token = jwt.sign({ sub: "admin-1", role: "admin" }, env.ADMIN_JWT_SECRET);
    expect(await request(token)).toMatchObject({ status: 200, body: { ok: true } });
    expect(mocks.archive).toHaveBeenCalledWith({ candidateId: "cancel-1", targetProgramId: "program-1",
      actorId: "admin-1", reason: body.reason, confirm: "archive",
      expectedCandidateUpdatedAt: body.expectedCandidateUpdatedAt, expectedProgramUpdatedAt: body.expectedProgramUpdatedAt });
  });
  it("maps typed conflicts and hides unexpected error details", async () => {
    const token = jwt.sign({ sub: "admin-1", role: "admin" }, env.ADMIN_JWT_SECRET);
    mocks.archive.mockRejectedValueOnce(new ReconciliationError("stale_program", 409));
    expect(await request(token)).toMatchObject({ status: 409, body: { error: "stale_program" } });
    mocks.archive.mockRejectedValueOnce("secret internal failure");
    expect(await request(token)).toMatchObject({ status: 500, body: { error: "Cancellation reconciliation failed" } });
  });
});
