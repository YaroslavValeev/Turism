export const SOURCE_TYPES = ["instagram", "telegram", "vk", "rss", "site", "other"] as const;
export const SOURCE_RUN_STATUSES = ["running", "success", "partial", "failed"] as const;
export const SOURCE_RUN_TYPES = ["collect", "normalize", "dedup", "publish"] as const;
export const EVENT_CANDIDATE_STATUSES = [
  "new",
  "needs_review",
  "approved",
  "rejected",
  "merged",
  "published",
  "archived",
] as const;

export type SourceType = (typeof SOURCE_TYPES)[number];
export type SourceRunStatus = (typeof SOURCE_RUN_STATUSES)[number];
export type SourceRunType = (typeof SOURCE_RUN_TYPES)[number];
export type EventCandidateStatus = (typeof EVENT_CANDIDATE_STATUSES)[number];

export function isSourceType(value: string | undefined | null): value is SourceType {
  return !!value && SOURCE_TYPES.includes(value as SourceType);
}

export function isEventCandidateStatus(value: string | undefined | null): value is EventCandidateStatus {
  return !!value && EVENT_CANDIDATE_STATUSES.includes(value as EventCandidateStatus);
}

export function isSourceRunType(value: string | undefined | null): value is SourceRunType {
  return !!value && SOURCE_RUN_TYPES.includes(value as SourceRunType);
}

export const SOURCE_PRIORITY_RANK: Record<SourceType, number> = {
  rss: 1,
  site: 1,
  vk: 2,
  telegram: 2,
  instagram: 3,
  other: 3,
};

