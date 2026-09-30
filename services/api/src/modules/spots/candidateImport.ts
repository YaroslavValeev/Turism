import { parseSpotInput, type Parsed, type SpotInput } from "./validation";

export const CANDIDATE_IMPORT_MAX_ITEMS = 500;

export interface CandidateImportError {
  index: number;
  name: string | null;
  error: string;
}

export interface CandidateImportDuplicate {
  index: number;
  name: string;
  region: string;
  reason: "exists" | "repeated_in_batch";
}

export interface CandidateImportPlan {
  toCreate: Array<{ index: number; data: SpotInput & { name: string; region: string } }>;
  duplicates: CandidateImportDuplicate[];
  errors: CandidateImportError[];
}

/** Ключ дедупликации: регистр, «ё», кавычки и лишние пробелы не делают место новым. */
export function spotDedupKey(name: string, region: string): string {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/ё/g, "е")
      .replace(/[«»"'`„“”]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  return `${norm(region)}|${norm(name)}`;
}

/**
 * Кандидаты — это discovery-данные без рейтинга: статус всегда candidate,
 * даже если во входных данных указано иное.
 */
export function planCandidateImport(
  body: unknown,
  existing: Array<{ name: string; region: string }>,
): Parsed<CandidateImportPlan> {
  if (typeof body !== "object" || body === null || !Array.isArray((body as { items?: unknown }).items)) {
    return { ok: false, error: "items must be an array" };
  }
  const items = (body as { items: unknown[] }).items;
  if (items.length === 0) return { ok: false, error: "items must not be empty" };
  if (items.length > CANDIDATE_IMPORT_MAX_ITEMS) {
    return { ok: false, error: `too many items: max ${CANDIDATE_IMPORT_MAX_ITEMS}` };
  }

  const known = new Set(existing.map((s) => spotDedupKey(s.name, s.region)));
  const seen = new Set<string>();
  const plan: CandidateImportPlan = { toCreate: [], duplicates: [], errors: [] };

  items.forEach((raw, index) => {
    const rawName =
      typeof raw === "object" && raw !== null && typeof (raw as { name?: unknown }).name === "string"
        ? ((raw as { name: string }).name.trim() || null)
        : null;
    const withStatus =
      typeof raw === "object" && raw !== null && !Array.isArray(raw)
        ? { ...(raw as Record<string, unknown>), discoveryStatus: "candidate" }
        : raw;
    const parsed = parseSpotInput(withStatus, "create");
    if (!parsed.ok) {
      plan.errors.push({ index, name: rawName, error: parsed.error });
      return;
    }
    const data = parsed.data as SpotInput & { name: string; region: string };
    const key = spotDedupKey(data.name, data.region);
    if (known.has(key)) {
      plan.duplicates.push({ index, name: data.name, region: data.region, reason: "exists" });
      return;
    }
    if (seen.has(key)) {
      plan.duplicates.push({ index, name: data.name, region: data.region, reason: "repeated_in_batch" });
      return;
    }
    seen.add(key);
    plan.toCreate.push({ index, data });
  });

  return { ok: true, data: plan };
}
