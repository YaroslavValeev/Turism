import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const tx = {
    eventCandidate: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
    normalizedItem: {
      update: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
  };

  const prisma = {
    $transaction: vi.fn(),
  };

  return { prisma, tx };
});

vi.mock("../../lib/prisma", () => ({ prisma: mocks.prisma }));

import { runEnduroCandidateRemediation } from "./service";

const ids = ["candidate-1", "candidate-2", "candidate-3", "candidate-4", "candidate-5", "candidate-6", "candidate-7"];

function candidate(
  id: string,
  rawText: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    id,
    normalizedItemId: `normalized-${id}`,
    dedupGroupId: null,
    status: "needs_review",
    reviewPriority: 70,
    trustScore: 0.7,
    fitScore: 0.7,
    futureEventScore: 0.7,
    duplicateScore: 0,
    finalScore: 0.7,
    eventLikelihoodScore: 0.7,
    completenessScore: 0.7,
    sourceTrustScore: 0.7,
    tourismFitScore: 0.7,
    decisionNotes: null,
    reviewedBy: null,
    reviewedAt: null,
    createdAt: new Date("2026-07-23T21:50:32.000Z"),
    updatedAt: new Date("2026-07-23T21:50:32.000Z"),
    publishedProgram: null,
    normalizedItem: {
      id: `normalized-${id}`,
      rawItemId: `raw-${id}`,
      title: "Old enduro title",
      country: "Russia",
      region: null,
      city: null,
      priceFrom: null,
      currency: null,
      parseVersion: "v1_rules",
      organizerName: "Анонсы эндуро гонок",
      rawItem: {
        id: `raw-${id}`,
        sourceId: "enduro-source",
        sourceUrl: `https://t.me/raceenduro/${id}`,
        authorName: null,
        publishedAt: new Date("2026-07-23T12:00:00.000Z"),
        rawTitle: "Анонсы эндуро гонок",
        rawText,
        rawMediaJson: [],
        rawPayloadJson: null,
        source: {
          id: "enduro-source",
          name: "Анонсы эндуро гонок",
          type: "telegram",
          priority: 100,
          trustScore: 0.8,
          discipline: "enduro",
          country: null,
          region: null,
          organizerId: null,
          organizer: null,
        },
      },
    },
    ...overrides,
  };
}

function validCandidates() {
  return [
    candidate(ids[0], "29 августа 2026 – Way Offroad Костромская обл., с.п. Прискоковское Взнос – 4 500 р."),
    candidate(ids[1], "08 августа 2026 – До отстрела Смоленская обл., д. Лягушкино Взнос – 6 000 р."),
    candidate(ids[2], "28-30 августа 2026 – SKHAUAT Карачаево-Черкесская Республика, с. Схауат Взнос – 20 000 р."),
    candidate(ids[3], "08-09 августа 2026 – UZBEKISTAN ENDURO CUP Республика Узбекистан, Ташкентская обл., г. Ахангаран"),
    candidate(ids[4], "15 августа 2026 – Дикий лось Ленинградская обл., с.п. Юкковское Взнос – 4 500 р."),
    candidate(ids[5], "25 июля 2026 – ZET Race Московская обл., с. Поярково Регистрация закрывается сегодня"),
    candidate(ids[6], "26-27 сентября 2026 – Эволюция Алтайский край, г. Белокуриха Взнос – 15 000 р."),
  ];
}

describe("candidate-scoped enduro remediation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.$transaction.mockImplementation(async (callback: (tx: typeof mocks.tx) => Promise<unknown>) => callback(mocks.tx));
    mocks.tx.eventCandidate.update.mockResolvedValue({});
    mocks.tx.normalizedItem.update.mockResolvedValue({});
    mocks.tx.auditLog.create.mockResolvedValue({});
  });

  it("updates exactly seven explicit enduro candidates and keeps their lifecycle unchanged", async () => {
    mocks.tx.eventCandidate.findMany.mockResolvedValue(validCandidates());

    await expect(runEnduroCandidateRemediation("ops-1", ids)).resolves.toEqual({
      scope: "enduro-candidates:7",
      processed: 7,
      created: 0,
      updated: 7,
    });

    expect(mocks.tx.normalizedItem.update.mock.calls.map(([args]) => args.where.id).sort()).toEqual(
      ids.map((id) => `normalized-${id}`).sort(),
    );
    expect(mocks.tx.eventCandidate.update.mock.calls.map(([args]) => args.where.id).sort()).toEqual([...ids].sort());
    expect(mocks.tx.eventCandidate.update.mock.calls.every(([args]) => args.data.status === undefined && args.data.dedupGroupId === undefined)).toBe(true);
    expect(mocks.tx.auditLog.create).toHaveBeenCalledTimes(7);

    const normalizedUpdates = mocks.tx.normalizedItem.update.mock.calls.map(([args]) => args);
    expect(normalizedUpdates.find((args) => args.where.id === "normalized-candidate-4")?.data).toMatchObject({
      title: "UZBEKISTAN ENDURO CUP",
      country: "Uzbekistan",
      region: "Ташкентская область",
      city: "Ахангаран",
      parseVersion: "v1_rules_enduro_race",
    });
    expect(normalizedUpdates.find((args) => args.where.id === "normalized-candidate-7")?.data).toMatchObject({
      title: "Эволюция",
      country: "Russia",
      region: "Алтайский край",
      city: "Белокуриха",
      priceFrom: 15000,
      currency: "RUB",
    });
    expect(normalizedUpdates.find((args) => args.where.id === "normalized-candidate-1")?.data).toMatchObject({
      priceFrom: 4500,
      currency: "RUB",
    });
  });

  it("rejects lifecycle or source violations before any write", async () => {
    const cases = [
      validCandidates().map((row, index) => (index === 0 ? { ...row, status: "published" } : row)),
      validCandidates().map((row, index) => (index === 0 ? { ...row, dedupGroupId: "group-1" } : row)),
      validCandidates().map((row, index) => (index === 0 ? { ...row, publishedProgram: { id: "published-1" } } : row)),
      validCandidates().map((row, index) =>
        index === 0
          ? {
              ...row,
              normalizedItem: {
                ...row.normalizedItem,
                rawItem: {
                  ...row.normalizedItem.rawItem,
                  source: { ...row.normalizedItem.rawItem.source, name: "Other source" },
                },
              },
            }
          : row,
      ),
    ];

    for (const rows of cases) {
      mocks.tx.eventCandidate.findMany.mockResolvedValueOnce(rows);
      await expect(runEnduroCandidateRemediation(null, ids)).rejects.toThrow("Enduro remediation preflight failed");
    }

    expect(mocks.tx.normalizedItem.update).not.toHaveBeenCalled();
    expect(mocks.tx.eventCandidate.update).not.toHaveBeenCalled();
    expect(mocks.tx.auditLog.create).not.toHaveBeenCalled();
  });

  it("rejects missing, duplicate, blank, or non-seven candidate IDs before writing", async () => {
    mocks.tx.eventCandidate.findMany.mockResolvedValue(validCandidates().slice(0, 6));
    await expect(runEnduroCandidateRemediation(null, ids)).rejects.toThrow("were not found");
    await expect(runEnduroCandidateRemediation(null, [...ids.slice(0, 6), ids[0]])).rejects.toThrow("must not contain duplicates");
    await expect(runEnduroCandidateRemediation(null, [...ids.slice(0, 6), ""])).rejects.toThrow("non-empty IDs");
    await expect(runEnduroCandidateRemediation(null, ids.slice(0, 6))).rejects.toThrow("exactly seven");

    expect(mocks.tx.normalizedItem.update).not.toHaveBeenCalled();
    expect(mocks.tx.eventCandidate.update).not.toHaveBeenCalled();
    expect(mocks.tx.auditLog.create).not.toHaveBeenCalled();
  });
});
