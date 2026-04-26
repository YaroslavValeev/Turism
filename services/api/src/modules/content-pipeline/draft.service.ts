import type { ContentDraftType, Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { writeAuditLog } from "../../lib/audit";
import {
  CONTENT_DRAFT_MODEL_VERSION,
  CONTENT_DRAFT_PROMPT_VERSION,
  DEFAULT_CONTENT_DRAFT_TYPES,
  buildDraftTexts,
  channelTargetsForDraftType,
  collectMissingFields,
  type NormalizedSnapshot,
} from "./draft.templates";

export { CONTENT_DRAFT_MODEL_VERSION, CONTENT_DRAFT_PROMPT_VERSION, DEFAULT_CONTENT_DRAFT_TYPES } from "./draft.templates";

function toSnapshot(row: {
  title: string | null;
  eventType: string | null;
  discipline: string | null;
  descriptionShort: string | null;
  descriptionFull: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
  venue: string | null;
  startDate: Date | null;
  endDate: Date | null;
  durationDays: number | null;
  level: string | null;
  priceFrom: number | null;
  currency: string | null;
  organizerName: string | null;
  bookingUrl: string | null;
  imageUrl: string | null;
  confidenceScore: number | null;
}): NormalizedSnapshot {
  return { ...row };
}

export type GenerateDraftsResult = {
  contentItemId: string;
  created: { draftType: ContentDraftType; draftId: string }[];
  skipped: { draftType: ContentDraftType; reason: "already_exists" }[];
};

/**
 * Идемпотентно создаёт черновики v1 для указанных типов (уникальный ключ contentItemId + draftType + version).
 */
export async function generateDraftsForContentItem(
  contentItemId: string,
  options: {
    draftTypes?: ContentDraftType[];
    actorId?: string | null;
    /** Версия черновика (rewrite = следующий номер). По умолчанию 1. */
    version?: number;
  } = {},
): Promise<GenerateDraftsResult> {
  const draftTypes = options.draftTypes?.length ? options.draftTypes : DEFAULT_CONTENT_DRAFT_TYPES;
  const version = options.version ?? 1;

  const item = await prisma.contentItem.findUnique({
    where: { id: contentItemId },
    include: {
      normalizedItem: true,
      rawItem: { include: { source: { select: { id: true, name: true } } } },
    },
  });

  if (!item?.normalizedItem) {
    throw new Error("content_item без normalized_item — сначала нормализация");
  }

  const n = item.normalizedItem;
  const snapshot = toSnapshot(n);
  const missingFields = collectMissingFields(snapshot);
  const sourceUrl = item.rawItem.sourceUrl ?? null;
  const sourceName = item.rawItem.source?.name ?? "источник";

  const created: GenerateDraftsResult["created"] = [];
  const skipped: GenerateDraftsResult["skipped"] = [];

  for (const draftType of draftTypes) {
    const existing = await prisma.contentDraft.findUnique({
      where: {
        contentItemId_draftType_version: {
          contentItemId,
          draftType,
          version,
        },
      },
    });
    if (existing) {
      skipped.push({ draftType, reason: "already_exists" });
      continue;
    }

    const built = buildDraftTexts({
      draftType,
      normalized: snapshot,
      sourceUrl,
      sourceName,
      missingFields,
    });

    const inputPayload: Prisma.InputJsonValue = {
      schema: "content_draft_input_v1",
      promptVersion: CONTENT_DRAFT_PROMPT_VERSION,
      modelVersion: CONTENT_DRAFT_MODEL_VERSION,
      contentItemId,
      normalizedItemId: n.id,
      rawItemId: item.rawItemId,
      sourceUrl,
      missingFields,
      hashtags: built.hashtags,
    };

    const draft = await prisma.contentDraft.create({
      data: {
        contentItemId,
        draftType,
        version,
        channelTargetsJson: channelTargetsForDraftType(draftType),
        generatedHeadline: built.headline,
        shortCopy: built.shortCopy,
        longCopy: built.longCopy,
        cta: built.cta,
        aiPromptVersion: CONTENT_DRAFT_PROMPT_VERSION,
        aiModel: CONTENT_DRAFT_MODEL_VERSION,
        inputPayloadJson: inputPayload,
        rawDraftText: built.longCopy,
        finalDraftText: built.longCopy,
        status: "ready",
      },
    });

    created.push({ draftType, draftId: draft.id });
    await writeAuditLog({
      entityType: "content_draft",
      entityId: draft.id,
      changedField: "created",
      oldValue: null,
      newValue: draft.id,
      changedBy: options.actorId ?? null,
      reason: `content_draft:${draftType}:v${version}`,
    });
  }

  if (created.length > 0) {
    const cur = await prisma.contentItem.findUnique({ where: { id: contentItemId }, select: { workflowStatus: true } });
    if (cur && (cur.workflowStatus === "ingest_collected" || cur.workflowStatus === "draft")) {
      await prisma.contentItem.update({
        where: { id: contentItemId },
        data: { workflowStatus: "draft", lastError: null },
      });
    }
  }

  return { contentItemId, created, skipped };
}

/**
 * Новая версия draft после комментария/voice owner. Старые версии того же draftType → superseded.
 */
export async function createRewriteDraftVersion(
  parentDraftId: string,
  options: { ownerText: string; voiceTranscript?: string | null; actorId?: string | null },
): Promise<{ newDraftId: string; version: number; contentItemId: string }> {
  const parent = await prisma.contentDraft.findUnique({
    where: { id: parentDraftId },
    include: {
      contentItem: {
        include: {
          normalizedItem: true,
          rawItem: { include: { source: { select: { id: true, name: true } } } },
        },
      },
    },
  });
  if (!parent?.contentItem?.normalizedItem) {
    throw new Error("parent draft not found or not normalizable");
  }
  const { contentItem } = parent;
  const n = contentItem.normalizedItem;
  if (!n) {
    throw new Error("normalized item missing");
  }
  const snapshot = toSnapshot(n);
  const missingFields = collectMissingFields(snapshot);
  const sourceUrl = contentItem.rawItem.sourceUrl ?? null;
  const sourceName = contentItem.rawItem.source?.name ?? "источник";

  const built = buildDraftTexts({
    draftType: parent.draftType,
    normalized: snapshot,
    sourceUrl,
    sourceName,
    missingFields,
  });

  const ownerBlock = [options.ownerText.trim(), options.voiceTranscript?.trim() ? `Голос: ${options.voiceTranscript}` : ""]
    .filter(Boolean)
    .join("\n");
  const mergedLong = `${built.longCopy}\n\n— Пожелания owner —\n${ownerBlock}`;

  const inputPayload: Prisma.InputJsonValue = {
    schema: "content_draft_input_v1",
    promptVersion: CONTENT_DRAFT_PROMPT_VERSION,
    modelVersion: `${CONTENT_DRAFT_MODEL_VERSION}+owner_rewrite`,
    contentItemId: contentItem.id,
    normalizedItemId: n.id,
    rewrite: {
      parentDraftId: parent.id,
      parentVersion: parent.version,
      ownerText: options.ownerText,
      voiceTranscript: options.voiceTranscript ?? null,
    },
  };

  return prisma.$transaction(async (tx) => {
    const agg = await tx.contentDraft.aggregate({
      where: { contentItemId: contentItem.id, draftType: parent.draftType },
      _max: { version: true },
    });
    const nextVersion = (agg._max.version ?? 0) + 1;

    await tx.contentDraft.updateMany({
      where: { contentItemId: contentItem.id, draftType: parent.draftType, version: { lt: nextVersion } },
      data: { status: "superseded" },
    });

    const newDraft = await tx.contentDraft.create({
      data: {
        contentItemId: contentItem.id,
        draftType: parent.draftType,
        version: nextVersion,
        channelTargetsJson: parent.channelTargetsJson === null ? undefined : parent.channelTargetsJson,
        generatedHeadline: built.headline,
        shortCopy: built.shortCopy,
        longCopy: mergedLong,
        cta: built.cta,
        ownerNotes: ownerBlock,
        voiceTranscript: options.voiceTranscript ?? null,
        aiPromptVersion: CONTENT_DRAFT_PROMPT_VERSION,
        aiModel: `${CONTENT_DRAFT_MODEL_VERSION}+owner_rewrite`,
        inputPayloadJson: inputPayload,
        rawDraftText: mergedLong,
        finalDraftText: mergedLong,
        status: "ready",
      },
    });
    await writeAuditLog({
      entityType: "content_draft",
      entityId: newDraft.id,
      changedField: "rewrite_version",
      oldValue: parent.id,
      newValue: newDraft.id,
      changedBy: options.actorId ?? null,
      reason: `content_draft:rewrite:${parent.draftType}:v${nextVersion}`,
    });
    return { newDraftId: newDraft.id, version: nextVersion, contentItemId: contentItem.id };
  });
}

/**
 * Пакетный job: для content items с нормализацией и без черновика telegram_post v1.
 */
export async function runContentDraftGenerationJob(
  actorId: string | null,
  options: { contentItemIds?: string[]; limit?: number } = {},
): Promise<{ processed: number; created: number; skipped: number; details: GenerateDraftsResult[] }> {
  const limit = Math.min(Math.max(options.limit ?? 40, 1), 200);
  let ids = options.contentItemIds?.filter(Boolean) ?? [];

  if (!ids.length) {
    const candidates = await prisma.contentItem.findMany({
      where: {
        normalizedItemId: { not: null },
        workflowStatus: { in: ["draft", "ingest_collected"] },
        drafts: { none: { draftType: "telegram_post", version: 1 } },
      },
      select: { id: true },
      take: limit,
      orderBy: { updatedAt: "asc" },
    });
    ids = candidates.map((c) => c.id);
  }

  let created = 0;
  let skipped = 0;
  const details: GenerateDraftsResult[] = [];

  for (const id of ids) {
    try {
      const r = await generateDraftsForContentItem(id, { actorId });
      created += r.created.length;
      skipped += r.skipped.length;
      details.push(r);
    } catch {
      // один битый item не валит job
    }
  }

  return { processed: ids.length, created, skipped, details };
}
