import type { AgentMemory } from "../memory/store.js";
import type { MarketingAction, MarketingPlan } from "../marketing/validator.js";
import type { SignalRow, SignalStrength } from "../analytics/signals.js";
import { findSignalBySource } from "../analytics/signals.js";

export type ActionContext = {
  topic: string;
  source: string;
  signal: SignalStrength;
};

/**
 * Rule 2: тема в failed → не используем.
 * Rule 3: тема в successful → разрешаем масштабировать (не блокируем).
 * tested / last_used: дедуп для остальных.
 */
export function isTopicBlockedByMemory(topic: string, memory: AgentMemory): boolean {
  const k = topic.trim().toLowerCase();
  if (!k) return true;
  if (memory.failed_topics.some((t) => t.trim().toLowerCase() === k)) return true;
  if (memory.successful_topics.some((t) => t.trim().toLowerCase() === k)) return false;
  if (memory.tested_topics.some((t) => t.trim().toLowerCase() === k)) return true;
  if (memory.last_used_topics.some((t) => t.trim().toLowerCase() === k)) return true;
  return false;
}

/**
 * Rule 1: сигнал ниже STRONG → не масштабируем (не оставляем в плане).
 */
export function filterStrongActionsOnly(
  plan: MarketingPlan,
  signals: SignalRow[]
): { plan: MarketingPlan; actionContext: ActionContext[] } {
  const actionContext: ActionContext[] = [];
  const nextActions: MarketingAction[] = [];
  for (const a of plan.actions) {
    const row = findSignalBySource(signals, a.source);
    const signal = row?.signal ?? "NONE";
    if (signal === "STRONG") {
      nextActions.push(a);
      actionContext.push({ topic: a.topic, source: a.source, signal });
    }
  }
  return { plan: { ...plan, actions: nextActions }, actionContext };
}
