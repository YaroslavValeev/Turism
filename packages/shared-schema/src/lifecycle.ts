export const TASK_LIFECYCLE = [
  "new",
  "triaged",
  "planned",
  "running",
  "blocked",
  "completed",
  "closed"
] as const;

export const RUN_LIFECYCLE = [
  "queued",
  "running",
  "waiting_approval",
  "succeeded",
  "failed",
  "cancelled"
] as const;

export const APPROVAL_LIFECYCLE = [
  "required",
  "requested",
  "approved",
  "rejected",
  "expired"
] as const;

export type TaskLifecycleStatus = (typeof TASK_LIFECYCLE)[number];
export type RunLifecycleStatus = (typeof RUN_LIFECYCLE)[number];
export type ApprovalLifecycleStatus = (typeof APPROVAL_LIFECYCLE)[number];
