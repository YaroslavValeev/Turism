/** Статусы черновика conversion funnel (owner governance). */
export const CONVERSION_DRAFT_STATUS = {
  DRAFT: "draft",
  AWAITING_OWNER: "awaiting_owner",
  APPROVED: "approved",
  SENT: "sent",
  REJECTED: "rejected",
  DEFERRED: "deferred",
  /** Текст правился через admin API; кнопки Send/Reject/Defer снова валидны. */
  EDITED: "edited",
} as const;

export type ConversionDraftStatus = (typeof CONVERSION_DRAFT_STATUS)[keyof typeof CONVERSION_DRAFT_STATUS];

export function draftDedupeKey(programId: string, stage: number): string {
  return `conversion_draft_trigger:${programId}:stage:${stage}`;
}

export function isOwnerGovernanceStage(stage: number): boolean {
  return stage === 3 || stage === 4 || stage === 5;
}
