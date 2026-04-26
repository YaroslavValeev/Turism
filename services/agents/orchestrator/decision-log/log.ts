import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { SignalStrength } from "../../analytics/signals.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOG_FILE = path.join(__dirname, "decisions.jsonl");

export type DecisionLogDecision =
  | "proposed"
  | "approved"
  | "rejected"
  | "executed"
  | "evaluated";

export type DecisionLogResult = "pending" | "success" | "failure" | "unknown";

/**
 * Запись в духе operational contract: что предложили, что приняли, чем закончилось.
 */
export type DecisionLogEntry = {
  ts: string;
  runId: string;
  topic: string;
  source: string;
  signal: SignalStrength;
  decision: DecisionLogDecision;
  result: DecisionLogResult;
};

export async function appendDecisionLog(entry: DecisionLogEntry): Promise<void> {
  await fs.mkdir(__dirname, { recursive: true });
  const line = JSON.stringify(entry) + "\n";
  await fs.appendFile(LOG_FILE, line, "utf8");
}

export function decisionLogPath(): string {
  return LOG_FILE;
}

export async function readAllDecisionLogEntries(): Promise<DecisionLogEntry[]> {
  try {
    const raw = await fs.readFile(LOG_FILE, "utf8");
    const out: DecisionLogEntry[] = [];
    for (const line of raw.split("\n")) {
      const t = line.trim();
      if (!t) continue;
      try {
        out.push(JSON.parse(t) as DecisionLogEntry);
      } catch {
        /* skip */
      }
    }
    return out;
  } catch {
    return [];
  }
}
