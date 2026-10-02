import {
  ACTIVITY_FORMAT_IDS,
  DISCIPLINE_IDS,
  ORGANIZER_KIND_IDS,
  SCOUT_AREAS,
  normalizeToken,
  resolveDiscipline,
  resolveDisciplines,
  resolveFormat,
  resolveOrganizerKinds,
  resolveScoutArea,
} from "@mywave/shared-types";
import { normalizeProposedSourceUrl } from "../sources/proposalUrl";
import { SCOUT_SCHEMA_VERSION_V2, type ScoutBatch, type ScoutCandidate } from "./candidate";
import { NOTES_MAX_LENGTH, batchNotesHeader, composeNotes } from "./notes";

/**
 * Discovery output is only a proposal. Trust/publication state is decided later by an operator
 * (SourceProposal approve → inactive Source), so a candidate must never claim it.
 */
export const FORBIDDEN_CANDIDATE_FIELDS = [
  "verified",
  "trusted",
  "verificationStatus",
  "trustScore",
  "isActive",
  "autoPublish",
  "publishStatus",
] as const;

/** v2 candidates may only target zones of this wave. */
export const SCOUT_V2_AREA_WAVE = 2;
/** Per-zone target is 10 candidates; outside [MIN, MAX] the batch gets a warning. */
export const SCOUT_AREA_TARGET = 10;
export const SCOUT_AREA_MIN = 5;
export const SCOUT_AREA_MAX = 12;

export const SCOUT_V2_CANDIDATE_FIELDS = [
  "scoutArea",
  "region",
  "name",
  "organizerName",
  "url",
  "organizerKinds",
  "kind",
  "disciplines",
  "rawDisciplines",
  "formats",
  "seasonality",
  "keyPerson",
  "role",
  "contacts",
  "legal",
  "reputation",
  "partners",
  "osintScore",
  "evidence",
] as const;

const V2_AREA_IDS: readonly string[] = SCOUT_AREAS.filter((area) => area.wave === SCOUT_V2_AREA_WAVE).map((area) => area.id);
const DISCIPLINE_ID_SET = new Set<string>(DISCIPLINE_IDS);
const FORMAT_ID_SET = new Set<string>(ACTIVITY_FORMAT_IDS);
const ORGANIZER_KIND_ID_SET = new Set<string>(ORGANIZER_KIND_IDS);
const KNOWN_V2_FIELDS = new Set<string>([...SCOUT_V2_CANDIDATE_FIELDS, ...FORBIDDEN_CANDIDATE_FIELDS]);
const OPTIONAL_V2_STRING_FIELDS = ["organizerName", "seasonality", "keyPerson", "role", "reputation"] as const;

export type ScoutIssue = {
  /** 1-based candidate row; null for batch-level issues. */
  row: number | null;
  code: string;
  message: string;
};

export type ScoutValidatedRow = {
  row: number;
  item: ScoutCandidate;
  normalizedUrl: string;
  detectedType: string;
  dedupKey: string;
};

export type ScoutValidationResult = {
  rows: ScoutValidatedRow[];
  errors: ScoutIssue[];
  warnings: ScoutIssue[];
  stats: ScoutBatchStats;
};

export type ScoutBatchStats = {
  byRegion: Record<string, number>;
  byKind: Record<string, number>;
  /** v1: zone resolved from region (unresolved regions skipped); v2: scoutArea. */
  byScoutArea: Record<string, number>;
  /** Candidates per discipline id; v1 values are resolved via the taxonomy, unresolved ones skipped. */
  byDiscipline: Record<string, number>;
  byFormat: Record<string, number>;
};

export type ValidateScoutBatchOptions = {
  /** `${detectedType}:${normalizedUrl}` keys from other batch files. */
  otherBatchKeys?: Set<string>;
};

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isNullableString(value: unknown): boolean {
  return value === undefined || value === null || typeof value === "string";
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function isPrivateIpv4(host: string): boolean {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!match) return false;
  const [a, b] = [Number(match[1]), Number(match[2])];
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
}

function isPrivateIpv6(host: string): boolean {
  if (!host.includes(":")) return false;
  const h = host.toLowerCase();
  if (h === "::" || h === "::1") return true;
  if (/^f[cd][0-9a-f]{0,2}:/.test(h)) return true;
  if (/^fe[89ab][0-9a-f]?:/.test(h)) return true;
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(h);
  return mapped ? isPrivateIpv4(mapped[1]) : false;
}

export function isPublicHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (!host) return false;
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return false;
  return !isPrivateIpv4(host) && !isPrivateIpv6(host);
}

export function isPublicHttpUrl(value: unknown): boolean {
  if (typeof value !== "string") return false;
  let parsed: URL;
  try {
    parsed = new URL(value.trim());
  } catch {
    return false;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
  if (parsed.username || parsed.password) return false;
  return isPublicHostname(parsed.hostname);
}

export function candidateDedupKey(url: unknown): { key: string; normalizedUrl: string; detectedType: string } {
  const { normalizedUrl, detectedType } = normalizeProposedSourceUrl(url);
  return { key: `${detectedType}:${normalizedUrl}`, normalizedUrl, detectedType };
}

/** Keys of all candidates whose URL normalizes; invalid rows are that batch's own problem. */
export function collectBatchKeys(batch: ScoutBatch): Set<string> {
  const keys = new Set<string>();
  for (const candidate of batch.candidates) {
    try {
      keys.add(candidateDedupKey((candidate as { url?: unknown })?.url).key);
    } catch {
      // skip
    }
  }
  return keys;
}

function increment(acc: Record<string, number>, key: string) {
  acc[key] = (acc[key] ?? 0) + 1;
}

type Report = (code: string, message: string) => void;

function suggestion(ids: readonly string[]): string {
  return ids.length ? `; did you mean ${ids.map((id) => `"${id}"`).join(", ")}?` : "";
}

/** Every entry must be an exact id from `allowed`; aliases get a hint with the canonical id. */
function checkIdList(
  value: unknown[],
  field: string,
  code: string,
  allowed: Set<string>,
  suggest: (raw: string) => readonly string[],
  fail: Report,
) {
  value.forEach((entry, i) => {
    if (typeof entry === "string" && allowed.has(entry)) return;
    const hint = typeof entry === "string" ? suggestion(suggest(entry).filter((id) => id !== entry)) : "";
    fail(code, `${field}[${i}] "${String(entry)}" is not a canonical id${hint}`);
  });
}

function validateV2Fields(item: Record<string, unknown>, fail: Report, warn: Report) {
  if (!nonEmptyString(item.scoutArea)) {
    fail("scout_area_required", `scoutArea is required (one of: ${V2_AREA_IDS.join(", ")})`);
  } else if (!V2_AREA_IDS.includes(item.scoutArea)) {
    const area = SCOUT_AREAS.find((a) => a.id === item.scoutArea);
    if (area) {
      fail("scout_area_wrong_wave", `scoutArea "${item.scoutArea}" is a wave ${area.wave} zone; allowed: ${V2_AREA_IDS.join(", ")}`);
    } else {
      const resolved = resolveScoutArea(item.scoutArea);
      fail("invalid_scout_area", `scoutArea "${item.scoutArea}" is not a zone id${suggestion(resolved ? [resolved] : [])}`);
    }
  } else if (nonEmptyString(item.region)) {
    const area = SCOUT_AREAS.find((a) => a.id === item.scoutArea)!;
    const region = normalizeToken(item.region);
    if (!(area.subjectsRu as readonly string[]).some((subject) => normalizeToken(subject) === region)) {
      warn(
        "region_not_area_subject",
        `region "${item.region}" is not a subject of zone ${area.id} (expected: ${area.subjectsRu.join(", ")})`,
      );
    }
  }

  if (!Array.isArray(item.organizerKinds) || item.organizerKinds.length === 0) {
    fail("organizer_kinds_required", `organizerKinds must be a non-empty array of: ${ORGANIZER_KIND_IDS.join(", ")}`);
  } else {
    checkIdList(item.organizerKinds, "organizerKinds", "invalid_organizer_kind", ORGANIZER_KIND_ID_SET, resolveOrganizerKinds, fail);
  }

  if (!Array.isArray(item.disciplines) || item.disciplines.length === 0) {
    fail("disciplines_required", "disciplines must be a non-empty array of discipline ids");
  } else {
    checkIdList(item.disciplines, "disciplines", "invalid_discipline", DISCIPLINE_ID_SET, (raw) => {
      const id = resolveDiscipline(raw);
      return id ? [id] : [];
    }, fail);
  }

  if (item.formats !== undefined) {
    if (!Array.isArray(item.formats)) {
      fail("invalid_field_type", "formats must be an array of format ids");
    } else {
      checkIdList(item.formats, "formats", "invalid_format", FORMAT_ID_SET, (raw) => {
        const id = resolveFormat(raw);
        return id ? [id] : [];
      }, fail);
    }
  }

  if (item.rawDisciplines !== undefined) {
    if (!isStringArray(item.rawDisciplines)) {
      fail("invalid_field_type", "rawDisciplines must be an array of strings");
    } else {
      item.rawDisciplines.forEach((raw, i) => {
        const resolved = resolveDisciplines(raw);
        if (!resolved.disciplines.length && !resolved.formats.length) {
          warn("unresolved_raw_discipline", `rawDisciplines[${i}] "${raw}" does not resolve to a discipline or format`);
        }
      });
    }
  }

  for (const field of OPTIONAL_V2_STRING_FIELDS) {
    if (!isNullableString(item[field])) fail("invalid_field_type", `${field} must be a string or null`);
  }
  if (item.partners !== undefined && !isStringArray(item.partners)) {
    fail("invalid_field_type", "partners must be an array of strings");
  }
  if (item.contacts !== undefined && !(isPlainObject(item.contacts) && Object.values(item.contacts).every(isNullableString))) {
    fail("invalid_field_type", "contacts must be an object of string|null values");
  }
  if (
    item.legal !== undefined &&
    !(isPlainObject(item.legal) && isNullableString(item.legal.registry) && isNullableString(item.legal.inn))
  ) {
    fail("invalid_field_type", "legal must be {registry?: string|null, inn?: string|null}");
  }

  for (const field of Object.keys(item)) {
    if (!KNOWN_V2_FIELDS.has(field)) warn("unknown_field", `field "${field}" is not part of schemaVersion ${SCOUT_SCHEMA_VERSION_V2}`);
  }
}

/** v1 files predate the taxonomy: mismatches are reported but never block the import. */
function legacyTaxonomyWarnings(candidate: ScoutCandidate, warn: Report) {
  if (!resolveScoutArea(candidate.region)) warn("taxonomy_unknown_region", `region "${candidate.region}" does not resolve to a scout zone`);
  if (resolveOrganizerKinds(candidate.kind).length === 0) {
    warn("taxonomy_unknown_kind", `kind "${candidate.kind}" does not resolve to an organizer kind`);
  }
  for (const raw of candidate.disciplines) {
    const resolved = resolveDisciplines(String(raw));
    if (!resolved.disciplines.length && !resolved.formats.length) {
      warn("taxonomy_unresolved_discipline", `discipline "${String(raw)}" does not resolve to a discipline or format`);
    }
  }
}

function taxonomyKeys(candidate: ScoutCandidate, isV2: boolean): { area: string | null; disciplines: string[]; formats: string[] } {
  if (isV2) {
    return {
      area: candidate.scoutArea ?? null,
      disciplines: [...new Set(candidate.disciplines)],
      formats: [...new Set(candidate.formats ?? [])],
    };
  }
  const disciplines = new Set<string>();
  const formats = new Set<string>();
  for (const raw of candidate.disciplines) {
    const resolved = resolveDisciplines(String(raw));
    resolved.disciplines.forEach((id) => disciplines.add(id));
    resolved.formats.forEach((id) => formats.add(id));
  }
  return { area: resolveScoutArea(candidate.region), disciplines: [...disciplines], formats: [...formats] };
}

export function validateScoutBatch(batch: ScoutBatch, options: ValidateScoutBatchOptions = {}): ScoutValidationResult {
  const errors: ScoutIssue[] = [];
  const warnings: ScoutIssue[] = [];
  const rows: ScoutValidatedRow[] = [];
  const stats: ScoutBatchStats = { byRegion: {}, byKind: {}, byScoutArea: {}, byDiscipline: {}, byFormat: {} };
  const seen = new Map<string, number>();
  const header = batchNotesHeader(batch.batchId);
  const isV2 = batch.schemaVersion === SCOUT_SCHEMA_VERSION_V2;

  if (batch.candidates.length === 0) {
    errors.push({ row: null, code: "empty_batch", message: "batch must contain at least one candidate" });
  }

  batch.candidates.forEach((raw, index) => {
    const row = index + 1;
    const rowErrors: ScoutIssue[] = [];
    const rowWarnings: ScoutIssue[] = [];
    const fail: Report = (code, message) => rowErrors.push({ row, code, message: `Row ${row}: ${message}` });
    const warn: Report = (code, message) => rowWarnings.push({ row, code, message: `Row ${row}: ${message}` });

    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      errors.push({ row, code: "invalid_candidate", message: `Row ${row}: candidate must be an object` });
      return;
    }
    const item = raw as Record<string, unknown>;

    for (const field of FORBIDDEN_CANDIDATE_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(item, field)) {
        fail("forbidden_field", `field "${field}" is not allowed in discovery candidates`);
      }
    }
    if (!nonEmptyString(item.region) || !nonEmptyString(item.name) || !nonEmptyString(item.kind)) {
      fail("required_fields", "region/name/kind are required");
    }
    if (isV2) {
      validateV2Fields(item, fail, warn);
    } else if (!Array.isArray(item.disciplines) || item.disciplines.length === 0) {
      fail("disciplines_required", "disciplines are required");
    }
    if (!Array.isArray(item.evidence) || item.evidence.length === 0) {
      fail("evidence_required", "at least one evidence URL is required");
    } else {
      item.evidence.forEach((url, evidenceIndex) => {
        if (!isPublicHttpUrl(url)) {
          fail("invalid_evidence_url", `evidence[${evidenceIndex}] must be a public http(s) URL: ${String(url)}`);
        }
      });
    }
    if (isV2) {
      if (typeof item.osintScore !== "number" || !Number.isInteger(item.osintScore) || item.osintScore < 1 || item.osintScore > 5) {
        fail("invalid_osint_score", "osintScore must be an integer 1..5");
      }
    } else if (
      typeof item.osintScore !== "number" ||
      !Number.isFinite(item.osintScore) ||
      item.osintScore < 1 ||
      item.osintScore > 5
    ) {
      fail("invalid_osint_score", "osintScore must be a number 1..5");
    }

    let normalized: ReturnType<typeof candidateDedupKey> | null = null;
    try {
      normalized = candidateDedupKey(item.url);
      if (!isPublicHostname(new URL(normalized.normalizedUrl).hostname)) {
        fail("unsafe_source_url", `source URL must point to a public host: ${normalized.normalizedUrl}`);
        normalized = null;
      }
    } catch (error) {
      fail("invalid_source_url", `source URL rejected (${error instanceof Error ? error.message : String(error)}): ${String(item.url)}`);
    }

    if (normalized) {
      const firstRow = seen.get(normalized.key);
      if (firstRow !== undefined) {
        fail("duplicate_in_batch", `duplicate source URL ${normalized.normalizedUrl} (same as row ${firstRow})`);
      } else {
        seen.set(normalized.key, row);
      }
      if (options.otherBatchKeys?.has(normalized.key)) {
        fail("duplicate_cross_batch", `source URL ${normalized.normalizedUrl} already present in another batch file`);
      }
    }

    if (rowErrors.length > 0 || !normalized) {
      errors.push(...rowErrors);
      return;
    }

    const candidate = item as unknown as ScoutCandidate;
    const notesLength = composeNotes(candidate, header, batch.schemaVersion).length;
    if (notesLength > NOTES_MAX_LENGTH) {
      warn("notes_truncated", `notes are ${notesLength} chars, will be truncated to ${NOTES_MAX_LENGTH} (evidence tail lost)`);
    }
    if (candidate.osintScore === 5 && !nonEmptyString(candidate.legal?.registry) && !nonEmptyString(candidate.legal?.inn)) {
      warn("score_without_legal", "osintScore 5 without registry/inn");
    }
    if (!isV2) legacyTaxonomyWarnings(candidate, warn);
    warnings.push(...rowWarnings);

    const keys = taxonomyKeys(candidate, isV2);
    increment(stats.byRegion, candidate.region);
    increment(stats.byKind, candidate.kind);
    if (keys.area) increment(stats.byScoutArea, keys.area);
    keys.disciplines.forEach((id) => increment(stats.byDiscipline, id));
    keys.formats.forEach((id) => increment(stats.byFormat, id));
    rows.push({
      row,
      item: candidate,
      normalizedUrl: normalized.normalizedUrl,
      detectedType: normalized.detectedType,
      dedupKey: normalized.key,
    });
  });

  if (isV2) {
    for (const [area, count] of Object.entries(stats.byScoutArea)) {
      if (count > SCOUT_AREA_MAX) {
        warnings.push({
          row: null,
          code: "scout_area_overfilled",
          message: `zone ${area}: ${count} candidates, more than ${SCOUT_AREA_MAX} (target ${SCOUT_AREA_TARGET})`,
        });
      } else if (count < SCOUT_AREA_MIN) {
        warnings.push({
          row: null,
          code: "scout_area_underfilled",
          message: `zone ${area}: ${count} candidates, fewer than ${SCOUT_AREA_MIN} (target ${SCOUT_AREA_TARGET})`,
        });
      }
    }
  }

  return { rows, errors, warnings, stats };
}
