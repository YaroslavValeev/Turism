import { prisma } from "../../lib/prisma";
import { logTelegramPlatformEvent } from "./events";

export async function createClickToken(input: {
  destinationUrl: string;
  programId?: string;
  organizerId?: string;
  telegramUserId?: string;
  sourcePostId?: string;
  campaign?: string;
  channel?: string;
}) {
  const row = await prisma.telegramClick.create({
    data: {
      destinationUrl: input.destinationUrl,
      programId: input.programId ?? null,
      organizerId: input.organizerId ?? null,
      telegramUserId: input.telegramUserId ?? null,
      sourcePostId: input.sourcePostId ?? null,
      campaign: input.campaign ?? null,
      channel: input.channel ?? "telegram_bot",
    },
  });
  return row.token;
}

export async function resolveClickAndRedirect(token: string): Promise<{ url: string } | null> {
  const click = await prisma.telegramClick.findUnique({ where: { token } });
  if (!click) return null;

  await prisma.telegramClick.update({
    where: { id: click.id },
    data: { clickedAt: new Date() },
  });

  await logTelegramPlatformEvent({
    eventName: "client_clicked_out",
    telegramUserId: click.telegramUserId,
    programId: click.programId,
    organizerId: click.organizerId,
    channelPostId: click.sourcePostId,
    properties: { destination_url: click.destinationUrl, token },
  });

  return { url: click.destinationUrl };
}
