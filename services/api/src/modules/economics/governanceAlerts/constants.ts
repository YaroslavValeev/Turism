/** Типы алертов governance v1 (строковые ключи для API и fingerprint). */
export const GOV_ALERT = {
  COMMISSION_SUM_DRIFT: "commission_sum_drift",
  REWARD_GRANT_BLOCKED_BURST: "reward_grant_blocked_burst",
  SOURCE_RUNS_FAILED_BURST: "source_runs_failed_burst",
  /** Активные источники с ошибками и без успешного сбора ≥7d — см. runCycle */
  INGESTION_SOURCES_STUCK: "ingestion_sources_stuck",
  /** Черновики conversion: owner Telegram notify не доставлен (есть lastError) */
  CONVERSION_OWNER_NOTIFY_FAILED: "conversion_owner_notify_failed",
  EXPIRY_RATIO_HIGH: "expiry_ratio_high",
  PROGRAM_MULTIPLIER_CHURN: "program_multiplier_churn",
  MANY_ACTIVE_OVERRIDES: "many_active_overrides",
  DISCOUNT_SURGE_LOW_COMPLETION: "discount_surge_low_completion",
  RECOVERY_ORGANIZER_CANCELLED_HIGH: "recovery_organizer_cancelled_high",
} as const;

export const ENTITY_PLATFORM = "platform";
