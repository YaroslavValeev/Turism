import { prisma } from "../../lib/prisma";
import { submitSourceProposal } from "../sources/sourceProposal";
import { batchNotesHeader, buildNotes } from "./notes";
import type { ScoutValidatedRow } from "./validate";

export type ScoutImportKind = "created" | "duplicate" | "existing_source" | "previously_reviewed";

export type ScoutImportCounts = Record<ScoutImportKind, number>;

export type ScoutImportOptions = {
  batchId: string;
  apply: boolean;
  submittedBy?: string;
  onRow?: (row: ScoutValidatedRow, kind: ScoutImportKind) => void;
};

export type ScoutImportResult = {
  applied: boolean;
  counts: ScoutImportCounts;
};

/** Operator decisions are final for discovery: a rejected/approved URL is never re-proposed. */
const REVIEWED_STATUSES = ["rejected", "approved"];

export function scoutSubmittedBy(batchId: string): string {
  return `osint-import:${batchId}`;
}

function clean(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * Writes pending SourceProposal rows only. Source/Program records are created exclusively
 * through the operator approve flow in sources/sourceProposal.ts.
 */
export async function importScoutBatch(rows: ScoutValidatedRow[], options: ScoutImportOptions): Promise<ScoutImportResult> {
  const counts: ScoutImportCounts = { created: 0, duplicate: 0, existing_source: 0, previously_reviewed: 0 };
  // Dry-run stays DB-free, same as the legacy CLI: validation output is the whole report.
  if (!options.apply) return { applied: false, counts };

  const submittedBy = options.submittedBy ?? scoutSubmittedBy(options.batchId);
  const header = batchNotesHeader(options.batchId);

  for (const row of rows) {
    const reviewed = await prisma.sourceProposal.findFirst({
      where: { normalizedUrl: row.normalizedUrl, status: { in: REVIEWED_STATUSES } },
      select: { id: true },
    });
    let kind: ScoutImportKind;
    if (reviewed) {
      kind = "previously_reviewed";
    } else {
      const result = await submitSourceProposal({
        url: row.item.url,
        displayName: row.item.name,
        organizerName: clean(row.item.organizerName),
        notes: buildNotes(row.item, header),
        submittedVia: "admin",
        submittedBy,
      });
      kind = result.kind;
    }
    counts[kind] += 1;
    options.onRow?.(row, kind);
  }
  return { applied: true, counts };
}
