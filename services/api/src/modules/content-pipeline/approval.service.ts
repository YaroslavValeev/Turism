import type { ContentOwnerDecision, ContentWorkflowStatus } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { writeAuditLog } from "../../lib/audit";
import type { Env } from "@mywave/config";
import { callTelegramJson, resolveContentOwnerChatId } from "../telegram/telegramApi";
import { createRewriteDraftVersion } from "./draft.service";

const CALLBACK_PREFIX = {
  publish: "P",
  rewrite: "W",
  reject: "X",
  skip: "K",
} as const;

function isCuid(id: string): boolean {
  return /^[a-z0-9]{8,32}$/i.test(id);
}

export function encodeCallbackData(action: keyof typeof CALLBACK_PREFIX, draftId: string): string {
  return `${CALLBACK_PREFIX[action]}|${draftId}`;
}

export function parseCallbackData(data: string): { action: keyof typeof CALLBACK_PREFIX; draftId: string } | null {
  const [a, id] = data.split("|", 2);
  if (!id || !isCuid(id)) return null;
  const entry = Object.entries(CALLBACK_PREFIX).find(([, v]) => v === a);
  if (!entry) return null;
  return { action: entry[0] as keyof typeof CALLBACK_PREFIX, draftId: id };
}

function formatPreview(draft: {
  generatedHeadline: string | null;
  shortCopy: string | null;
  longCopy: string | null;
}): string {
  const title = (draft.generatedHeadline ?? "Черновик").trim();
  const shortB = (draft.shortCopy ?? "").trim().slice(0, 1200);
  const longB = (draft.longCopy ?? draft.shortCopy ?? "").trim().slice(0, 3500);
  return `${title}

Кратко:
${shortB}

Текст:
${longB}`;
}

/** Отправка превью owner в Telegram + переходы статусов. */
export async function sendDraftToOwner(
  env: Env,
  contentDraftId: string,
  options: { includeSourceLine?: string; actorId?: string | null } = {},
): Promise<{ ok: boolean; error?: string; messageId?: number }> {
  const chat = resolveContentOwnerChatId(env);
  if (!chat) {
    return { ok: false, error: "TELEGRAM_CONTENT_OWNER_CHAT_ID/TELEGRAM_ALERT_CHAT_ID not set" };
  }
  if (!env.TELEGRAM_BOT_API_BASE_URL) {
    return { ok: false, error: "TELEGRAM_BOT_API_BASE_URL not set" };
  }

  const draft = await prisma.contentDraft.findUnique({
    where: { id: contentDraftId },
    include: {
      contentItem: { include: { rawItem: { select: { sourceUrl: true } } } },
    },
  });
  if (!draft) {
    return { ok: false, error: "draft not found" };
  }
  if (draft.status !== "ready" && draft.status !== "pending_owner_review") {
    return { ok: false, error: `draft status ${draft.status} not sendable` };
  }

  const item = draft.contentItem;
  const terminal = new Set<string>(["approved", "rejected", "published", "skipped", "archived", "failed"]);
  if (terminal.has(item.workflowStatus)) {
    return { ok: false, error: "content_item in terminal state" };
  }

  const sourceLine = item.rawItem.sourceUrl?.trim() ?? "—";
  const body = `${formatPreview(draft)}

Источник:
${sourceLine}
${options.includeSourceLine ?? ""}`;

  const keyboard = {
    inline_keyboard: [
      [
        { text: "✅ Publish", callback_data: encodeCallbackData("publish", draft.id) },
        { text: "✏ Rewrite", callback_data: encodeCallbackData("rewrite", draft.id) },
      ],
      [
        { text: "❌ Reject", callback_data: encodeCallbackData("reject", draft.id) },
        { text: "⏳ Skip", callback_data: encodeCallbackData("skip", draft.id) },
      ],
    ],
  };

  const res = await callTelegramJson<{ message_id: number }>(env, "sendMessage", {
    chat_id: chat,
    text: body.slice(0, 4090),
    reply_markup: keyboard,
  });
  if (!res.ok) {
    await prisma.contentItem.update({
      where: { id: item.id },
      data: { lastError: res.description ?? "telegram send failed" },
    });
    return { ok: false, error: res.description ?? "telegram error" };
  }
  const messageId = res.result?.message_id;

  await prisma.$transaction([
    prisma.contentDraft.update({
      where: { id: draft.id },
      data: {
        status: "pending_owner_review",
        telegramPreviewMessageId: messageId ?? null,
        telegramPreviewChatId: chat,
      },
    }),
    prisma.contentItem.update({
      where: { id: item.id },
      data: { workflowStatus: "pending_owner_review", lastError: null, ownerReviewAwaitingDraftId: null },
    }),
  ]);

  await writeAuditLog({
    entityType: "content_item",
    entityId: item.id,
    changedField: "owner_review_sent",
    oldValue: null,
    newValue: draft.id,
    changedBy: options.actorId ?? null,
    reason: "telegram preview",
  });

  return { ok: true, messageId };
}

type DecisionInput = {
  contentDraftId: string;
  decision: "approved" | "rejected" | "rewrite_requested" | "deferred" | "skipped";
  /** Telegram user id string */
  decidedBy: string;
  comment?: string | null;
  source?: string;
  callbackId?: string | null;
};

/**
 * Сохраняет решение + workflow. Идемпотентно по `callbackId` (Telegram `callback_query.id`).
 */
export async function handleApprovalDecision(
  input: DecisionInput,
): Promise<{ ok: true; duplicate?: boolean } | { ok: false; error: string }> {
  if (input.callbackId) {
    const existing = await prisma.processedTelegramCallback.findUnique({ where: { id: input.callbackId } });
    if (existing) {
      return { ok: true, duplicate: true };
    }
  }

  const draft = await prisma.contentDraft.findUnique({
    where: { id: input.contentDraftId },
    include: { contentItem: true },
  });
  if (!draft) {
    return { ok: false, error: "draft not found" };
  }
  const item = draft.contentItem;
  if (input.decision === "approved" && item.workflowStatus === "approved") {
    if (input.callbackId) {
      await safeRecordCallback(input.callbackId, draft.id, item.id, "approve_dup");
    }
    return { ok: true, duplicate: true };
  }

  const mapDecision: ContentOwnerDecision = input.decision as ContentOwnerDecision;
  let newWorkflow: string;
  if (input.decision === "approved") newWorkflow = "approved";
  else if (input.decision === "rejected") newWorkflow = "rejected";
  else if (input.decision === "rewrite_requested") newWorkflow = "rewrite_requested";
  else if (input.decision === "skipped" || input.decision === "deferred") newWorkflow = "skipped";
  else {
    return { ok: false, error: "unsupported decision" };
  }

  await prisma.$transaction(async (tx) => {
    await tx.contentApproval.create({
      data: {
        contentItemId: item.id,
        contentDraftId: draft.id,
        decision: mapDecision,
        comment: input.comment?.trim() || null,
        decidedBy: input.decidedBy,
        source: input.source ?? "telegram",
        decidedAt: new Date(),
      },
    });
    if (input.decision === "approved") {
      await tx.contentDraft.update({ where: { id: draft.id }, data: { status: "ready" } });
    } else if (input.decision === "rejected") {
      await tx.contentDraft.update({ where: { id: draft.id }, data: { status: "superseded" } });
    } else if (input.decision === "rewrite_requested") {
      await tx.contentDraft.update({ where: { id: draft.id }, data: { status: "pending_owner_review" } });
    }
    if (input.decision === "rewrite_requested") {
      await tx.contentItem.update({
        where: { id: item.id },
        data: { workflowStatus: "rewrite_requested", ownerReviewAwaitingDraftId: draft.id },
      });
    } else {
      await tx.contentItem.update({
        where: { id: item.id },
        data: { workflowStatus: newWorkflow as ContentWorkflowStatus, ownerReviewAwaitingDraftId: null },
      });
    }
    if (input.callbackId) {
      await tx.processedTelegramCallback.create({
        data: { id: input.callbackId, contentDraftId: draft.id, contentItemId: item.id, action: input.decision },
      });
    }
  });

  await writeAuditLog({
    entityType: "content_item",
    entityId: item.id,
    changedField: "owner_decision",
    oldValue: item.workflowStatus,
    newValue: newWorkflow,
    changedBy: input.decidedBy,
    reason: `approval:${mapDecision}:draft=${draft.id}`,
  });

  return { ok: true };
}

async function safeRecordCallback(id: string, draftId: string, itemId: string, action: string): Promise<void> {
  try {
    await prisma.processedTelegramCallback.create({ data: { id, contentDraftId: draftId, contentItemId: itemId, action } });
  } catch {
    // duplicate
  }
}

/**
 * Сообщение с инструкцией после кнопки Rewrite.
 */
export async function requestRewrite(env: Env, contentDraftId: string): Promise<void> {
  const chat = resolveContentOwnerChatId(env);
  if (!chat || !env.TELEGRAM_BOT_API_BASE_URL) return;
  await callTelegramJson(env, "sendMessage", {
    chat_id: chat,
    text: "Отправьте текст правок в ответ на это сообщение (или голосовое). Или снова нажмите кнопки на превью.",
  });
}

/**
 * Текст/голос → новая версия draft + новое превью. `transcript` — расшифровка voice (опционально).
 */
export async function applyRewrite(
  env: Env,
  input: { parentDraftId: string; text: string; transcript: string | null; decidedBy: string; voiceFileId?: string },
): Promise<{ ok: true; newDraftId: string } | { ok: false; error: string }> {
  const parent = await prisma.contentDraft.findUnique({
    where: { id: input.parentDraftId },
    include: { contentItem: true },
  });
  if (!parent) return { ok: false, error: "draft not found" };
  if (parent.contentItem.ownerReviewAwaitingDraftId !== parent.id) {
    return { ok: false, error: "not awaiting rewrite for this draft" };
  }
  const combined = [input.text.trim(), input.transcript?.trim() ?? ""].filter(Boolean).join("\n");
  if (!combined.length) {
    return { ok: false, error: "empty input" };
  }
  const { newDraftId } = await createRewriteDraftVersion(parent.id, {
    ownerText: input.text.trim() || combined,
    voiceTranscript: input.transcript,
    actorId: input.decidedBy,
  });
  if (input.voiceFileId) {
    await prisma.contentApproval.create({
      data: {
        contentItemId: parent.contentItemId,
        contentDraftId: parent.id,
        decision: "rewrite_requested",
        comment: "voice",
        ownerVoiceFileId: input.voiceFileId,
        decidedBy: input.decidedBy,
        source: "telegram",
        decidedAt: new Date(),
      },
    });
  }
  const send = await sendDraftToOwner(env, newDraftId, { actorId: input.decidedBy });
  if (!send.ok) {
    await prisma.contentItem.update({
      where: { id: parent.contentItemId },
      data: { lastError: send.error ?? "send after rewrite failed" },
    });
  }
  return { ok: true, newDraftId };
}
