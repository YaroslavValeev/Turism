import type { Env } from "@mywave/config";

/**
 * Разрешён ли автоматический показ/отправка этапа с учётом rollout-флагов.
 * Этап 0 (onboarding при публикации) всегда разрешён, если воронка включена на уровне процесса.
 */
export function isConversionStageAutomationAllowed(env: Env, stage: number): boolean {
  if (stage === 0) return true;
  if (stage === -1) return env.CONVERSION_ENABLE_FOLLOWUP;
  if (stage < 0) return false;
  if (stage > env.CONVERSION_ALLOWED_MAX_STAGE) return false;
  if (stage === 4 && !env.CONVERSION_ENABLE_STAGE4) return false;
  if (stage === 5 && !env.CONVERSION_ENABLE_STAGE5) return false;
  return true;
}
