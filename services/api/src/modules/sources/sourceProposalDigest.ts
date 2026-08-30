import type { Env } from "@mywave/config";
import { prisma } from "../../lib/prisma";
import { callTelegramJson, isTelegramBotApiConfigured, resolveContentOwnerChatId } from "../telegram/telegramApi";

const DIGEST_ENTITY_TYPE = "source_proposal_digest";
const MAX_PROPOSALS_PER_DIGEST = 10;

type PendingProposal = {
  id: string;
  normalizedUrl: string;
  detectedType: string;
  displayName: string | null;
  organizerName: string | null;
};

export function sourceProposalDigestDayKey(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

function cleanLine(value: string | null, fallback: string): string {
  const normalized = (value ?? "")
    .replace(/[\u0000-\u001f\u007f-\u009f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return normalized || fallback;
}

export function formatSourceProposalDigest(proposals: PendingProposal[]): string {
  const lines = [
    `Новые и ожидающие проверки источники: ${proposals.length}`,
    "",
    ...proposals.flatMap((proposal, index) => [
      `${index + 1}. ${cleanLine(proposal.organizerName ?? proposal.displayName, "Без названия")} · ${proposal.detectedType}`,
      proposal.normalizedUrl,
    ]),
    "",
    "Проверьте источники в Admin перед включением. Одобрение создаёт неактивный источник; сбор и публикация запускаются отдельно.",
  ];
  return lines.join("\n").slice(0, 4000);
}

export type SourceProposalDigestResult = {
  status: "sent" | "skipped";
  reason?: "telegram_not_configured" | "already_sent_today" | "no_pending_proposals";
  proposalIds?: string[];
};

/**
 * Sends an internal, once-per-UTC-day review digest. It deliberately does not
 * approve proposals, activate sources, run parsers, or contact organizers.
 */
export async function sendPendingSourceProposalDigest(
  env: Env,
  now = new Date(),
): Promise<SourceProposalDigestResult> {
  const chatId = resolveContentOwnerChatId(env);
  if (!chatId || !isTelegramBotApiConfigured(env)) {
    return { status: "skipped", reason: "telegram_not_configured" };
  }

  const dayKey = sourceProposalDigestDayKey(now);
  const alreadySent = await prisma.auditLog.findFirst({
    where: {
      entityType: DIGEST_ENTITY_TYPE,
      entityId: dayKey,
      changedField: "sent",
    },
    select: { id: true },
  });
  if (alreadySent) return { status: "skipped", reason: "already_sent_today" };

  const proposals = await prisma.sourceProposal.findMany({
    where: { status: "pending" },
    select: {
      id: true,
      normalizedUrl: true,
      detectedType: true,
      displayName: true,
      organizerName: true,
    },
    orderBy: { createdAt: "asc" },
    take: MAX_PROPOSALS_PER_DIGEST,
  });
  if (proposals.length === 0) return { status: "skipped", reason: "no_pending_proposals" };

  const response = await callTelegramJson(env, "sendMessage", {
    chat_id: chatId,
    text: formatSourceProposalDigest(proposals),
    disable_web_page_preview: true,
  });
  if (!response.ok) {
    throw new Error(`source proposal digest failed: ${response.description ?? "unknown Telegram error"}`);
  }

  const proposalIds = proposals.map((proposal) => proposal.id);
  await prisma.auditLog.create({
    data: {
      entityType: DIGEST_ENTITY_TYPE,
      entityId: dayKey,
      changedField: "sent",
      oldValue: null,
      newValue: JSON.stringify(proposalIds),
      changedBy: "system",
      reason: "daily pending source proposal digest sent to owner chat",
    },
  });
  return { status: "sent", proposalIds };
}
