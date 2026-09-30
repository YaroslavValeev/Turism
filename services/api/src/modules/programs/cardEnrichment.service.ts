import type { Env } from "@mywave/config";
import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { callOpenAiJson } from "../ai-pilot/openaiJson";
import { getApiEnv } from "../analytics/runtimeEnv";
import {
  buildEnrichmentUpdate,
  buildEnrichmentUserMessage,
  CARD_ENRICHMENT_SYSTEM_PROMPT,
  enrichmentSourceHash,
  parseCardEnrichment,
  readStoredEnrichment,
  type StoredEnrichment,
} from "./cardEnrichment";

export type EnrichProgramOutcome =
  | { status: "enriched"; fields: string[] }
  | { status: "skipped"; reason: "disabled" | "not_found" | "no_source_text" | "unchanged" }
  | { status: "failed"; reason: string };

export function isCardEnrichmentEnabled(env: Env): boolean {
  return Boolean(env.AI_ENABLED && env.AI_CARD_ENRICH_ENABLED && env.OPENAI_API_KEY?.trim());
}

const MIN_SOURCE_TEXT = 40;

/** Заполняет текст карточки по исходному посту. Ручные правки админа (manualFields) не трогает, статус публикации не меняет. */
export async function enrichProgramCard(
  env: Env,
  programId: string,
  options: { force?: boolean } = {},
): Promise<EnrichProgramOutcome> {
  if (!isCardEnrichmentEnabled(env)) return { status: "skipped", reason: "disabled" };
  const program = await prisma.program.findUnique({
    where: { id: programId },
    select: {
      id: true,
      discipline: true,
      region: true,
      formatType: true,
      startDate: true,
      endDate: true,
      itineraryDayByDay: true,
      manualFields: true,
      aiEnrichment: true,
      publishedPrograms: {
        take: 1,
        select: { candidate: { select: { normalizedItem: { select: { rawItem: { select: { rawText: true } } } } } } },
      },
    },
  });
  if (!program) return { status: "skipped", reason: "not_found" };

  const rawText = program.publishedPrograms[0]?.candidate?.normalizedItem?.rawItem?.rawText?.trim();
  const sourceText = rawText && rawText.length >= MIN_SOURCE_TEXT ? rawText : program.itineraryDayByDay?.trim() ?? "";
  if (sourceText.length < MIN_SOURCE_TEXT) return { status: "skipped", reason: "no_source_text" };

  const sourceHash = enrichmentSourceHash(sourceText);
  if (!options.force && readStoredEnrichment(program.aiEnrichment)?.sourceHash === sourceHash) {
    return { status: "skipped", reason: "unchanged" };
  }

  const ai = await callOpenAiJson(env, [
    { role: "system", content: CARD_ENRICHMENT_SYSTEM_PROMPT },
    {
      role: "user",
      content: buildEnrichmentUserMessage({
        discipline: program.discipline,
        formatType: program.formatType,
        startDate: program.startDate,
        endDate: program.endDate,
        text: sourceText,
      }),
    },
  ]);
  if (!ai.ok) return { status: "failed", reason: ai.reason };
  const parsed = parseCardEnrichment(ai.json, sourceText, `${program.discipline} ${program.formatType ?? ""}`);
  if (!parsed) return { status: "failed", reason: "invalid_json" };

  const { data, stored } = buildEnrichmentUpdate(program, parsed, { model: ai.model, sourceHash, now: new Date() });
  await prisma.program.update({
    where: { id: program.id },
    data: { ...data, aiEnrichment: stored as unknown as Prisma.InputJsonValue },
  });
  return { status: "enriched", fields: stored.fields };
}

/** Фоновый запуск после сбора: ошибки только в лог, сбор не блокируется. */
export function enrichProgramCardInBackground(env: Env, programId: string): void {
  if (!isCardEnrichmentEnabled(env)) return;
  void enrichProgramCard(env, programId).then(
    (outcome) => {
      if (outcome.status === "failed") console.warn(`[card-enrich] ${programId}: ${outcome.reason}`);
    },
    (error: unknown) => console.warn(`[card-enrich] ${programId}: ${error instanceof Error ? error.message : String(error)}`),
  );
}

/** Хук сбора из источников: env читается лениво, сбой конфигурации не должен ломать ingestion. */
export function enrichProgramCardAfterIngestion(programId: string): void {
  let env: Env;
  try {
    env = getApiEnv();
  } catch {
    return;
  }
  enrichProgramCardInBackground(env, programId);
}

export const ENRICH_BATCH_MAX = 50;

/** Пакетный прогон по опубликованным карточкам без автозаполнения (последовательно, чтобы не упереться в лимиты OpenAI). */
export async function enrichPublishedProgramsBatch(env: Env, limit: number) {
  const take = Math.max(1, Math.min(ENRICH_BATCH_MAX, Math.floor(limit) || 10));
  const programs = await prisma.program.findMany({
    where: { publishStatus: "published", aiEnrichment: { equals: Prisma.AnyNull } },
    select: { id: true },
    orderBy: { startDate: "asc" },
    take,
  });
  const results: Array<{ id: string } & EnrichProgramOutcome> = [];
  for (const { id } of programs) {
    results.push({ id, ...(await enrichProgramCard(env, id)) });
  }
  return results;
}

export type { StoredEnrichment };
