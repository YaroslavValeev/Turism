/**
 * Запуск `next dev` с портом из WEB_DEV_PORT или PORT (по умолчанию 3000).
 * Согласовано с `scripts/ensure-web-dev-port.mjs` в корне репозитория.
 */
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const port = String(process.env.WEB_DEV_PORT || process.env.PORT || 3000);

const child = spawn("npx", ["next", "dev", "-p", port], {
  cwd: webRoot,
  stdio: "inherit",
  shell: process.platform === "win32",
});

child.on("exit", (code) => process.exit(code ?? 0));
