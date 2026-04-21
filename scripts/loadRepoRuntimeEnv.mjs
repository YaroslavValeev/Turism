import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { applyApiRuntimeEnvAliases } from "@mywave/config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

/** Загрузка repo root `.env`, затем `services/api/.env`, затем канонические алиасы (как у API). */
export function loadRepoRuntimeEnv() {
  const rootEnv = path.join(root, ".env");
  const apiEnv = path.join(root, "services", "api", ".env");
  if (fs.existsSync(rootEnv)) dotenv.config({ path: rootEnv, override: false });
  if (fs.existsSync(apiEnv)) dotenv.config({ path: apiEnv, override: true });
  applyApiRuntimeEnvAliases();
}
