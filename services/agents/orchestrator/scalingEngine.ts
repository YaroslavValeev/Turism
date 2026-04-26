import type { MarketingAction, MarketingActionType, MarketingPlan } from "../marketing/validator.js";
import type { ActionContext } from "./scalingRules.js";
import type { AgentMemory } from "../memory/store.js";
import { topicKeyOf } from "../memory/topicOutcomes.js";
import { findSignalBySource } from "../analytics/signals.js";
import type { SignalRow } from "../analytics/signals.js";

const ALL_TYPES: MarketingActionType[] = [
  "create_blog",
  "create_collection",
  "strengthen_explore",
];

function actionKey(a: MarketingAction): string {
  return `${a.type}|${topicKeyOf(a.topic)}|${a.source.trim()}`;
}

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .split(/[^a-zа-яё0-9]+/u)
    .map((t) => t.trim())
    .filter((t) => t.length > 2);
}

/**
 * Suppression: тема **похожа** на провал (токенное пересечение/вложение).
 */
export function isTopicSimilarToFailed(
  topic: string,
  failedAndSimilar: string[]
): boolean {
  const k = topicKeyOf(topic);
  const tTokens = new Set(tokenize(topic));
  for (const f of failedAndSimilar) {
    if (!f?.trim()) continue;
    if (topicKeyOf(f) === k) return true;
    if (k.includes(topicKeyOf(f)) && topicKeyOf(f).length >= 4) return true;
    if (topicKeyOf(f).length >= 4 && topicKeyOf(f).includes(k) && k.length >= 3) return true;
    const ft = tokenize(f);
    if (ft.length === 0) continue;
    const fs = new Set(ft);
    let n = 0;
    for (const x of tTokens) {
      if (fs.has(x)) n += 1;
    }
    const j = n / (tTokens.size + fs.size - n || 1);
    if (j >= 0.45) return true;
  }
  return false;
}

/**
 * 1 → N: для источника из successful_topics — добираем отсутствующие форматы
 * (только в виде *рекомендаций* в plan, без автодеплоя).
 */
export function amplifySuccessTopics(
  plan: MarketingPlan,
  actionContext: ActionContext[],
  memory: AgentMemory,
  signals: SignalRow[]
): { plan: MarketingPlan; actionContext: ActionContext[] } {
  const success = new Set(memory.successful_topics.map((t) => topicKeyOf(t)));
  if (success.size === 0) {
    return { plan, actionContext: [...actionContext] };
  }

  const have = new Set<string>();
  for (const a of plan.actions) have.add(actionKey(a));

  const newActions: MarketingAction[] = [...plan.actions];
  const newCtx: ActionContext[] = [...actionContext];

  for (const a of plan.actions) {
    if (!success.has(topicKeyOf(a.topic))) continue;
    const row = findSignalBySource(signals, a.source);
    const signal = row?.signal ?? "NONE";
    for (const type of ALL_TYPES) {
      if (a.type === type) continue;
      const proposal: MarketingAction = {
        type,
        topic: a.topic,
        source: a.source,
      };
      if (have.has(actionKey(proposal))) continue;
      have.add(actionKey(proposal));
      newActions.push(proposal);
      newCtx.push({ topic: a.topic, source: a.source, signal });
    }
  }

  return { plan: { ...plan, actions: newActions }, actionContext: newCtx };
}
