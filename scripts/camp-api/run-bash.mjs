import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("usage: node scripts/camp-api/run-bash.mjs [-n] <script> [args...]");
  process.exit(2);
}

function resolveBash() {
  if (process.env.BASH_PATH) return process.env.BASH_PATH;
  if (process.platform === "win32") {
    const candidates = [
      "C:\\Program Files\\Git\\bin\\bash.exe",
      "C:\\Program Files\\Git\\usr\\bin\\bash.exe",
    ];
    const found = candidates.find((candidate) => existsSync(candidate));
    if (found) return found;
  }
  return "bash";
}

const result = spawnSync(resolveBash(), args, {
  cwd: process.cwd(),
  env: process.env,
  stdio: "inherit",
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
