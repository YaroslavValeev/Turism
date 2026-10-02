import { normalizeProposedSourceUrl } from "../sources/proposalUrl";
import type { ScoutBatch, ScoutCandidate } from "./candidate";
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
  stats: { byRegion: Record<string, number>; byKind: Record<string, number> };
};

export type ValidateScoutBatchOptions = {
  /** `${detectedType}:${normalizedUrl}` keys from other batch files. */
  otherBatchKeys?: Set<string>;
};

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
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

export function validateScoutBatch(batch: ScoutBatch, options: ValidateScoutBatchOptions = {}): ScoutValidationResult {
  const errors: ScoutIssue[] = [];
  const warnings: ScoutIssue[] = [];
  const rows: ScoutValidatedRow[] = [];
  const stats = { byRegion: {} as Record<string, number>, byKind: {} as Record<string, number> };
  const seen = new Map<string, number>();
  const header = batchNotesHeader(batch.batchId);

  if (batch.candidates.length === 0) {
    errors.push({ row: null, code: "empty_batch", message: "batch must contain at least one candidate" });
  }

  batch.candidates.forEach((raw, index) => {
    const row = index + 1;
    const rowErrors: ScoutIssue[] = [];
    const fail = (code: string, message: string) => rowErrors.push({ row, code, message: `Row ${row}: ${message}` });

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
    if (!Array.isArray(item.disciplines) || item.disciplines.length === 0) {
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
    if (typeof item.osintScore !== "number" || !Number.isFinite(item.osintScore) || item.osintScore < 1 || item.osintScore > 5) {
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
    const notesLength = composeNotes(candidate, header).length;
    if (notesLength > NOTES_MAX_LENGTH) {
      warnings.push({
        row,
        code: "notes_truncated",
        message: `Row ${row}: notes are ${notesLength} chars, will be truncated to ${NOTES_MAX_LENGTH} (evidence tail lost)`,
      });
    }
    if (candidate.osintScore === 5 && !nonEmptyString(candidate.legal?.registry) && !nonEmptyString(candidate.legal?.inn)) {
      warnings.push({ row, code: "score_without_legal", message: `Row ${row}: osintScore 5 without registry/inn` });
    }

    increment(stats.byRegion, candidate.region);
    increment(stats.byKind, candidate.kind);
    rows.push({
      row,
      item: candidate,
      normalizedUrl: normalized.normalizedUrl,
      detectedType: normalized.detectedType,
      dedupKey: normalized.key,
    });
  });

  return { rows, errors, warnings, stats };
}
