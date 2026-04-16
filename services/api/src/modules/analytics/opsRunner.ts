import type { Env } from "@mywave/config";
import { prisma } from "../../lib/prisma";
import { recalculateOrganizerScores, recalculateProgramScores } from "./scoreEngine";

export function utcPeriodEndToday(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));
}

export function parsePeriodEndQuery(raw: string | undefined): Date {
  if (raw && /^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [y, m, d] = raw.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d, 23, 59, 59, 999));
  }
  return utcPeriodEndToday();
}

export async function runMartRefreshWithLog(): Promise<{ durationMs: number; ok: true } | { durationMs: number; ok: false; error: string }> {
  const t0 = Date.now();
  try {
    await prisma.$executeRawUnsafe(`SELECT analytics_refresh_marts()`);
    const durationMs = Date.now() - t0;
    await prisma.analyticsMartRefreshLog.create({
      data: { status: "success", durationMs },
    });
    return { durationMs, ok: true };
  } catch (e) {
    const durationMs = Date.now() - t0;
    const message = e instanceof Error ? e.message : String(e);
    await prisma.analyticsMartRefreshLog.create({
      data: { status: "failure", durationMs, message },
    });
    return { durationMs, ok: false, error: message };
  }
}

export async function runScoresRecalculate(env: Env, periodEnd?: Date): Promise<{
  periodEnd: string;
  organizers: { upserted: number };
  programs: { upserted: number };
}> {
  const pe = periodEnd ?? utcPeriodEndToday();
  const org = await recalculateOrganizerScores(env, pe);
  const prog = await recalculateProgramScores(env, pe);
  return {
    periodEnd: pe.toISOString(),
    organizers: org,
    programs: prog,
  };
}
