import "../src/env/loadProcessEnv";
import { prisma } from "../src/lib/prisma";
import {
  autoPublishReadyCandidates,
  runDedupJob,
  runIngestionJob,
  runNormalizationJob,
} from "../src/modules/ingestion/service";
import { loadEnv } from "@mywave/config";

const URLS = [
  "https://www.instagram.com/youngstarsnow",
  "https://www.instagram.com/reel/DXhZtUKCKto",
  "https://www.instagram.com/skate_pitochnaya",
];

const env = loadEnv();

async function main() {
  const sources = await prisma.source.findMany({
    where: { urlOrHandle: { in: URLS }, isActive: true },
    select: { id: true, name: true, urlOrHandle: true },
    orderBy: { createdAt: "asc" },
  });
  if (sources.length === 0) {
    console.log(JSON.stringify({ error: "no_sources", urls: URLS }, null, 2));
    return;
  }
  const sourceIds = sources.map((s) => s.id);
  const autoPublish = process.argv.includes("--no-auto-publish")
    ? false
    : process.argv.includes("--auto-publish")
      ? true
      : env.INGESTION_AUTOPUBLISH_ENABLED;

  const collect = await runIngestionJob("system", sourceIds);
  const normalize = await runNormalizationJob("system", sourceIds);
  const dedup = await runDedupJob("system", sourceIds);
  const autoPublishResult = await autoPublishReadyCandidates("system", {
    autoPublishEnabled: autoPublish,
    fallbackImageUrl: null,
  });

  console.log(
    JSON.stringify(
      {
        sources: sources,
        sourceIds,
        autoPublishFlag: autoPublish,
        collect,
        normalize,
        dedup,
        autoPublishResult,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
