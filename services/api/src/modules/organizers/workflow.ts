/**
 * Organizer verification ladder and merge helpers (docs/VERIFICATION_LADDER.md).
 * Pure functions: routes and the Telegram operator menu share the same rules.
 */
import { ORGANIZER_VERIFICATION_STATUS_LABELS } from "@mywave/shared-types";

export const VERIFICATION_LADDER = ["listed", "checked", "verified", "trusted_by_platform"] as const;
export const AUTOPUBLISH_ELIGIBLE_STATUSES: readonly string[] = ["verified", "trusted_by_platform"];
export const INGESTION_STUB_EMAIL_SUFFIX = "@mywave.local";

function ladderIndex(status: string): number {
  return (VERIFICATION_LADDER as readonly string[]).indexOf(status);
}

/**
 * Returns a Russian error message when the transition is not allowed, otherwise null.
 * Raising trust goes one step at a time and needs at least one piece of evidence;
 * lowering, pausing and rejecting are always allowed.
 */
export function checkVerificationTransition(from: string, to: string, hasEvidence: boolean): string | null {
  if (from === to) return "Статус уже установлен.";
  const target = ladderIndex(to);
  if (target <= 0) return null;
  const current = Math.max(ladderIndex(from), 0);
  if (target > current + 1) {
    const next = VERIFICATION_LADDER[current + 1];
    return `Повышать можно только на одну ступень: сначала «${ORGANIZER_VERIFICATION_STATUS_LABELS[next]}».`;
  }
  if (target > current && !hasEvidence) {
    return "Для повышения статуса добавьте доказательство проверки (ссылка или заметка).";
  }
  return null;
}

export function isIngestionStubOrganizer(contactEmail: string | null | undefined): boolean {
  return (contactEmail ?? "").toLowerCase().endsWith(INGESTION_STUB_EMAIL_SUFFIX);
}

export function normalizeOrganizerName(name: string): string {
  return name
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/["«»'`]/g, "")
    .replace(/(?<![\p{L}\p{N}])(ооо|ип|llc|ltd|school|школа)(?![\p{L}\p{N}])/gu, " ")
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

/** Candidates that probably describe the same organizer: equal normalized names or one contains the other. */
export function findSimilarOrganizers<T extends { id: string; displayName: string }>(
  target: { id: string; displayName: string },
  all: readonly T[],
): T[] {
  const key = normalizeOrganizerName(target.displayName);
  if (key.length < 3) return [];
  return all.filter((other) => {
    if (other.id === target.id) return false;
    const otherKey = normalizeOrganizerName(other.displayName);
    if (otherKey.length < 3) return false;
    return otherKey === key || otherKey.includes(key) || key.includes(otherKey);
  });
}

export type MergeBlockers = Record<string, number>;

/** Money, contracts and unique-keyed records are never moved automatically. */
export function describeMergeBlockers(counts: MergeBlockers): string | null {
  const labels: Record<string, string> = {
    bookings: "бронирования",
    payments: "платежи",
    refunds: "возвраты",
    commissions: "комиссии",
    contracts: "договоры",
    billingStatements: "отчёты биллинга",
    billingProfile: "реквизиты",
    telegramAccounts: "Telegram-аккаунты",
    outreachCampaigns: "outreach-кампании",
  };
  const present = Object.entries(counts)
    .filter(([, count]) => count > 0)
    .map(([key, count]) => `${labels[key] ?? key}: ${count}`);
  return present.length ? `У организатора есть ${present.join(", ")} — объединение только вручную.` : null;
}
