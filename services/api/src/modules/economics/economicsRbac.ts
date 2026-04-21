import type { Env } from "@mywave/config";

/**
 * Опасные операции economics override: indefinite TTL, force_suspend, referral force_low_quality.
 * Если `ECONOMICS_PRIVILEGED_ADMIN_SUBS` задан и непустой — только перечисленные JWT `sub`.
 */
export function assertEconomicsDangerousOverrideAllowed(
  env: Env,
  adminUserId: string,
): { ok: true } | { ok: false; error: "privileged_admin_required" } {
  const raw = env.ECONOMICS_PRIVILEGED_ADMIN_SUBS?.trim();
  if (!raw) return { ok: true };
  const allowed = new Set(
    raw
      .split(",")
      .map((s: string) => s.trim())
      .filter(Boolean),
  );
  if (allowed.size === 0) return { ok: true };
  if (!allowed.has(adminUserId)) {
    return { ok: false, error: "privileged_admin_required" };
  }
  return { ok: true };
}
