import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fetchTelegramUpdates, type TelegramUpdate } from "../shared/telegramUpdates.js";
import { sendToTelegram } from "../shared/telegram.js";
import { findSignalBySource } from "../analytics/signals.js";
import { loadRun, updateRunStatus, type OrchestratorRunRecord } from "./runs/registry.js";
import { loadMemory, saveMemory } from "../memory/store.js";
import { appendDecisionLog } from "./decision-log/log.js";
import { completeRunWithEvaluation } from "./evaluateRun.js";
import type { ActionContext } from "./scalingRules.js";
import { tryParseInfoCommand, processInfoCommand } from "./telegramInfoCommands.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OFFSET_PATH = path.join(__dirname, "runs", "telegram-poll-offset.json");

function resolveOwnerChatId(): string {
  return (
    process.env.TG_CHAT_ID ??
    process.env.TELEGRAM_ANALYTICS_AGENT_CHAT_ID ??
    process.env.TELEGRAM_ALERT_CHAT_ID ??
    process.env.OWNER_CHAT_ID ??
    ""
  );
}

async function readPollOffset(): Promise<number> {
  try {
    const raw = await fs.readFile(OFFSET_PATH, "utf8");
    const n = Number.parseInt(JSON.parse(raw) as string, 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

async function writePollOffset(next: number): Promise<void> {
  await fs.mkdir(path.dirname(OFFSET_PATH), { recursive: true });
  await fs.writeFile(OFFSET_PATH, JSON.stringify(String(next)), "utf8");
}

function parseCommand(
  text: string
):
  | { cmd: "approve" | "reject" | "rewrite" | "executed" | "evaluated"; runId: string; note?: string }
  | null {
  const t = text.trim();
  const m = t.match(/^\/(approve|reject|rewrite|executed|evaluated)\s+(\S+)(?:\s+([\s\S]*))?$/i);
  if (!m) return null;
  const cmd = m[1].toLowerCase() as "approve" | "reject" | "rewrite" | "executed" | "evaluated";
  const runId = m[2].trim();
  const note = m[3]?.trim() || undefined;
  if (!runId) return null;
  return { cmd, runId, note };
}

function buildActionContext(run: OrchestratorRunRecord): ActionContext[] {
  if (run.actionContext?.length) return run.actionContext;
  return run.plan.actions.map((a) => {
    const row = findSignalBySource(run.signals, a.source);
    return {
      topic: a.topic,
      source: a.source,
      signal: row?.signal ?? "NONE",
    };
  });
}

async function notify(text: string): Promise<void> {
  try {
    await sendToTelegram(text);
  } catch (e) {
    console.error("[orchestrator:telegram]", text, e);
  }
}

async function handleApprove(runId: string): Promise<void> {
  const run = await loadRun(runId);
  if (!run) {
    await notify(`❌ Прогон не найден: ${runId}`);
    return;
  }
  if (run.status !== "pending") {
    await notify(`⚠️ Прогон ${runId} уже в статусе «${run.status}», approve проигнорирован.`);
    return;
  }
  const next = await updateRunStatus(runId, "approved");
  if (!next) {
    await notify(`❌ Статус «approved» не применён (проверьте переход из «${run.status}»).`);
    return;
  }
  const ctx = buildActionContext(run);
  const ts = new Date().toISOString();
  for (const c of ctx) {
    await appendDecisionLog({
      ts,
      runId,
      topic: c.topic,
      source: c.source,
      signal: c.signal,
      decision: "approved",
      result: "pending",
    });
  }
  const topics = run.plan.actions.map((a) => a.topic.trim()).filter(Boolean);
  if (topics.length > 0) {
    const mem = await loadMemory();
    await saveMemory({
      tested_topics: dedupeStrings([...mem.tested_topics, ...topics]),
      failed_topics: mem.failed_topics,
      successful_topics: dedupeStrings([...mem.successful_topics, ...topics]),
      last_used_topics: dedupeStrings([...topics, ...mem.last_used_topics]).slice(0, 30),
    });
  }
  await notify(`✅ Прогон ${runId} одобрен. Темы учтены в memory (tested / successful / last_used).`);
}

async function handleReject(runId: string, note?: string): Promise<void> {
  const run = await loadRun(runId);
  if (!run) {
    await notify(`❌ Прогон не найден: ${runId}`);
    return;
  }
  if (run.status !== "pending") {
    await notify(`⚠️ Прогон ${runId} уже в статусе «${run.status}», reject проигнорирован.`);
    return;
  }
  const next = await updateRunStatus(runId, "rejected", note);
  if (!next) {
    await notify(`❌ Статус «rejected» не применён.`);
    return;
  }
  const ctx = buildActionContext(run);
  const ts = new Date().toISOString();
  for (const c of ctx) {
    await appendDecisionLog({
      ts,
      runId,
      topic: c.topic,
      source: c.source,
      signal: c.signal,
      decision: "rejected",
      result: "failure",
    });
  }
  const topics = run.plan.actions.map((a) => a.topic.trim()).filter(Boolean);
  if (topics.length > 0) {
    const mem = await loadMemory();
    await saveMemory({
      tested_topics: mem.tested_topics,
      failed_topics: dedupeStrings([...mem.failed_topics, ...topics]),
      successful_topics: mem.successful_topics,
      last_used_topics: mem.last_used_topics,
    });
  }
  await notify(`❌ Прогон ${runId} отклонён. Темы добавлены в failed_topics.${note ? `\nКомментарий: ${note}` : ""}`);
}

async function handleExecuted(runId: string): Promise<void> {
  const run = await loadRun(runId);
  if (!run) {
    await notify(`❌ Прогон не найден: ${runId}`);
    return;
  }
  if (run.status !== "approved") {
    await notify(
      `⚠️ /executed допустим из «approved», сейчас «${run.status}».`
    );
    return;
  }
  const updated = await updateRunStatus(runId, "executed");
  if (!updated) {
    await notify("❌ Переход в «executed» невозможен.");
    return;
  }
  const ctx = buildActionContext(run);
  const ts = new Date().toISOString();
  for (const c of ctx) {
    await appendDecisionLog({
      ts,
      runId,
      topic: c.topic,
      source: c.source,
      signal: c.signal,
      decision: "executed",
      result: "pending",
    });
  }
  await notify(`🛠 Прогон ${runId} в статусе executed (черновик/артефакт зафиксирован). Далее: /evaluated.`);
}

async function handleEvaluatedCommand(runId: string): Promise<void> {
  const r = await completeRunWithEvaluation(runId);
  await notify(r.ok ? r.message : `❌ ${r.message}`);
}

function dedupeStrings(items: string[]): string[] {
  return Array.from(new Set(items.map((x) => x.trim()).filter(Boolean)));
}

async function processUpdate(u: TelegramUpdate, ownerChatId: number): Promise<void> {
  const msg = u.message;
  if (!msg?.text) return;
  if (Number(msg.chat.id) !== ownerChatId) return;

  const info = tryParseInfoCommand(msg.text);
  if (info) {
    await processInfoCommand(info);
    return;
  }

  const parsed = parseCommand(msg.text);
  if (!parsed) return;

  if (parsed.cmd === "approve") await handleApprove(parsed.runId);
  else if (parsed.cmd === "reject") await handleReject(parsed.runId, parsed.note);
  else if (parsed.cmd === "rewrite")
    await handleReject(parsed.runId, parsed.note ? `rewrite: ${parsed.note}` : "rewrite");
  else if (parsed.cmd === "executed") await handleExecuted(parsed.runId);
  else if (parsed.cmd === "evaluated") await handleEvaluatedCommand(parsed.runId);
}

/**
 * Фоновый long-poll: команды /approve /reject /rewrite только из owner-chat.
 */
export async function startTelegramControlLoop(): Promise<void> {
  const token = process.env.TG_BOT_TOKEN ?? process.env.TELEGRAM_BOT_TOKEN ?? "";
  if (!token.trim()) {
    console.warn("[orchestrator:telegram] Нет TG_BOT_TOKEN / TELEGRAM_BOT_TOKEN — опрос команд выключен.");
    return;
  }
  const chatRaw = resolveOwnerChatId();
  const ownerChatId = Number(chatRaw);
  if (!chatRaw || !Number.isFinite(ownerChatId)) {
    console.warn("[orchestrator:telegram] TG_CHAT_ID / OWNER_CHAT_ID не задан — опрос команд выключен.");
    return;
  }

  let offset = await readPollOffset();
  console.log("[orchestrator:telegram] Long-poll запущен, owner chat:", ownerChatId);

  for (;;) {
    try {
      const updates = await fetchTelegramUpdates(offset);
      for (const u of updates) {
        offset = u.update_id + 1;
        await processUpdate(u, ownerChatId);
      }
      if (updates.length > 0) await writePollOffset(offset);
    } catch (e) {
      console.error("[orchestrator:telegram] getUpdates error", e);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
}
