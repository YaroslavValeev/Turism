import { safeError, safeLog, toSafeErrorMessage } from "../../lib/safeLogger";

export interface CampApiRuntimeStatus {
  status: "ok" | "degraded";
  auth_failures_total: number;
  last_auth_failure_at: string | null;
  feed_success_total: number;
  feed_error_total: number;
  last_successful_feed_generation_at: string | null;
  last_feed_error_at: string | null;
  last_feed_error: string | null;
  last_item_count: number | null;
  last_next_offset: number | null;
}

const runtimeStatus: CampApiRuntimeStatus = {
  status: "ok",
  auth_failures_total: 0,
  last_auth_failure_at: null,
  feed_success_total: 0,
  feed_error_total: 0,
  last_successful_feed_generation_at: null,
  last_feed_error_at: null,
  last_feed_error: null,
  last_item_count: null,
  last_next_offset: null,
};

function nowIso(): string {
  return new Date().toISOString();
}

export function recordCampApiAuthFailure(path: string): void {
  runtimeStatus.auth_failures_total += 1;
  runtimeStatus.last_auth_failure_at = nowIso();
  safeLog("[camp-api] auth failure", { path });
}

export function recordCampApiFeedSuccess(itemCount: number, nextOffset: number | null): void {
  runtimeStatus.status = "ok";
  runtimeStatus.feed_success_total += 1;
  runtimeStatus.last_successful_feed_generation_at = nowIso();
  runtimeStatus.last_feed_error = null;
  runtimeStatus.last_item_count = itemCount;
  runtimeStatus.last_next_offset = nextOffset;
}

export function recordCampApiFeedError(error: unknown): void {
  runtimeStatus.status = "degraded";
  runtimeStatus.feed_error_total += 1;
  runtimeStatus.last_feed_error_at = nowIso();
  runtimeStatus.last_feed_error = toSafeErrorMessage(error);
  safeError("[camp-api] feed generation failed", error);
}

export function getCampApiRuntimeStatus(): CampApiRuntimeStatus {
  return { ...runtimeStatus };
}
