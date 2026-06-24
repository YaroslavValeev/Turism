import { prisma } from "../../lib/prisma";

export type TelegramPlatformAction = "claim" | "manual_contacted" | "request_contact" | "no_contact" | "organizer_ack";

export async function recordTelegramPlatformAction(input: {
  leadId: string;
  action: TelegramPlatformAction;
  actorTelegramId?: string;
  callbackQueryId?: string;
  metadata?: unknown;
}): Promise<void> {
  await prisma.telegramPlatformActionLog.create({
    data: {
      leadId: input.leadId,
      action: input.action,
      actorTelegramId: input.actorTelegramId,
      callbackQueryId: input.callbackQueryId,
      metadataJson: input.metadata === undefined ? undefined : JSON.stringify(input.metadata),
    },
  });
}
