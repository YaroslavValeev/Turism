import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { AnalyticsSnapshot } from "../../analytics/agent.js";
import type { SignalRow } from "../../analytics/signals.js";
import type { MarketingPlan } from "../../marketing/validator.js";
import type { ActionContext } from "../scalingRules.js";

export type RunStatus = "pending" | "approved" | "rejected" | "executed" | "evaluated";

export type OrchestratorRunRecord = {
  runId: string;
  timestamp: string;
  analyticsSnapshot: AnalyticsSnapshot;
  /** Сигналы для аудита: capped STRONG + все WEAK (как контекст рядом с analyticsSnapshot). */
  signals: SignalRow[];
  plan: MarketingPlan;
  /** Тема + source + сигнал для логов, feedback, scaling. */
  actionContext?: ActionContext[];
  status: RunStatus;
  /** Комментарий при reject / rewrite */
  ownerNote?: string;
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RUNS_DIR = path.join(__dirname);
const TELEGRAM_OFFSET_FILE = "telegram-poll-offset.json";

function runPath(runId: string): string {
  const safe = runId.replace(/[^a-zA-Z0-9._-]/g, "_");
  return path.join(RUNS_DIR, `${safe}.json`);
}

export async function saveRun(record: OrchestratorRunRecord): Promise<void> {
  await fs.mkdir(RUNS_DIR, { recursive: true });
  await fs.writeFile(runPath(record.runId), JSON.stringify(record, null, 2) + "\n", "utf8");
}

export async function loadRun(runId: string): Promise<OrchestratorRunRecord | null> {
  try {
    const raw = await fs.readFile(runPath(runId), "utf8");
    return JSON.parse(raw) as OrchestratorRunRecord;
  } catch {
    return null;
  }
}

function canTransition(from: RunStatus, to: RunStatus): boolean {
  if (from === to) return true;
  if (from === "pending" && (to === "approved" || to === "rejected")) return true;
  if (from === "approved" && to === "executed") return true;
  if (from === "executed" && to === "evaluated") return true;
  return false;
}

/**
 * @param allowAnyTransition — только для срочной правки записей; обычно false.
 */
export async function updateRunStatus(
  runId: string,
  status: RunStatus,
  ownerNote?: string,
  allowAnyTransition = false
): Promise<OrchestratorRunRecord | null> {
  const existing = await loadRun(runId);
  if (!existing) return null;
  if (!allowAnyTransition && !canTransition(existing.status, status)) {
    return null;
  }
  const next: OrchestratorRunRecord = {
    ...existing,
    status,
    ...(ownerNote !== undefined ? { ownerNote } : {}),
  };
  await saveRun(next);
  return next;
}

export async function listRunRecords(): Promise<OrchestratorRunRecord[]> {
  const names = await fs.readdir(RUNS_DIR);
  const out: OrchestratorRunRecord[] = [];
  for (const n of names) {
    if (!n.endsWith(".json") || n === TELEGRAM_OFFSET_FILE) continue;
    const full = path.join(RUNS_DIR, n);
    try {
      const raw = await fs.readFile(full, "utf8");
      const rec = JSON.parse(raw) as Partial<OrchestratorRunRecord>;
      if (
        typeof rec.runId === "string" &&
        rec.status &&
        rec.plan &&
        typeof rec.status === "string" &&
        ["pending", "approved", "rejected", "executed", "evaluated"].includes(String(rec.status))
      ) {
        out.push(rec as OrchestratorRunRecord);
      }
    } catch {
      /* пропускаем невалидные файлы */
    }
  }
  return out;
}
