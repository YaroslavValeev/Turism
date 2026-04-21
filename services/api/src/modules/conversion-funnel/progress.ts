import type { PrismaClient } from "@prisma/client";
import type { Env } from "@mywave/config";
import { isLaunchMode } from "@mywave/config";
import { buildProgramConversionMetrics } from "./metrics";

export type ConversionProgressResponse = {
  programId: string;
  organizerId: string;
  programTitle: string;
  funnelEnabled: boolean;
  serviceCommsOptIn: boolean;
  discussUrl: string;
  firstPublishedAt: string | null;
  metrics: { views: number; clicks: number; leads: number; deals: number };
  checklist: {
    hasViews: boolean;
    hasClicks: boolean;
    hasLeads: boolean;
    hasDeals: boolean;
    modelDiscussed: boolean;
  };
  stagesSent: {
    stage0: boolean;
    stage1: boolean;
    stage2: boolean;
    stage3: boolean;
    stage4: boolean;
    stage5: boolean;
    followUp: boolean;
  };
  maxStageReached: number;
  /** Активные флаги сервера (сверка с реальными отправками). */
  rollout: {
    allowedMaxStage: number;
    enableStage4: boolean;
    enableStage5: boolean;
    enableFollowup: boolean;
    organizerMinIntervalHours: number;
  };
  platformMode: string;
  launchMode: boolean;
};

export async function getProgramConversionProgress(
  db: PrismaClient,
  env: Env,
  organizerId: string,
  programId: string,
): Promise<ConversionProgressResponse | null> {
  const program = await db.program.findFirst({
    where: { id: programId, organizerId },
    select: { id: true, title: true, publishStatus: true, createdAt: true },
  });
  if (!program) return null;
  if (program.publishStatus !== "published") {
    const err = new Error("program_not_published");
    (err as Error & { code: string }).code = "program_not_published";
    throw err;
  }

  const state = await db.programConversionState.findUnique({ where: { programId } });
  const since = state?.firstPublishedAt ?? program.createdAt;
  const metrics = await buildProgramConversionMetrics(db, { programId, organizerId, since });

  return {
    programId: program.id,
    organizerId,
    programTitle: program.title,
    funnelEnabled: env.CONVERSION_FUNNEL_ENABLED,
    serviceCommsOptIn: state?.serviceCommsOptIn ?? true,
    discussUrl: env.CONVERSION_DISCUSS_URL,
    firstPublishedAt: state?.firstPublishedAt?.toISOString() ?? null,
    metrics: {
      views: metrics.views,
      clicks: metrics.clicks,
      leads: metrics.leads,
      deals: metrics.deals,
    },
    checklist: {
      hasViews: metrics.views > 0,
      hasClicks: metrics.clicks > 0,
      hasLeads: metrics.leads > 0,
      hasDeals: metrics.deals > 0,
      modelDiscussed: Boolean(state?.stage4SentAt || state?.stage5SentAt),
    },
    stagesSent: {
      stage0: Boolean(state?.stage0SentAt),
      stage1: Boolean(state?.stage1SentAt),
      stage2: Boolean(state?.stage2SentAt),
      stage3: Boolean(state?.stage3SentAt),
      stage4: Boolean(state?.stage4SentAt),
      stage5: Boolean(state?.stage5SentAt),
      followUp: Boolean(state?.followUpSentAt),
    },
    maxStageReached: state?.maxStageReached ?? -1,
    rollout: {
      allowedMaxStage: env.CONVERSION_ALLOWED_MAX_STAGE,
      enableStage4: env.CONVERSION_ENABLE_STAGE4,
      enableStage5: env.CONVERSION_ENABLE_STAGE5,
      enableFollowup: env.CONVERSION_ENABLE_FOLLOWUP,
      organizerMinIntervalHours: env.CONVERSION_ORGANIZER_MIN_INTERVAL_HOURS,
    },
    platformMode: env.PLATFORM_MODE,
    launchMode: isLaunchMode(env.PLATFORM_MODE),
  };
}
