import { prisma } from "../src/lib/prisma";

const confirmation = "legacy-source-run-v1";
const apply = process.argv.includes("--apply") && process.env.BACKFILL_CONFIRM === confirmation;

type LegacySource = {
  id: string;
  name: string;
  rawItemsWithoutSourceRun: number;
};

async function collectLegacySources(): Promise<LegacySource[]> {
  const rows = await prisma.rawItem.groupBy({
    by: ["sourceId"],
    where: { sourceRunId: null },
    _count: { _all: true },
  });

  const sources = await prisma.source.findMany({
    where: { id: { in: rows.map((row) => row.sourceId) } },
    select: { id: true, name: true },
  });
  const names = new Map(sources.map((source) => [source.id, source.name]));

  return rows
    .map((row) => ({
      id: row.sourceId,
      name: names.get(row.sourceId) ?? "<deleted source>",
      rawItemsWithoutSourceRun: row._count._all,
    }))
    .sort((left, right) => right.rawItemsWithoutSourceRun - left.rawItemsWithoutSourceRun);
}

async function main() {
  const sources = await collectLegacySources();
  const total = sources.reduce((sum, source) => sum + source.rawItemsWithoutSourceRun, 0);

  console.log(JSON.stringify({ apply, sources, total }, null, 2));
  if (!apply) {
    console.log(`Dry run only. To apply, run: BACKFILL_CONFIRM=${confirmation} pnpm --filter api backfill:legacy-source-runs -- --apply`);
    return;
  }

  let linked = 0;
  for (const source of sources) {
    const linkedForSource = await prisma.$transaction(async (tx) => {
      const now = new Date();
      const run = await tx.sourceRun.create({
        data: {
          sourceId: source.id,
          runType: "legacy_backfill",
          status: "success",
          startedAt: now,
          finishedAt: now,
          metaJson: {
            kind: "legacy_source_run_backfill",
            note: "Links records created before raw_items.source_run_id existed; this is not a reconstructed collection run.",
          },
        },
      });
      const result = await tx.rawItem.updateMany({
        where: { sourceId: source.id, sourceRunId: null },
        data: { sourceRunId: run.id },
      });
      await tx.sourceRun.update({
        where: { id: run.id },
        data: { itemsFound: result.count, itemsCreated: result.count },
      });
      return result.count;
    });
    linked += linkedForSource;
    console.log(`linked source=${source.id} name=${JSON.stringify(source.name)} rawItems=${linkedForSource}`);
  }

  console.log(JSON.stringify({ ok: true, linked }, null, 2));
}

main()
  .catch((error) => {
    console.error("legacy source-run backfill failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
