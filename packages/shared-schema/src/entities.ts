export type EntityId = string;
export type ISODateTime = string;

export type LifecycleStatus =
  | "draft"
  | "active"
  | "paused"
  | "archived"
  | "completed"
  | "failed";

export interface Project {
  id: EntityId;
  slug: string;
  name: string;
  status: "draft" | "active" | "paused" | "archived";
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface Task {
  id: EntityId;
  projectId: EntityId;
  title: string;
  type: string;
  priority: "low" | "medium" | "high" | "critical";
  status:
    | "new"
    | "triaged"
    | "planned"
    | "running"
    | "blocked"
    | "completed"
    | "closed";
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface Run {
  id: EntityId;
  taskId: EntityId;
  orchestrator: "molt";
  status: "queued" | "running" | "waiting_approval" | "succeeded" | "failed" | "cancelled";
  startedAt: ISODateTime | null;
  finishedAt: ISODateTime | null;
}

export interface Decision {
  id: EntityId;
  taskId: EntityId;
  runId: EntityId;
  decisionType: string;
  payload: Record<string, unknown>;
  riskLevel: "low" | "medium" | "high" | "critical";
  createdAt: ISODateTime;
}

export interface Approval {
  id: EntityId;
  taskId: EntityId;
  decisionId: EntityId;
  requiredByPolicy: boolean;
  status: "required" | "requested" | "approved" | "rejected" | "expired";
  requestedAt: ISODateTime;
  resolvedAt: ISODateTime | null;
}

export interface Artifact {
  id: EntityId;
  projectId: EntityId;
  taskId: EntityId;
  kind: string;
  uri: string;
  checksum: string;
  createdAt: ISODateTime;
}

export interface MemoryEntry {
  id: EntityId;
  projectId: EntityId;
  scope: "project" | "task" | "global";
  key: string;
  value: string;
  source: string;
  createdAt: ISODateTime;
}

export interface Channel {
  id: EntityId;
  channelType: "telegram" | "cursor" | "web" | "desktop" | "api";
  purpose: string;
  status: "configured" | "active" | "paused" | "retired";
  configRef: string;
}

export interface Agent {
  id: EntityId;
  layer: "product" | "governance" | "runtime";
  capabilities: string[];
  status: "registered" | "active" | "throttled" | "disabled";
  owner: string;
}

export interface PolicyRule {
  id: EntityId;
  name: string;
  version: string;
  scope: string;
  condition: string;
  action: string;
  severity: "low" | "medium" | "high" | "critical";
  enabled: boolean;
}

export interface ExecutionEvent {
  id: EntityId;
  runId: EntityId;
  eventType: string;
  actor: string;
  channelId: EntityId | null;
  policyRuleId: EntityId | null;
  timestamp: ISODateTime;
  payload: Record<string, unknown>;
}
