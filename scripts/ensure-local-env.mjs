/**
 * Создаёт `services/api/.env` и `apps/web/.env.local` из *.example, если файлов ещё нет.
 * Не перезаписывает существующие — безопасно вызывать перед local:bootstrap.
 */
import { copyFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const pairs = [
  { from: join(root, "services", "api", ".env.example"), to: join(root, "services", "api", ".env") },
  { from: join(root, "apps", "web", ".env.example"), to: join(root, "apps", "web", ".env.local") },
];

for (const { from, to } of pairs) {
  if (existsSync(to)) {
    console.log(`[ensure-local-env] skip (exists): ${to}`);
    continue;
  }
  if (!existsSync(from)) {
    console.error(`[ensure-local-env] missing template: ${from}`);
    process.exit(1);
  }
  copyFileSync(from, to);
  console.log(`[ensure-local-env] created: ${to}`);
}
