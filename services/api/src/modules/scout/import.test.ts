import { beforeEach, describe, expect, it, vi } from "vitest";

type FakeProposal = { id: string; normalizedUrl: string; status: string; submittedBy: string | null; notes: string | null };
type StatusFilter = string | { in: string[] };

const mocks = vi.hoisted(() => {
  const state = {
    proposals: [] as FakeProposal[],
    sources: [] as Array<{ id: string; type: string; urlOrHandle: string }>,
  };
  const matchesStatus = (status: string, filter: StatusFilter) =>
    typeof filter === "string" ? status === filter : filter.in.includes(status);
  const prisma = {
    sourceProposal: {
      findFirst: vi.fn(async ({ where }: { where: { normalizedUrl: string; status: StatusFilter } }) =>
        state.proposals.find((p) => p.normalizedUrl === where.normalizedUrl && matchesStatus(p.status, where.status)) ?? null,
      ),
      create: vi.fn(async ({ data }: { data: Omit<FakeProposal, "id" | "status"> }) => {
        const proposal = { ...data, id: `proposal-${state.proposals.length + 1}`, status: "pending" };
        state.proposals.push(proposal);
        return proposal;
      }),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    source: {
      findMany: vi.fn(async ({ where }: { where: { type: string } }) => state.sources.filter((s) => s.type === where.type)),
      create: vi.fn(),
      update: vi.fn(),
      upsert: vi.fn(),
    },
    program: { create: vi.fn(), update: vi.fn(), upsert: vi.fn(), createMany: vi.fn(), updateMany: vi.fn() },
    $transaction: vi.fn(),
  };
  return { state, prisma, writeAuditLog: vi.fn() };
});

vi.mock("../../lib/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("../../lib/audit", () => ({ writeAuditLog: mocks.writeAuditLog }));

import { importScoutBatch, scoutSubmittedBy } from "./import";
import { validateScoutBatch } from "./validate";

function rowsFor(urls: string[]) {
  const result = validateScoutBatch({
    batchId: "2026-10-01",
    schemaVersion: 1,
    candidates: urls.map((url, i) => ({
      region: "Алтай",
      name: `Candidate ${i + 1}`,
      organizerName: "  ООО Тест  ",
      url,
      kind: "школа",
      disciplines: ["фрирайд"],
      osintScore: 3,
      evidence: [`${url.replace(/\/$/, "")}/about`],
    })),
  });
  expect(result.errors).toEqual([]);
  return result.rows;
}

function expectNoSourceOrProgramWrites() {
  expect(mocks.prisma.source.create).not.toHaveBeenCalled();
  expect(mocks.prisma.source.update).not.toHaveBeenCalled();
  expect(mocks.prisma.source.upsert).not.toHaveBeenCalled();
  expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  for (const fn of Object.values(mocks.prisma.program)) expect(fn).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.state.proposals = [];
  mocks.state.sources = [];
});

describe("importScoutBatch", () => {
  it("creates pending proposals with batch-scoped submittedBy and notes header", async () => {
    const rows = rowsFor(["https://alpha.ru/", "https://t.me/beta_club"]);
    const seen: string[] = [];

    const result = await importScoutBatch(rows, { batchId: "2026-10-01", apply: true, onRow: (_r, kind) => seen.push(kind) });

    expect(result).toEqual({
      applied: true,
      counts: { created: 2, duplicate: 0, existing_source: 0, previously_reviewed: 0 },
    });
    expect(seen).toEqual(["created", "created"]);
    expect(scoutSubmittedBy("2026-10-01")).toBe("osint-import:2026-10-01");
    expect(mocks.prisma.sourceProposal.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        normalizedUrl: "https://alpha.ru",
        submittedBy: "osint-import:2026-10-01",
        submittedVia: "admin",
        organizerName: "ООО Тест",
        notes: expect.stringMatching(/^OSINT discovery 2026-10-01; регион=Алтай/),
      }),
    });
    expectNoSourceOrProgramWrites();
  });

  it.each(["rejected", "approved"])("skips a URL whose proposal was %s as previously_reviewed", async (status) => {
    const rows = rowsFor(["https://alpha.ru/"]);
    mocks.state.proposals.push({ id: "old", normalizedUrl: rows[0].normalizedUrl, status, submittedBy: "osint-import:2026-09-29", notes: null });

    const result = await importScoutBatch(rows, { batchId: "2026-10-01", apply: true });

    expect(result.counts).toEqual({ created: 0, duplicate: 0, existing_source: 0, previously_reviewed: 1 });
    expect(mocks.prisma.sourceProposal.findFirst).toHaveBeenCalledWith({
      where: { normalizedUrl: "https://alpha.ru", status: { in: ["rejected", "approved"] } },
      select: { id: true },
    });
    expect(mocks.prisma.sourceProposal.create).not.toHaveBeenCalled();
    expect(mocks.writeAuditLog).not.toHaveBeenCalled();
    expectNoSourceOrProgramWrites();
  });

  it("is idempotent: a repeat run reports duplicates and creates nothing new", async () => {
    const rows = rowsFor(["https://alpha.ru/", "https://beta.ru/"]);
    await importScoutBatch(rows, { batchId: "2026-10-01", apply: true });
    mocks.prisma.sourceProposal.create.mockClear();

    const second = await importScoutBatch(rows, { batchId: "2026-10-01", apply: true });

    expect(second.counts).toEqual({ created: 0, duplicate: 2, existing_source: 0, previously_reviewed: 0 });
    expect(mocks.prisma.sourceProposal.create).not.toHaveBeenCalled();
    expect(mocks.state.proposals).toHaveLength(2);
  });

  it("passes through existing_source from submitSourceProposal", async () => {
    mocks.state.sources.push({ id: "source-1", type: "telegram", urlOrHandle: "https://t.me/s/beta_club/12" });
    const rows = rowsFor(["https://t.me/beta_club"]);

    const result = await importScoutBatch(rows, { batchId: "2026-10-01", apply: true });

    expect(result.counts).toEqual({ created: 0, duplicate: 0, existing_source: 1, previously_reviewed: 0 });
    expect(mocks.prisma.sourceProposal.create).not.toHaveBeenCalled();
    expectNoSourceOrProgramWrites();
  });

  it("honours an explicit submittedBy override", async () => {
    await importScoutBatch(rowsFor(["https://alpha.ru/"]), { batchId: "2026-10-01", apply: true, submittedBy: "operator-7" });
    expect(mocks.prisma.sourceProposal.create).toHaveBeenCalledWith({ data: expect.objectContaining({ submittedBy: "operator-7" }) });
  });

  it("writes v2 notes with the zone line when schemaVersion 2 is passed", async () => {
    const result = validateScoutBatch({
      batchId: "wave2-2026-10-05",
      schemaVersion: 2,
      wave: 2,
      discoveredAt: "2026-10-05",
      candidates: [
        {
          scoutArea: "karelia",
          region: "Республика Карелия",
          name: "Karelia Kayak",
          url: "https://karelia-kayak.ru/",
          organizerKinds: ["club"],
          kind: "клуб",
          disciplines: ["kayaking"],
          osintScore: 3,
          evidence: ["https://karelia-kayak.ru/about"],
        },
      ],
    });
    expect(result.errors).toEqual([]);

    await importScoutBatch(result.rows, { batchId: "wave2-2026-10-05", schemaVersion: 2, apply: true });

    expect(mocks.prisma.sourceProposal.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        submittedBy: "osint-import:wave2-2026-10-05",
        notes: expect.stringMatching(/^OSINT discovery wave2-2026-10-05; зона=karelia; регион=Республика Карелия; .*дисциплины=kayaking;/),
      }),
    });
  });

  it("dry-run touches no database at all", async () => {
    const result = await importScoutBatch(rowsFor(["https://alpha.ru/"]), { batchId: "2026-10-01", apply: false });

    expect(result).toEqual({ applied: false, counts: { created: 0, duplicate: 0, existing_source: 0, previously_reviewed: 0 } });
    expect(mocks.prisma.sourceProposal.findFirst).not.toHaveBeenCalled();
    expect(mocks.prisma.sourceProposal.create).not.toHaveBeenCalled();
    expect(mocks.prisma.source.findMany).not.toHaveBeenCalled();
    expect(mocks.writeAuditLog).not.toHaveBeenCalled();
    expectNoSourceOrProgramWrites();
  });
});
