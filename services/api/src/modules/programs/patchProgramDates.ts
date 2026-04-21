import { inclusiveDurationDaysUTC } from "@mywave/shared-types";

/** Сообщение для 400, если клиент пытается задать только durationDays без дат. */
export const DURATION_DAYS_READ_ONLY_MESSAGE =
  "durationDays cannot be updated directly; provide startDate/endDate";

export type DurationPatchPolicy =
  | { kind: "ok" }
  | { kind: "reject_only_duration" }
  | { kind: "ignore_client_duration" };

/**
 * Политика PATCH: durationDays с клиента не задаётся без дат;
 * при наличии дат значение durationDays игнорируется (пересчёт на сервере).
 */
export function evaluateDurationDaysInPatchBody(body: Record<string, unknown>): DurationPatchPolicy {
  if (body.durationDays === undefined) return { kind: "ok" };
  const hasDates = body.startDate !== undefined || body.endDate !== undefined;
  if (!hasDates) return { kind: "reject_only_duration" };
  return { kind: "ignore_client_duration" };
}

export function mergeDatesAndComputeDurationDays(
  existing: { startDate: Date; endDate: Date },
  patch: { startDate?: Date; endDate?: Date },
): { durationDays: number } | { error: string } {
  const start = patch.startDate ?? existing.startDate;
  const end = patch.endDate ?? existing.endDate;
  try {
    return { durationDays: inclusiveDurationDaysUTC(start, end) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "invalid date range" };
  }
}
