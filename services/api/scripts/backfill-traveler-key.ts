/**
 * Идемпотентный backfill travelerKeyHash для Booking и Lead.
 * Требует: DATABASE_URL, APP_ENV, JWT_SECRET, ADMIN_JWT_SECRET, TRAVELER_KEY_SALT.
 *
 * Запуск из каталога services/api:
 *   pnpm exec tsx scripts/backfill-traveler-key.ts
 */
import { loadEnv } from "@mywave/config";
import { prisma } from "../src/lib/prisma";
import { computeTravelerKeyHash } from "../src/lib/travelerKey";

const BATCH = 250;

async function backfillBookings(env: ReturnType<typeof loadEnv>): Promise<number> {
  let total = 0;
  for (;;) {
    const rows = await prisma.booking.findMany({
      where: { travelerKeyHash: null },
      take: BATCH,
      select: { id: true, guestContact: true },
    });
    if (rows.length === 0) break;
    for (const row of rows) {
      const gc = (row.guestContact ?? "").trim();
      if (!gc) continue;
      const hash = computeTravelerKeyHash(env, row.guestContact);
      if (!hash) continue;
      await prisma.booking.update({
        where: { id: row.id },
        data: { travelerKeyHash: hash },
      });
      total++;
    }
    console.log(`[backfill-traveler-key] bookings updated so far: ${total}`);
  }
  return total;
}

async function backfillLeads(env: ReturnType<typeof loadEnv>): Promise<number> {
  let total = 0;
  for (;;) {
    const rows = await prisma.lead.findMany({
      where: { travelerKeyHash: null },
      take: BATCH,
      select: { id: true, guestContact: true },
    });
    if (rows.length === 0) break;
    for (const row of rows) {
      const gc = (row.guestContact ?? "").trim();
      if (!gc) continue;
      const hash = computeTravelerKeyHash(env, row.guestContact);
      if (!hash) continue;
      await prisma.lead.update({
        where: { id: row.id },
        data: { travelerKeyHash: hash },
      });
      total++;
    }
    console.log(`[backfill-traveler-key] leads updated so far: ${total}`);
  }
  return total;
}

async function main() {
  const env = loadEnv();
  if (!env.TRAVELER_KEY_SALT?.trim()) {
    console.error("[backfill-traveler-key] TRAVELER_KEY_SALT is required");
    process.exit(1);
  }

  const bookings = await backfillBookings(env);
  const leads = await backfillLeads(env);
  console.log(`[backfill-traveler-key] done. bookings=${bookings} leads=${leads}`);
}

void main()
  .catch((e) => {
    console.error("[backfill-traveler-key] fatal", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
