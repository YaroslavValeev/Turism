/**
 * Глобальный режим платформы: launch (рост без списаний) vs monetization.
 * См. loadEnv: PLATFORM_MODE.
 */
export type PlatformMode = "launch" | "monetization";

export function parsePlatformMode(raw: string | undefined): PlatformMode {
  const v = (raw ?? "launch").toLowerCase().trim();
  return v === "monetization" ? "monetization" : "launch";
}

export function isLaunchMode(mode: PlatformMode): boolean {
  return mode === "launch";
}
