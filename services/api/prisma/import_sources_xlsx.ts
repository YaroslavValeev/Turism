import { prisma } from "../src/lib/prisma";
import { runXlsxSourceImport } from "../src/modules/sources/importService";

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    throw new Error("Usage: tsx prisma/import_sources_xlsx.ts <xlsx-path> [--dry-run]");
  }
  const dryRun = process.argv.includes("--dry-run");
  const result = await runXlsxSourceImport(prisma, {
    filePath,
    dryRun,
    startedBy: "cli_import_sources_xlsx",
  });
  console.log(JSON.stringify(result, null, 2));
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });

