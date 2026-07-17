import { prisma } from "../../lib/prisma";
import { logTelegramPlatformEvent } from "./events";
import { logTelegramPlatformAction } from "./actionLog";

export type OpsLeadAction = "ops_work" | "ops_contacted" | "ops_request_contact" | "ops_blocked";

export function parseOpsLeadCallback(data: string): { action: OpsLeadAction; leadToken: string } | null {
  const m = data.match(/^O\|(ops_work|ops_contacted|ops_request_contact|ops_blocked)\|([a-f0-9]{16,64})$/i);
  if (!m) return null;
  return { action: m[1]!.toLowerCase() as OpsLeadAction, leadToken: m[2]! };
}

const OPS_STATUS_MAP: Record<OpsLeadAction, string> = {
  ops_work: "contacted",
  ops_contacted: "contacted",
  ops_request_contact: "contacted",
  ops_blocked: "rejected",
};

export async function applyOpsLeadStatus(input: {
  leadToken: string;
  action: OpsLeadAction;
  actorId?: string;
}) {
  const lead = await prisma.lead.findUnique({ where: { leadToken: input.leadToken } });
  if (!lead) return { ok: false as const, error: "lead_not_found" };

  const fromStatus = lead.leadStatus;
  const toStatus = OPS_STATUS_MAP[input.action];

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
      actorType: "ops",
      actorId: input.actorId ?? null,
      note: input.action,
    },
  });

  await logTelegramPlatformAction({
    leadId: lead.id,
    leadToken: input.leadToken,
    telegramUserId: lead.telegramUserId,
    programId: lead.programId,
    organizerId: lead.organizerId,
    actorType: "ops",
    actorId: input.actorId ?? null,
    action: input.action,
    statusFrom: fromStatus,
    statusTo: toStatus,
    properties: { reason: "organizer_telegram_channel_missing" },
  });

  await logTelegramPlatformEvent({
    eventName: "ops_status_changed",
    telegramUserId: lead.telegramUserId,
    programId: lead.programId,
    organizerId: lead.organizerId,
    leadToken: input.leadToken,
    properties: { action: input.action, reason: "organizer_telegram_channel_missing" },
  });

  if (input.action === "ops_request_contact") {
    await logTelegramPlatformEvent({
      eventName: "ops_request_organizer_contact",
      leadToken: input.leadToken,
      organizerId: lead.organizerId,
      programId: lead.programId,
    });
  }

  return { ok: true as const, leadStatus: toStatus };
}
