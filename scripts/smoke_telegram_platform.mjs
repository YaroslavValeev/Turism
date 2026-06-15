#!/usr/bin/env node
/**
 * Smoke: Telegram platform API (без реального Telegram).
 */
import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env") });
config({ path: resolve(__dirname, "../services/api/.env") });

const API = (process.env.PUBLIC_API_BASE_URL || "http://localhost:3001").replace(/\/+$/, "");

async function main() {
  const health = await fetch(`${API}/health`);
  if (!health.ok) throw new Error("API health failed");

  const dl = await fetch(`${API}/public/telegram/platform/deeplink/validate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ payload: "program_test1234567890ab", telegramAccountId: 999001 }),
  });
  const dlBody = await dl.json();
  if (!dl.ok && dl.status !== 404) {
    console.log("deeplink validate:", dl.status, dlBody);
  }

  const consents = await fetch(`${API}/public/telegram/platform/leads/consents/nonexistent`);
  if (consents.status !== 404 && consents.status !== 200) {
    throw new Error(`consents endpoint unexpected: ${consents.status}`);
  }

  console.log("smoke_telegram_platform: ok");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
