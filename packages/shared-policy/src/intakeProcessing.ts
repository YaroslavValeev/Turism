export const INTAKE_PROCESSING_STATUSES = ["new", "in_review", "draft_created", "dismissed"] as const;

export type IntakeProcessingStatus = (typeof INTAKE_PROCESSING_STATUSES)[number];

export function isIntakeProcessingStatus(s: string): s is IntakeProcessingStatus {
  return (INTAKE_PROCESSING_STATUSES as readonly string[]).includes(s);
}

const ALLOWED: Record<IntakeProcessingStatus, IntakeProcessingStatus[]> = {
  new: ["in_review", "dismissed"],
  in_review: ["dismissed", "new"],
  draft_created: ["in_review", "dismissed"],
  dismissed: ["new"],
};

/** Статусы, которые оператор может выставить через PATCH (draft_created только через draft-program). */
export const INTAKE_MANUAL_PATCH_STATUSES: readonly IntakeProcessingStatus[] = ["new", "in_review", "dismissed"];

export function isValidIntakeProcessingTransition(from: string, to: string): boolean {
  if (!isIntakeProcessingStatus(from) || !isIntakeProcessingStatus(to)) return false;
  return ALLOWED[from].includes(to as IntakeProcessingStatus);
}

export function getNextIntakeProcessingStatuses(current: string): IntakeProcessingStatus[] {
  if (!isIntakeProcessingStatus(current)) return [];
  return [...ALLOWED[current]];
}
