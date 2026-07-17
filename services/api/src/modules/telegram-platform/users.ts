import { prisma } from "../../lib/prisma";

export type TelegramProfile = {
  telegramUserId: bigint;
  username?: string;
  firstName?: string;
  lastName?: string;
  languageCode?: string;
};

export async function upsertTelegramUser(profile: TelegramProfile) {
  const now = new Date();
  return prisma.telegramUser.upsert({
    where: { telegramUserId: profile.telegramUserId },
    create: {
      telegramUserId: profile.telegramUserId,
      username: profile.username ?? null,
      firstName: profile.firstName ?? null,
      lastName: profile.lastName ?? null,
      languageCode: profile.languageCode ?? null,
      lastSeenAt: now,
    },
    update: {
      username: profile.username ?? null,
      firstName: profile.firstName ?? null,
      lastName: profile.lastName ?? null,
      languageCode: profile.languageCode ?? null,
      lastSeenAt: now,
    },
  });
}
