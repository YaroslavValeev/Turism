import { prisma } from "../../lib/prisma";
import { logTelegramPlatformEvent } from "./events";

export async function createTelegramSubscription(input: {
  telegramUserId: string;
  disciplineSlug?: string;
  regionSlug?: string;
  budgetMin?: number;
  budgetMax?: number;
  season?: string;
  digestFrequency?: string;
  riskFilter?: string;
  kidsFilter?: string;
}) {
  const sub = await prisma.telegramSubscription.create({
    data: {
      telegramUserId: input.telegramUserId,
      disciplineSlug: input.disciplineSlug ?? null,
      regionSlug: input.regionSlug ?? null,
      budgetMin: input.budgetMin ?? null,
      budgetMax: input.budgetMax ?? null,
      season: input.season ?? null,
      digestFrequency: input.digestFrequency ?? "weekly",
      riskFilter: input.riskFilter ?? "default",
      kidsFilter: input.kidsFilter ?? "any",
    },
  });

  await logTelegramPlatformEvent({
    eventName: "subscription_created",
    telegramUserId: input.telegramUserId,
    properties: {
      discipline: input.disciplineSlug,
      region: input.regionSlug,
      frequency: input.digestFrequency,
    },
  });

  return sub;
}

export async function listTelegramSubscriptions(telegramUserId: string) {
  return prisma.telegramSubscription.findMany({
    where: { telegramUserId, status: "active" },
    orderBy: { createdAt: "desc" },
  });
}

export async function unsubscribeTelegram(telegramUserId: string, subscriptionId: string) {
  return prisma.telegramSubscription.updateMany({
    where: { id: subscriptionId, telegramUserId },
    data: { status: "unsubscribed" },
  });
}
