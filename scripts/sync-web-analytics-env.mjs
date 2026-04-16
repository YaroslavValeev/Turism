#!/usr/bin/env node
/**
 * Создаёт/обновляет apps/web/.env.local: INTERNAL_ANALYTICS_TOKEN и base URL из services/api/.env.
 * Не печатает секреты. Использование: node scripts/sync-web-analytics-env.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadRepoRuntimeEnv } from "./loadRepoRuntimeEnv.mjs";

loadRepoRuntimeEnv();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const webPath = path.join(root, "apps", "web", ".env.local");

function parseEnvFile(content) {
  const o = {};
  for (const line of content.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i <= 0) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    o[k] = v;
  }
  return o;
}

const token = (process.env.INTERNAL_ANALYTICS_TOKEN || process.env.TARGET_INTERNAL_TOKEN || "").trim();
if (!token) {
  console.error("FAIL: no INTERNAL_ANALYTICS_TOKEN after loadRepoRuntimeEnv (check services/api/.env or root .env)");
  process.exit(1);
}

const base =
  (process.env.API_INTERNAL_BASE_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001").trim();

let existing = {};
if (fs.existsSync(webPath)) {
  existing = parseEnvFile(fs.readFileSync(webPath, "utf8"));
}

const merged = {
  ...existing,
  NEXT_PUBLIC_API_URL: existing.NEXT_PUBLIC_API_URL || base,
  API_INTERNAL_BASE_URL: existing.API_INTERNAL_BASE_URL || base,
  INTERNAL_ANALYTICS_TOKEN: token,
};

const esc = (v) => {
  const s = String(v);
  if (/[\s#"']/.test(s) || s.includes("\n")) return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  return s;
};

const keys = Object.keys(merged).sort();
const body = keys.map((k) => `${k}=${esc(merged[k])}`).join("\n") + "\n";
fs.writeFileSync(webPath, body, "utf8");
console.log("OK: apps/web/.env.local updated (analytics + preserved keys)");
