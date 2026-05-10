/**
 * Одноразовый запуск сида с демо-каталогом (SEED_DEMO_CATALOG=1), кроссплатформенно.
 */
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const env = { ...process.env, SEED_DEMO_CATALOG: "1" };
const r = spawnSync("pnpm", ["--filter", "api", "db:seed"], {
  stdio: "inherit",
  env,
  cwd: root,
  shell: process.platform === "win32",
});
process.exit(r.status ?? 1);
