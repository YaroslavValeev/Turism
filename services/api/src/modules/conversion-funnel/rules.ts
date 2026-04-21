import type { Env } from "@mywave/config";
import type { ProgramConversionMetrics } from "./metrics";

export type ProgramConversionStateSlice = {
  stage0SentAt: Date | null;
  stage1SentAt: Date | null;
  stage2SentAt: Date | null;
  stage3SentAt: Date | null;
  stage4SentAt: Date | null;
  stage5SentAt: Date | null;
  stage4EligibleAt: Date | null;
  followUpDueAt: Date | null;
  followUpSentAt: Date | null;
};

/** WoW рост просмотров: если прошлая неделя 0 — достаточно ненулевой текущей. */
export function weekOverWeekViewsGrowthPct(m: ProgramConversionMetrics): number | null {
  if (m.viewsPrevWeek === 0) return m.viewsThisWeek > 0 ? 100 : 0;
  return ((m.viewsThisWeek - m.viewsPrevWeek) / m.viewsPrevWeek) * 100;
}

export function meetsStage3GrowthRequirement(env: Env, m: ProgramConversionMetrics): boolean {
  if (!env.CONVERSION_STAGE3_REQUIRE_LEADS_AND_GROWTH) return true;
  const pct = weekOverWeekViewsGrowthPct(m);
  if (pct === null) return false;
  return pct >= env.CONVERSION_WEEK_GROWTH_MIN_PCT && m.leads >= 1;
}

export function shouldSendStage1(env: Env, m: ProgramConversionMetrics): boolean {
  return m.views >= env.CONVERSION_STAGE1_MIN_VIEWS || m.clicks >= env.CONVERSION_STAGE1_MIN_CLICKS;
}

export function shouldSendStage2(env: Env, m: ProgramConversionMetrics): boolean {
  return m.leads >= env.CONVERSION_STAGE2_MIN_LEADS;
}

export function shouldSendStage3(
  env: Env,
  m: ProgramConversionMetrics,
  state: ProgramConversionStateSlice,
): boolean {
  const base =
    m.views >= env.CONVERSION_STAGE3_MIN_VIEWS &&
    m.clicks >= env.CONVERSION_STAGE3_MIN_CLICKS &&
    m.leads >= env.CONVERSION_STAGE3_MIN_LEADS;
  if (!base) return false;
  if (!meetsStage3GrowthRequirement(env, m)) return false;
  /** Пока не отправлен follow-up после этапа 2 — не переходим к этапу 3 (чтобы не перепрыгнуть «мягкое» касание). */
  if (
    env.CONVERSION_ENABLE_FOLLOWUP &&
    state.stage2SentAt &&
    state.followUpDueAt &&
    !state.followUpSentAt
  ) {
    return false;
  }
  return true;
}

export function shouldSendStage4(_env: Env, _m: ProgramConversionMetrics, state: ProgramConversionStateSlice, now: Date): boolean {
  if (!state.stage3SentAt || state.stage4SentAt) return false;
  if (!state.stage4EligibleAt) return false;
  return now.getTime() >= state.stage4EligibleAt.getTime();
}

export function shouldSendStage5(env: Env, m: ProgramConversionMetrics): boolean {
  return m.deals >= env.CONVERSION_STAGE5_MIN_DEALS || m.leads >= env.CONVERSION_STAGE5_MIN_LEADS;
}

export function shouldSendFollowUp(state: ProgramConversionStateSlice, now: Date): boolean {
  if (!state.followUpDueAt || state.followUpSentAt) return false;
  return now.getTime() >= state.followUpDueAt.getTime();
}
