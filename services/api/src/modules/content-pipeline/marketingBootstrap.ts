import { createHash, randomBytes } from "crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { runNormalizationJob } from "../ingestion/service";
import { runContentDraftGenerationJob } from "./draft.service";

function hash(s: string): string {
  return createHash("sha256").update(s, "utf8").digest("hex");
}

async function ensureMarketingSource(): Promise<{ id: string }> {
  const name = "Marketing agent (internal)";
  const found = await prisma.source.findFirst({
    where: { urlOrHandle: "internal://marketing" },
  });
  if (found) return { id: found.id };
  const s = await prisma.source.create({
    data: {
      type: "site",
      name,
      urlOrHandle: "internal://marketing",
      priority: 200,
      isActive: true,
    },
  });
  return { id: s.id };
}

export type CreateFromMarketingInput = {
  topic: string;
  source: string;
  actionType: string;
};

/**
 * Внутренний сценарий: маркетинговый сигнал → raw → content_item → normalize → draft (без публикации).
 */
export async function createContentFromMarketing(
  actorId: string | null,
  input: CreateFromMarketingInput
): Promise<{ contentItemId: string; rawItemId: string; sourceId: string; draftJob: unknown }> {
  const { id: sourceId } = await ensureMarketingSource();
  const stamp = new Date().toISOString();
  const contentHash = hash(`${input.topic}|${input.source}|${input.actionType}|${stamp}`);
  const bodyText = [input.topic, `source=${input.source}`, `action=${input.actionType}`].join("\n");

  const { rawId, itemId } = await prisma.$transaction(async (tx) => {
    const r = await tx.rawItem.create({
      data: {
        sourceId,
        externalItemId: `mkt-${stamp.replace(/[:.]/g, "-")}-${randomBytes(4).toString("hex")}`,
        sourceType: "site",
        sourceUrl: `internal://marketing/${contentHash.slice(0, 16)}`,
        rawTitle: input.topic.slice(0, 500),
        rawText: bodyText,
        contentHash,
        parseStatus: "ok",
        fetchedAt: new Date(),
        rawPayloadJson: { marketing: true, source: input.source, actionType: input.actionType } as Prisma.InputJsonValue,
      },
    });
    const ex = await tx.contentItem.create({
      data: {
        rawItemId: r.id,
        idempotencyKey: `marketing:${r.id}`,
        workflowStatus: "ingest_collected",
      },
    });
    return { rawId: r.id, itemId: ex.id };
  });

  await runNormalizationJob(actorId, [sourceId]);
  const draftJob = await runContentDraftGenerationJob(actorId, { contentItemIds: [itemId], limit: 5 });

  return { contentItemId: itemId, rawItemId: rawId, sourceId, draftJob };
}
