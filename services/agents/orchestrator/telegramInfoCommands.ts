import { sendToTelegram } from "../shared/telegram.js";
import { loadRun } from "./runs/registry.js";
import { readAllDecisionLogEntries } from "./decision-log/log.js";
import { loadTopicOutcomes, topicKeyOf } from "../memory/topicOutcomes.js";
import { splitTelegramMessage } from "../analytics/formatter.js";
import { computeTopicActionScore } from "./topicScoring.js";

/**
 * /status <runId> — снимок прогона.
 * /history <тема> — последние события из decision log.
 * /top — темы по оценочному score (learning).
 */
export function tryParseInfoCommand(
  text: string
):
  | { kind: "status"; runId: string }
  | { kind: "history"; q: string }
  | { kind: "top" }
  | null {
  const t = text.trim();
  if (t === "/top" || t.toLowerCase() === "/top") return { kind: "top" };
  if (t.toLowerCase().startsWith("/status ")) {
    const runId = t.slice(8).trim();
    if (runId) return { kind: "status", runId };
  }
  if (t.toLowerCase().startsWith("/history ")) {
    const q = t.slice(9).trim();
    if (q) return { kind: "history", q };
  }
  return null;
}

type InfoCommand = NonNullable<ReturnType<typeof tryParseInfoCommand>>;

export async function handleInfoCommand(c: InfoCommand): Promise<string> {
  if (c.kind === "status") {
    const run = await loadRun(c.runId);
    if (!run) return `Статус: прогон «${c.runId}» не найден.`;
    const p = run.plan;
    return [
      `Status ${run.runId}`,
      `state: ${run.status}`,
      `t: ${run.timestamp}`,
      `actions: ${p.actions.length} · confidence: ${p.confidence.toFixed(2)}`,
      p.notes ? `notes: ${p.notes.slice(0, 200)}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  }
  if (c.kind === "history") {
    const log = await readAllDecisionLogEntries();
    const key = c.q.toLowerCase();
    const lines = log
      .filter(
        (e) =>
          topicKeyOf(e.topic).includes(key) || e.topic.toLowerCase().includes(key) || e.source.toLowerCase().includes(key)
      )
      .slice(-25);
    if (lines.length === 0) return `История по «${c.q}»: пусто (в логе нет совпадений).`;
    return lines
      .map((e) => `${e.ts} ${e.decision} ${e.result} | ${e.topic} | ${e.runId.slice(0, 8)}…`)
      .join("\n");
  }
  if (c.kind === "top") {
    const out = await loadTopicOutcomes();
    const withScore = out
      .filter((o) => o.runs > 0)
      .map((o) => ({
        o,
        s: computeTopicActionScore(o.topic, o.signalOnLastRun ?? "STRONG", out),
      }));
    withScore.sort((a, b) => b.s - a.s);
    const top = withScore.slice(0, 15);
    if (top.length === 0) return "TOP: пока нет оцененных тем (нужен /evaluated).";
    return top
      .map(
        (t) =>
          `· ${t.o.topic} | SR=${(t.o.successRate * 100).toFixed(0)}% runs=${t.o.runs} trust=${t.o.trust.toFixed(2)} last=${t.o.lastResult}`
      )
      .join("\n");
  }
  return "";
}

export async function processInfoCommand(c: InfoCommand): Promise<void> {
  try {
    const msg = await handleInfoCommand(c);
    const parts = splitTelegramMessage(msg);
    for (let i = 0; i < parts.length; i += 1) {
      const p = parts.length > 1 ? `(${i + 1}/${parts.length})\n` : "";
      await sendToTelegram(p + parts[i]!);
    }
  } catch (e) {
    console.error("[orchestrator:info]", e);
  }
}
