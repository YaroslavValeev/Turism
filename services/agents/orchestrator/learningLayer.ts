import type { MarketingAction, MarketingPlan } from "../marketing/validator.js";
import type { SignalRow, SignalStrength } from "../analytics/signals.js";
import { findSignalBySource } from "../analytics/signals.js";
import type { ActionContext } from "./scalingRules.js";
import type { AgentMemory } from "../memory/store.js";
import type { TopicOutcomeRecord } from "../memory/topicOutcomes.js";
import { loadTopicOutcomes, topicKeyOf } from "../memory/topicOutcomes.js";
import type { LearningLimits } from "../shared/learningLimits.js";
import {
  computeTopicActionScore,
  isLowTrustBlock,
  isRepeatTooSoon,
  sortPlanActionsByTopicScore,
} from "./topicScoring.js";
import { isTopicSimilarToFailed, amplifySuccessTopics } from "./scalingEngine.js";

function alignContext(
  actions: MarketingAction[],
  signals: SignalRow[],
  prev: ActionContext[]
): ActionContext[] {
  return actions.map((a) => {
    const c = prev.find(
      (x) => topicKeyOf(x.topic) === topicKeyOf(a.topic) && x.source.trim() === a.source.trim()
    );
    if (c) return c;
    const row = findSignalBySource(signals, a.source);
    return { topic: a.topic, source: a.source, signal: row?.signal ?? "STRONG" };
  });
}

function signalFor(
  a: MarketingAction,
  planActions: MarketingAction[],
  actionContext: ActionContext[],
  signals: SignalRow[]
): SignalStrength {
  const idx = planActions.findIndex(
    (x) => x.type === a.type && topicKeyOf(x.topic) === topicKeyOf(a.topic) && x.source === a.source
  );
  if (idx >= 0 && actionContext[idx]) return actionContext[idx]!.signal;
  return findSignalBySource(signals, a.source)?.signal ?? "STRONG";
}

export async function applyLearningLayerWithOutcomes(args: {
  plan: MarketingPlan;
  actionContext: ActionContext[];
  memory: AgentMemory;
  limits: LearningLimits;
  signals: SignalRow[];
  outcomes?: TopicOutcomeRecord[];
}): Promise<{ plan: MarketingPlan; actionContext: ActionContext[]; outcomes: TopicOutcomeRecord[] }> {
  const outcomes = args.outcomes ?? (await loadTopicOutcomes());
  const { memory, limits, signals } = args;
  let plan = args.plan;
  let actionContext = alignContext(plan.actions, signals, args.actionContext);
  const successfulKeySet = new Set(memory.successful_topics.map((t) => topicKeyOf(t)));

  const f1: MarketingAction[] = [];
  const c1: ActionContext[] = [];
  for (let i = 0; i < plan.actions.length; i += 1) {
    const a = plan.actions[i]!;
    const c = actionContext[i]!;
    if (isTopicSimilarToFailed(a.topic, memory.failed_topics)) continue;
    f1.push(a);
    c1.push(c);
  }
  plan = { ...plan, actions: f1 };
  actionContext = c1;

  const f2: MarketingAction[] = [];
  const c2: ActionContext[] = [];
  for (let i = 0; i < plan.actions.length; i += 1) {
    const a = plan.actions[i]!;
    const c = actionContext[i]!;
    if (isLowTrustBlock(a.topic, outcomes, 0.2)) continue;
    if (isRepeatTooSoon(a.topic, outcomes, successfulKeySet, limits.maxRepeatTopicWindowDays)) continue;
    f2.push(a);
    c2.push(c);
  }
  plan = { ...plan, actions: f2 };
  actionContext = c2;

  const amp = amplifySuccessTopics(plan, actionContext, memory, signals);
  plan = amp.plan;
  actionContext = alignContext(plan.actions, signals, amp.actionContext);

  const ordered = sortPlanActionsByTopicScore(
    plan.actions,
    (a) => signalFor(a, plan.actions, actionContext, signals),
    outcomes
  );
  plan = { ...plan, actions: ordered };
  actionContext = alignContext(ordered, signals, actionContext);

  const have = new Set(outcomes.map((o) => o.topicKey));
  const oldA: MarketingAction[] = [];
  const oldC: ActionContext[] = [];
  const newA: MarketingAction[] = [];
  const newC: ActionContext[] = [];
  for (let i = 0; i < plan.actions.length; i += 1) {
    const a = plan.actions[i]!;
    const c = actionContext[i]!;
    if (have.has(topicKeyOf(a.topic))) {
      oldA.push(a);
      oldC.push(c);
    } else {
      newA.push(a);
      newC.push(c);
    }
  }
  if (newA.length > limits.maxNewTopicsPerDay) {
    const scored = newA.map((a, i) => {
      const c = newC[i]!;
      return { a, c, s: computeTopicActionScore(a.topic, c.signal, outcomes) };
    });
    scored.sort((x, y) => y.s - x.s);
    const keep = scored.slice(0, limits.maxNewTopicsPerDay);
    const mergedA = [...oldA, ...keep.map((k) => k.a)];
    const mergedC = [...oldC, ...keep.map((k) => k.c)];
    plan = { ...plan, actions: mergedA };
    actionContext = alignContext(mergedA, signals, mergedC);
  }

  return { plan, actionContext, outcomes };
}
