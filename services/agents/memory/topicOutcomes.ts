import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { SignalStrength } from "../analytics/signals.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PATH = path.join(__dirname, "topic_outcomes.json");

/**
 * Статистическое слежение: decision → исход → веса на будущее.
 */
export type TopicOutcomeRecord = {
  topicKey: string;
  topic: string;
  runs: number;
  successes: number;
  successRate: number;
  lastResult: "success" | "failure" | "unknown";
  lastEvaluatedAt?: string;
  lastProposedAt?: string;
  firstSeenAt?: string;
  lastPlanConfidence?: number;
  trust: number;
  signalOnLastRun?: SignalStrength;
};

type StoreFile = { topics: TopicOutcomeRecord[] };

export function topicKeyOf(raw: string): string {
  return raw.trim().toLowerCase();
}

export async function loadTopicOutcomes(): Promise<TopicOutcomeRecord[]> {
  try {
    const raw = await fs.readFile(PATH, "utf8");
    const parsed = JSON.parse(raw) as StoreFile;
    if (!Array.isArray(parsed?.topics)) return [];
    return parsed.topics
      .filter(
        (t): t is TopicOutcomeRecord =>
          typeof t?.topicKey === "string" && typeof t.topic === "string"
      )
      .map(mergeDefaults);
  } catch {
    return [];
  }
}

function mergeDefaults(t: TopicOutcomeRecord): TopicOutcomeRecord {
  const runs = Number.isFinite(t.runs) && t.runs >= 0 ? t.runs : 0;
  const successes = Number.isFinite(t.successes) && t.successes >= 0 ? t.successes : 0;
  const tr = Number.isFinite(t.trust) && t.trust > 0 && t.trust <= 1 ? t.trust : 1;
  return {
    ...t,
    runs,
    successes,
    successRate: runs > 0 ? successes / runs : 0,
    lastResult: t.lastResult === "success" || t.lastResult === "failure" ? t.lastResult : "unknown",
    trust: tr,
  };
}

export async function saveTopicOutcomes(records: TopicOutcomeRecord[]): Promise<void> {
  const norm = records.map(mergeDefaults).sort((a, b) => a.topicKey.localeCompare(b.topicKey));
  const body = JSON.stringify({ topics: norm }, null, 2) + "\n";
  await fs.writeFile(PATH, body, "utf8");
}

function getOrCreate(list: TopicOutcomeRecord[], key: string, displayLabel: string): TopicOutcomeRecord {
  const x = list.find((r) => r.topicKey === key);
  if (x) return x;
  const n: TopicOutcomeRecord = {
    topicKey: key,
    topic: displayLabel,
    runs: 0,
    successes: 0,
    successRate: 0,
    lastResult: "unknown",
    trust: 1,
  };
  list.push(n);
  return n;
}

/** Старт/обновление при прогоне. */
export async function recordTopicsProposed(
  items: Array<{ topic: string; source: string; signal: SignalStrength; confidence: number }>
): Promise<void> {
  if (items.length === 0) return;
  const list = await loadTopicOutcomes();
  const now = new Date().toISOString();
  for (const it of items) {
    const key = topicKeyOf(it.topic);
    if (!key) continue;
    const rec = getOrCreate(list, key, it.topic.trim() || key);
    rec.topic = it.topic.trim() || rec.topic;
    rec.lastProposedAt = now;
    rec.lastPlanConfidence = it.confidence;
    rec.signalOnLastRun = it.signal;
    if (!rec.firstSeenAt) rec.firstSeenAt = now;
  }
  await saveTopicOutcomes(list);
}

export async function recordEvaluatedTopicOutcome(
  topic: string,
  result: "success" | "failure",
  planConfidence: number | undefined,
  calibrationHighConfidence: number
): Promise<TopicOutcomeRecord> {
  const list = await loadTopicOutcomes();
  const key = topicKeyOf(topic);
  const rec = getOrCreate(list, key, topic.trim() || key);
  const now = new Date().toISOString();
  rec.runs += 1;
  if (result === "success") {
    rec.successes += 1;
  }
  rec.successRate = rec.runs > 0 ? rec.successes / rec.runs : 0;
  rec.lastResult = result;
  rec.lastEvaluatedAt = now;
  if (result === "failure" && planConfidence != null && planConfidence > calibrationHighConfidence) {
    rec.trust = Math.max(0, rec.trust * 0.5);
  } else if (result === "success" && rec.trust < 1) {
    rec.trust = Math.min(1, rec.trust * 1.1);
  }
  if (!rec.topic) rec.topic = topic;
  await saveTopicOutcomes(list);
  return rec;
}

/** Пакетная оценка — один read/write файла. */
export async function recordManyEvaluatedTopicOutcomes(
  items: Array<{
    topic: string;
    result: "success" | "failure";
  }>,
  planConfidence: number | undefined,
  calibrationHighConfidence: number
): Promise<void> {
  if (items.length === 0) return;
  const list = await loadTopicOutcomes();
  const now = new Date().toISOString();
  for (const { topic, result } of items) {
    const key = topicKeyOf(topic);
    if (!key) continue;
    const rec = getOrCreate(list, key, topic.trim() || key);
    rec.runs += 1;
    if (result === "success") {
      rec.successes += 1;
    }
    rec.successRate = rec.runs > 0 ? rec.successes / rec.runs : 0;
    rec.lastResult = result;
    rec.lastEvaluatedAt = now;
    if (result === "failure" && planConfidence != null && planConfidence > calibrationHighConfidence) {
      rec.trust = Math.max(0, rec.trust * 0.5);
    } else if (result === "success" && rec.trust < 1) {
      rec.trust = Math.min(1, rec.trust * 1.1);
    }
    if (!rec.topic) rec.topic = topic;
  }
  await saveTopicOutcomes(list);
}

export function getOutcomeByKey(
  out: TopicOutcomeRecord[] | null | undefined,
  topic: string
): TopicOutcomeRecord | undefined {
  if (!out?.length) return undefined;
  const k = topicKeyOf(topic);
  return out.find((x) => x.topicKey === k);
}
