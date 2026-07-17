import type { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";

type TelegramPlatformActionLogInput = {
  leadId?: string | null;
  leadToken?: string | null;
  telegramUserId?: string | null;
  programId?: string | null;
  organizerId?: string | null;
  actorType: "ops" | "organizer" | "traveler" | "system";
  actorId?: string | null;
  action: string;
  source?: string | null;
  statusFrom?: string | null;
  statusTo?: string | null;
  properties?: Record<string, unknown>;
};

export async function logTelegramPlatformAction(input: TelegramPlatformActionLogInput): Promise<void> {
  await prisma.telegramPlatformActionLog.create({
    data: {
      leadId: input.leadId ?? null,
      leadToken: input.leadToken ?? null,
      telegramUserId: input.telegramUserId ?? null,
      programId: input.programId ?? null,
      organizerId: input.organizerId ?? null,
      actorType: input.actorType,
      actorId: input.actorId ?? null,
      action: input.action,
      source: input.source ?? "telegram_callback",
      statusFrom: input.statusFrom ?? null,
      statusTo: input.statusTo ?? null,
      propertiesJson: (input.properties ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  });
}
