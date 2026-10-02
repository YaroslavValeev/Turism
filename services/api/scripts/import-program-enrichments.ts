/**
 * Импорт OSINT-дополнений карточек (проживание / трансфер / экипировка) из JSON.
 * По умолчанию dry-run; запись только с --apply. Создаёт ТОЛЬКО черновики; одобрение — вручную в админке.
 *
 *   pnpm --filter api db:import:program-enrichments -- --file=path/to/batch.json
 *   pnpm --filter api db:import:program-enrichments -- --file=path/to/batch.json --apply
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { prisma } from "../src/lib/prisma";
import {
  parseEnrichmentImportFile,
  runEnrichmentImport,
  type EnrichmentImportClient,
} from "../src/modules/programs/enrichmentImport";

function resolveFileArg(argv: string[]): string {
  const flag = argv.find((item) => item.startsWith("--file="));
  const positional = argv.slice(2).find((item) => !item.startsWith("--"));
  const file = flag ? flag.slice("--file=".length) : positional;
  if (!file) throw new Error("usage: import-program-enrichments --file=<batch.json> [--apply]");
  return path.resolve(file);
}

async function main(): Promise<void> {
  const file = parseEnrichmentImportFile(JSON.parse(readFileSync(resolveFileArg(process.argv), "utf8")));
  const summary = await runEnrichmentImport(prisma as unknown as EnrichmentImportClient, file, {
    apply: process.argv.includes("--apply"),
  });
  console.log(JSON.stringify({ ok: true, ...summary }, null, 2));
}

main()
  .catch((error) => {
    console.error(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : "unknown error" }));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
