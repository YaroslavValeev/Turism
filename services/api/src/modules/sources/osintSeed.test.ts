import fs from "fs/promises";
import { describe, expect, it } from "vitest";
import { normalizeProposedSourceUrl } from "./sourceProposal";

type SeedRow = {
  region: string;
  name: string;
  url: string;
  kind: string;
  disciplines: string[];
  osintScore: number;
  evidence: string[];
};

async function loadSeed(): Promise<SeedRow[]> {
  const file = new URL("../../../prisma/source_proposals_osint_2026-09-29.json", import.meta.url);
  return JSON.parse(await fs.readFile(file, "utf8")) as SeedRow[];
}

describe("OSINT source proposal seed", () => {
  it("contains exactly 10 candidates for each pilot region", async () => {
    const rows = await loadSeed();
    expect(rows).toHaveLength(30);
    const byRegion = rows.reduce<Record<string, number>>((acc, row) => {
      acc[row.region] = (acc[row.region] ?? 0) + 1;
      return acc;
    }, {});
    expect(byRegion).toEqual({ "Камчатка": 10, "Алтай": 10, "Приэльбрусье": 10 });
  });

  it("has valid unique canonical source URLs and evidence", async () => {
    const rows = await loadSeed();
    const seen = new Set<string>();

    for (const row of rows) {
      expect(row.name.trim().length).toBeGreaterThan(0);
      expect(row.kind.trim().length).toBeGreaterThan(0);
      expect(row.disciplines.length).toBeGreaterThan(0);
      expect(row.osintScore).toBeGreaterThanOrEqual(1);
      expect(row.osintScore).toBeLessThanOrEqual(5);
      expect(row.evidence.length).toBeGreaterThan(0);

      const normalized = normalizeProposedSourceUrl(row.url);
      const key = `${normalized.detectedType}:${normalized.normalizedUrl}`;
      expect(seen.has(key), `duplicate canonical source: ${key}`).toBe(false);
      seen.add(key);

      for (const evidenceUrl of row.evidence) {
        const parsed = new URL(evidenceUrl);
        expect(["http:", "https:"]).toContain(parsed.protocol);
      }
    }
  });
});
