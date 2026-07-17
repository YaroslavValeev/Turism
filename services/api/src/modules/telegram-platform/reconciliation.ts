import { prisma } from "../../lib/prisma";
import { logTelegramPlatformEvent } from "./events";
import { logTelegramPlatformAction } from "./actionLog";

export function parseReconciliationCallback(data: string): { action: string; leadToken: string } | null {
  const m = data.match(/^R\|([a-z_]+)\|([a-f0-9]{16,64})$/i);
  if (!m) return null;
  return { action: m[1]!.toLowerCase(), leadToken: m[2]! };
}

export async function applyReconciliationCallback(input: {
  leadToken: string;
  action: string;
  dealAmountRub?: number;
  comment?: string;
}) {
  const lead = await prisma.lead.findUnique({ where: { leadToken: input.leadToken } });
  if (!lead) return { ok: false as const, error: "lead_not_found" };

  const task = await prisma.telegramReconciliationTask.findFirst({
    where: { leadId: lead.id, status: { in: ["pending", "sent"] } },
    orderBy: { createdAt: "desc" },
  });
  if (!task) return { ok: false as const, error: "task_not_found" };

  const result =
    input.action === "booked" ? "booked" : input.action === "lost" ? "lost" : input.action === "progress" ? "in_progress" : input.action;

  await prisma.telegramReconciliationTask.update({
    where: { id: task.id },
    data: {
      status: "completed",
      result,
      dealAmountRub: input.dealAmountRub ?? null,
      comment: input.comment ?? null,
      completedAt: new Date(),
    },
  });

  if (result === "booked") {
    await prisma.lead.update({ where: { id: lead.id }, data: { leadStatus: "qualified" } });
  } else if (result === "lost") {
    await prisma.lead.update({ where: { id: lead.id }, data: { leadStatus: "rejected" } });
  }

  await logTelegramPlatformAction({
    leadId: lead.id,
    leadToken: input.leadToken,
    telegramUserId: lead.telegramUserId,
    programId: lead.programId,
    organizerId: lead.organizerId,
    actorType: "organizer",
    action: `reconciliation_${input.action}`,
    source: "telegram_reconciliation_callback",
    properties: { result },
  });

  await logTelegramPlatformEvent({
    eventName: "reconciliation_completed",
    telegramUserId: lead.telegramUserId,
    programId: lead.programId,
    organizerId: lead.organizerId,
    leadToken: input.leadToken,
    properties: { action: input.action, result },
  });

  return { ok: true as const, result };
}
