/**
 * Подмножество загрузки env как у Next для `apps/web` (локальная проверка скриптами).
 * Файлы в порядке возрастания приоритета (последний перекрывает).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { applyApiRuntimeEnvAliases } from "@mywave/config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const webDir = path.join(root, "apps", "web");

export function loadWebRuntimeEnv() {
  const files = [".env", ".env.development", ".env.local", ".env.development.local"];
  for (const name of files) {
    const p = path.join(webDir, name);
    if (fs.existsSync(p)) dotenv.config({ path: p, override: true });
  }
  applyApiRuntimeEnvAliases();
}
