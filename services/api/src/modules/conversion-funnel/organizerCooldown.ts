import type { PrismaClient } from "@prisma/client";
import type { Env } from "@mywave/config";

/** Не чаще одного успешного conversion-сообщения на организатора за CONVERSION_ORGANIZER_MIN_INTERVAL_HOURS (все программы). */
export async function isOrganizerConversionCooldownActive(
  db: PrismaClient,
  organizerId: string,
  env: Env,
  now: Date,
): Promise<boolean> {
  if (env.CONVERSION_ORGANIZER_MIN_INTERVAL_HOURS <= 0) return false;
  const last = await db.programConversionDelivery.findFirst({
    where: {
      organizerId,
      outcome: { startsWith: "delivered" },
    },
    orderBy: { sentAt: "desc" },
    select: { sentAt: true },
  });
  if (!last) return false;
  const ms = env.CONVERSION_ORGANIZER_MIN_INTERVAL_HOURS * 3600 * 1000;
  return now.getTime() - last.sentAt.getTime() < ms;
}
