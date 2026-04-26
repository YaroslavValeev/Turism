import path from "node:path";
import fs from "node:fs";
import { config } from "dotenv";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Загрузка `.env` как у `scripts/preload-repo-env.cjs` (корень, затем API).
 * Алиасы env для API в агенте не применяем — ожидаем канонические имена (INTERNAL_ANALYTICS_TOKEN, …).
 */
export function loadRepoEnv(): void {
  const root = path.resolve(__dirname, "../../..");
  const rootEnv = path.join(root, ".env");
  const apiEnv = path.join(root, "services", "api", ".env");
  if (fs.existsSync(rootEnv)) {
    config({ path: rootEnv, override: false });
  }
  if (fs.existsSync(apiEnv)) {
    config({ path: apiEnv, override: true });
  }
}
