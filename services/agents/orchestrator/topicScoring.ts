import type { SignalStrength } from "../analytics/signals.js";
import type { TopicOutcomeRecord } from "../memory/topicOutcomes.js";
import { getOutcomeByKey, topicKeyOf } from "../memory/topicOutcomes.js";

const WEIGHT: Record<SignalStrength, number> = { STRONG: 1, WEAK: 0.5, NONE: 0.1 };

/**
 * successRate * w(signal) * recency: свежие оценки важнее (half-life ~30d).
 */
export function computeTopicActionScore(
  topic: string,
  signal: SignalStrength,
  outcomes: TopicOutcomeRecord[] | null,
  nowMs = Date.now()
): number {
  const o = getOutcomeByKey(outcomes, topic);
  const sr = o && o.runs > 0 ? o.successRate : 0.4;
  const t = o?.trust != null && o.trust > 0 ? o.trust : 1;
  const w = WEIGHT[signal] ?? 0.1;
  let recency = 0.5;
  if (o?.lastEvaluatedAt) {
    const days = (nowMs - new Date(o.lastEvaluatedAt).getTime()) / 86_400_000;
    recency = Math.exp(-Math.max(0, days) / 30);
  }
  return sr * w * recency * t;
}

/**
 * Сортировка action по убыванию score (и стабилизация порядка по topicKey).
 */
export function sortPlanActionsByTopicScore<T extends { topic: string; source: string }>(
  actions: T[],
  getSignal: (a: T) => SignalStrength,
  outcomes: TopicOutcomeRecord[] | null
): T[] {
  const withIx = actions.map((a, i) => ({ a, i, s: computeTopicActionScore(a.topic, getSignal(a), outcomes) }));
  withIx.sort((x, y) => {
    if (y.s !== x.s) return y.s - x.s;
    return x.i - y.i;
  });
  return withIx.map((x) => x.a);
}

export function isLowTrustBlock(topic: string, outcomes: TopicOutcomeRecord[] | null, threshold = 0.2): boolean {
  const o = getOutcomeByKey(outcomes, topic);
  if (!o) return false;
  return o.trust < threshold;
}

export function isRepeatTooSoon(
  topic: string,
  outcomes: TopicOutcomeRecord[] | null,
  successfulKeySet: Set<string>,
  windowDays: number,
  nowMs = Date.now()
): boolean {
  const k = topicKeyOf(topic);
  if (successfulKeySet.has(k)) return false;
  const o = getOutcomeByKey(outcomes, topic);
  if (!o?.lastProposedAt) return false;
  const days = (nowMs - new Date(o.lastProposedAt).getTime()) / 86_400_000;
  if (days < 0) return true;
  return days < windowDays;
}
