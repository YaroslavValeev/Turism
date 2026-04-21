import type { Env } from "@mywave/config";
import type { PrismaClient } from "@prisma/client";
import { writeAuditLog } from "../../lib/audit";
import type { ProgramAutoEconomicsComputed } from "./programAutoEconomicsCompute";
import { recomputeProgramEconomicsAuto, recomputeReferralEconomicsAuto } from "./economicsRecompute";
import { assertEconomicsDangerousOverrideAllowed } from "./economicsRbac";
import {
  PROGRAM_ECONOMICS_OVERRIDE_MODES,
  REFERRAL_ECONOMICS_OVERRIDE_MODES,
  getEffectiveProgramEconomics,
  isReferralEconomicsOverrideActive,
  programOverrideMultiplierBps,
  type ProgramEconomicsOverrideFields,
} from "./economicsOverride";

function parseIsoUntil(v: unknown): Date | null {
  if (v === undefined || v === null || v === "") return null;
  if (typeof v !== "string") return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

export type ProgramOverrideBody = {
  mode: string;
  reason: string;
  until?: string | null;
  indefinite?: boolean;
};

export type ReferralOverrideBody = {
  mode: string;
  reason: string;
  until?: string | null;
  indefinite?: boolean;
};

export async function applyProgramEconomicsOverride(
  db: PrismaClient,
  env: Env,
  params: {
    programId: string;
    body: ProgramOverrideBody;
    adminUserId: string;
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const mode = params.body.mode?.trim();
  if (!mode || !PROGRAM_ECONOMICS_OVERRIDE_MODES.includes(mode as (typeof PROGRAM_ECONOMICS_OVERRIDE_MODES)[number])) {
    return { ok: false, error: "invalid_mode" };
  }
  const reason = params.body.reason?.trim() ?? "";
  if (reason.length < 1) {
    return { ok: false, error: "reason_required" };
  }

  const indefinite = params.body.indefinite === true;
  let until: Date | null = parseIsoUntil(params.body.until);
  if (!indefinite) {
    if (!until) {
      return { ok: false, error: "until_required_or_use_indefinite" };
    }
    const now = Date.now();
    if (until.getTime() <= now + 60_000) {
      return { ok: false, error: "until_must_be_in_future" };
    }
  } else {
    until = null;
  }

  if (indefinite || mode === "force_suspend") {
    const gate = assertEconomicsDangerousOverrideAllowed(env, params.adminUserId);
    if (!gate.ok) return { ok: false, error: gate.error };
  }

  const existing = await db.program.findUnique({
    where: { id: params.programId },
    select: {
      economicsOverrideMode: true,
      economicsOverrideUntil: true,
      economicsOverrideReason: true,
      economicsRewardMultiplierBps: true,
      economicsRewardSuspended: true,
    },
  });
  if (!existing) {
    return { ok: false, error: "program_not_found" };
  }

  const mult = programOverrideMultiplierBps(mode, env);
  const suspended = mult === 0;

  await db.program.update({
    where: { id: params.programId },
    data: {
      economicsOverrideMode: mode,
      economicsOverrideReason: reason,
      economicsOverrideUntil: until,
      economicsOverrideUpdatedAt: new Date(),
      economicsRewardMultiplierBps: mult,
      economicsRewardSuspended: suspended,
    },
  });

  await writeAuditLog({
    entityType: "economics_manual_override",
    entityId: params.programId,
    changedField: "program_override_set",
    oldValue: JSON.stringify({
      mode: existing.economicsOverrideMode,
      until: existing.economicsOverrideUntil?.toISOString() ?? null,
      reason: existing.economicsOverrideReason,
      multiplier_bps: existing.economicsRewardMultiplierBps,
      suspended: existing.economicsRewardSuspended,
    }),
    newValue: JSON.stringify({
      mode,
      until: until?.toISOString() ?? null,
      indefinite,
      reason,
      multiplier_bps: mult,
      suspended,
    }),
    changedBy: params.adminUserId,
    reason: indefinite ? "manual_override_exceptional_indefinite" : "manual_override_set",
  });

  return { ok: true };
}

export async function clearProgramEconomicsOverride(
  db: PrismaClient,
  env: Env,
  params: { programId: string; adminUserId: string },
): Promise<
  | {
      ok: true;
      old_effective: ReturnType<typeof getEffectiveProgramEconomics>;
      new_effective: ReturnType<typeof getEffectiveProgramEconomics>;
      recomputed: ProgramAutoEconomicsComputed;
    }
  | { ok: false; error: string }
> {
  const existing = await db.program.findUnique({
    where: { id: params.programId },
    select: {
      economicsRewardMultiplierBps: true,
      economicsRewardSuspended: true,
      economicsOverrideMode: true,
      economicsOverrideUntil: true,
      economicsOverrideReason: true,
    },
  });
  if (!existing) {
    return { ok: false, error: "program_not_found" };
  }
  if (!existing.economicsOverrideMode) {
    return { ok: false, error: "no_active_override" };
  }

  const now = new Date();
  const oldEffectiveBefore = getEffectiveProgramEconomics(existing as ProgramEconomicsOverrideFields, env, now);

  await db.program.update({
    where: { id: params.programId },
    data: {
      economicsOverrideMode: null,
      economicsOverrideReason: null,
      economicsOverrideUntil: null,
      economicsOverrideUpdatedAt: new Date(),
    },
  });

  await writeAuditLog({
    entityType: "economics_manual_override",
    entityId: params.programId,
    changedField: "program_override_clear",
    oldValue: JSON.stringify({
      mode: existing.economicsOverrideMode,
      until: existing.economicsOverrideUntil?.toISOString() ?? null,
      reason: existing.economicsOverrideReason,
    }),
    newValue: null,
    changedBy: params.adminUserId,
    reason: "manual_override_cleared",
  });

  const rec = await recomputeProgramEconomicsAuto(db, env, params.programId, {
    auditReason: "manual_override_cleared_recomputed",
    changedBy: params.adminUserId,
    old_effective_before: oldEffectiveBefore,
  });
  if (!rec.ok) {
    return { ok: false, error: rec.error };
  }
  return {
    ok: true,
    old_effective: rec.old_effective,
    new_effective: rec.new_effective,
    recomputed: rec.recomputed,
  };
}

export async function applyReferralEconomicsOverride(
  db: PrismaClient,
  env: Env,
  params: {
    code: string;
    body: ReferralOverrideBody;
    adminUserId: string;
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const mode = params.body.mode?.trim();
  if (
    !mode ||
    !REFERRAL_ECONOMICS_OVERRIDE_MODES.includes(mode as (typeof REFERRAL_ECONOMICS_OVERRIDE_MODES)[number])
  ) {
    return { ok: false, error: "invalid_mode" };
  }
  const reason = params.body.reason?.trim() ?? "";
  if (reason.length < 1) {
    return { ok: false, error: "reason_required" };
  }

  const indefinite = params.body.indefinite === true;
  let until: Date | null = parseIsoUntil(params.body.until);
  if (!indefinite) {
    if (!until) {
      return { ok: false, error: "until_required_or_use_indefinite" };
    }
    const now = Date.now();
    if (until.getTime() <= now + 60_000) {
      return { ok: false, error: "until_must_be_in_future" };
    }
  } else {
    until = null;
  }

  if (indefinite || mode === "force_low_quality") {
    const gate = assertEconomicsDangerousOverrideAllowed(env, params.adminUserId);
    if (!gate.ok) return { ok: false, error: gate.error };
  }

  const existing = await db.referralCode.findUnique({
    where: { code: params.code },
    select: {
      economicsOverrideMode: true,
      economicsOverrideUntil: true,
      economicsOverrideReason: true,
      economicsLowQuality: true,
      economicsLowQualityReason: true,
    },
  });
  if (!existing) {
    return { ok: false, error: "referral_not_found" };
  }

  const low = mode === "force_low_quality";

  await db.referralCode.update({
    where: { code: params.code },
    data: {
      economicsOverrideMode: mode,
      economicsOverrideReason: reason,
      economicsOverrideUntil: until,
      economicsOverrideUpdatedAt: new Date(),
      economicsLowQuality: low,
      economicsLowQualityReason: low ? `manual_override:${reason}` : null,
      economicsLowQualityAt: low ? new Date() : null,
    },
  });

  await writeAuditLog({
    entityType: "economics_manual_override",
    entityId: params.code,
    changedField: "referral_override_set",
    oldValue: JSON.stringify({
      mode: existing.economicsOverrideMode,
      until: existing.economicsOverrideUntil?.toISOString() ?? null,
      reason: existing.economicsOverrideReason,
      low_quality: existing.economicsLowQuality,
    }),
    newValue: JSON.stringify({
      mode,
      until: until?.toISOString() ?? null,
      indefinite,
      reason,
      low_quality: low,
    }),
    changedBy: params.adminUserId,
    reason: indefinite ? "manual_override_exceptional_indefinite" : "manual_override_set",
  });

  return { ok: true };
}

export async function clearReferralEconomicsOverride(
  db: PrismaClient,
  env: Env,
  params: { code: string; adminUserId: string },
): Promise<
  | {
      ok: true;
      old_effective: { low_quality: boolean; override_active: boolean };
      new_effective: { low_quality: boolean; override_active: boolean };
    }
  | { ok: false; error: string }
> {
  const existing = await db.referralCode.findUnique({
    where: { code: params.code },
    select: {
      economicsOverrideMode: true,
      economicsOverrideUntil: true,
      economicsOverrideReason: true,
      economicsLowQuality: true,
    },
  });
  if (!existing) {
    return { ok: false, error: "referral_not_found" };
  }
  if (!existing.economicsOverrideMode) {
    return { ok: false, error: "no_active_override" };
  }

  const now = new Date();
  const ov = isReferralEconomicsOverrideActive(
    { economicsOverrideMode: existing.economicsOverrideMode, economicsOverrideUntil: existing.economicsOverrideUntil },
    now,
  );
  const oldEffectiveBefore = {
    low_quality: ov ? existing.economicsOverrideMode === "force_low_quality" : existing.economicsLowQuality,
    override_active: ov,
  };

  await db.referralCode.update({
    where: { code: params.code },
    data: {
      economicsOverrideMode: null,
      economicsOverrideReason: null,
      economicsOverrideUntil: null,
      economicsOverrideUpdatedAt: new Date(),
    },
  });

  await writeAuditLog({
    entityType: "economics_manual_override",
    entityId: params.code,
    changedField: "referral_override_clear",
    oldValue: JSON.stringify({
      mode: existing.economicsOverrideMode,
      until: existing.economicsOverrideUntil?.toISOString() ?? null,
      reason: existing.economicsOverrideReason,
    }),
    newValue: null,
    changedBy: params.adminUserId,
    reason: "manual_override_cleared",
  });

  const rec = await recomputeReferralEconomicsAuto(db, env, params.code, {
    auditReason: "manual_override_cleared_recomputed",
    changedBy: params.adminUserId,
    old_effective_before: oldEffectiveBefore,
  });
  if (!rec.ok) {
    return { ok: false, error: rec.error };
  }
  return {
    ok: true,
    old_effective: rec.old_effective,
    new_effective: rec.new_effective,
  };
}

export type ExpireOverridesResult = {
  triggers: Array<{ kind: string; detail: string }>;
};

/**
 * Снимает истёкшие TTL (until <= now). Без срока (null) не трогаем.
 * После снятия — немедленный пересчёт авто-economics (audit: manual_override_expired_recomputed).
 */
export async function expireEconomicsManualOverrides(
  db: PrismaClient,
  env: Env,
): Promise<ExpireOverridesResult> {
  const triggers: Array<{ kind: string; detail: string }> = [];
  const now = new Date();

  const expiredPrograms = await db.program.findMany({
    where: {
      economicsOverrideMode: { not: null },
      economicsOverrideUntil: { not: null, lte: now },
    },
    select: {
      id: true,
      economicsRewardMultiplierBps: true,
      economicsRewardSuspended: true,
      economicsOverrideMode: true,
      economicsOverrideUntil: true,
      economicsOverrideReason: true,
    },
  });

  for (const p of expiredPrograms) {
    const oldEffectiveBefore = getEffectiveProgramEconomics(p as ProgramEconomicsOverrideFields, env, now);

    await db.program.update({
      where: { id: p.id },
      data: {
        economicsOverrideMode: null,
        economicsOverrideReason: null,
        economicsOverrideUntil: null,
        economicsOverrideUpdatedAt: new Date(),
      },
    });

    await writeAuditLog({
      entityType: "economics_manual_override",
      entityId: p.id,
      changedField: "override_expired",
      oldValue: JSON.stringify({
        mode: p.economicsOverrideMode,
        until: p.economicsOverrideUntil!.toISOString(),
        reason: p.economicsOverrideReason,
      }),
      newValue: null,
      changedBy: "system",
      reason: "override_ttl_expired",
    });

    const rec = await recomputeProgramEconomicsAuto(db, env, p.id, {
      auditReason: "manual_override_expired_recomputed",
      changedBy: "system",
      old_effective_before: oldEffectiveBefore,
    });
    triggers.push({ kind: "program_override_expired", detail: p.id });
    if (!rec.ok) {
      triggers.push({ kind: "program_override_recompute_failed", detail: `${p.id}:${rec.error}` });
    }
  }

  const expiredRefs = await db.referralCode.findMany({
    where: {
      economicsOverrideMode: { not: null },
      economicsOverrideUntil: { not: null, lte: now },
    },
    select: {
      code: true,
      economicsOverrideMode: true,
      economicsOverrideUntil: true,
      economicsOverrideReason: true,
      economicsLowQuality: true,
    },
  });

  for (const r of expiredRefs) {
    const ov = isReferralEconomicsOverrideActive(
      { economicsOverrideMode: r.economicsOverrideMode, economicsOverrideUntil: r.economicsOverrideUntil },
      now,
    );
    const oldEffectiveBefore = {
      low_quality: ov ? r.economicsOverrideMode === "force_low_quality" : r.economicsLowQuality,
      override_active: ov,
    };

    await db.referralCode.update({
      where: { code: r.code },
      data: {
        economicsOverrideMode: null,
        economicsOverrideReason: null,
        economicsOverrideUntil: null,
        economicsOverrideUpdatedAt: new Date(),
      },
    });

    await writeAuditLog({
      entityType: "economics_manual_override",
      entityId: r.code,
      changedField: "override_expired",
      oldValue: JSON.stringify({
        mode: r.economicsOverrideMode,
        until: r.economicsOverrideUntil!.toISOString(),
        reason: r.economicsOverrideReason,
      }),
      newValue: null,
      changedBy: "system",
      reason: "override_ttl_expired",
    });

    const rec = await recomputeReferralEconomicsAuto(db, env, r.code, {
      auditReason: "manual_override_expired_recomputed",
      changedBy: "system",
      old_effective_before: oldEffectiveBefore,
    });
    triggers.push({ kind: "referral_override_expired", detail: r.code });
    if (!rec.ok) {
      triggers.push({ kind: "referral_override_recompute_failed", detail: `${r.code}:${rec.error}` });
    }
  }

  return { triggers };
}
