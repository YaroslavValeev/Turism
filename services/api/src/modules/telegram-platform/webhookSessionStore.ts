import { prisma } from "../../lib/prisma";

export type WebhookLeadSession = {
  telegramUserId?: string;
  attemptId?: string;
  programId?: string;
  pendingConsents?: string[];
  consentsAccepted?: string[];
  awaiting?: "name" | "phone" | "participants" | "comment" | "consent";
};

export async function fetchLeadAttemptSession(chatId: string): Promise<WebhookLeadSession | null> {
  const row = await prisma.telegramSession.findUnique({ where: { id: `webhook:${chatId}` } });
  if (!row?.stateJson || typeof row.stateJson !== "object") return null;
  const s = row.stateJson as Record<string, unknown>;
  return (s.session ?? null) as WebhookLeadSession | null;
}

export async function saveLeadAttemptSession(chatId: string, session: WebhookLeadSession): Promise<void> {
  const now = new Date();
  await prisma.telegramSession.upsert({
    where: { id: `webhook:${chatId}` },
    create: {
      id: `webhook:${chatId}`,
      telegramUserId: session.telegramUserId ?? "unknown",
      currentFlow: "platform_lead",
      currentStep: "webhook",
      stateJson: { chat_id: chatId, session } as any,
      expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
      createdAt: now,
      updatedAt: now,
    },
    update: {
      telegramUserId: session.telegramUserId ?? "unknown",
      stateJson: { chat_id: chatId, session } as any,
      expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
      updatedAt: now,
    },
  });
}

export async function clearLeadAttemptSession(chatId: string): Promise<void> {
  await prisma.telegramSession.deleteMany({ where: { id: `webhook:${chatId}` } });
}
