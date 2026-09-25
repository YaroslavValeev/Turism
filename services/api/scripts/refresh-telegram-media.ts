/**
 * Перекачать протухшие медиа Telegram (cdn*.telesco.pe → 404) в /ingestion-media.
 * Запуск: pnpm --filter api exec tsx scripts/refresh-telegram-media.ts [--dry-run] [--limit N]
 * На VPS: docker compose … exec -T api sh -c 'cd /app/services/api && pnpm exec tsx scripts/refresh-telegram-media.ts'
 */
import { prisma } from "../src/lib/prisma";
import { refreshTelegramProgramMedia } from "../src/modules/ingestion/telegramMedia";

function readLimit(argv: string[]): number | undefined {
  const index = argv.indexOf("--limit");
  if (index < 0) return undefined;
  const value = Number(argv[index + 1]);
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

async function main() {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes("--dry-run");
  const result = await refreshTelegramProgramMedia({ dryRun, limit: readLimit(argv) });
  console.log(
    `dry_run=${dryRun} checked=${result.programsChecked} updated=${result.programsUpdated} cached_files=${result.mediaCached} failed=${result.failures.length}`,
  );
  for (const failure of result.failures) {
    console.log(`FAIL\t${failure.programId}\t${failure.reason}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
