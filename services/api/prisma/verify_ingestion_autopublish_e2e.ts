/**
 * Снимок для верификации autopublish: БД, публичные программы, источники, опциональный прогон autoPublish.
 * Запуск: pnpm --filter api exec tsx prisma/verify_ingestion_autopublish_e2e.ts
 * С прогоном: INGESTION_AUTOPUBLISH_E2E_RUN=1 pnpm --filter api exec tsx prisma/verify_ingestion_autopublish_e2e.ts
 */
import "../src/env/loadProcessEnv";
import { loadEnv } from "@mywave/config";
import { Prisma } from "@prisma/client";
import { prisma } from "../src/lib/prisma";
import { autoPublishReadyCandidates, shouldRunAutoPublishForSource } from "../src/modules/ingestion/service";

function metaObject(meta: Prisma.JsonValue | null | undefined): Record<string, unknown> {
  if (meta && typeof meta === "object" && !Array.isArray(meta)) return meta as Record<string, unknown>;
  return {};
}

function pick<T>(v: T | null | undefined, keys: (keyof T)[]): Partial<T> {
  if (v == null) return {};
  const o: Partial<T> = {};
  for (const k of keys) {
    o[k] = v[k];
  }
  return o;
}

async function main() {
  const env = loadEnv();
  const runProbes = process.env.INGESTION_AUTOPUBLISH_E2E_RUN === "1" || process.env.INGESTION_AUTOPUBLISH_E2E_RUN === "true";

  const [publicPrograms, sourceSample, withOptOut, candidateQueue] = await Promise.all([
    prisma.program.findMany({
      where: { publishStatus: "published" },
      take: 5,
      orderBy: { updatedAt: "desc" },
      include: { media: { take: 1 }, organizer: { select: { id: true, displayName: true, verificationStatus: true } } },
    }),
    prisma.source.findMany({
      where: { isActive: true },
      take: 6,
      orderBy: { priority: "asc" },
    }),
    prisma.source
      .findMany({ where: { isActive: true }, select: { id: true, name: true, metaJson: true } })
      .then((rows) => rows.find((r) => metaObject(r.metaJson).autoPublish === false) ?? null),
    prisma.eventCandidate.count({
      where: {
        status: { in: ["new", "needs_review", "approved"] },
        publishedProgram: null,
        finalScore: { gte: 0.62 },
      },
    }),
  ]);

  const snapshot = {
    env: {
      INGESTION_AUTOPUBLISH_ENABLED: env.INGESTION_AUTOPUBLISH_ENABLED,
    },
    public_programs_count: await prisma.program.count({ where: { publishStatus: "published" } }),
    public_program_sample: publicPrograms.map((p) => ({
      ...pick(p, [
        "id",
        "title",
        "discipline",
        "region",
        "publishStatus",
        "intakeSource",
        "autoPublished",
        "sourceId",
        "sourceType",
        "sourceUrl",
        "ingestedAt",
        "reviewStatus",
        "updatedAt",
        "updatedFromSourceAt",
      ]),
      mediaCount: p.media.length,
    })),
    active_sources: sourceSample.map((s) => ({
      id: s.id,
      name: s.name,
      type: s.type,
      shouldRun: shouldRunAutoPublishForSource(s as never, true),
    })),
    source_with_opt_out_meta: withOptOut,
    autopublish_queue_candidates: candidateQueue,
  };

  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ event: "verify_e2e_snapshot", ...snapshot }, null, 2));

  if (runProbes) {
    const optOutCandidateIds = withOptOut
      ? (
          await prisma.eventCandidate.findMany({
            where: {
              status: { in: ["new", "needs_review", "approved"] },
              publishedProgram: null,
              finalScore: { gte: 0.62 },
              normalizedItem: {
                rawItem: {
                  sourceId: withOptOut.id,
                },
              },
            },
            select: { id: true },
          })
        ).map((c) => c.id)
      : [];

    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify(
        { event: "verify_e2e_start", message: "autoPublishReadyCandidates(…, { autoPublishEnabled: true })" },
        null,
        2,
      ),
    );
    const batch = await autoPublishReadyCandidates("e2e-verify", {
      autoPublishEnabled: true,
      fallbackImageUrl: env.INGESTION_DEFAULT_FALLBACK_IMAGE_URL ?? null,
    });

    const optOutPublishedAfter = optOutCandidateIds.length
      ? await prisma.publishedProgram.count({
          where: {
            candidateId: { in: optOutCandidateIds },
          },
        })
      : 0;

    const assertions = {
      duplicate_merged: {
        observed: batch.duplicateMerged > 0,
        count: batch.duplicateMerged,
        exercised: batch.checked > 0,
      },
      autopublish_skipped_gate: {
        observed: batch.gateSkipped > 0 || batch.autoCreatedGateSkipped > 0,
        count: batch.gateSkipped,
        createPathCount: batch.autoCreatedGateSkipped,
        exercised: batch.checked > 0,
      },
      source_opt_out_not_published: withOptOut
        ? {
            observed: optOutCandidateIds.length > 0 ? optOutPublishedAfter === 0 : false,
            sourceId: withOptOut.id,
            queuedCandidatesChecked: optOutCandidateIds.length,
            publishedAfterRun: optOutPublishedAfter,
            ...(optOutCandidateIds.length === 0
              ? { notApplicable: true, reason: "no queued opt-out candidates in this run window" }
              : {}),
          }
        : {
            observed: false,
            notApplicable: true,
            reason: "active source with metaJson.autoPublish=false not found",
          },
    };

    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ event: "verify_e2e_batch_result", batch }, null, 2));
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ event: "verify_e2e_assertions", assertions }, null, 2));
  }
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
