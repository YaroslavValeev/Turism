import type { Env } from "@mywave/config";
import { Prisma, type PrismaClient } from "@prisma/client";
import { writeAuditLog } from "../../lib/audit";
import {
  getEffectiveProgramEconomics,
  isProgramEconomicsOverrideActive,
  isReferralEconomicsOverrideActive,
  type ProgramEconomicsOverrideFields,
  type EffectiveProgramEconomics,
} from "./economicsOverride";
import { computeProgramAutoEconomicsState } from "./programAutoEconomicsCompute";
import { computeReferralAutoEconomicsState } from "./referralAutoEconomicsCompute";

function guardrailsWindows(env: Env) {
  const longDays = Math.max(1, Math.floor(env.ECON_GUARDRAILS_LOOKBACK_DAYS || 30));
  const shortDays = Math.max(
    1,
    Math.min(longDays, Math.floor(env.ECON_GUARDRAILS_SHORT_LOOKBACK_DAYS ?? 7)),
  );
  const fromLong = new Date();
  fromLong.setUTCDate(fromLong.getUTCDate() - longDays);
  const fromShort = new Date();
  fromShort.setUTCDate(fromShort.getUTCDate() - shortDays);
  return { longDays, shortDays, fromLong, fromShort };
}

export type RecomputeProgramResult = {
  ok: true;
  old_effective: ReturnType<typeof getEffectiveProgramEconomics>;
  new_effective: ReturnType<typeof getEffectiveProgramEconomics>;
  recomputed: Awaited<ReturnType<typeof computeProgramAutoEconomicsState>>;
} | { ok: false; error: string };

/**
 * Пересчёт авто-economics по программе после снятия override (или TTL). Не вызывать при активном override.
 */
export async function recomputeProgramEconomicsAuto(
  db: PrismaClient,
  env: Env,
  programId: string,
  opts: {
    auditReason: "manual_override_cleared_recomputed" | "manual_override_expired_recomputed";
    changedBy: string;
    /** Состояние до снятия override (если уже снят в БД — передать сюда). */
    old_effective_before?: EffectiveProgramEconomics;
  },
): Promise<RecomputeProgramResult> {
  const row = await db.program.findUnique({
    where: { id: programId },
    select: {
      economicsRewardMultiplierBps: true,
      economicsRewardSuspended: true,
      economicsOverrideMode: true,
      economicsOverrideUntil: true,
      economicsEarlyWarningFlag: true,
      economicsGuardrailReason: true,
    },
  });
  if (!row) {
    return { ok: false, error: "program_not_found" };
  }
  if (
    isProgramEconomicsOverrideActive(
      { economicsOverrideMode: row.economicsOverrideMode, economicsOverrideUntil: row.economicsOverrideUntil },
      new Date(),
    )
  ) {
    return { ok: false, error: "override_still_active" };
  }

  const oldEffective =
    opts.old_effective_before ?? getEffectiveProgramEconomics(row as ProgramEconomicsOverrideFields, env);

  const { longDays, shortDays, fromLong, fromShort } = guardrailsWindows(env);
  const jobNow = new Date();

  const computed = await computeProgramAutoEconomicsState(db, env, programId, {
    oldMult: row.economicsRewardMultiplierBps ?? 10000,
    prevEwFlag: row.economicsEarlyWarningFlag ?? false,
    fromLong,
    fromShort,
    longDays,
    shortDays,
  });

  await db.program.update({
    where: { id: programId },
    data: {
      economicsRewardMultiplierBps: computed.newMult,
      economicsRewardSuspended: computed.suspended,
      ...(computed.mainChangedMult
        ? {
            economicsGuardrailReason: computed.reason,
            economicsGuardrailUpdatedAt: new Date(),
          }
        : {}),
      economicsEarlyWarningFlag: computed.ewApplied,
      economicsEarlyWarningReason: computed.ewApplied ? computed.ewReason : null,
      economicsEarlyWarningAt: computed.ewApplied ? new Date() : null,
      economicsEarlyWarningSnapshot: computed.ewSnapshot === null ? Prisma.JsonNull : computed.ewSnapshot,
    },
  });

  const afterRow = await db.program.findUnique({
    where: { id: programId },
    select: {
      economicsRewardMultiplierBps: true,
      economicsRewardSuspended: true,
      economicsOverrideMode: true,
      economicsOverrideUntil: true,
    },
  });
  const newEffective = getEffectiveProgramEconomics(afterRow as ProgramEconomicsOverrideFields, env);

  await writeAuditLog({
    entityType: "economics_manual_override",
    entityId: programId,
    changedField: "program_auto_recomputed",
    oldValue: JSON.stringify({
      effective_multiplier_bps: oldEffective.multiplierBps,
      effective_suspended: oldEffective.suspended,
      override_active: oldEffective.overrideActive,
    }),
    newValue: JSON.stringify({
      effective_multiplier_bps: newEffective.multiplierBps,
      effective_suspended: newEffective.suspended,
      computed,
    }),
    changedBy: opts.changedBy,
    reason: opts.auditReason,
  });

  return { ok: true, old_effective: oldEffective, new_effective: newEffective, recomputed: computed };
}

export async function recomputeReferralEconomicsAuto(
  db: PrismaClient,
  env: Env,
  code: string,
  opts: {
    auditReason: "manual_override_cleared_recomputed" | "manual_override_expired_recomputed";
    changedBy: string;
    old_effective_before?: { low_quality: boolean; override_active: boolean };
  },
): Promise<{
  ok: true;
  old_effective: { low_quality: boolean; override_active: boolean };
  new_effective: { low_quality: boolean; override_active: boolean };
} | { ok: false; error: string }> {
  const row = await db.referralCode.findUnique({
    where: { code },
    select: {
      visits: true,
      bookings: true,
      economicsLowQuality: true,
      economicsOverrideMode: true,
      economicsOverrideUntil: true,
    },
  });
  if (!row) {
    return { ok: false, error: "referral_not_found" };
  }
  if (
    isReferralEconomicsOverrideActive(
      { economicsOverrideMode: row.economicsOverrideMode, economicsOverrideUntil: row.economicsOverrideUntil },
      new Date(),
    )
  ) {
    return { ok: false, error: "override_still_active" };
  }

  const oldEffective = opts.old_effective_before ?? {
    low_quality: row.economicsLowQuality,
    override_active: isReferralEconomicsOverrideActive(
      { economicsOverrideMode: row.economicsOverrideMode, economicsOverrideUntil: row.economicsOverrideUntil },
      new Date(),
    ),
  };

  const { longDays, shortDays, fromLong, fromShort } = guardrailsWindows(env);

  const computed = await computeReferralAutoEconomicsState(db, env, {
    code,
    visits: row.visits,
    bookings: row.bookings,
    fromLong,
    fromShort,
    shortDays,
    longDays,
  });

  await db.referralCode.update({
    where: { code },
    data: {
      economicsLowQuality: computed.low,
      economicsLowQualityReason: computed.economicsLowQualityReason,
      economicsLowQualityAt: computed.low ? new Date() : null,
      economicsEarlyWarningFlag: computed.ewRef,
      economicsEarlyWarningReason: computed.ewRef ? computed.ewRefReason : null,
      economicsEarlyWarningAt: computed.ewRef ? new Date() : null,
      economicsEarlyWarningSnapshot: computed.ewRefSnapshot === null ? Prisma.JsonNull : computed.ewRefSnapshot,
    },
  });

  const afterRow = await db.referralCode.findUnique({
    where: { code },
    select: { economicsLowQuality: true },
  });

  const newEffective = {
    low_quality: afterRow?.economicsLowQuality ?? false,
    override_active: false,
  };

  await writeAuditLog({
    entityType: "economics_manual_override",
    entityId: code,
    changedField: "referral_auto_recomputed",
    oldValue: JSON.stringify(oldEffective),
    newValue: JSON.stringify(newEffective),
    changedBy: opts.changedBy,
    reason: opts.auditReason,
  });

  return { ok: true, old_effective: oldEffective, new_effective: newEffective };
}
