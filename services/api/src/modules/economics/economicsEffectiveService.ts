import type { Env } from "@mywave/config";
import type { PrismaClient } from "@prisma/client";
import {
  getEffectiveProgramEconomics,
  isProgramEconomicsOverrideActive,
  isReferralEconomicsOverrideActive,
  programOverrideMultiplierBps,
  type ProgramEconomicsOverrideFields,
} from "./economicsOverride";
import { computeProgramAutoEconomicsState } from "./programAutoEconomicsCompute";

export type EconomicsSourceOfTruth = "manual_override" | "guardrail_auto" | "early_warning_auto" | "default";

export type ProgramEconomicsExplanation = {
  why: string;
  applied_rule: string;
  source_of_truth: EconomicsSourceOfTruth;
  effective_multiplier_bps: number;
  effective_suspended: boolean;
  grant_or_apply_blocked: boolean;
};

function explainProgram(
  row: {
    economicsOverrideMode: string | null;
    economicsOverrideUntil: Date | null;
    economicsGuardrailReason: string | null;
    economicsEarlyWarningFlag: boolean;
    economicsEarlyWarningReason: string | null;
  },
  env: Env,
  eff: ReturnType<typeof getEffectiveProgramEconomics>,
  now: Date,
): ProgramEconomicsExplanation {
  const blocked = eff.suspended || eff.multiplierBps === 0;

  if (eff.overrideActive && row.economicsOverrideMode) {
    return {
      why: "Активен ручной override множителя программы.",
      applied_rule: `override_mode:${row.economicsOverrideMode}`,
      source_of_truth: "manual_override",
      effective_multiplier_bps: eff.multiplierBps,
      effective_suspended: eff.suspended,
      grant_or_apply_blocked: blocked,
    };
  }
  if (row.economicsEarlyWarningFlag && row.economicsEarlyWarningReason) {
    return {
      why: "Сработал early-warning (short vs long метрики).",
      applied_rule: row.economicsEarlyWarningReason,
      source_of_truth: "early_warning_auto",
      effective_multiplier_bps: eff.multiplierBps,
      effective_suspended: eff.suspended,
      grant_or_apply_blocked: blocked,
    };
  }
  if (row.economicsGuardrailReason && row.economicsGuardrailReason.length > 0) {
    return {
      why: "Применены реактивные guardrails по метрикам окна.",
      applied_rule: row.economicsGuardrailReason,
      source_of_truth: "guardrail_auto",
      effective_multiplier_bps: eff.multiplierBps,
      effective_suspended: eff.suspended,
      grant_or_apply_blocked: blocked,
    };
  }
  return {
    why: "Автоматические пороги не сработали; множитель по умолчанию или восстановление.",
    applied_rule: "baseline_10000_bps",
    source_of_truth: "default",
    effective_multiplier_bps: eff.multiplierBps,
    effective_suspended: eff.suspended,
    grant_or_apply_blocked: blocked,
  };
}

const programSelectEffective = {
  economicsRewardMultiplierBps: true,
  economicsRewardSuspended: true,
  economicsOverrideMode: true,
  economicsOverrideReason: true,
  economicsOverrideUntil: true,
  economicsOverrideUpdatedAt: true,
  economicsGuardrailReason: true,
  economicsGuardrailUpdatedAt: true,
  economicsEarlyWarningFlag: true,
  economicsEarlyWarningReason: true,
  economicsEarlyWarningAt: true,
  economicsEarlyWarningSnapshot: true,
  title: true,
} as const;

export async function getProgramEconomicsEffectivePayload(db: PrismaClient, env: Env, programId: string) {
  const row = await db.program.findUnique({
    where: { id: programId },
    select: { id: true, ...programSelectEffective },
  });
  if (!row) {
    return { ok: false as const, error: "program_not_found" };
  }
  const now = new Date();
  const eff = getEffectiveProgramEconomics(row as ProgramEconomicsOverrideFields, env, now);
  const explanation = explainProgram(row, env, eff, now);
  return {
    ok: true as const,
    program_id: row.id,
    title: row.title,
    raw_auto: {
      economics_reward_multiplier_bps: row.economicsRewardMultiplierBps,
      economics_reward_suspended: row.economicsRewardSuspended,
      economics_guardrail_reason: row.economicsGuardrailReason,
      economics_guardrail_updated_at: row.economicsGuardrailUpdatedAt,
      economics_early_warning_flag: row.economicsEarlyWarningFlag,
      economics_early_warning_reason: row.economicsEarlyWarningReason,
      economics_early_warning_at: row.economicsEarlyWarningAt,
      economics_early_warning_snapshot: row.economicsEarlyWarningSnapshot,
    },
    manual_override: {
      mode: row.economicsOverrideMode,
      reason: row.economicsOverrideReason,
      until: row.economicsOverrideUntil,
      updated_at: row.economicsOverrideUpdatedAt,
      active: isProgramEconomicsOverrideActive(
        { economicsOverrideMode: row.economicsOverrideMode, economicsOverrideUntil: row.economicsOverrideUntil },
        now,
      ),
    },
    effective: {
      multiplier_bps: eff.multiplierBps,
      suspended: eff.suspended,
      override_active: eff.overrideActive,
    },
    why: explanation.why,
    applied_rule: explanation.applied_rule,
    effective_multiplier_bps: explanation.effective_multiplier_bps,
    effective_quality_flag: null as null,
    grant_or_apply_blocked: explanation.grant_or_apply_blocked,
    source_of_truth: explanation.source_of_truth,
  };
}


export async function previewProgramEconomicsOverride(
  db: PrismaClient,
  env: Env,
  programId: string,
  body: { mode: string; reason?: string; until?: string | null; indefinite?: boolean },
) {
  const row = await db.program.findUnique({
    where: { id: programId },
    select: programSelectEffective,
  });
  if (!row) {
    return { ok: false as const, error: "program_not_found" };
  }
  const now = new Date();
  const currentEff = getEffectiveProgramEconomics(row as ProgramEconomicsOverrideFields, env, now);
  const currentExpl = explainProgram(row, env, currentEff, now);

  const mode = body.mode?.trim() ?? "";
  const multFuture = programOverrideMultiplierBps(mode, env);
  const suspendedFuture = multFuture === 0;

  let until: Date | null = null;
  if (body.indefinite === true) {
    until = null;
  } else if (body.until) {
    until = new Date(body.until);
    if (Number.isNaN(until.getTime())) {
      return { ok: false as const, error: "invalid_until" };
    }
  }

  const simulated: ProgramEconomicsOverrideFields = {
    economicsRewardMultiplierBps: row.economicsRewardMultiplierBps,
    economicsRewardSuspended: row.economicsRewardSuspended,
    economicsOverrideMode: mode,
    economicsOverrideUntil: body.indefinite ? null : until,
  };
  const newEff = getEffectiveProgramEconomics(simulated, env, now);
  const newExpl = explainProgram(
    {
      ...row,
      economicsOverrideMode: mode,
      economicsOverrideUntil: simulated.economicsOverrideUntil,
      economicsEarlyWarningFlag: row.economicsEarlyWarningFlag,
      economicsEarlyWarningReason: row.economicsEarlyWarningReason,
    },
    env,
    newEff,
    now,
  );

  const { longDays, shortDays, fromLong, fromShort } = (() => {
    const longDays = Math.max(1, Math.floor(env.ECON_GUARDRAILS_LOOKBACK_DAYS || 30));
    const shortDays = Math.max(1, Math.min(longDays, Math.floor(env.ECON_GUARDRAILS_SHORT_LOOKBACK_DAYS ?? 7)));
    const fromLong = new Date();
    fromLong.setUTCDate(fromLong.getUTCDate() - longDays);
    const fromShort = new Date();
    fromShort.setUTCDate(fromShort.getUTCDate() - shortDays);
    return { longDays, shortDays, fromLong, fromShort };
  })();

  const autoIfCleared = await computeProgramAutoEconomicsState(db, env, programId, {
    oldMult: row.economicsRewardMultiplierBps ?? 10000,
    prevEwFlag: row.economicsEarlyWarningFlag ?? false,
    fromLong,
    fromShort,
    longDays,
    shortDays,
  });

  return {
    ok: true as const,
    dry_run: true,
    current: {
      effective_multiplier_bps: currentEff.multiplierBps,
      effective_suspended: currentEff.suspended,
      effective: currentEff,
      explanation: currentExpl,
    },
    after_override: {
      effective_multiplier_bps: newEff.multiplierBps,
      effective_suspended: newEff.suspended,
      effective: newEff,
      explanation: newExpl,
    },
    comparison: {
      multiplier_before: currentEff.multiplierBps,
      multiplier_after: newEff.multiplierBps,
      grant_or_apply_blocked_before: currentExpl.grant_or_apply_blocked,
      grant_or_apply_blocked_after: newExpl.grant_or_apply_blocked,
    },
    active_signals: {
      guardrail_reason: row.economicsGuardrailReason,
      early_warning_flag: row.economicsEarlyWarningFlag,
      early_warning_reason: row.economicsEarlyWarningReason,
    },
    auto_recompute_if_cleared: {
      note: "Если бы override не был активен, авто-логика дала бы такие значения (оценка по текущим метрикам).",
      computed_multiplier_bps: autoIfCleared.newMult,
      computed_suspended: autoIfCleared.suspended,
    },
    why: `Preview: переход к override «${mode}»; сравнение с текущим effective.`,
    applied_rule: `preview_override:${mode}`,
  };
}

const referralSelectEffective = {
  code: true,
  visits: true,
  bookings: true,
  economicsLowQuality: true,
  economicsLowQualityReason: true,
  economicsLowQualityAt: true,
  economicsOverrideMode: true,
  economicsOverrideReason: true,
  economicsOverrideUntil: true,
  economicsOverrideUpdatedAt: true,
  economicsEarlyWarningFlag: true,
  economicsEarlyWarningReason: true,
  economicsEarlyWarningAt: true,
  economicsEarlyWarningSnapshot: true,
} as const;

export async function getReferralEconomicsEffectivePayload(db: PrismaClient, env: Env, code: string) {
  const row = await db.referralCode.findUnique({
    where: { code },
    select: referralSelectEffective,
  });
  if (!row) {
    return { ok: false as const, error: "referral_not_found" };
  }
  const now = new Date();
  const ov = isReferralEconomicsOverrideActive(
    { economicsOverrideMode: row.economicsOverrideMode, economicsOverrideUntil: row.economicsOverrideUntil },
    now,
  );
  let lowQuality = row.economicsLowQuality;
  if (ov) {
    lowQuality = row.economicsOverrideMode === "force_low_quality";
  }
  const source: EconomicsSourceOfTruth = ov
    ? "manual_override"
    : row.economicsEarlyWarningFlag
      ? "early_warning_auto"
      : row.economicsLowQuality
        ? "guardrail_auto"
        : "default";

  return {
    ok: true as const,
    code: row.code,
    raw_auto: {
      economics_low_quality: row.economicsLowQuality,
      economics_low_quality_reason: row.economicsLowQualityReason,
      economics_early_warning_flag: row.economicsEarlyWarningFlag,
      economics_early_warning_reason: row.economicsEarlyWarningReason,
    },
    manual_override: {
      mode: row.economicsOverrideMode,
      reason: row.economicsOverrideReason,
      until: row.economicsOverrideUntil,
      updated_at: row.economicsOverrideUpdatedAt,
      active: ov,
    },
    effective: {
      low_quality: lowQuality,
      override_active: ov,
    },
    why:
      ov
        ? "Активен ручной override качества реферального кода."
        : row.economicsEarlyWarningFlag
          ? "Сработал early-warning по referral-коду."
          : row.economicsLowQuality
            ? "Низкая конверсия по порогу guardrails."
            : "Нормальное качество по текущим метрикам.",
    applied_rule: ov
      ? `override_mode:${row.economicsOverrideMode}`
      : (row.economicsLowQualityReason ?? "conversion_ok"),
    effective_multiplier_bps: null as null,
    effective_quality_flag: lowQuality,
    grant_or_apply_blocked: lowQuality,
    source_of_truth: source,
  };
}

export async function previewReferralEconomicsOverride(
  db: PrismaClient,
  env: Env,
  code: string,
  body: { mode: string; until?: string | null; indefinite?: boolean },
) {
  const row = await db.referralCode.findUnique({
    where: { code },
    select: referralSelectEffective,
  });
  if (!row) {
    return { ok: false as const, error: "referral_not_found" };
  }
  const now = new Date();
  const currentOv = isReferralEconomicsOverrideActive(
    { economicsOverrideMode: row.economicsOverrideMode, economicsOverrideUntil: row.economicsOverrideUntil },
    now,
  );
  const currentLow = currentOv ? row.economicsOverrideMode === "force_low_quality" : row.economicsLowQuality;

  const mode = body.mode?.trim() ?? "";
  let until: Date | null = null;
  if (body.indefinite === true) {
    until = null;
  } else if (body.until) {
    until = new Date(body.until);
    if (Number.isNaN(until.getTime())) {
      return { ok: false as const, error: "invalid_until" };
    }
  }

  const futureLow = mode === "force_low_quality";
  const futureOv = true;

  return {
    ok: true as const,
    dry_run: true,
    current: {
      effective_low_quality: currentLow,
      override_active: currentOv,
    },
    after_override: {
      effective_low_quality: futureLow,
      override_active: futureOv,
      mode,
      until: body.indefinite ? null : until?.toISOString() ?? null,
    },
    comparison: {
      quality_flag_before: currentLow,
      quality_flag_after: futureLow,
      grant_or_apply_blocked_before: currentLow,
      grant_or_apply_blocked_after: futureLow,
    },
    active_signals: {
      early_warning_flag: row.economicsEarlyWarningFlag,
      guardrail_low_quality_auto: row.economicsLowQuality && !currentOv,
    },
    why: `Preview: переход referral override к «${mode}».`,
    applied_rule: `preview_referral_override:${mode}`,
  };
}
