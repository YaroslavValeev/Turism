export type CriticalAction =
  | "code_write"
  | "git_commit_or_push"
  | "deploy_or_release"
  | "file_write_outside_sandbox"
  | "external_api_action"
  | "telegram_production_send"
  | "pii_operation"
  | "financial_or_legal_action"
  | "destructive_operation";

export interface ApprovalRule {
  action: CriticalAction;
  requiresApproval: boolean;
  escalationLevel: "none" | "gm" | "owner";
}

export const DEFAULT_APPROVAL_RULES: ApprovalRule[] = [
  { action: "code_write", requiresApproval: true, escalationLevel: "gm" },
  { action: "git_commit_or_push", requiresApproval: true, escalationLevel: "gm" },
  { action: "deploy_or_release", requiresApproval: true, escalationLevel: "owner" },
  { action: "file_write_outside_sandbox", requiresApproval: true, escalationLevel: "gm" },
  { action: "external_api_action", requiresApproval: true, escalationLevel: "gm" },
  { action: "telegram_production_send", requiresApproval: true, escalationLevel: "owner" },
  { action: "pii_operation", requiresApproval: true, escalationLevel: "owner" },
  { action: "financial_or_legal_action", requiresApproval: true, escalationLevel: "owner" },
  { action: "destructive_operation", requiresApproval: true, escalationLevel: "owner" }
];
