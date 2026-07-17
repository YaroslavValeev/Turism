import { prisma } from "../../lib/prisma";
import { logTelegramPlatformEvent } from "./events";
import { logTelegramPlatformAction } from "./actionLog";

const STATUS_MAP: Record<string, string> = {
  work: "contacted",
  contacted: "contacted",
  booked: "qualified",
  lost: "rejected",
  need_info: "contacted",
  no_answer: "contacted",
};

export function parseOrganizerLeadCallback(data: string): { action: string; leadToken: string } | null {
  const m = data.match(/^L\|([a-z_]+)\|([a-f0-9]{16,64})$/i);
  if (!m) return null;
  return { action: m[1]!.toLowerCase(), leadToken: m[2]! };
}

export async function applyOrganizerLeadStatus(input: {
  leadToken: string;
  action: string;
  organizerTelegramAccountId?: string;
  actorId?: string;
}) {
  const lead = await prisma.lead.findUnique({ where: { leadToken: input.leadToken } });
  if (!lead) return { ok: false as const, error: "lead_not_found" };

  const toStatus = STATUS_MAP[input.action] ?? "contacted";
  const fromStatus = lead.leadStatus;

  await prisma.lead.update({
    where: { id: lead.id },
    data: {
      leadStatus: toStatus,
      organizerFirstResponseAt: lead.organizerFirstResponseAt ?? new Date(),
    },
  });

  await prisma.organizerLeadStatusEvent.create({
    data: {
      leadId: lead.id,
      organizerId: lead.organizerId,
      fromStatus,
      toStatus,
      actorType: "organizer",
      actorId: input.actorId ?? input.organizerTelegramAccountId ?? null,
      note: input.action,
    },
  });

  await logTelegramPlatformAction({
    leadId: lead.id,
    leadToken: input.leadToken,
    telegramUserId: lead.telegramUserId,
    programId: lead.programId,
    organizerId: lead.organizerId,
    actorType: "organizer",
    actorId: input.actorId ?? input.organizerTelegramAccountId ?? null,
    action: input.action,
    statusFrom: fromStatus,
    statusTo: toStatus,
  });

  await logTelegramPlatformEvent({
    eventName: "organizer_status_changed",
    telegramUserId: lead.telegramUserId,
    programId: lead.programId,
    organizerId: lead.organizerId,
    leadToken: input.leadToken,
    properties: { action: input.action, from: fromStatus, to: toStatus },
  });

  return { ok: true as const, leadStatus: toStatus };
}
