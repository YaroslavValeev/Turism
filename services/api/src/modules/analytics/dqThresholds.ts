import type { Env } from "@mywave/config";

export type DqThresholds = {
  eventBaseline: number;
  ingestionErrorsWarning: number;
  ingestionErrorsCritical: number;
  duplicateWarning: number;
  maxPipelineLagSec: number;
  lateEventLagSec: number;
};

export function dqThresholdsFromEnv(env: Env): DqThresholds {
  return {
    eventBaseline: env.ANALYTICS_DQ_EVENT_BASELINE,
    ingestionErrorsWarning: env.ANALYTICS_DQ_INGESTION_ERRORS_WARNING,
    ingestionErrorsCritical: env.ANALYTICS_DQ_INGESTION_ERRORS_CRITICAL,
    duplicateWarning: env.ANALYTICS_DQ_DUPLICATE_WARNING,
    maxPipelineLagSec: env.ANALYTICS_DQ_MAX_PIPELINE_LAG_SEC,
    lateEventLagSec: env.ANALYTICS_DQ_LATE_EVENT_LAG_SEC,
  };
}
