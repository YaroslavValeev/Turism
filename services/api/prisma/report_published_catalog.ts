/**
 * Отчёт по опубликованным программам и дублям sourceUrl после цикла.
 * pnpm --filter api exec tsx prisma/report_published_catalog.ts
 */
import "../src/env/loadProcessEnv";
import { Prisma } from "@prisma/client";
import { prisma } from "../src/lib/prisma";

function metaObject(meta: Prisma.JsonValue | null | undefined): Record<string, unknown> {
  if (meta && typeof meta === "object" && !Array.isArray(meta)) return meta as Record<string, unknown>;
  return {};
}

async function main() {
  const published = await prisma.program.findMany({
    where: { publishStatus: "published" },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      title: true,
      sourceType: true,
      sourceId: true,
      sourceUrl: true,
      autoPublished: true,
      reviewStatus: true,
      updatedAt: true,
      updatedFromSourceAt: true,
      ingestedAt: true,
    },
  });

  const byUrl = new Map<string, string[]>();
  for (const p of published) {
    const u = (p.sourceUrl ?? "").trim();
    if (!u) continue;
    const list = byUrl.get(u) ?? [];
    list.push(p.id);
    byUrl.set(u, list);
  }
  const duplicateUrls = [...byUrl.entries()].filter(([, ids]) => ids.length > 1);

  const optOutSources = await prisma.source.findMany({
    where: { isActive: true },
    select: { id: true, name: true, metaJson: true },
  });
  const optedOut = optOutSources.filter((s) => metaObject(s.metaJson).autoPublish === false);

  const failedRuns = await prisma.sourceRun.count({ where: { status: "failed" } });
  const failedLastBatch = await prisma.sourceRun.findMany({
    where: { status: "failed" },
    take: 10,
    orderBy: { startedAt: "desc" },
    select: { id: true, sourceId: true, runType: true, errorMessage: true, startedAt: true },
  });

  const queueHint = await prisma.eventCandidate.count({
    where: {
      status: { in: ["new", "needs_review", "approved"] },
      publishedProgram: null,
      finalScore: { gte: 0.62 },
    },
  });

  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify(
      {
        event: "report_published_catalog",
        counts: {
          publishedTotal: published.length,
          autoPublished: published.filter((p) => p.autoPublished).length,
          duplicateSourceUrlGroups: duplicateUrls.length,
        },
        optOutSources: optedOut.map((s) => ({ id: s.id, name: s.name })),
        autopublishQueueCandidates_ge_0_62_unpublished: queueHint,
        sourceRunsFailed_total: failedRuns,
        sourceRunsFailed_sample: failedLastBatch,
        published,
        duplicateSourceUrlDetails: duplicateUrls.map(([url, ids]) => ({ sourceUrl: url, programIds: ids })),
      },
      null,
      2,
    ),
  );
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
