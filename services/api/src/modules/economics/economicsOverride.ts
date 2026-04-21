import type { Env } from "@mywave/config";

/** Ручной override множителя программы (см. admin economics override API). */
export const PROGRAM_ECONOMICS_OVERRIDE_MODES = [
  "force_full",
  "force_soft",
  "force_hard",
  "force_suspend",
] as const;
export type ProgramEconomicsOverrideMode = (typeof PROGRAM_ECONOMICS_OVERRIDE_MODES)[number];

export const REFERRAL_ECONOMICS_OVERRIDE_MODES = ["force_normal", "force_low_quality"] as const;
export type ReferralEconomicsOverrideMode = (typeof REFERRAL_ECONOMICS_OVERRIDE_MODES)[number];

export type ProgramEconomicsOverrideFields = {
  economicsOverrideMode: string | null;
  economicsOverrideUntil: Date | null;
  economicsRewardMultiplierBps: number;
  economicsRewardSuspended: boolean;
};

export function isProgramEconomicsOverrideActive(
  row: Pick<ProgramEconomicsOverrideFields, "economicsOverrideMode" | "economicsOverrideUntil">,
  now: Date,
): boolean {
  if (!row.economicsOverrideMode) return false;
  if (row.economicsOverrideUntil == null) return true;
  return row.economicsOverrideUntil.getTime() > now.getTime();
}

export function programOverrideMultiplierBps(mode: string, env: Env): number {
  const softBps = Math.min(10000, Math.max(0, Math.floor(env.ECON_REWARD_MULTIPLIER_SOFT_BPS ?? 7000)));
  const hardBps = Math.min(softBps, Math.max(0, Math.floor(env.ECON_REWARD_MULTIPLIER_HARD_BPS ?? 5000)));
  switch (mode) {
    case "force_full":
      return 10000;
    case "force_soft":
      return softBps;
    case "force_hard":
      return hardBps;
    case "force_suspend":
      return 0;
    default:
      return 10000;
  }
}

export type EffectiveProgramEconomics = {
  multiplierBps: number;
  suspended: boolean;
  overrideActive: boolean;
};

/**
 * Effective economics для grant/apply: при активном override — из mode; иначе из полей программы.
 */
export function getEffectiveProgramEconomics(
  row: ProgramEconomicsOverrideFields,
  env: Env,
  now: Date = new Date(),
): EffectiveProgramEconomics {
  if (isProgramEconomicsOverrideActive(row, now)) {
    const mode = row.economicsOverrideMode!;
    const multiplierBps = programOverrideMultiplierBps(mode, env);
    return {
      multiplierBps,
      suspended: multiplierBps === 0,
      overrideActive: true,
    };
  }
  return {
    multiplierBps: row.economicsRewardMultiplierBps ?? 10000,
    suspended: row.economicsRewardSuspended ?? false,
    overrideActive: false,
  };
}

export type ReferralEconomicsOverrideFields = {
  economicsOverrideMode: string | null;
  economicsOverrideUntil: Date | null;
};

export function isReferralEconomicsOverrideActive(
  row: ReferralEconomicsOverrideFields,
  now: Date,
): boolean {
  if (!row.economicsOverrideMode) return false;
  if (row.economicsOverrideUntil == null) return true;
  return row.economicsOverrideUntil.getTime() > now.getTime();
}
