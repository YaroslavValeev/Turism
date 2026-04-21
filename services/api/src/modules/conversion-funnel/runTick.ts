import type { PrismaClient } from "@prisma/client";
import type { Env } from "@mywave/config";
import { reopenDeferredConversionDrafts } from "./drafts/draftService";
import { processOneProgramConversion } from "./processProgramConversion";

const BATCH = 200;

export async function runConversionFunnelTick(db: PrismaClient, env: Env): Promise<{ processed: number }> {
  if (!env.CONVERSION_FUNNEL_ENABLED) return { processed: 0 };

  const rows = await db.programConversionState.findMany({
    where: { program: { publishStatus: "published" } },
    select: { programId: true },
    take: BATCH,
  });

  for (const r of rows) {
    // eslint-disable-next-line no-await-in-loop
    await processOneProgramConversion(db, env, r.programId);
  }

  if (env.CONVERSION_FUNNEL_ENABLED) {
    const now = new Date();
    // eslint-disable-next-line no-await-in-loop
    await reopenDeferredConversionDrafts(db, env, now);
  }

  return { processed: rows.length };
}
