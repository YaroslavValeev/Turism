/**
 * Авто-расчёт multiplier/suspend/EW для одной программы (паритет с runEconomicsGuardrailsJob).
 */
import type { Env } from "@mywave/config";
import { Prisma, type PrismaClient } from "@prisma/client";
import { computeProgramEconomicsMetrics, num } from "./economicsMetrics";

export type { ProgramEconomicsWindowMetrics } from "./economicsMetrics";

function isMainReactiveGuardrailReason(reason: string | null): boolean {
  if (!reason) return false;
  return (
    reason.includes("discount_completion_") ||
    reason.includes("_gt_zero_") ||
    reason.includes("_gt_hard_") ||
    reason.includes("_gt_soft_")
  );
}

function shouldSkipEarlyWarningNudge(params: {
  env: Env;
  mainReason: string | null;
  newMultAfterMain: number;
  hardBps: number;
  softBps: number;
}): boolean {
  if (!params.env.ECON_EARLY_WARNING_ENABLED) return true;
  if (params.newMultAfterMain === 0) return true;
  if (params.newMultAfterMain <= params.hardBps) return true;
  if (params.newMultAfterMain <= params.softBps) return true;
  if (isMainReactiveGuardrailReason(params.mainReason)) return true;
  if (params.mainReason?.startsWith("reward_multiplier_recovery")) return true;
  return false;
}

export type ProgramAutoEconomicsComputed = {
  newMult: number;
  suspended: boolean;
  reason: string | null;
  multAfterMain: number;
  ewApplied: boolean;
  ewReason: string | null;
  ewSnapshot: Prisma.InputJsonValue | null;
  mainChangedMult: boolean;
  ewChangedMult: boolean;
};

export async function computeProgramAutoEconomicsState(
  db: PrismaClient,
  env: Env,
  programId: string,
  args: {
    oldMult: number;
    prevEwFlag: boolean;
    fromLong: Date;
    fromShort: Date;
    longDays: number;
    shortDays: number;
    triggers?: Array<{ kind: string; detail: string }>;
  },
): Promise<ProgramAutoEconomicsComputed> {
  const minCompletion = env.ECON_MIN_COMPLETION_RATE ?? 10;
  const ratioSoft = Math.max(0, env.ECON_PROGRAM_RATIO_SOFT ?? 2);
  const ratioHard = Math.max(ratioSoft, env.ECON_PROGRAM_RATIO_HARD ?? 3);
  const ratioZero = Math.max(ratioHard, env.ECON_PROGRAM_RATIO_ZERO ?? 5);
  const softBps = Math.min(10000, Math.max(0, Math.floor(env.ECON_REWARD_MULTIPLIER_SOFT_BPS ?? 7000)));
  const hardBps = Math.min(softBps, Math.max(0, Math.floor(env.ECON_REWARD_MULTIPLIER_HARD_BPS ?? 5000)));
  const recoveryStep = Math.max(1, Math.floor(env.ECON_REWARD_MULTIPLIER_RECOVERY_STEP_BPS ?? 1000));

  const ewStep = Math.max(1, Math.floor(env.ECON_EARLY_WARNING_STEP_BPS ?? 1000));
  const ewRatioFactor = Math.max(1.01, env.ECON_EARLY_WARNING_RATIO_SHORT_VS_LONG_FACTOR ?? 1.5);
  const ewCompFactor = Math.max(0.01, Math.min(1, env.ECON_EARLY_WARNING_COMPLETION_SHORT_VS_LONG_FACTOR ?? 0.85));
  const minCommL = Math.max(0, env.ECON_EARLY_WARNING_MIN_COMMISSION_RUB_LONG ?? 100);
  const minCommS = Math.max(0, env.ECON_EARLY_WARNING_MIN_COMMISSION_RUB_SHORT ?? 50);
  const minDiscL = Math.max(1, Math.floor(env.ECON_EARLY_WARNING_MIN_DISCOUNT_BOOKINGS_LONG ?? 3));
  const minDiscS = Math.max(1, Math.floor(env.ECON_EARLY_WARNING_MIN_DISCOUNT_BOOKINGS_SHORT ?? 2));

  const tr = args.triggers;

  const [discAgg, commRows, withDisc, completedDisc] = await Promise.all([
    db.booking.aggregate({
      where: { programId, createdAt: { gte: args.fromLong } },
      _sum: { discountAmountRub: true },
    }),
    db.commission.findMany({
      where: { programId, booking: { createdAt: { gte: args.fromLong } } },
      select: { commissionCollectedRub: true, commissionAmountRub: true },
    }),
    db.booking.count({
      where: { programId, createdAt: { gte: args.fromLong }, discountAmountRub: { gt: 0 } },
    }),
    db.booking.count({
      where: {
        programId,
        createdAt: { gte: args.fromLong },
        discountAmountRub: { gt: 0 },
        bookingStatus: "completed",
      },
    }),
  ]);

  let totalComm = 0;
  for (const c of commRows) {
    totalComm += num(c.commissionCollectedRub) || num(c.commissionAmountRub);
  }
  const totalDiscount = num(discAgg._sum.discountAmountRub);
  const completionPct =
    withDisc > 0 ? Math.round((completedDisc / withDisc) * 1000) / 10 : 100;

  const oldMult = args.oldMult;
  let newMult = oldMult;
  let reason: string | null = null;

  if (withDisc > 0 && completionPct < minCompletion) {
    newMult = 0;
    reason = `discount_completion_${completionPct}_pct_lt_${minCompletion}`;
    tr?.push({
      kind: "program_reward_multiplier_zero",
      detail: `${programId}: completion ${completionPct}%`,
    });
  } else if (totalComm > 0) {
    const ratio = totalDiscount / totalComm;
    if (ratio > ratioZero) {
      newMult = 0;
      reason = `discount_commission_ratio_${ratio.toFixed(2)}_gt_zero_${ratioZero}`;
      tr?.push({
        kind: "program_reward_multiplier_zero",
        detail: `${programId}: ratio ${ratio.toFixed(2)} discount ${totalDiscount} comm ${totalComm}`,
      });
    } else if (ratio > ratioHard) {
      newMult = hardBps;
      reason = `discount_commission_ratio_${ratio.toFixed(2)}_gt_hard_${ratioHard}_bps_${hardBps}`;
      tr?.push({
        kind: "program_reward_multiplier_hard",
        detail: `${programId}: ratio ${ratio.toFixed(2)} → ${hardBps} bps`,
      });
    } else if (ratio > ratioSoft) {
      newMult = softBps;
      reason = `discount_commission_ratio_${ratio.toFixed(2)}_gt_soft_${ratioSoft}_bps_${softBps}`;
      tr?.push({
        kind: "program_reward_multiplier_soft",
        detail: `${programId}: ratio ${ratio.toFixed(2)} → ${softBps} bps`,
      });
    } else {
      newMult = Math.min(10000, oldMult + recoveryStep);
      if (newMult !== oldMult) {
        reason = `reward_multiplier_recovery_step_${recoveryStep}_bps`;
      }
    }
  } else {
    newMult = Math.min(10000, oldMult + recoveryStep);
    if (newMult !== oldMult) {
      reason = `reward_multiplier_recovery_step_${recoveryStep}_bps_no_commission_in_window`;
    }
  }

  newMult = Math.min(10000, Math.max(0, newMult));
  const multAfterMain = newMult;

  let ewApplied = false;
  let ewReason: string | null = null;
  let ewSnapshot: Prisma.InputJsonValue | null = null;
  const multBeforeEw = newMult;

  if (
    !shouldSkipEarlyWarningNudge({
      env,
      mainReason: reason,
      newMultAfterMain: multAfterMain,
      hardBps,
      softBps,
    })
  ) {
    const mShort = await computeProgramEconomicsMetrics(db, programId, args.fromShort);
    const mLong = await computeProgramEconomicsMetrics(db, programId, args.fromLong);

    const longRatio =
      mLong.totalComm >= minCommL ? mLong.totalDiscount / mLong.totalComm : null;
    const shortRatio =
      mShort.totalComm >= minCommS ? mShort.totalDiscount / mShort.totalComm : null;

    const completionLong =
      mLong.withDisc >= minDiscL
        ? Math.round((mLong.completedDisc / mLong.withDisc) * 1000) / 10
        : null;
    const completionShort =
      mShort.withDisc >= minDiscS
        ? Math.round((mShort.completedDisc / mShort.withDisc) * 1000) / 10
        : null;

    let spikeRatio = false;
    if (
      longRatio != null &&
      shortRatio != null &&
      longRatio > 0 &&
      shortRatio > longRatio * ewRatioFactor
    ) {
      spikeRatio = true;
    }

    let spikeCompletion = false;
    if (
      completionLong != null &&
      completionShort != null &&
      completionLong > 0 &&
      completionShort < completionLong * ewCompFactor
    ) {
      spikeCompletion = true;
    }

    if (spikeRatio) {
      newMult = Math.min(10000, Math.max(0, newMult - ewStep));
      ewApplied = true;
      ewReason = "early_warning_spike";
      ewSnapshot = {
        kind: "ratio_short_vs_long",
        short_window_days: args.shortDays,
        long_window_days: args.longDays,
        short_ratio: Math.round(shortRatio! * 1000) / 1000,
        long_ratio: Math.round(longRatio! * 1000) / 1000,
        factor: ewRatioFactor,
      };
      tr?.push({
        kind: "early_warning_program_ratio",
        detail: `${programId}: short_ratio>${longRatio! * ewRatioFactor}`,
      });
    } else if (spikeCompletion) {
      newMult = Math.min(10000, Math.max(0, newMult - ewStep));
      ewApplied = true;
      ewReason = "early_warning_completion_drop";
      ewSnapshot = {
        kind: "completion_short_vs_long",
        short_window_days: args.shortDays,
        long_window_days: args.longDays,
        completion_short_pct: completionShort,
        completion_long_pct: completionLong,
        factor: ewCompFactor,
      };
      tr?.push({
        kind: "early_warning_program_completion",
        detail: `${programId}: completion_short ${completionShort}%`,
      });
    }
  }

  const suspended = newMult === 0;
  const mainChangedMult = multAfterMain !== oldMult;
  const ewChangedMult = newMult !== multAfterMain;

  return {
    newMult,
    suspended,
    reason,
    multAfterMain,
    ewApplied,
    ewReason,
    ewSnapshot,
    mainChangedMult,
    ewChangedMult,
  };
}
