import express from "express";
import fs from "fs/promises";
import { readFileSync } from "fs";
import os from "os";
import path from "path";
import type { Server } from "node:http";
import jwt from "jsonwebtoken";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "@mywave/config";

const mocks = vi.hoisted(() => ({
  spotCreate: vi.fn(),
  spotFindMany: vi.fn(),
  userFindMany: vi.fn(),
  userFindUnique: vi.fn(),
  methodologyUpdateMany: vi.fn(),
  spotAuditFindUnique: vi.fn(),
  spotAuditUpdate: vi.fn(),
  spotAuditCreate: vi.fn(),
  equipmentFindUnique: vi.fn(),
  methodologyFindUnique: vi.fn(),
  methodologyFindMany: vi.fn(),
  scoreUpsert: vi.fn(),
  evidenceFindUnique: vi.fn(),
  evidenceCreate: vi.fn(),
  snapshotCreate: vi.fn(),
  snapshotFindUnique: vi.fn(),
  snapshotUpdate: vi.fn(),
  writeAuditLog: vi.fn(),
}));

vi.mock("../../lib/prisma", () => ({
  prisma: {
    spot: { create: mocks.spotCreate, findMany: mocks.spotFindMany },
    user: { findMany: mocks.userFindMany, findUnique: mocks.userFindUnique },
    spotAssessment: { findUnique: mocks.spotAuditFindUnique, update: mocks.spotAuditUpdate, create: mocks.spotAuditCreate },
    spotEquipment: { findUnique: mocks.equipmentFindUnique },
    spotMethodology: {
      findUnique: mocks.methodologyFindUnique,
      findMany: mocks.methodologyFindMany,
      updateMany: mocks.methodologyUpdateMany,
    },
    spotCriterionResult: { upsert: mocks.scoreUpsert },
    spotEvidence: { findUnique: mocks.evidenceFindUnique, create: mocks.evidenceCreate },
    spotRatingSnapshot: {
      create: mocks.snapshotCreate,
      findUnique: mocks.snapshotFindUnique,
      update: mocks.snapshotUpdate,
    },
    $transaction: vi.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
  },
}));
vi.mock("../../lib/audit", () => ({ writeAuditLog: mocks.writeAuditLog }));

import { spotsAdminRoutes } from "./adminRoutes";
import { computeDefinitionSha256 } from "./methodologyRegistry";

const env = { ADMIN_JWT_SECRET: "spots-admin-routes-test-secret" } as Env;
const CATEGORIES = ["infrastructure", "instrument", "waterArea", "personnel", "safety", "atmosphere"];
const GATES = ["G01", "G02", "G03", "G04", "G05", "G06", "G07", "G08"];

const methodologyDefinition = JSON.parse(
  readFileSync(path.resolve(__dirname, "../../../prisma/data/spot-methodology/wakesurf-v1.1.json"), "utf8"),
) as unknown;
const METHODOLOGY_SHA = computeDefinitionSha256(methodologyDefinition);

function methodologyRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "spotmeth_wakesurf_v1_1",
    discipline: "wakesurf",
    methodologyVersion: "v1.1",
    protocolVersion: "wakesurf-v1.1",
    criteriaVersion: "wakesurf-v1.1",
    ratingVersion: "wakesurf-v1.1",
    status: "approved",
    definition: methodologyDefinition,
    definitionSha256: METHODOLOGY_SHA,
    ...overrides,
  };
}

function signedAudit(overrides: Record<string, unknown> = {}) {
  const testedAt = new Date(Date.now() - 30 * 24 * 3600 * 1000);
  return {
    id: "audit-1",
    unitId: "unit-1",
    testedAt,
    methodologyId: "spotmeth_wakesurf_v1_1",
    methodologySha256: METHODOLOGY_SHA,
    methodology: methodologyRow(),
    methodologyVersion: "v1.1",
    protocolVersion: "wakesurf-v1.1",
    criteriaVersion: "wakesurf-v1.1",
    status: "signed",
    expertUserId: "admin-1",
    expertSignedAt: new Date(),
    externalExpertConfirmed: false,
    externalExpertName: null,
    independentEditorUserId: null,
    notes: null,
    unit: { id: "unit-1", spot: { id: "spot-1", relatedToMyWave: false } },
    categoryScores: CATEGORIES.map((category) => ({ category, score: "8.0" })),
    gateResults: GATES.map((gateId) => ({ gateId, status: "pass" })),
    evidence: CATEGORIES.map((category, i) => ({
      id: `ev-${i}`,
      criterion: category,
      isGenerated: false,
      integrityConfirmedAt: new Date(),
    })),
    remediations: [],
    snapshots: [],
    ...overrides,
  };
}

function token(role = "admin"): string {
  return jwt.sign({ sub: "admin-1", role }, env.ADMIN_JWT_SECRET);
}

let server: Server;
let base: string;
let evidenceDir: string;

beforeAll(async () => {
  evidenceDir = await fs.mkdtemp(path.join(os.tmpdir(), "spot-routes-"));
  process.env.SPOT_EVIDENCE_DIR = evidenceDir;
  const app = express();
  app.use(express.json());
  app.use("/spots", spotsAdminRoutes(env));
  server = await new Promise<Server>((resolve) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server did not bind");
  base = `http://127.0.0.1:${address.port}/spots`;
});

afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
  delete process.env.SPOT_EVIDENCE_DIR;
  await fs.rm(evidenceDir, { recursive: true, force: true });
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.writeAuditLog.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.clearAllMocks();
});

async function call(method: string, pathname: string, body?: unknown, headers: Record<string, string> = {}) {
  const init: RequestInit = {
    method,
    headers: { Authorization: `Bearer ${token()}`, ...headers },
  };
  if (body instanceof Buffer) {
    init.body = body;
  } else if (body !== undefined) {
    init.body = JSON.stringify(body);
    (init.headers as Record<string, string>)["Content-Type"] = "application/json";
  }
  const res = await fetch(`${base}${pathname}`, init);
  return { status: res.status, json: (await res.json().catch(() => null)) as Record<string, unknown> | null };
}

describe("spots admin routes: access", () => {
  it("rejects requests without an admin token", async () => {
    expect((await fetch(`${base}/`)).status).toBe(401);
    const res = await fetch(`${base}/`, { headers: { Authorization: `Bearer ${token("organizer")}` } });
    expect(res.status).toBe(403);
  });
});

describe("spots admin routes: spots", () => {
  it("validates and creates a spot with an audit log entry", async () => {
    expect((await call("POST", "/", { region: "Moscow" })).status).toBe(400);
    mocks.spotCreate.mockResolvedValue({ id: "spot-1", name: "Wake Park" });
    const res = await call("POST", "/", { name: "Wake Park", region: "Moscow", latitude: 55.7, longitude: 37.6 });
    expect(res.status).toBe(201);
    expect(mocks.writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ entityType: "spot", entityId: "spot-1", changedField: "created", changedBy: "admin-1" }),
    );
  });
});

describe("spots admin routes: reviewers", () => {
  it("lists only admin users and reports the current user", async () => {
    mocks.userFindMany.mockResolvedValue([{ id: "admin-2", name: "Editor", email: "e@x.ru" }]);
    const res = await call("GET", "/reviewers");
    expect(res.status).toBe(200);
    expect(res.json).toEqual({ items: [{ id: "admin-2", name: "Editor", email: "e@x.ru" }], currentUserId: "admin-1" });
    expect(mocks.userFindMany.mock.calls[0][0].where).toEqual({ role: "admin" });
  });
});

describe("spots admin routes: methodology approval", () => {
  beforeEach(() => {
    mocks.userFindUnique.mockResolvedValue({ role: "admin" });
    mocks.methodologyUpdateMany.mockResolvedValue({ count: 1 });
  });

  it("lists methodologies without definitions and is not shadowed by /:id", async () => {
    mocks.methodologyFindMany.mockResolvedValue([{ id: "spotmeth_wakesurf_v1_1", status: "draft" }]);
    const res = await call("GET", "/methodologies");
    expect(res.status).toBe(200);
    expect(res.json?.items).toEqual([{ id: "spotmeth_wakesurf_v1_1", status: "draft" }]);
    const select = mocks.methodologyFindMany.mock.calls[0][0].select;
    expect(select.definition).toBeUndefined();
    expect(select._count).toEqual({ select: { assessments: true } });
  });

  it("approves a draft as the current admin and writes an audit log entry", async () => {
    mocks.methodologyFindUnique
      .mockResolvedValueOnce(methodologyRow({ status: "draft" }))
      .mockResolvedValueOnce({ id: "spotmeth_wakesurf_v1_1", status: "approved" });
    const res = await call("POST", "/methodologies/spotmeth_wakesurf_v1_1/approve", { expectedSha256: METHODOLOGY_SHA });
    expect(res.status).toBe(200);
    expect(res.json).toMatchObject({ status: "approved" });
    expect(mocks.userFindUnique.mock.calls[0][0].where).toEqual({ id: "admin-1" });
    expect(mocks.methodologyUpdateMany).toHaveBeenCalledWith({
      where: { id: "spotmeth_wakesurf_v1_1", status: "draft", definitionSha256: METHODOLOGY_SHA },
      data: { status: "approved", approvedByUserId: "admin-1", approvedAt: expect.any(Date) },
    });
    expect(mocks.writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: "spot_methodology",
        entityId: "spotmeth_wakesurf_v1_1",
        changedField: "status",
        oldValue: "draft",
        newValue: "approved",
        changedBy: "admin-1",
        reason: `definitionSha256=${METHODOLOGY_SHA}`,
      }),
    );
  });

  it("refuses non-admin tokens and users whose role is no longer admin", async () => {
    const organizer = await fetch(`${base}/methodologies/spotmeth_wakesurf_v1_1/approve`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token("organizer")}`, "Content-Type": "application/json" },
      body: JSON.stringify({ expectedSha256: METHODOLOGY_SHA }),
    });
    expect(organizer.status).toBe(403);
    mocks.userFindUnique.mockResolvedValue({ role: "user" });
    expect((await call("POST", "/methodologies/spotmeth_wakesurf_v1_1/approve", { expectedSha256: METHODOLOGY_SHA })).status).toBe(403);
    expect(mocks.methodologyUpdateMany).not.toHaveBeenCalled();
  });

  it("refuses non-drafts, missing or wrong expected sha256 and concurrent changes", async () => {
    const approve = (body: unknown) => call("POST", "/methodologies/spotmeth_wakesurf_v1_1/approve", body);
    mocks.methodologyFindUnique.mockResolvedValue(null);
    expect((await approve({ expectedSha256: METHODOLOGY_SHA })).status).toBe(404);

    mocks.methodologyFindUnique.mockResolvedValue(methodologyRow({ status: "approved" }));
    const again = await approve({ expectedSha256: METHODOLOGY_SHA });
    expect(again.status).toBe(409);
    expect(again.json?.code).toBe("methodology_not_draft");

    mocks.methodologyFindUnique.mockResolvedValue(methodologyRow({ status: "draft" }));
    expect((await approve({})).status).toBe(400);
    const wrong = await approve({ expectedSha256: "f".repeat(64) });
    expect(wrong.status).toBe(409);
    expect(wrong.json?.code).toBe("methodology_sha256_mismatch");
    expect(mocks.methodologyUpdateMany).not.toHaveBeenCalled();

    mocks.methodologyUpdateMany.mockResolvedValue({ count: 0 });
    const raced = await approve({ expectedSha256: METHODOLOGY_SHA });
    expect(raced.status).toBe(409);
    expect(raced.json?.code).toBe("methodology_changed");
    expect(mocks.writeAuditLog).not.toHaveBeenCalled();
  });
});

describe("spots admin routes: candidate import", () => {
  const items = [
    { name: "Wake Park", region: "Moscow" },
    { name: "Новый спот", region: "Тверская область", latitude: 56.8, longitude: 35.9, discoveryStatus: "listed" },
    { name: "  новый   спот ", region: "тверская область" },
  ];

  it("creates nothing when any row is invalid", async () => {
    mocks.spotFindMany.mockResolvedValue([]);
    const res = await call("POST", "/import", { items: [...items, { name: "Без региона" }] });
    expect(res.status).toBe(400);
    expect(res.json?.errors).toEqual([expect.objectContaining({ index: 3, name: "Без региона" })]);
    expect(mocks.spotCreate).not.toHaveBeenCalled();
  });

  it("dry run reports duplicates without writing", async () => {
    mocks.spotFindMany.mockResolvedValue([{ name: "WAKE PARK", region: "moscow" }]);
    const res = await call("POST", "/import", { items, dryRun: true });
    expect(res.status).toBe(200);
    expect(res.json?.toCreate).toEqual([{ index: 1, name: "Новый спот", region: "Тверская область" }]);
    expect(res.json?.duplicates).toEqual([
      expect.objectContaining({ index: 0, reason: "exists" }),
      expect.objectContaining({ index: 2, reason: "repeated_in_batch" }),
    ]);
    expect(mocks.spotCreate).not.toHaveBeenCalled();
  });

  it("creates new rows only as unrated candidates and logs each one", async () => {
    mocks.spotFindMany.mockResolvedValue([{ name: "Wake Park", region: "Moscow" }]);
    mocks.spotCreate.mockResolvedValue({ id: "spot-2", name: "Новый спот", region: "Тверская область" });
    const res = await call("POST", "/import", { items });
    expect(res.status).toBe(201);
    expect(mocks.spotCreate).toHaveBeenCalledTimes(1);
    expect(mocks.spotCreate.mock.calls[0][0].data).toMatchObject({ name: "Новый спот", discoveryStatus: "candidate" });
    expect(mocks.writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ entityId: "spot-2", changedField: "created", reason: "candidate_import" }),
    );
  });
});

describe("spots admin routes: audit lifecycle", () => {
  it("refuses to submit an audit without all six category scores", async () => {
    mocks.spotAuditFindUnique.mockResolvedValue(
      signedAudit({ status: "draft", categoryScores: [{ category: "safety", score: "7.0" }] }),
    );
    const res = await call("POST", "/audits/audit-1/submit", {});
    expect(res.status).toBe(409);
    expect(res.json?.missing).toEqual(CATEGORIES.filter((c) => c !== "safety"));
    expect(mocks.spotAuditUpdate).not.toHaveBeenCalled();
  });

  it("signs a submitted audit as the current admin", async () => {
    mocks.spotAuditFindUnique.mockResolvedValue(signedAudit({ status: "submitted", expertUserId: null, expertSignedAt: null }));
    mocks.spotAuditUpdate.mockResolvedValue({ id: "audit-1", status: "signed" });
    const res = await call("POST", "/audits/audit-1/sign", {});
    expect(res.status).toBe(200);
    expect(mocks.spotAuditUpdate).toHaveBeenCalledWith({
      where: { id: "audit-1" },
      data: expect.objectContaining({ status: "signed", expertUserId: "admin-1", expertSignedAt: expect.any(Date) }),
    });
  });

  it("does not allow skipping submission or editing after signing", async () => {
    mocks.spotAuditFindUnique.mockResolvedValue(signedAudit({ status: "draft" }));
    expect((await call("POST", "/audits/audit-1/sign", {})).status).toBe(409);

    mocks.spotAuditFindUnique.mockResolvedValue(signedAudit());
    expect((await call("PUT", "/audits/audit-1/scores", { scores: { safety: 9 } })).status).toBe(409);
    expect(mocks.scoreUpsert).not.toHaveBeenCalled();
  });
});

describe("spots admin routes: evidence", () => {
  it("stores a real photo privately and rejects svg", async () => {
    mocks.spotAuditFindUnique.mockResolvedValue({ id: "audit-1", status: "draft" });
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
    expect((await call("POST", "/audits/audit-1/evidence", svg, { "Content-Type": "image/svg+xml" })).status).toBe(400);

    mocks.evidenceFindUnique.mockResolvedValue(null);
    mocks.evidenceCreate.mockImplementation(async ({ data }) => ({ id: "ev-new", ...data }));
    const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 7)]);
    const res = await call("POST", "/audits/audit-1/evidence?criterion=safety", jpeg, { "Content-Type": "image/jpeg" });
    expect(res.status).toBe(201);
    expect(res.json).toMatchObject({ criterion: "safety", kind: "photo", mimeType: "image/jpeg", isGenerated: false });
    const files = await fs.readdir(evidenceDir);
    expect(files).toContain(res.json?.storageKey);
  });

  it("does not accept evidence after the audit is signed", async () => {
    mocks.spotAuditFindUnique.mockResolvedValue({ id: "audit-1", status: "signed" });
    const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 8)]);
    expect((await call("POST", "/audits/audit-1/evidence", jpeg, { "Content-Type": "image/jpeg" })).status).toBe(409);
  });
});

describe("spots admin routes: assessment methodology pin", () => {
  const body = { testedAt: "2026-06-01T10:00:00Z", methodologyVersion: "v1.1", protocolVersion: "wakesurf-v1.1", criteriaVersion: "wakesurf-v1.1" };

  beforeEach(() => {
    mocks.equipmentFindUnique.mockResolvedValue({ id: "unit-1", discipline: "wakesurf" });
    mocks.spotAuditCreate.mockImplementation(async ({ data }) => ({ id: "audit-new", ...data }));
  });

  it("resolves the registry methodology by versions and pins its sha256", async () => {
    mocks.methodologyFindMany.mockResolvedValue([methodologyRow({ status: "draft" })]);
    const res = await call("POST", "/units/unit-1/audits", body);
    expect(res.status).toBe(201);
    expect(mocks.methodologyFindMany.mock.calls[0][0].where).toEqual({
      discipline: "wakesurf",
      methodologyVersion: "v1.1",
      protocolVersion: "wakesurf-v1.1",
      criteriaVersion: "wakesurf-v1.1",
      status: { not: "retired" },
    });
    expect(mocks.spotAuditCreate.mock.calls[0][0].data).toMatchObject({
      unitId: "unit-1",
      methodologyId: "spotmeth_wakesurf_v1_1",
      methodologySha256: METHODOLOGY_SHA,
      methodologyVersion: "v1.1",
      protocolVersion: "wakesurf-v1.1",
      criteriaVersion: "wakesurf-v1.1",
    });
  });

  it("pins by methodologyId and copies versions from the registry", async () => {
    mocks.methodologyFindUnique.mockResolvedValue(methodologyRow());
    const res = await call("POST", "/units/unit-1/audits", { testedAt: body.testedAt, methodologyId: "spotmeth_wakesurf_v1_1" });
    expect(res.status).toBe(201);
    expect(mocks.spotAuditCreate.mock.calls[0][0].data).toMatchObject({
      methodologyId: "spotmeth_wakesurf_v1_1",
      protocolVersion: "wakesurf-v1.1",
    });
  });

  it("refuses unknown, retired or ambiguous methodologies", async () => {
    mocks.methodologyFindMany.mockResolvedValue([]);
    expect((await call("POST", "/units/unit-1/audits", body)).status).toBe(404);
    mocks.methodologyFindUnique.mockResolvedValue(methodologyRow({ status: "retired" }));
    expect((await call("POST", "/units/unit-1/audits", { testedAt: body.testedAt, methodologyId: "spotmeth_wakesurf_v1_1" })).status).toBe(409);
    mocks.methodologyFindMany.mockResolvedValue([methodologyRow(), methodologyRow({ id: "other" })]);
    expect((await call("POST", "/units/unit-1/audits", body)).status).toBe(409);
    expect(mocks.spotAuditCreate).not.toHaveBeenCalled();
  });

  it("does not allow changing the pinned methodology of an assessment", async () => {
    mocks.spotAuditFindUnique.mockResolvedValue(signedAudit({ status: "draft" }));
    const res = await call("PATCH", "/audits/audit-1", { protocolVersion: "wakesurf-v1.0" });
    expect(res.status).toBe(400);
    expect(mocks.spotAuditUpdate).not.toHaveBeenCalled();
  });
});

describe("spots admin routes: snapshots", () => {
  it("computes a snapshot from a signed audit through the rating engine", async () => {
    mocks.spotAuditFindUnique.mockResolvedValue(signedAudit());
    mocks.snapshotCreate.mockImplementation(async ({ data }) => ({ id: "snap-1", ...data }));
    const res = await call("POST", "/audits/audit-1/snapshots", {});
    expect(res.status).toBe(201);
    const data = mocks.snapshotCreate.mock.calls[0][0].data;
    expect(data.publishable).toBe(true);
    expect(data.officialScore.toString()).toBe("8");
    expect(data.band).toBe("premium");
    expect(data.blockers).toEqual([]);
    expect(data.methodologyId).toBe("spotmeth_wakesurf_v1_1");
    expect(data.methodologySha256).toBe(METHODOLOGY_SHA);
    expect(data.ratingVersion).toBe("wakesurf-v1.1");
    expect(data.inputJson).toMatchObject({ ratingVersion: "wakesurf-v1.1", expertSigned: true, methodologyApprovedForPublication: true });
  });

  it("reads approval from the registry, not from the request body", async () => {
    mocks.spotAuditFindUnique.mockResolvedValue(signedAudit({ methodology: methodologyRow({ status: "draft" }) }));
    mocks.snapshotCreate.mockImplementation(async ({ data }) => ({ id: "snap-2", ...data }));
    const res = await call("POST", "/audits/audit-1/snapshots", { methodologyApprovedForPublication: true });
    expect(res.status).toBe(201);
    const data = mocks.snapshotCreate.mock.calls[0][0].data;
    expect(data.publishable).toBe(false);
    expect(data.officialScore).toBeNull();
    expect(data.blockers).toContain("methodology_not_approved");
  });

  it("refuses snapshots for unpinned or drifted assessments and foreign rating versions", async () => {
    mocks.spotAuditFindUnique.mockResolvedValue(signedAudit({ methodologyId: null, methodologySha256: null, methodology: null }));
    const legacy = await call("POST", "/audits/audit-1/snapshots", {});
    expect(legacy.status).toBe(409);
    expect(legacy.json?.code).toBe("assessment_not_pinned");

    mocks.spotAuditFindUnique.mockResolvedValue(signedAudit({ methodologySha256: "f".repeat(64) }));
    const drifted = await call("POST", "/audits/audit-1/snapshots", {});
    expect(drifted.status).toBe(409);
    expect(drifted.json?.code).toBe("methodology_changed_since_assessment");

    mocks.spotAuditFindUnique.mockResolvedValue(signedAudit());
    expect((await call("POST", "/audits/audit-1/snapshots", { ratingVersion: "rating-v2" })).status).toBe(400);
    expect(mocks.snapshotCreate).not.toHaveBeenCalled();
  });

  it("publishes only publishable, unexpired, unpublished snapshots", async () => {
    const future = new Date(Date.now() + 86400000);
    mocks.snapshotFindUnique.mockResolvedValue({ id: "s", publishable: false, blockers: ["x"], expiresAt: future });
    expect((await call("POST", "/snapshots/s/publish", {})).status).toBe(409);

    mocks.snapshotFindUnique.mockResolvedValue({ id: "s", publishable: true, expiresAt: new Date(Date.now() - 1000) });
    expect((await call("POST", "/snapshots/s/publish", {})).status).toBe(409);

    mocks.snapshotFindUnique.mockResolvedValue({
      id: "s", publishable: true, publishedAt: null, revokedAt: null, expiresAt: future, officialScore: "8.0", band: "premium",
    });
    mocks.snapshotUpdate.mockResolvedValue({ id: "s" });
    expect((await call("POST", "/snapshots/s/publish", {})).status).toBe(200);
    expect(mocks.snapshotUpdate).toHaveBeenCalledWith({
      where: { id: "s" },
      data: { publishedAt: expect.any(Date), publishedByUserId: "admin-1" },
    });
  });

  it("requires a reason to revoke and refuses double revocation", async () => {
    mocks.snapshotFindUnique.mockResolvedValue({ id: "s", revokedAt: null, publishedAt: new Date() });
    expect((await call("POST", "/snapshots/s/revoke", {})).status).toBe(400);
    mocks.snapshotFindUnique.mockResolvedValue({ id: "s", revokedAt: new Date() });
    expect((await call("POST", "/snapshots/s/revoke", { reason: "appeal" })).status).toBe(409);
  });
});
