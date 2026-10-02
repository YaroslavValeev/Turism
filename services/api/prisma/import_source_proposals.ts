import "../src/env/loadProcessEnv";
import fs from "fs/promises";
import path from "path";
import { prisma } from "../src/lib/prisma";
import { LEGACY_BATCH_FILE_PREFIX, loadScoutBatch } from "../src/modules/scout/candidate";
import { collectBatchKeys, validateScoutBatch } from "../src/modules/scout/validate";
import { importScoutBatch } from "../src/modules/scout/import";

async function loadOtherBatchKeys(filePath: string): Promise<Set<string>> {
  const dir = path.dirname(filePath);
  const self = path.resolve(filePath);
  const keys = new Set<string>();
  const files = (await fs.readdir(dir)).filter(
    (name) => name.startsWith(LEGACY_BATCH_FILE_PREFIX) && name.endsWith(".json") && path.resolve(dir, name) !== self,
  );
  for (const name of files) {
    try {
      for (const key of collectBatchKeys(await loadScoutBatch(path.join(dir, name)))) keys.add(key);
    } catch (error) {
      console.warn(`WARN cannot read other batch ${name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return keys;
}

async function main() {
  const filePath = process.argv.find((arg) => arg.endsWith(".json"));
  const apply = process.argv.includes("--apply");
  if (!filePath) {
    throw new Error("Usage: tsx prisma/import_source_proposals.ts <json-file> [--apply]");
  }

  const batch = await loadScoutBatch(filePath);
  const otherBatchKeys = await loadOtherBatchKeys(filePath);
  const { rows, errors, warnings, stats } = validateScoutBatch(batch, { otherBatchKeys });

  if (errors.length > 0) {
    for (const issue of errors) console.error(`ERROR [${issue.code}] ${issue.message}`);
    console.error(`Validation failed: ${errors.length} error(s) in ${batch.candidates.length} candidate(s). Nothing imported.`);
    process.exitCode = 1;
    return;
  }
  for (const issue of warnings) console.warn(`WARN [${issue.code}] ${issue.message}`);

  console.log(
    JSON.stringify(
      {
        mode: apply ? "apply" : "dry-run",
        batchId: batch.batchId,
        schemaVersion: batch.schemaVersion,
        total: rows.length,
        warnings: warnings.length,
        byRegion: stats.byRegion,
        byKind: stats.byKind,
        byScoutArea: stats.byScoutArea,
        byDiscipline: stats.byDiscipline,
        byFormat: stats.byFormat,
      },
      null,
      2,
    ),
  );

  const result = await importScoutBatch(rows, {
    batchId: batch.batchId,
    schemaVersion: batch.schemaVersion,
    apply,
    onRow: (row, kind) => console.log(`${kind.padEnd(19)} ${row.item.region.padEnd(12)} ${row.item.name}`),
  });
  if (!result.applied) {
    console.log("Dry-run only. Re-run with --apply after Owner review to write pending SourceProposal rows.");
    return;
  }
  console.log(JSON.stringify(result.counts, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
