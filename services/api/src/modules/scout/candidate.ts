import fs from "fs/promises";
import path from "path";

export const SCOUT_SCHEMA_VERSION = 1;
/** Wrapper-only format: candidates are validated against the shared taxonomy (@mywave/shared-types). */
export const SCOUT_SCHEMA_VERSION_V2 = 2;
export const SUPPORTED_SCOUT_SCHEMA_VERSIONS = [SCOUT_SCHEMA_VERSION, SCOUT_SCHEMA_VERSION_V2] as const;
export const LEGACY_BATCH_FILE_PREFIX = "source_proposals_osint_";

export type ScoutCandidate = {
  region: string;
  name: string;
  organizerName?: string | null;
  url: string;
  kind: string;
  keyPerson?: string | null;
  role?: string | null;
  /** v1: free text; v2: canonical DisciplineId values. */
  disciplines: string[];
  seasonality?: string | null;
  contacts?: Record<string, string | null>;
  legal?: { registry?: string | null; inn?: string | null };
  reputation?: string | null;
  partners?: string[];
  osintScore: number;
  evidence: string[];
  /** v2 only: ScoutAreaId of a wave 2 zone. */
  scoutArea?: string;
  /** v2 only: OrganizerKindId values. */
  organizerKinds?: string[];
  /** v2 only: discipline wording as found in the source, before mapping to ids. */
  rawDisciplines?: string[];
  /** v2 only: ActivityFormatId values. */
  formats?: string[];
};

export type ScoutBatch = {
  batchId: string;
  schemaVersion: number;
  /** v2 only: discovery wave number. */
  wave?: number;
  /** v2 only: ISO date (YYYY-MM-DD) or ISO timestamp of the discovery run. */
  discoveredAt?: string;
  /** Raw rows as read from disk; shape is only guaranteed after validateScoutBatch. */
  candidates: ScoutCandidate[];
};

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}(T[\d:.]+(Z|[+-]\d{2}:\d{2})?)?$/;

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

function parseV2Meta(wrapper: Record<string, unknown>, fileName: string): Pick<ScoutBatch, "wave" | "discoveredAt"> {
  const { wave, discoveredAt } = wrapper;
  if (typeof wave !== "number" || !Number.isInteger(wave) || wave < 1) {
    throw new Error(`${fileName}: wave must be a positive integer for schemaVersion ${SCOUT_SCHEMA_VERSION_V2}`);
  }
  if (typeof discoveredAt !== "string" || !ISO_DATE_RE.test(discoveredAt.trim()) || Number.isNaN(Date.parse(discoveredAt.trim()))) {
    throw new Error(`${fileName}: discoveredAt must be an ISO date (YYYY-MM-DD) for schemaVersion ${SCOUT_SCHEMA_VERSION_V2}`);
  }
  return { wave, discoveredAt: discoveredAt.trim() };
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
    const schemaVersion = wrapper.schemaVersion;
    if (!SUPPORTED_SCOUT_SCHEMA_VERSIONS.includes(schemaVersion as (typeof SUPPORTED_SCOUT_SCHEMA_VERSIONS)[number])) {
      throw new Error(
        `${fileName}: unsupported schemaVersion ${String(schemaVersion)} (expected ${SUPPORTED_SCOUT_SCHEMA_VERSIONS.join(" or ")})`,
      );
    }
    if (typeof wrapper.batchId !== "string" || !wrapper.batchId.trim()) {
      throw new Error(`${fileName}: batchId is required`);
    }
    if (!Array.isArray(wrapper.candidates)) {
      throw new Error(`${fileName}: candidates must be an array`);
    }
    return {
      batchId: wrapper.batchId.trim(),
      schemaVersion: schemaVersion as number,
      ...(schemaVersion === SCOUT_SCHEMA_VERSION_V2 ? parseV2Meta(wrapper, fileName) : {}),
      candidates: wrapper.candidates as ScoutCandidate[],
    };
  }
  throw new Error(`${fileName}: expected an array of candidates or {schemaVersion, batchId, candidates}`);
}

export async function loadScoutBatch(filePath: string): Promise<ScoutBatch> {
  const raw = await fs.readFile(filePath, "utf8");
  return parseScoutBatch(JSON.parse(raw), path.basename(filePath));
}
