import type { Env } from "@mywave/config";
import type { PrismaClient } from "@prisma/client";
import { enqueueProgramUpcomingStartJob } from "./enqueueProgramJobs";

/** Постановка в очередь: опубликованные программы со стартом в UTC-день (сегодня + lead дней). */
export async function enqueueUpcomingProgramsForLeadDay(db: PrismaClient, env: Env, now: Date): Promise<number> {
  const lead = env.NOTIFICATIONS_UPCOMING_LEAD_DAYS;
  const t = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  t.setUTCDate(t.getUTCDate() + lead);
  const y = t.getUTCFullYear();
  const mo = t.getUTCMonth();
  const d = t.getUTCDate();
  const dayStart = new Date(Date.UTC(y, mo, d, 0, 0, 0, 0));
  const dayEnd = new Date(Date.UTC(y, mo, d + 1, 0, 0, 0, 0));
  const anchorUtcYmd = `${y}-${String(mo + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

  const programs = await db.program.findMany({
    where: { publishStatus: "published", startDate: { gte: dayStart, lt: dayEnd } },
    select: { id: true, startDate: true },
  });

  let created = 0;
  for (const p of programs) {
    const ok = await enqueueProgramUpcomingStartJob(db, {
      programId: p.id,
      startDate: p.startDate,
      windowLeadDays: lead,
      anchorUtcYmd,
    });
    if (ok) created += 1;
  }
  return created;
}
