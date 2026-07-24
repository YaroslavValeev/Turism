import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";

const DAILY_SYNC_JOB_KEY = "ingestion-daily-sync";
const LEASE_MS = 2 * 60 * 60 * 1000;

export type DailyRunClaim = {
  jobKey: string;
  dayKey: string;
  leaseToken: string;
};

export async function claimDailyRun(
  dayKey: string,
  now = new Date(),
): Promise<DailyRunClaim | null> {
  const leaseToken = randomUUID();
  const leaseExpiresAt = new Date(now.getTime() + LEASE_MS);
  const claim = { jobKey: DAILY_SYNC_JOB_KEY, dayKey, leaseToken };

  try {
    await prisma.schedulerDailyRun.create({
      data: {
        ...claim,
        status: "running",
        leaseExpiresAt,
      },
    });
    return claim;
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
      throw error;
    }
  }

  const reclaimed = await prisma.schedulerDailyRun.updateMany({
    where: {
      jobKey: DAILY_SYNC_JOB_KEY,
      dayKey,
      OR: [
        { status: "failed" },
        { status: "running", leaseExpiresAt: { lt: now } },
      ],
    },
    data: {
      status: "running",
      leaseToken,
      leaseExpiresAt,
      completedAt: null,
      errorMessage: null,
    },
  });

  return reclaimed.count === 1 ? claim : null;
}

export async function completeDailyRun(claim: DailyRunClaim, now = new Date()): Promise<void> {
  await prisma.schedulerDailyRun.updateMany({
    where: { ...claim, status: "running" },
    data: { status: "success", completedAt: now, leaseExpiresAt: now },
  });
}

export async function failDailyRun(claim: DailyRunClaim, error: unknown): Promise<void> {
  await prisma.schedulerDailyRun.updateMany({
    where: { ...claim, status: "running" },
    data: {
      status: "failed",
      errorMessage: error instanceof Error ? error.message : String(error),
    },
  });
}
