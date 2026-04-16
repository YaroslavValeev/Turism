import { prisma } from "../src/lib/prisma";
import {
  autoPublishReadyCandidates,
  runDedupJob,
  runIngestionJob,
  runNormalizationJob,
} from "../src/modules/ingestion/service";

function readFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

function readOption(name: string): string | undefined {
  const index = process.argv.findIndex((arg) => arg === name);
  if (index === -1) return undefined;
  return process.argv[index + 1];
}

async function main() {
  const sourceType = readOption("--type");
  const singleSourceId = readOption("--source-id");
  const autoPublish = readFlag("--auto-publish");
  const fallbackImageUrl = readOption("--fallback-image-url") ?? null;

  const sources = await prisma.source.findMany({
    where: {
      isActive: true,
      id: singleSourceId ?? undefined,
      type: sourceType ?? undefined,
    },
    select: { id: true, type: true, name: true, urlOrHandle: true },
    orderBy: [{ priority: "asc" }, { updatedAt: "desc" }],
  });

  const sourceIds = sources.map((source) => source.id);
  if (!sourceIds.length) {
    console.log(JSON.stringify({ sources: 0, message: "No matching active sources" }, null, 2));
    return;
  }

  const collect = await runIngestionJob("system", sourceIds);
  const normalize = await runNormalizationJob("system", sourceIds);
  const dedup = await runDedupJob("system", sourceIds);
  const autoPublishResult = await autoPublishReadyCandidates("system", {
    autoPublishEnabled: autoPublish,
    fallbackImageUrl,
  });

  console.log(
    JSON.stringify(
      {
        sources: sources.length,
        sourceType: sourceType ?? null,
        sourceIds,
        collect,
        normalize,
        dedup,
        autoPublish: autoPublishResult,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
