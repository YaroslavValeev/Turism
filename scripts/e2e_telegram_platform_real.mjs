#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const required = ["DATABASE_URL", "TELEGRAM_BOT_TOKEN", "TELEGRAM_WEBHOOK_SECRET", "TELEGRAM_ALERT_CHAT_ID"];
const missing = required.filter((key) => !process.env[key]?.trim());
if (missing.length) {
  console.error(`[telegram-platform-real-e2e] missing_real_data/env: ${missing.join(", ")}`);
  console.error("This command never seeds fake programs, organizers, leads or Telegram contacts. Run only against a real DB/env.");
  process.exit(2);
}

const result = spawnSync(
  "pnpm",
  ["--filter", "api", "exec", "tsx", "scripts/e2e-telegram-platform-real.ts"],
  { stdio: "inherit", env: process.env },
);
process.exit(result.status ?? 1);
