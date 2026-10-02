import fs from "fs/promises";
import path from "path";

export const SCOUT_SCHEMA_VERSION = 1;
export const LEGACY_BATCH_FILE_PREFIX = "source_proposals_osint_";

export type ScoutCandidate = {
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

export type ScoutBatch = {
  batchId: string;
  schemaVersion: number;
  /** Raw rows as read from disk; shape is only guaranteed after validateScoutBatch. */
  candidates: ScoutCandidate[];
};

/**
 * Legacy array files carry no batch id, so it is taken from the file name:
 * `source_proposals_osint_2026-09-29.json` → `2026-09-29`. Wave 1 audit trail
 * (submittedBy / notes header) depends on this exact value.
 */
export function batchIdFromFileName(fileName: string): string {
  const base = path.basename(fileName).replace(/\.json$/i, "");
  const id = base.startsWith(LEGACY_BATCH_FILE_PREFIX) ? base.slice(LEGACY_BATCH_FILE_PREFIX.length) : base;
  if (!id.trim()) throw new Error(`Cannot derive batchId from file name: ${fileName}`);
  return id;
}

export function parseScoutBatch(json: unknown, fileName: string): ScoutBatch {
  if (Array.isArray(json)) {
    return {
      batchId: batchIdFromFileName(fileName),
      schemaVersion: SCOUT_SCHEMA_VERSION,
      candidates: json as ScoutCandidate[],
    };
  }
  if (json && typeof json === "object") {
    const wrapper = json as Record<string, unknown>;
    if (wrapper.schemaVersion !== SCOUT_SCHEMA_VERSION) {
      throw new Error(`${fileName}: unsupported schemaVersion ${String(wrapper.schemaVersion)} (expected ${SCOUT_SCHEMA_VERSION})`);
    }
    if (typeof wrapper.batchId !== "string" || !wrapper.batchId.trim()) {
      throw new Error(`${fileName}: batchId is required`);
    }
    if (!Array.isArray(wrapper.candidates)) {
      throw new Error(`${fileName}: candidates must be an array`);
    }
    return {
      batchId: wrapper.batchId.trim(),
      schemaVersion: wrapper.schemaVersion,
      candidates: wrapper.candidates as ScoutCandidate[],
    };
  }
  throw new Error(`${fileName}: expected an array of candidates or {schemaVersion, batchId, candidates}`);
}

export async function loadScoutBatch(filePath: string): Promise<ScoutBatch> {
  const raw = await fs.readFile(filePath, "utf8");
  return parseScoutBatch(JSON.parse(raw), path.basename(filePath));
}
