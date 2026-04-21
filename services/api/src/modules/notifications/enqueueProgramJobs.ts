import { Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";

export type ProgramDatesUpdatedPayload = {
  programId: string;
  oldStart: string;
  oldEnd: string;
  newStart: string;
  newEnd: string;
};

export type ProgramUpcomingStartPayload = {
  programId: string;
  startDate: string;
  windowLeadDays: number;
  anchorUtcYmd: string;
};

/** Если недавно был переход new→old, а сейчас old→new (откат), не шумим. */
export async function shouldSuppressDateFlipNoise(
  db: PrismaClient,
  programId: string,
  oldStart: Date,
  oldEnd: Date,
  newStart: Date,
  newEnd: Date,
  windowHours: number,
): Promise<boolean> {
  const since = new Date(Date.now() - windowHours * 3600 * 1000);
  const recent = await db.notificationJob.findMany({
    where: { eventType: "program_dates_updated", createdAt: { gte: since } },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: { payload: true },
  });
  const os = oldStart.toISOString();
  const oe = oldEnd.toISOString();
  const ns = newStart.toISOString();
  const ne = newEnd.toISOString();
  for (const row of recent) {
    const pl = row.payload as ProgramDatesUpdatedPayload;
    if (!pl || pl.programId !== programId) continue;
    if (pl.newStart === os && pl.newEnd === oe && pl.oldStart === ns && pl.oldEnd === ne) {
      return true;
    }
  }
  return false;
}

export async function enqueueProgramDatesUpdatedJob(
  db: PrismaClient,
  params: {
    programId: string;
    oldStart: Date;
    oldEnd: Date;
    newStart: Date;
    newEnd: Date;
  },
): Promise<boolean> {
  const dedupeKey = `program_dates_updated:${params.programId}:${params.oldStart.toISOString()}_${params.oldEnd.toISOString()}_TO_${params.newStart.toISOString()}_${params.newEnd.toISOString()}`;
  const payload: ProgramDatesUpdatedPayload = {
    programId: params.programId,
    oldStart: params.oldStart.toISOString(),
    oldEnd: params.oldEnd.toISOString(),
    newStart: params.newStart.toISOString(),
    newEnd: params.newEnd.toISOString(),
  };
  try {
    await db.notificationJob.create({
      data: {
        eventType: "program_dates_updated",
        dedupeKey,
        payload,
        status: "pending",
      },
    });
    return true;
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return false;
    throw e;
  }
}

export async function enqueueProgramUpcomingStartJob(
  db: PrismaClient,
  params: { programId: string; startDate: Date; windowLeadDays: number; anchorUtcYmd: string },
): Promise<boolean> {
  const dedupeKey = `program_upcoming_start:${params.programId}:${params.anchorUtcYmd}`;
  const payload: ProgramUpcomingStartPayload = {
    programId: params.programId,
    startDate: params.startDate.toISOString(),
    windowLeadDays: params.windowLeadDays,
    anchorUtcYmd: params.anchorUtcYmd,
  };
  try {
    await db.notificationJob.create({
      data: {
        eventType: "program_upcoming_start",
        dedupeKey,
        payload,
        status: "pending",
      },
    });
    return true;
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return false;
    throw e;
  }
}

export async function maybeEnqueueProgramDatesUpdatedFromPatch(
  db: PrismaClient,
  before: { id: string; publishStatus: string; startDate: Date; endDate: Date },
  after: { id: string; startDate: Date; endDate: Date },
  patchData: Record<string, unknown>,
  antiFlipWindowHours: number,
): Promise<void> {
  if (before.publishStatus !== "published") return;
  if (patchData.startDate === undefined && patchData.endDate === undefined) return;
  if (before.startDate.getTime() === after.startDate.getTime() && before.endDate.getTime() === after.endDate.getTime()) {
    return;
  }
  const suppress = await shouldSuppressDateFlipNoise(
    db,
    before.id,
    before.startDate,
    before.endDate,
    after.startDate,
    after.endDate,
    antiFlipWindowHours,
  );
  if (suppress) {
    console.debug("[notifications] suppressed date flip noise", { programId: before.id });
    return;
  }
  await enqueueProgramDatesUpdatedJob(db, {
    programId: before.id,
    oldStart: before.startDate,
    oldEnd: before.endDate,
    newStart: after.startDate,
    newEnd: after.endDate,
  });
}
