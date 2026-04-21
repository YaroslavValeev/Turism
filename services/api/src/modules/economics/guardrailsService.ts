/**
 * Config-driven economics guardrails: скидки, программы, качество рефералов, expiry health (log).
 * Early-warning: короткое окно vs long lookback (leading indicators), мягкий nudge multiplier.
 */
import type { Env } from "@mywave/config";
import { Prisma, type PrismaClient } from "@prisma/client";
import { writeAuditLog } from "../../lib/audit";
import { expireEconomicsManualOverrides } from "./overrideService";
import {
  isProgramEconomicsOverrideActive,
  isReferralEconomicsOverrideActive,
} from "./economicsOverride";
import { computeProgramAutoEconomicsState } from "./programAutoEconomicsCompute";
import { num } from "./economicsMetrics";

export { computeProgramEconomicsMetrics, type ProgramEconomicsWindowMetrics } from "./economicsMetrics";

export type GlobalRewardGuardrail = {
  avgDiscountSharePct: number;
  mode: "ok" | "reduce" | "suspend";
  /** Множитель для нового UserReward (bps), 10000 = 100% */
  valueMultiplierBps: number;
};

/**
 * Глобальная метрика по броням за lookback: средняя доля скидки от original.
 */
export async function computeGlobalDiscountGuardrail(
  db: PrismaClient,
  env: Env,
): Promise<GlobalRewardGuardrail> {
  if (!env.ECON_GUARDRAILS_ENABLED) {
    return { avgDiscountSharePct: 0, mode: "ok", valueMultiplierBps: 10000 };
  }
  const days = Math.max(1, Math.floor(env.ECON_GUARDRAILS_LOOKBACK_DAYS || 30));
  const from = new Date();
  from.setUTCDate(from.getUTCDate() - days);
  const agg = await db.booking.aggregate({
    where: { createdAt: { gte: from } },
    _sum: { originalAmountRub: true, discountAmountRub: true },
  });
  const orig = num(agg._sum.originalAmountRub);
  const disc = num(agg._sum.discountAmountRub);
  const avgShare = orig > 0 ? Math.round((disc / orig) * 1000) / 10 : 0;
  const maxShare = env.ECON_MAX_DISCOUNT_SHARE;
  if (avgShare <= maxShare) {
    return { avgDiscountSharePct: avgShare, mode: "ok", valueMultiplierBps: 10000 };
  }
  if (env.ECON_GLOBAL_REWARD_ACTION === "suspend") {
    return { avgDiscountSharePct: avgShare, mode: "suspend", valueMultiplierBps: 0 };
  }
  const mult = Math.min(10000, Math.max(1000, Math.floor(env.ECON_GLOBAL_REWARD_REDUCE_BPS || 5000)));
  return { avgDiscountSharePct: avgShare, mode: "reduce", valueMultiplierBps: mult };
}

export type GuardrailsRunResult = {
  programs_updated: number;
  programs_skipped_manual_override: number;
  referral_codes_updated: number;
  expiry_health_logged: boolean;
  early_warning_program_nudges: number;
  early_warning_referral_flags: number;
  triggers: Array<{ kind: string; detail: string }>;
};

/**
 * Периодическая оценка: программы (discount vs commission, completion), рефералы (conversion), expiry (audit only).
 */
export async function runEconomicsGuardrailsJob(
  db: PrismaClient,
  env: Env,
): Promise<GuardrailsRunResult> {
  const triggers: Array<{ kind: string; detail: string }> = [];
  const expired = await expireEconomicsManualOverrides(db, env);
  triggers.push(...expired.triggers);

  if (!env.ECON_GUARDRAILS_ENABLED) {
    return {
      programs_updated: 0,
      programs_skipped_manual_override: 0,
      referral_codes_updated: 0,
      expiry_health_logged: false,
      early_warning_program_nudges: 0,
      early_warning_referral_flags: 0,
      triggers,
    };
  }

  const longDays = Math.max(1, Math.floor(env.ECON_GUARDRAILS_LOOKBACK_DAYS || 30));
  const shortDays = Math.max(
    1,
    Math.min(longDays, Math.floor(env.ECON_GUARDRAILS_SHORT_LOOKBACK_DAYS ?? 7)),
  );
  const fromLong = new Date();
  fromLong.setUTCDate(fromLong.getUTCDate() - longDays);
  const fromShort = new Date();
  fromShort.setUTCDate(fromShort.getUTCDate() - shortDays);

  const distinctPrograms = await db.booking.findMany({
    where: { createdAt: { gte: fromLong } },
    select: { programId: true },
    distinct: ["programId"],
  });

  let programsUpdated = 0;
  let programsSkippedManualOverride = 0;
  let earlyWarningProgramNudges = 0;

  const jobNow = new Date();
  for (const { programId } of distinctPrograms) {
    const programRow = await db.program.findUnique({
      where: { id: programId },
      select: {
        economicsRewardMultiplierBps: true,
        economicsRewardSuspended: true,
        economicsEarlyWarningFlag: true,
        economicsOverrideMode: true,
        economicsOverrideUntil: true,
      },
    });
    if (
      programRow &&
      isProgramEconomicsOverrideActive(
        {
          economicsOverrideMode: programRow.economicsOverrideMode,
          economicsOverrideUntil: programRow.economicsOverrideUntil,
        },
        jobNow,
      )
    ) {
      programsSkippedManualOverride += 1;
      triggers.push({
        kind: "program_skipped_manual_override",
        detail: programId,
      });
      continue;
    }
    const oldMult = programRow?.economicsRewardMultiplierBps ?? 10000;

    const computed = await computeProgramAutoEconomicsState(db, env, programId, {
      oldMult,
      prevEwFlag: programRow?.economicsEarlyWarningFlag ?? false,
      fromLong,
      fromShort,
      longDays,
      shortDays,
      triggers,
    });

    if (computed.ewApplied) {
      earlyWarningProgramNudges += 1;
      await writeAuditLog({
        entityType: "economics_early_warning",
        entityId: programId,
        changedField: "program_multiplier_nudge",
        oldValue: String(computed.multAfterMain),
        newValue: String(computed.newMult),
        changedBy: "system",
        reason: computed.ewReason,
      });
    }

    const newMult = computed.newMult;
    const reason = computed.reason;
    const multAfterMain = computed.multAfterMain;
    const ewApplied = computed.ewApplied;
    const ewReason = computed.ewReason;
    const ewSnapshot = computed.ewSnapshot;
    const suspended = computed.suspended;

    const mainChangedMult = computed.mainChangedMult;
    const ewChangedMult = computed.ewChangedMult;
    const prevEwFlag = programRow?.economicsEarlyWarningFlag ?? false;

    const needsWrite =
      mainChangedMult ||
      ewChangedMult ||
      programRow?.economicsRewardSuspended !== suspended ||
      ewApplied !== prevEwFlag;

    if (needsWrite) {
      await db.program.update({
        where: { id: programId },
        data: {
          economicsRewardMultiplierBps: newMult,
          economicsRewardSuspended: suspended,
          ...(mainChangedMult
            ? {
                economicsGuardrailReason: reason,
                economicsGuardrailUpdatedAt: new Date(),
              }
            : {}),
          economicsEarlyWarningFlag: ewApplied,
          economicsEarlyWarningReason: ewApplied ? ewReason : null,
          economicsEarlyWarningAt: ewApplied ? new Date() : null,
          economicsEarlyWarningSnapshot: ewSnapshot === null ? Prisma.JsonNull : ewSnapshot,
        },
      });
      if (mainChangedMult) {
        await writeAuditLog({
          entityType: "program",
          entityId: programId,
          changedField: "economicsRewardMultiplierBps",
          oldValue: String(oldMult),
          newValue: String(multAfterMain),
          changedBy: "system",
          reason: reason ?? "economics_guardrail_multiplier",
        });
      }
    }

    programsUpdated += 1;
  }

  const minVisits = Math.max(1, env.ECON_REFERRAL_CODE_MIN_VISITS || 20);
  const minConv = env.ECON_MIN_REFERRAL_CONVERSION ?? 2;
  const codes = await db.referralCode.findMany({
    where: { visits: { gte: minVisits } },
    select: {
      code: true,
      visits: true,
      bookings: true,
      economicsOverrideMode: true,
      economicsOverrideUntil: true,
    },
  });

  let refUpdated = 0;
  let earlyWarningReferralFlags = 0;
  const refEwEnabled = env.ECON_REFERRAL_EW_ENABLED && env.ECON_EARLY_WARNING_ENABLED;
  const refEwFactor = Math.max(1.01, env.ECON_REFERRAL_EW_VELOCITY_DROP_FACTOR ?? 1.5);
  const refEwMinBk = Math.max(1, Math.floor(env.ECON_REFERRAL_EW_MIN_BOOKINGS_LONG ?? 3));
  const expectedShortShare = shortDays / longDays;

  for (const c of codes) {
    const refOverride = isReferralEconomicsOverrideActive(c, jobNow);
    const convPct = c.visits > 0 ? Math.round((c.bookings / c.visits) * 10000) / 100 : 0;
    let low: boolean;
    let ewRef = false;
    let ewRefReason: string | null = null;
    let ewRefSnapshot: Prisma.InputJsonValue | null = null;

    if (refOverride) {
      low = c.economicsOverrideMode === "force_low_quality";
      triggers.push({ kind: "referral_skipped_manual_override", detail: c.code });
    } else {
      low = convPct < minConv;
    }

    if (!refOverride && refEwEnabled) {
      const [bookingsLong, bookingsShort] = await Promise.all([
        db.booking.count({
          where: { referralCode: c.code, createdAt: { gte: fromLong } },
        }),
        db.booking.count({
          where: { referralCode: c.code, createdAt: { gte: fromShort } },
        }),
      ]);

      const actualFrac = bookingsShort / Math.max(1, bookingsLong);
      const degraded =
        bookingsLong >= refEwMinBk &&
        actualFrac < expectedShortShare / refEwFactor;

      if (degraded) {
        ewRef = true;
        ewRefReason = "early_warning_referral_velocity_drop";
        ewRefSnapshot = {
          kind: "referral_booking_share_short_vs_long",
          short_window_days: shortDays,
          long_window_days: longDays,
          bookings_long: bookingsLong,
          bookings_short: bookingsShort,
          actual_share: Math.round(actualFrac * 1000) / 1000,
          expected_share: Math.round(expectedShortShare * 1000) / 1000,
          factor: refEwFactor,
        };
        earlyWarningReferralFlags += 1;
        triggers.push({
          kind: "early_warning_referral_velocity",
          detail: `${c.code}: share ${actualFrac.toFixed(3)} < ${(expectedShortShare / refEwFactor).toFixed(3)}`,
        });
        await writeAuditLog({
          entityType: "economics_early_warning",
          entityId: c.code,
          changedField: "referral_velocity_watch",
          oldValue: String(bookingsLong),
          newValue: String(bookingsShort),
          changedBy: "system",
          reason: ewRefReason,
        });
      }
    }

    await db.referralCode.update({
      where: { code: c.code },
      data: {
        economicsLowQuality: low,
        economicsLowQualityReason: low
          ? refOverride
            ? "manual_override_force_low_quality"
            : `conversion_${convPct}_pct_lt_${minConv}_visits_${c.visits}`
          : null,
        economicsLowQualityAt: low ? new Date() : null,
        economicsEarlyWarningFlag: ewRef,
        economicsEarlyWarningReason: ewRef ? ewRefReason : null,
        economicsEarlyWarningAt: ewRef ? new Date() : null,
        economicsEarlyWarningSnapshot: ewRefSnapshot === null ? Prisma.JsonNull : ewRefSnapshot,
      },
    });
    refUpdated += 1;
    if (low) {
      triggers.push({
        kind: "referral_low_quality",
        detail: `${c.code}: ${convPct}% bookings/visits`,
      });
    }
  }

  const granted = await db.programUgc.count({
    where: {
      rewardStatus: "granted",
      rewardGrantedAt: { gte: fromLong },
    },
  });
  const expiredEvents = await db.auditLog.count({
    where: {
      entityType: "user_reward",
      reason: "expires_at_reached",
      createdAt: { gte: fromLong },
    },
  });
  let expiryLogged = false;
  const expiryRatioPct = granted > 0 ? Math.round((expiredEvents / granted) * 1000) / 10 : 0;
  const expiryThreshold = env.ECON_EXPIRY_HEALTH_RATIO ?? 50;
  if (granted > 0 && expiryRatioPct > expiryThreshold) {
    expiryLogged = true;
    triggers.push({
      kind: "expiry_health_watch",
      detail: `expired_events=${expiredEvents} granted=${granted} ratio_pct=${expiryRatioPct}`,
    });
    await writeAuditLog({
      entityType: "economics_guardrail",
      entityId: `expiry_health:${fromLong.toISOString().slice(0, 10)}`,
      changedField: "expiry_health_watch",
      oldValue: null,
      newValue: JSON.stringify({
        expired_events: expiredEvents,
        rewards_granted_in_window: granted,
        ratio_percent: expiryRatioPct,
        threshold_percent: expiryThreshold,
      }),
      changedBy: "system",
      reason: "expiry_health_threshold",
    });
  }

  return {
    programs_updated: programsUpdated,
    programs_skipped_manual_override: programsSkippedManualOverride,
    referral_codes_updated: refUpdated,
    expiry_health_logged: expiryLogged,
    early_warning_program_nudges: earlyWarningProgramNudges,
    early_warning_referral_flags: earlyWarningReferralFlags,
    triggers,
  };
}

export async function getGuardrailsDashboard(db: PrismaClient, env: Env) {
  const dashNow = new Date();
  const activeProgramOverrideWhere = {
    economicsOverrideMode: { not: null },
    OR: [{ economicsOverrideUntil: null }, { economicsOverrideUntil: { gt: dashNow } }],
  };
  const activeReferralOverrideWhere = {
    economicsOverrideMode: { not: null },
    OR: [{ economicsOverrideUntil: null }, { economicsOverrideUntil: { gt: dashNow } }],
  };

  const [programsLimited, referralLowQuality, programsEw, referralsEw, programsOverridden, referralsOverridden] =
    await Promise.all([
    db.program.findMany({
      where: {
        OR: [{ economicsRewardSuspended: true }, { economicsRewardMultiplierBps: { not: 10000 } }],
      },
      select: {
        id: true,
        title: true,
        economicsRewardSuspended: true,
        economicsRewardMultiplierBps: true,
        economicsGuardrailReason: true,
        economicsGuardrailUpdatedAt: true,
        economicsEarlyWarningFlag: true,
        economicsEarlyWarningReason: true,
        economicsEarlyWarningAt: true,
        economicsEarlyWarningSnapshot: true,
        economicsOverrideMode: true,
        economicsOverrideReason: true,
        economicsOverrideUntil: true,
        economicsOverrideUpdatedAt: true,
      },
      take: 200,
      orderBy: { economicsGuardrailUpdatedAt: "desc" },
    }),
    db.referralCode.findMany({
      where: { economicsLowQuality: true },
      select: {
        code: true,
        visits: true,
        bookings: true,
        economicsLowQualityReason: true,
        economicsLowQualityAt: true,
      },
      take: 200,
      orderBy: { lastVisitAt: "desc" },
    }),
    db.program.findMany({
      where: { economicsEarlyWarningFlag: true },
      select: {
        id: true,
        title: true,
        economicsRewardMultiplierBps: true,
        economicsEarlyWarningReason: true,
        economicsEarlyWarningAt: true,
        economicsEarlyWarningSnapshot: true,
        economicsGuardrailReason: true,
      },
      take: 100,
      orderBy: { economicsEarlyWarningAt: "desc" },
    }),
    db.referralCode.findMany({
      where: { economicsEarlyWarningFlag: true },
      select: {
        code: true,
        visits: true,
        bookings: true,
        economicsEarlyWarningReason: true,
        economicsEarlyWarningAt: true,
        economicsEarlyWarningSnapshot: true,
      },
      take: 100,
      orderBy: { economicsEarlyWarningAt: "desc" },
    }),
    db.program.findMany({
      where: activeProgramOverrideWhere,
      select: {
        id: true,
        title: true,
        economicsRewardMultiplierBps: true,
        economicsOverrideMode: true,
        economicsOverrideReason: true,
        economicsOverrideUntil: true,
        economicsOverrideUpdatedAt: true,
      },
      take: 200,
      orderBy: { economicsOverrideUpdatedAt: "desc" },
    }),
    db.referralCode.findMany({
      where: activeReferralOverrideWhere,
      select: {
        code: true,
        visits: true,
        bookings: true,
        economicsOverrideMode: true,
        economicsOverrideReason: true,
        economicsOverrideUntil: true,
        economicsOverrideUpdatedAt: true,
        economicsLowQuality: true,
      },
      take: 200,
      orderBy: { economicsOverrideUpdatedAt: "desc" },
    }),
  ]);

  const globalSnapshot = await computeGlobalDiscountGuardrail(db, env);

  return {
    enabled: env.ECON_GUARDRAILS_ENABLED,
    thresholds: {
      ECON_MAX_DISCOUNT_SHARE: env.ECON_MAX_DISCOUNT_SHARE,
      ECON_GUARDRAILS_LOOKBACK_DAYS: env.ECON_GUARDRAILS_LOOKBACK_DAYS,
      ECON_GUARDRAILS_SHORT_LOOKBACK_DAYS: env.ECON_GUARDRAILS_SHORT_LOOKBACK_DAYS,
      ECON_GLOBAL_REWARD_ACTION: env.ECON_GLOBAL_REWARD_ACTION,
      ECON_GLOBAL_REWARD_REDUCE_BPS: env.ECON_GLOBAL_REWARD_REDUCE_BPS,
      ECON_MIN_REFERRAL_CONVERSION: env.ECON_MIN_REFERRAL_CONVERSION,
      ECON_REFERRAL_CODE_MIN_VISITS: env.ECON_REFERRAL_CODE_MIN_VISITS,
      ECON_MIN_COMPLETION_RATE: env.ECON_MIN_COMPLETION_RATE,
      ECON_PROGRAM_RATIO_SOFT: env.ECON_PROGRAM_RATIO_SOFT,
      ECON_PROGRAM_RATIO_HARD: env.ECON_PROGRAM_RATIO_HARD,
      ECON_PROGRAM_RATIO_ZERO: env.ECON_PROGRAM_RATIO_ZERO,
      ECON_REWARD_MULTIPLIER_SOFT_BPS: env.ECON_REWARD_MULTIPLIER_SOFT_BPS,
      ECON_REWARD_MULTIPLIER_HARD_BPS: env.ECON_REWARD_MULTIPLIER_HARD_BPS,
      ECON_REWARD_MULTIPLIER_RECOVERY_STEP_BPS: env.ECON_REWARD_MULTIPLIER_RECOVERY_STEP_BPS,
      ECON_EXPIRY_HEALTH_RATIO: env.ECON_EXPIRY_HEALTH_RATIO,
      ECON_EARLY_WARNING_ENABLED: env.ECON_EARLY_WARNING_ENABLED,
      ECON_EARLY_WARNING_RATIO_SHORT_VS_LONG_FACTOR: env.ECON_EARLY_WARNING_RATIO_SHORT_VS_LONG_FACTOR,
      ECON_EARLY_WARNING_COMPLETION_SHORT_VS_LONG_FACTOR: env.ECON_EARLY_WARNING_COMPLETION_SHORT_VS_LONG_FACTOR,
      ECON_EARLY_WARNING_STEP_BPS: env.ECON_EARLY_WARNING_STEP_BPS,
      ECON_REFERRAL_EW_ENABLED: env.ECON_REFERRAL_EW_ENABLED,
      ECON_REFERRAL_EW_VELOCITY_DROP_FACTOR: env.ECON_REFERRAL_EW_VELOCITY_DROP_FACTOR,
      ECON_REFERRAL_EW_MIN_BOOKINGS_LONG: env.ECON_REFERRAL_EW_MIN_BOOKINGS_LONG,
    },
    global_discount_guardrail: globalSnapshot,
    programs_limited: programsLimited.map((p) => {
      const ovActive = isProgramEconomicsOverrideActive(
        {
          economicsOverrideMode: p.economicsOverrideMode,
          economicsOverrideUntil: p.economicsOverrideUntil,
        },
        dashNow,
      );
      return {
        ...p,
        reward_multiplier_bps: p.economicsRewardMultiplierBps,
        last_change_reason: p.economicsGuardrailReason,
        early_warning: p.economicsEarlyWarningFlag
          ? {
              flag: true,
              reason: p.economicsEarlyWarningReason,
              at: p.economicsEarlyWarningAt,
              snapshot: p.economicsEarlyWarningSnapshot,
            }
          : { flag: false, reason: null, at: null, snapshot: null },
        manual_override: ovActive
          ? {
              active: true,
              mode: p.economicsOverrideMode,
              reason: p.economicsOverrideReason,
              until: p.economicsOverrideUntil,
              updated_at: p.economicsOverrideUpdatedAt,
            }
          : {
              active: false,
              mode: null,
              reason: null,
              until: null,
              updated_at: null,
            },
      };
    }),
    programs_overridden: programsOverridden.map((p) => ({
      id: p.id,
      title: p.title,
      reward_multiplier_bps: p.economicsRewardMultiplierBps,
      economics_override_mode: p.economicsOverrideMode,
      economics_override_reason: p.economicsOverrideReason,
      economics_override_until: p.economicsOverrideUntil,
      economics_override_updated_at: p.economicsOverrideUpdatedAt,
    })),
    referrals_overridden: referralsOverridden.map((r) => ({
      code: r.code,
      visits: r.visits,
      bookings: r.bookings,
      economics_low_quality: r.economicsLowQuality,
      economics_override_mode: r.economicsOverrideMode,
      economics_override_reason: r.economicsOverrideReason,
      economics_override_until: r.economicsOverrideUntil,
      economics_override_updated_at: r.economicsOverrideUpdatedAt,
    })),
    referral_codes_low_quality: referralLowQuality,
    early_warning: {
      enabled: env.ECON_EARLY_WARNING_ENABLED,
      short_lookback_days: env.ECON_GUARDRAILS_SHORT_LOOKBACK_DAYS,
      long_lookback_days: env.ECON_GUARDRAILS_LOOKBACK_DAYS,
      programs_flagged: programsEw.map((p) => ({
        id: p.id,
        title: p.title,
        reward_multiplier_bps: p.economicsRewardMultiplierBps,
        guardrail_reason: p.economicsGuardrailReason,
        early_warning_reason: p.economicsEarlyWarningReason,
        early_warning_at: p.economicsEarlyWarningAt,
        metrics_short_vs_long: p.economicsEarlyWarningSnapshot,
      })),
      referrals_flagged: referralsEw.map((r) => ({
        code: r.code,
        visits: r.visits,
        bookings: r.bookings,
        early_warning_reason: r.economicsEarlyWarningReason,
        early_warning_at: r.economicsEarlyWarningAt,
        metrics_short_vs_long: r.economicsEarlyWarningSnapshot,
      })),
    },
  };
}

/** Комбинированное значение reward при выдаче: глобальный × программный множитель (bps). */
export function combineRewardMultipliersBps(globalBps: number, programBps: number): number {
  return Math.min(10000, Math.max(0, Math.floor((globalBps * programBps) / 10000)));
}
