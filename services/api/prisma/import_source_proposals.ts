import "../src/env/loadProcessEnv";
import fs from "fs/promises";
import { prisma } from "../src/lib/prisma";
import { normalizeProposedSourceUrl, submitSourceProposal } from "../src/modules/sources/sourceProposal";

type OsintCandidate = {
  region: string;
  name: string;
  organizerName?: string | null;
  url: string;
  kind: string;
  keyPerson?: string | null;
  role?: string | null;
  disciplines: string[];
  seasonality?: string | null;
  contacts?: Record<string, string | null>;
  legal?: { registry?: string | null; inn?: string | null };
  reputation?: string | null;
  partners?: string[];
  osintScore: number;
  evidence: string[];
};

function clean(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function buildNotes(item: OsintCandidate): string {
  const parts = [
    "OSINT discovery 2026-09-29",
    `регион=${item.region}`,
    `тип=${item.kind}`,
    `дисциплины=${item.disciplines.join(", ")}`,
    `OSINT score=${item.osintScore}/5`,
    item.keyPerson ? `ключевая персона=${item.keyPerson}${item.role ? ` (${item.role})` : ""}` : "ключевая персона=требует обогащения",
    item.legal?.registry ? `реестр=${item.legal.registry}` : "реестр=требует проверки",
    item.legal?.inn ? `ИНН=${item.legal.inn}` : null,
    item.seasonality ? `сезонность=${item.seasonality}` : null,
    item.reputation ? `репутация=${item.reputation}` : null,
    item.partners?.length ? `партнеры=${item.partners.join(", ")}` : null,
    `evidence=${item.evidence.join(" | ")}`,
  ].filter(Boolean);
  return parts.join("; ").slice(0, 2_000);
}

async function main() {
  const filePath = process.argv.find((arg) => arg.endsWith(".json"));
  const apply = process.argv.includes("--apply");
  if (!filePath) {
    throw new Error("Usage: tsx prisma/import_source_proposals.ts <json-file> [--apply]");
  }

  const payload = JSON.parse(await fs.readFile(filePath, "utf8")) as OsintCandidate[];
  if (!Array.isArray(payload) || payload.length === 0) {
    throw new Error("OSINT proposal payload must be a non-empty array");
  }

  const normalizedSeen = new Set<string>();
  const validated = payload.map((item, index) => {
    if (!clean(item.region) || !clean(item.name) || !clean(item.kind)) {
      throw new Error(`Row ${index + 1}: region/name/kind are required`);
    }
    if (!Array.isArray(item.disciplines) || item.disciplines.length === 0) {
      throw new Error(`Row ${index + 1}: disciplines are required`);
    }
    if (!Array.isArray(item.evidence) || item.evidence.length === 0) {
      throw new Error(`Row ${index + 1}: at least one evidence URL is required`);
    }
    if (!Number.isFinite(item.osintScore) || item.osintScore < 1 || item.osintScore > 5) {
      throw new Error(`Row ${index + 1}: osintScore must be 1..5`);
    }
    const normalized = normalizeProposedSourceUrl(item.url);
    const dedupKey = `${normalized.detectedType}:${normalized.normalizedUrl}`;
    if (normalizedSeen.has(dedupKey)) {
      throw new Error(`Row ${index + 1}: duplicate source URL ${normalized.normalizedUrl}`);
    }
    normalizedSeen.add(dedupKey);
    return { item, normalized };
  });

  const byRegion = validated.reduce<Record<string, number>>((acc, row) => {
    acc[row.item.region] = (acc[row.item.region] ?? 0) + 1;
    return acc;
  }, {});

  console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", total: validated.length, byRegion }, null, 2));
  if (!apply) {
    console.log("Dry-run only. Re-run with --apply after Owner review to write pending SourceProposal rows.");
    return;
  }

  const counters = { created: 0, duplicate: 0, existing_source: 0 };
  for (const { item } of validated) {
    const result = await submitSourceProposal({
      url: item.url,
      displayName: item.name,
      organizerName: clean(item.organizerName),
      notes: buildNotes(item),
      submittedVia: "admin",
      submittedBy: "osint-import:2026-09-29",
    });
    counters[result.kind] += 1;
    console.log(`${result.kind.padEnd(15)} ${item.region.padEnd(12)} ${item.name}`);
  }
  console.log(JSON.stringify(counters, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
