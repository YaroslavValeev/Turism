import { spawnSync } from "child_process";
import fs from "fs/promises";
import path from "path";
import type { PrismaClient } from "@prisma/client";
import { SOURCE_ORIGIN, detectSourceType, normalizeSourceUrlOrHandle, upsertSourceByTypeAndHandle } from "./sourceRegistry";

export type ImportCandidate = {
  sheetName: string;
  rowNumber: number;
  sourceType: string;
  urlOrHandle: string;
  sourceName: string;
  parserProfile: string | null;
  discipline: string | null;
  country: string | null;
  region: string | null;
  priority: number;
  metaJson: Record<string, unknown>;
};

const RELEVANT_SHEETS = ["PROJECTS_DB", "TG_VK_SOURCES", "TOP_30_PRIORITY", "KIDS_FAMILY", "PREMIUM_EXPEDITIONS"];

function toStringOrNull(value: unknown): string | null {
  const v = String(value ?? "").trim();
  return v ? v : null;
}

function parserProfileForType(type: string): string | null {
  if (type === "telegram") return "telegram_channel";
  if (type === "instagram") return "instagram_public_profile";
  if (type === "vk") return "vk_public_page";
  if (type === "rss") return "rss_feed";
  if (type === "site") return "site_html";
  return null;
}

function asPriority(v: unknown, fallback = 100): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.min(1000, Math.floor(n)));
}

/** Правила очереди ручной проверки после batch-import (см. roadmap Wave 1). */
export function importCandidateNeedsManualReview(c: ImportCandidate): boolean {
  if (c.sourceType === "other") return true;
  if (c.urlOrHandle.length < 12) return true;
  if ((c.sourceName ?? "").trim().length < 2) return true;
  return false;
}

function collectUrlFields(record: Record<string, unknown>): Array<{ key: string; value: string }> {
  const candidates: Array<{ key: string; value: string }> = [];
  const keys = ["website", "telegram", "vk", "instagram", "url", "booking_entry_point", "evidence_url"];
  for (const key of keys) {
    const value = toStringOrNull(record[key]);
    if (value) candidates.push({ key, value });
  }
  return candidates;
}

function mapSheetRows(rows: Array<Record<string, unknown>>, sheetName: string): ImportCandidate[] {
  const out: ImportCandidate[] = [];
  rows.forEach((row, idx) => {
    const rowNumber = idx + 2;
    const projectName = toStringOrNull(row.project_name) ?? toStringOrNull(row.source_name) ?? `row_${rowNumber}`;
    const discipline = toStringOrNull(row.discipline);
    const region = toStringOrNull(row.region);
    const country = toStringOrNull(row.country);
    const urls = collectUrlFields(row);
    urls.forEach(({ key, value }) => {
      const sourceType =
        key === "telegram"
          ? "telegram"
          : key === "instagram"
            ? "instagram"
            : key === "vk"
              ? "vk"
              : key === "url"
                ? (() => {
                    const platform = toStringOrNull(row.platform)?.toLowerCase();
                    if (platform === "telegram") return "telegram";
                    if (platform === "instagram") return "instagram";
                    if (platform === "vk") return "vk";
                    if (platform === "rss") return "rss";
                    return detectSourceType(value);
                  })()
                : detectSourceType(value);
      const normalized = normalizeSourceUrlOrHandle(sourceType, value);
      if (!normalized) return;
      out.push({
        sheetName,
        rowNumber,
        sourceType,
        urlOrHandle: normalized,
        sourceName: projectName,
        parserProfile: parserProfileForType(sourceType),
        discipline,
        country,
        region,
        priority: asPriority(row.priority_tier ?? row.platform_fit_score ?? row.priority, 100),
        metaJson: {
          source_sheet: sheetName,
          source_row: rowNumber,
          source_column: key,
          project_name: projectName,
          cluster: toStringOrNull(row.cluster),
          subtype: toStringOrNull(row.subtype),
          kids_flag: toStringOrNull(row.kids_flag),
          family_flag: toStringOrNull(row.family_flag),
          premium_flag: toStringOrNull(row.premium_flag),
          signal: toStringOrNull(row.signal),
          focus: toStringOrNull(row.focus),
          why_useful: toStringOrNull(row.why_useful),
          evidence_url: toStringOrNull(row.evidence_url),
          evidence_note: toStringOrNull(row.evidence_note),
        },
      });
    });
  });
  return out;
}

function loadWorkbookRows(filePath: string): Record<string, Array<Record<string, unknown>>> {
  const py = `
import json, openpyxl, sys
file_path = sys.argv[1]
sheets = sys.argv[2].split(",")
wb = openpyxl.load_workbook(file_path, data_only=True)
out = {}
for sheet_name in sheets:
    if sheet_name not in wb.sheetnames:
        continue
    ws = wb[sheet_name]
    headers = [str(cell.value).strip() if cell.value is not None else "" for cell in ws[1]]
    rows = []
    for row in ws.iter_rows(min_row=2, values_only=True):
        rec = {}
        has_any = False
        for i, value in enumerate(row):
            if i >= len(headers):
                continue
            key = headers[i]
            if not key:
                continue
            if value is None:
                continue
            has_any = True
            rec[key] = value
        if has_any:
            rows.append(rec)
    out[sheet_name] = rows
print(json.dumps(out, ensure_ascii=False))
`;
  const proc = spawnSync("python", ["-c", py, filePath, RELEVANT_SHEETS.join(",")], {
    encoding: "utf-8",
    maxBuffer: 8 * 1024 * 1024,
  });
  if (proc.status !== 0) {
    throw new Error(`xlsx_read_failed: ${proc.stderr || proc.stdout || "unknown error"}`);
  }
  const parsed = JSON.parse(proc.stdout || "{}") as Record<string, Array<Record<string, unknown>>>;
  return parsed;
}

function loadCsvRows(filePath: string): Record<string, Array<Record<string, unknown>>> {
  const py = `
import csv, json, sys
file_path = sys.argv[1]
rows = []
with open(file_path, "r", encoding="utf-8-sig", newline="") as f:
    reader = csv.DictReader(f)
    for row in reader:
        rec = {k: v for k, v in row.items() if k and v not in (None, "")}
        if rec:
            rows.append(rec)
print(json.dumps({"CSV_IMPORT": rows}, ensure_ascii=False))
`;
  const proc = spawnSync("python", ["-c", py, filePath], {
    encoding: "utf-8",
    maxBuffer: 8 * 1024 * 1024,
  });
  if (proc.status !== 0) {
    throw new Error(`csv_read_failed: ${proc.stderr || proc.stdout || "unknown error"}`);
  }
  return JSON.parse(proc.stdout || "{\"CSV_IMPORT\":[]}") as Record<string, Array<Record<string, unknown>>>;
}

async function loadJsonRows(filePath: string): Promise<Record<string, Array<Record<string, unknown>>>> {
  const raw = JSON.parse(await fs.readFile(filePath, "utf-8")) as unknown;
  if (Array.isArray(raw)) {
    return { JSON_IMPORT: raw as Array<Record<string, unknown>> };
  }
  if (raw && typeof raw === "object") {
    return raw as Record<string, Array<Record<string, unknown>>>;
  }
  return { JSON_IMPORT: [] };
}

async function runWorkbookLikeImport(
  db: PrismaClient,
  options: {
    filePath: string;
    startedBy: string | null;
    dryRun: boolean;
    sourceFormat: "xlsx" | "csv" | "json";
    workbookRows: Record<string, Array<Record<string, unknown>>>;
    relevantSheets: string[];
  },
) {
  const session = await db.sourceImportSession.create({
    data: {
      status: options.dryRun ? "dry_run" : "created",
      sourceFileName: options.filePath,
      sourceFormat: options.sourceFormat,
      sourceOrigin: SOURCE_ORIGIN.BATCH_IMPORT,
      startedBy: options.startedBy ?? null,
      dryRun: options.dryRun,
    },
  });
  const candidates = Object.entries(options.workbookRows).flatMap(([sheetName, rows]) => mapSheetRows(rows, sheetName));

  const dedupMap = new Map<string, ImportCandidate>();
  for (const c of candidates) {
    const key = `${c.sourceType}::${c.urlOrHandle}`;
    if (!dedupMap.has(key)) dedupMap.set(key, c);
  }
  const uniqueCandidates = [...dedupMap.values()];

  let created = 0;
  let updated = 0;
  let skipped = 0;
  let duplicates = candidates.length - uniqueCandidates.length;
  let errors = 0;
  let manualReviewCount = 0;

  for (const c of uniqueCandidates) {
    const manual = importCandidateNeedsManualReview(c);
    try {
      const existing = await db.source.findFirst({
        where: { type: c.sourceType, urlOrHandle: c.urlOrHandle },
        select: { id: true },
      });
      if (manual) manualReviewCount += 1;
      if (!options.dryRun) {
        const rowAction = manual ? "manual_review" : existing ? "updated" : "created";
        const source = await upsertSourceByTypeAndHandle(db, {
          type: c.sourceType,
          name: c.sourceName,
          urlOrHandle: c.urlOrHandle,
          parserProfile: c.parserProfile,
          fetchIntervalMinutes: 1440,
          sourceOrigin: SOURCE_ORIGIN.BATCH_IMPORT,
          lifecycleState: "active",
          isActive: true,
          autoPublish: false,
          discipline: c.discipline,
          country: c.country,
          region: c.region,
          importSessionId: session.id,
          metaJson: {
            ...c.metaJson,
            importSessionId: session.id,
            importedAt: new Date().toISOString(),
            importRequiresManualReview: manual,
          },
        });
        await db.sourceImportRow.create({
          data: {
            sessionId: session.id,
            sheetName: c.sheetName,
            rowNumber: c.rowNumber,
            sourceType: c.sourceType,
            urlOrHandle: c.urlOrHandle,
            sourceName: c.sourceName,
            action: rowAction,
            sourceId: source.id,
            normalizedJson: c as unknown as object,
            rawJson: c.metaJson as unknown as object,
          },
        });
      }
      if (existing) updated += 1;
      else created += 1;
    } catch (error) {
      errors += 1;
      if (!options.dryRun) {
        await db.sourceImportRow.create({
          data: {
            sessionId: session.id,
            sheetName: c.sheetName,
            rowNumber: c.rowNumber,
            sourceType: c.sourceType,
            urlOrHandle: c.urlOrHandle,
            sourceName: c.sourceName,
            action: "error",
            errorMessage: error instanceof Error ? error.message : String(error),
            normalizedJson: c as unknown as object,
            rawJson: c.metaJson as unknown as object,
          },
        });
      }
    }
  }

  skipped = options.dryRun ? uniqueCandidates.length : 0;
  const status = errors > 0 ? "failed" : options.dryRun ? "dry_run" : "completed";
  await db.sourceImportSession.update({
    where: { id: session.id },
    data: {
      status,
      finishedAt: new Date(),
      createdCount: created,
      updatedCount: updated,
      skippedCount: skipped,
      duplicateCount: duplicates,
      errorCount: errors,
      summaryJson: {
        totalCandidates: candidates.length,
        uniqueCandidates: uniqueCandidates.length,
        relevantSheets: options.relevantSheets,
        manualReviewCount,
      },
    },
  });
  return {
    sessionId: session.id,
    status,
    created,
    updated,
    skipped,
    duplicates,
    errors,
    manualReviewCount,
    totalCandidates: candidates.length,
    uniqueCandidates: uniqueCandidates.length,
    relevantSheets: options.relevantSheets,
  };
}

export async function runSourceImportFile(
  db: PrismaClient,
  options: { filePath: string; startedBy: string | null; dryRun: boolean },
) {
  const ext = path.extname(options.filePath).toLowerCase();
  if (ext === ".xlsx") {
    const workbookRows = loadWorkbookRows(options.filePath);
    return runWorkbookLikeImport(db, {
      ...options,
      sourceFormat: "xlsx",
      workbookRows,
      relevantSheets: RELEVANT_SHEETS,
    });
  }
  if (ext === ".csv") {
    const workbookRows = loadCsvRows(options.filePath);
    return runWorkbookLikeImport(db, {
      ...options,
      sourceFormat: "csv",
      workbookRows,
      relevantSheets: Object.keys(workbookRows),
    });
  }
  if (ext === ".json") {
    const workbookRows = await loadJsonRows(options.filePath);
    return runWorkbookLikeImport(db, {
      ...options,
      sourceFormat: "json",
      workbookRows,
      relevantSheets: Object.keys(workbookRows),
    });
  }
  throw new Error(`unsupported_import_format: ${ext || "unknown"}`);
}

export async function runXlsxSourceImport(
  db: PrismaClient,
  options: { filePath: string; startedBy: string | null; dryRun: boolean },
) {
  return runSourceImportFile(db, options);
}

/** Уникальные кандидаты из XLSX (та же логика, что и batch-import), без записи в БД. */
export function extractUniqueImportCandidatesFromXlsxFile(filePath: string): ImportCandidate[] {
  const workbookRows = loadWorkbookRows(filePath);
  const candidates = Object.entries(workbookRows).flatMap(([sheetName, rows]) => mapSheetRows(rows, sheetName));
  const dedupMap = new Map<string, ImportCandidate>();
  for (const c of candidates) {
    const key = `${c.sourceType}::${c.urlOrHandle}`;
    if (!dedupMap.has(key)) dedupMap.set(key, c);
  }
  return [...dedupMap.values()];
}

