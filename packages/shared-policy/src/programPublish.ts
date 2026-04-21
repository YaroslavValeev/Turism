import { isProgramPublishStatus, type ProgramPublishStatus } from "@mywave/shared-types";

/**
 * Допустимые переходы publishStatus программы (Stage 4 policy).
 * Значения — канон БД (см. ADR-006).
 */
export type ProgramPublishTransitionContext = {
  /**
   * Ingestion: после отдельного `canPublish` допускается прямой draft→published
   * в обход модерационной цепочки. Вызывающий обязан проверить gate.
   */
  ingestionAutoPublish?: boolean;
};

const ALLOWED: Record<ProgramPublishStatus, ProgramPublishStatus[]> = {
  draft: ["internal_review", "archived"],
  internal_review: ["needs_fix", "approved", "draft"],
  needs_fix: ["internal_review", "archived"],
  approved: ["published", "internal_review", "needs_fix"],
  published: ["paused", "archived"],
  paused: ["published", "archived"],
  archived: [],
};

export function isValidProgramPublishTransition(
  from: string,
  to: string,
  context?: ProgramPublishTransitionContext,
): boolean {
  if (!isProgramPublishStatus(from) || !isProgramPublishStatus(to)) return false;
  if (context?.ingestionAutoPublish && from === "draft" && to === "published") {
    return true;
  }
  return ALLOWED[from as ProgramPublishStatus].includes(to as ProgramPublishStatus);
}

export function getNextProgramPublishStatuses(current: string): ProgramPublishStatus[] {
  if (!isProgramPublishStatus(current)) return [];
  return [...ALLOWED[current as ProgramPublishStatus]];
}
