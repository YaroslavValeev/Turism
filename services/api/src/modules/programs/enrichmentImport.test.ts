import { describe, expect, it, vi } from "vitest";
import {
  draftKey,
  matchesProgram,
  parseEnrichmentImportFile,
  planEnrichmentImport,
  runEnrichmentImport,
  type EnrichmentImportClient,
  type EnrichmentImportFile,
  type ImportProgramCandidate,
} from "./enrichmentImport";

const NOW = new Date("2026-10-02T12:00:00Z");
const SOURCES = [{ url: "https://sheregesh.ru/kak-dobratsya", accessedAt: "2026-10-01" }];
const TEXT = "До Шерегеша добираются через аэропорт Новокузнецка: рейсовые автобусы и такси, около трёх часов в пути.";

const programs: ImportProgramCandidate[] = [
  { id: "p1", title: "Фрирайд-кэмп в Шерегеше", region: "Кемеровская область", exactLocation: null, publishStatus: "published" },
  { id: "p2", title: "Ски-тур", region: "Шерегеш", exactLocation: null, publishStatus: "published" },
  { id: "p3", title: "Шерегеш — черновик", region: "Кемеровская область", exactLocation: null, publishStatus: "draft" },
  { id: "p4", title: "Вейк-кэмп", region: "Краснодарский край", exactLocation: "Кубань", publishStatus: "published" },
];

const file: EnrichmentImportFile = {
  batchId: "sheregesh-2026-10",
  items: [
    { programMatch: { region: "Шерегеш", titleIncludes: ["Шерегеш"] }, field: "transfer", content: { text: TEXT }, sources: SOURCES, checkedAt: "2026-10-01" },
    { programId: "p4", field: "equipment", content: { text: "x".repeat(60) }, sources: SOURCES, checkedAt: "2026-10-01" },
    { programId: "p4", field: "transfer", content: { text: "коротко" }, sources: SOURCES, checkedAt: "2026-10-01" },
    { programId: "missing", field: "transfer", content: { text: TEXT }, sources: SOURCES, checkedAt: "2026-10-01" },
  ],
};

describe("planEnrichmentImport", () => {
  it("applies programMatch to published programs only and reports invalid/unmatched items", () => {
    const plan = planEnrichmentImport(file, programs, new Set(), NOW);
    expect(plan.creates.map((c) => `${c.programId}:${c.field}`)).toEqual(["p1:transfer", "p2:transfer", "p4:equipment"]);
    expect(plan.invalid.map((i) => i.index)).toEqual([2]);
    expect(plan.unmatched.map((i) => i.index)).toEqual([3]);
  });

  it("is idempotent: skips drafts that already exist for the same program, field and batch", () => {
    const existing = new Set([draftKey("p1", "transfer", file.batchId)]);
    const plan = planEnrichmentImport(file, programs, existing, NOW);
    expect(plan.creates.map((c) => c.programId)).toEqual(["p2", "p4"]);
    expect(plan.skippedExisting).toEqual([{ programId: "p1", field: "transfer" }]);
    expect(existing.size).toBe(1);
  });

  it("rejects future checkedAt and items without a target", () => {
    const plan = planEnrichmentImport(
      {
        batchId: "b",
        items: [
          { programId: "p1", field: "transfer", content: { text: TEXT }, sources: SOURCES, checkedAt: "2027-01-01" },
          { field: "transfer", content: { text: TEXT }, sources: SOURCES, checkedAt: "2026-10-01" },
        ],
      },
      programs,
      new Set(),
      NOW,
    );
    expect(plan.creates).toEqual([]);
    expect(plan.invalid.map((i) => i.index)).toEqual([0, 1]);
  });

  it("matches region against exactLocation as well", () => {
    expect(matchesProgram({ region: "кубань" }, programs[3])).toBe(true);
    expect(matchesProgram({ titleIncludes: ["шерегеш"] }, programs[3])).toBe(false);
  });

  it("validates the file envelope", () => {
    expect(() => parseEnrichmentImportFile({ items: [] })).toThrow(/batchId/);
    expect(() => parseEnrichmentImportFile({ batchId: "b", items: [] })).toThrow(/items/);
  });
});

describe("runEnrichmentImport", () => {
  function client(): EnrichmentImportClient & { createMany: ReturnType<typeof vi.fn> } {
    const createMany = vi.fn(async ({ data }: { data: unknown[] }) => ({ count: data.length }));
    return {
      createMany,
      program: { findMany: vi.fn(async () => programs) },
      programEnrichment: { findMany: vi.fn(async () => [{ programId: "p2", field: "transfer" }]), createMany },
    };
  }

  it("does not write in dry-run mode", async () => {
    const c = client();
    const summary = await runEnrichmentImport(c, file, { apply: false, now: NOW });
    expect(c.createMany).not.toHaveBeenCalled();
    expect(summary).toMatchObject({ dryRun: true, toCreate: 2, skippedExisting: 1, created: 0 });
  });

  it("creates only draft rows with --apply", async () => {
    const c = client();
    const summary = await runEnrichmentImport(c, file, { apply: true, now: NOW });
    expect(summary).toMatchObject({ dryRun: false, created: 2 });
    const rows = c.createMany.mock.calls[0][0].data as Array<Record<string, unknown>>;
    expect(rows.every((r) => r.status === "draft" && r.batchId === file.batchId)).toBe(true);
    expect(rows.map((r) => r.programId)).toEqual(["p1", "p4"]);
  });
});
