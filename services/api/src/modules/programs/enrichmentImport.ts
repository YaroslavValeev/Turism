/**
 * Чистое планирование импорта OSINT-дополнений из JSON-файла (scripts/import-program-enrichments.ts).
 * Импорт создаёт только черновики и никогда не одобряет.
 */
import {
  validateEnrichmentInput,
  type EnrichmentContent,
  type EnrichmentField,
  type EnrichmentSource,
} from "./enrichment";

export type EnrichmentImportItem = {
  programId?: string;
  /** Программа подходит, если выполнено хотя бы одно условие (сравнение без учёта регистра, по подстроке). */
  programMatch?: { region?: string; titleIncludes?: string[] };
  field: string;
  content: unknown;
  sources: unknown;
  checkedAt: string;
};

export type EnrichmentImportFile = { batchId: string; items: EnrichmentImportItem[] };

export type ImportProgramCandidate = {
  id: string;
  title: string;
  region: string;
  exactLocation: string | null;
  publishStatus: string;
};

export type PlannedEnrichmentCreate = {
  programId: string;
  field: EnrichmentField;
  content: EnrichmentContent;
  sources: EnrichmentSource[];
  checkedAt: Date;
  batchId: string;
};

export type EnrichmentImportPlan = {
  batchId: string;
  creates: PlannedEnrichmentCreate[];
  skippedExisting: Array<{ programId: string; field: string }>;
  invalid: Array<{ index: number; errors: string[] }>;
  unmatched: Array<{ index: number; reason: string }>;
};

export function draftKey(programId: string, field: string, batchId: string): string {
  return `${programId}:${field}:${batchId}`;
}

export function parseEnrichmentImportFile(raw: unknown): EnrichmentImportFile {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("import file must be a JSON object");
  const { batchId, items } = raw as { batchId?: unknown; items?: unknown };
  if (typeof batchId !== "string" || !batchId.trim() || batchId.length > 120) {
    throw new Error("batchId: non-empty string up to 120 chars required");
  }
  if (!Array.isArray(items) || items.length === 0) throw new Error("items: non-empty array required");
  return { batchId: batchId.trim(), items: items as EnrichmentImportItem[] };
}

function includesCi(haystack: string | null | undefined, needle: string): boolean {
  const n = needle.trim().toLocaleLowerCase("ru");
  return n !== "" && String(haystack ?? "").toLocaleLowerCase("ru").includes(n);
}

export function matchesProgram(match: NonNullable<EnrichmentImportItem["programMatch"]>, p: ImportProgramCandidate): boolean {
  const byRegion = typeof match.region === "string" && match.region.trim() !== ""
    && (includesCi(p.region, match.region) || includesCi(p.exactLocation, match.region));
  const byTitle = Array.isArray(match.titleIncludes)
    && match.titleIncludes.some((t) => typeof t === "string" && includesCi(p.title, t));
  return byRegion || byTitle;
}

/**
 * @param programs все программы-кандидаты; programMatch применяется только к published, programId — к любой существующей.
 * @param existingDraftKeys ключи draftKey(programId, field, batchId) уже существующих черновиков.
 */
export function planEnrichmentImport(
  file: EnrichmentImportFile,
  programs: ImportProgramCandidate[],
  existingDraftKeys: Set<string>,
  now: Date = new Date(),
): EnrichmentImportPlan {
  const plan: EnrichmentImportPlan = { batchId: file.batchId, creates: [], skippedExisting: [], invalid: [], unmatched: [] };
  const seen = new Set(existingDraftKeys);
  const byId = new Map(programs.map((p) => [p.id, p]));
  const published = programs.filter((p) => p.publishStatus === "published");

  file.items.forEach((item, index) => {
    const validation = validateEnrichmentInput(item?.field, item?.content, item?.sources);
    const checkedAt = new Date(item?.checkedAt ?? "");
    const errors = validation.ok ? [] : [...validation.errors];
    if (Number.isNaN(checkedAt.getTime()) || checkedAt.getTime() > now.getTime() + 24 * 60 * 60 * 1000) {
      errors.push("checkedAt: нужна дата проверки не в будущем");
    }
    if (!validation.ok || errors.length > 0) {
      plan.invalid.push({ index, errors });
      return;
    }

    let targets: ImportProgramCandidate[];
    if (typeof item.programId === "string" && item.programId.trim()) {
      const program = byId.get(item.programId.trim());
      if (!program) {
        plan.unmatched.push({ index, reason: `programId ${item.programId} not found` });
        return;
      }
      targets = [program];
    } else if (item.programMatch) {
      targets = published.filter((p) => matchesProgram(item.programMatch!, p));
      if (targets.length === 0) {
        plan.unmatched.push({ index, reason: "programMatch matched no published programs" });
        return;
      }
    } else {
      plan.invalid.push({ index, errors: ["programId или programMatch обязателен"] });
      return;
    }

    for (const program of targets) {
      const key = draftKey(program.id, validation.field, file.batchId);
      if (seen.has(key)) {
        plan.skippedExisting.push({ programId: program.id, field: validation.field });
        continue;
      }
      seen.add(key);
      plan.creates.push({
        programId: program.id,
        field: validation.field,
        content: validation.content,
        sources: validation.sources,
        checkedAt,
        batchId: file.batchId,
      });
    }
  });
  return plan;
}

/** Минимальный срез PrismaClient, нужный импорту (удобно мокать в тестах). */
export type EnrichmentImportClient = {
  program: { findMany(args: unknown): Promise<ImportProgramCandidate[]> };
  programEnrichment: {
    findMany(args: unknown): Promise<Array<{ programId: string; field: string }>>;
    createMany(args: { data: unknown[] }): Promise<{ count: number }>;
  };
};

export async function runEnrichmentImport(
  client: EnrichmentImportClient,
  file: EnrichmentImportFile,
  options: { apply: boolean; now?: Date },
) {
  const [programs, existing] = await Promise.all([
    client.program.findMany({ select: { id: true, title: true, region: true, exactLocation: true, publishStatus: true } }),
    client.programEnrichment.findMany({
      where: { batchId: file.batchId, status: "draft" },
      select: { programId: true, field: true },
    }),
  ]);
  const existingKeys = new Set(existing.map((row) => draftKey(row.programId, row.field, file.batchId)));
  const plan = planEnrichmentImport(file, programs, existingKeys, options.now);
  let created = 0;
  if (options.apply && plan.creates.length > 0) {
    const result = await client.programEnrichment.createMany({
      data: plan.creates.map((c) => ({
        programId: c.programId,
        field: c.field,
        status: "draft",
        contentJson: c.content,
        sourcesJson: c.sources,
        batchId: c.batchId,
        createdBy: `import:${c.batchId}`,
        checkedAt: c.checkedAt,
      })),
    });
    created = result.count;
  }
  return { ...summarizeImportPlan(plan, !options.apply), created };
}

export function summarizeImportPlan(plan: EnrichmentImportPlan, dryRun: boolean) {
  return {
    batchId: plan.batchId,
    dryRun,
    toCreate: plan.creates.length,
    skippedExisting: plan.skippedExisting.length,
    invalid: plan.invalid,
    unmatched: plan.unmatched,
    byField: plan.creates.reduce<Record<string, number>>((acc, c) => {
      acc[c.field] = (acc[c.field] ?? 0) + 1;
      return acc;
    }, {}),
  };
}
