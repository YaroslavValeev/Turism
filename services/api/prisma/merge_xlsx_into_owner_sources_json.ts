/**
 * Сравнивает XLSX (mywave v5 mapping) с `source_imports_owner_*.json` и дописывает только новые источники
 * по ключу type + нормализованный urlOrHandle.
 *
 * Usage:
 *   pnpm --filter api exec tsx prisma/merge_xlsx_into_owner_sources_json.ts "<new.xlsx>" [path-to-json] [baseline.xlsx]
 *
 * Если указан baseline.xlsx — в JSON попадают только кандидаты из new.xlsx, которых нет в baseline (diff версий таблицы).
 * Если baseline не указан — все уникальные кандидаты из new.xlsx, которых ещё нет в JSON.
 */
import fs from "fs/promises";
import path from "path";
import { extractUniqueImportCandidatesFromXlsxFile } from "../src/modules/sources/importService";
import { normalizeSourceUrlOrHandle } from "../src/modules/sources/sourceRegistry";

type OwnerJsonSource = {
  type: string;
  name: string;
  urlOrHandle: string;
  discipline?: string | null;
  country?: string | null;
  region?: string | null;
  language?: string | null;
  priority?: number;
  trustScore?: number;
  parserProfile?: string | null;
  fetchIntervalMinutes?: number;
  isActive?: boolean;
  metaJson?: Record<string, unknown>;
};

function entryKey(entry: { type: string; urlOrHandle: string }): string {
  const url = normalizeSourceUrlOrHandle(entry.type, entry.urlOrHandle.trim());
  return `${entry.type}::${url}`;
}

function candidateToOwnerJson(c: ReturnType<typeof extractUniqueImportCandidatesFromXlsxFile>[number], xlsxLabel: string): OwnerJsonSource {
  return {
    type: c.sourceType,
    name: c.sourceName.trim() || "source",
    urlOrHandle: c.urlOrHandle,
    discipline: c.discipline,
    country: c.country ?? "Russia",
    region: c.region ?? "",
    language: "ru",
    priority: c.priority,
    trustScore: 0.5,
    parserProfile: c.parserProfile,
    fetchIntervalMinutes: 1440,
    isActive: true,
    metaJson: {
      autoPublish: false,
      notes: [
        `Merged from XLSX ${xlsxLabel}`,
        `sheet=${c.sheetName} row=${c.rowNumber}`,
      ],
      xlsxImportMeta: c.metaJson,
    },
  };
}

async function main() {
  const xlsxPath = process.argv[2];
  if (!xlsxPath?.trim()) {
    throw new Error(
      'Usage: tsx prisma/merge_xlsx_into_owner_sources_json.ts "<new.xlsx>" [path-to.json] [baseline.xlsx]',
    );
  }
  const arg3 = process.argv[3]?.trim();
  const arg4 = process.argv[4]?.trim();
  let jsonPath = path.join(__dirname, "source_imports_owner_2026-04-16.json");
  let baselineXlsx: string | null = null;
  if (arg3 && arg3.toLowerCase().endsWith(".xlsx")) {
    baselineXlsx = arg3;
  } else if (arg3) {
    jsonPath = arg3;
  }
  if (arg4 && arg4.toLowerCase().endsWith(".xlsx")) {
    baselineXlsx = arg4;
  }

  const xlsxLabel = path.basename(xlsxPath);
  const raw = await fs.readFile(jsonPath, "utf-8");
  const existing = JSON.parse(raw) as OwnerJsonSource[];
  if (!Array.isArray(existing)) {
    throw new Error("JSON must be an array of sources");
  }

  const keys = new Set(existing.map((e) => entryKey(e)));
  let candidates = extractUniqueImportCandidatesFromXlsxFile(xlsxPath);
  if (baselineXlsx) {
    const baselineKeys = new Set(
      extractUniqueImportCandidatesFromXlsxFile(baselineXlsx).map((c) => `${c.sourceType}::${c.urlOrHandle}`),
    );
    candidates = candidates.filter((c) => !baselineKeys.has(`${c.sourceType}::${c.urlOrHandle}`));
  }

  const additions: OwnerJsonSource[] = [];
  for (const c of candidates) {
    const k = `${c.sourceType}::${c.urlOrHandle}`;
    if (keys.has(k)) continue;
    keys.add(k);
    additions.push(candidateToOwnerJson(c, xlsxLabel));
  }

  if (additions.length === 0) {
    console.log(
      JSON.stringify(
        {
          jsonPath,
          xlsxPath,
          baselineXlsx,
          candidatesUnique: candidates.length,
          added: 0,
          message: "no_new_sources_vs_json",
        },
        null,
        2,
      ),
    );
    return;
  }

  const merged = [...existing, ...additions];
  await fs.writeFile(jsonPath, `${JSON.stringify(merged, null, 2)}\n`, "utf-8");

  console.log(
    JSON.stringify(
      {
        jsonPath,
        xlsxPath,
        baselineXlsx,
        candidatesUnique: candidates.length,
        added: additions.length,
        addedPreview: additions.slice(0, 5).map((a) => ({ type: a.type, urlOrHandle: a.urlOrHandle, name: a.name })),
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
