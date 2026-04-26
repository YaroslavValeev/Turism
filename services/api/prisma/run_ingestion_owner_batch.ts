/**
 * Запуск collect → normalize → dedup только для источников из source_imports_owner_2026-04-16.json
 * (по совпадению type + urlOrHandle). Не трогает остальные активные источники.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import "../src/env/loadProcessEnv";
import { loadEnv } from "@mywave/config";
import { prisma } from "../src/lib/prisma";
import {
  runDedupJob,
  runIngestionJob,
  runNormalizationJob,
  autoPublishReadyCandidates,
} from "../src/modules/ingestion/service";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const env = loadEnv();

async function main() {
  const jsonPath = path.join(__dirname, "source_imports_owner_2026-04-16.json");
  const payload = JSON.parse(fs.readFileSync(jsonPath, "utf8")) as Array<{ type: string; urlOrHandle: string }>;
  const ids: string[] = [];
  for (const row of payload) {
    const s = await prisma.source.findFirst({
      where: { type: row.type, urlOrHandle: row.urlOrHandle.trim() },
      select: { id: true },
    });
    if (s) ids.push(s.id);
    else console.warn("Source not in DB:", row.type, row.urlOrHandle);
  }
  if (!ids.length) {
    console.log(JSON.stringify({ error: "no_matching_sources", hint: "pnpm run ingest:import-owner-sources" }, null, 2));
    return;
  }

  const collect = await runIngestionJob("system", ids);
  const normalize = await runNormalizationJob("system", ids);
  const dedup = await runDedupJob("system", ids);
  const autoPublish = await autoPublishReadyCandidates("system", {
    autoPublishEnabled: env.INGESTION_AUTOPUBLISH_ENABLED,
    fallbackImageUrl: env.INGESTION_DEFAULT_FALLBACK_IMAGE_URL ?? null,
  });

  console.log(JSON.stringify({ sourceIds: ids, collect, normalize, dedup, autoPublish }, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
