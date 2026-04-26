import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type AgentMemory = {
  tested_topics: string[];
  failed_topics: string[];
  successful_topics: string[];
  last_used_topics: string[];
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MEMORY_PATH = path.join(__dirname, "memory.json");

const EMPTY: AgentMemory = {
  tested_topics: [],
  failed_topics: [],
  successful_topics: [],
  last_used_topics: [],
};

function readStringList(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

export async function loadMemory(): Promise<AgentMemory> {
  try {
    const raw = await fs.readFile(MEMORY_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<AgentMemory>;
    return {
      tested_topics: readStringList(parsed.tested_topics),
      failed_topics: readStringList(parsed.failed_topics),
      successful_topics: readStringList(parsed.successful_topics),
      last_used_topics: readStringList(parsed.last_used_topics),
    };
  } catch {
    return { ...EMPTY };
  }
}

export async function saveMemory(next: AgentMemory): Promise<void> {
  const body = JSON.stringify(
    {
      tested_topics: dedupe(next.tested_topics),
      failed_topics: dedupe(next.failed_topics),
      successful_topics: dedupe(next.successful_topics),
      last_used_topics: dedupe(next.last_used_topics),
    },
    null,
    2
  );
  await fs.writeFile(MEMORY_PATH, body + "\n", "utf8");
}

function dedupe(items: string[]): string[] {
  return Array.from(new Set(items.map((x) => x.trim()).filter(Boolean)));
}
