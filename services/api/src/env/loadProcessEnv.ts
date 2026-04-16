/**
 * Загрузка переменных окружения до loadEnv(): корневой .env, затем services/api/.env (перекрывает),
 * затем алиасы TELEGRAM_* / INTERNAL_ANALYTICS_TOKEN (см. @mywave/config applyApiRuntimeEnvAliases).
 */
import fs from "node:fs";
import path from "node:path";
import { config as dotenvConfig } from "dotenv";
import { applyApiRuntimeEnvAliases } from "@mywave/config";

function findWorkspaceRoot(startDir: string): string | undefined {
  let dir = path.resolve(startDir);
  for (;;) {
    if (fs.existsSync(path.join(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

const cwd = process.cwd();
const workspaceRoot = findWorkspaceRoot(cwd) ?? findWorkspaceRoot(path.join(__dirname, "..", ".."));

const rootEnv = workspaceRoot ? path.join(workspaceRoot, ".env") : undefined;
const apiEnv = workspaceRoot
  ? path.join(workspaceRoot, "services", "api", ".env")
  : path.join(__dirname, "..", "..", ".env");

if (rootEnv && fs.existsSync(rootEnv)) {
  dotenvConfig({ path: rootEnv, override: false });
}
if (fs.existsSync(apiEnv)) {
  dotenvConfig({ path: apiEnv, override: true });
}

applyApiRuntimeEnvAliases();
