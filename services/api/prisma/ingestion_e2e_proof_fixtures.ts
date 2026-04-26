/**
 * Детерминированные proof-fixtures для Sprint 2.1: duplicate merge, gate skip, source opt-out.
 * Запуск: pnpm --filter api exec tsx prisma/ingestion_e2e_proof_fixtures.ts
 *
 * Режимы: MODE=duplicate|gate|optout|all (по умолчанию all)
 * Gate-ветка: INGESTION_E2E_FORCE_GATE=1 (только non-production, см. canPublishAutopilot)
 * Клинап: E2E_CLEANUP=0 чтобы оставить строки в БД
 */
import { createHash } from "crypto";
import type { Prisma } from "@prisma/client";
import "../src/env/loadProcessEnv";
import { prisma } from "../src/lib/prisma";
import { autoPublishReadyCandidates, publishCandidateToDraft } from "../src/modules/ingestion/service";

const TITL = "E2E proof program merge title alpha";
const DATES = { start: new Date("2030-06-15T00:00:00.000Z"), end: new Date("2030-06-20T00:00:00.000Z") };

const scoreBundle = {
  finalScore: 0.7,
  tourismFitScore: 0.32,
  trustScore: 0.5,
  fitScore: 0.5,
  futureEventScore: 0.5,
  eventLikelihoodScore: 0.5,
  completenessScore: 0.5,
  sourceTrustScore: 0.5,
  reviewPriority: 0,
} as const;

function exJson(): Prisma.InputJsonValue {
  return { hasExplicitDateSignal: true } as Prisma.InputJsonValue;
}

async function createCoreRows(runId: string, meta: Prisma.InputJsonValue) {
  const org = await prisma.organizer.create({
    data: {
      displayName: `E2E Proof ${runId}`,
      legalStatus: null,
      contactEmail: `e2e-proof+${runId}@mywave.local`,
      contactPhone: null,
      verificationStatus: "listed",
    },
  });
  const source = await prisma.source.create({
    data: {
      type: "site",
      name: `e2e-proof-source-${runId}`,
      urlOrHandle: "https://example.com/e2e",
      discipline: "Wakesurf",
      country: "Russia",
      region: "Krasnodar",
      language: "ru",
      priority: 1,
      trustScore: 0.7,
      isActive: true,
      organizerId: org.id,
      metaJson: meta,
    },
  });
  return { org, source } as const;
}

async function createRowNormCand(
  sourceId: string,
  runId: string,
  slice: "a" | "b" | "c",
  start: Date,
  end: Date,
) {
  const contentHash = createHash("sha256")
    .update(`e2e-${runId}-${slice}`)
    .digest("hex");
  const raw = await prisma.rawItem.create({
    data: {
      sourceId,
      sourceType: "site",
      sourceUrl: `https://example.com/e2e/${runId}/${slice}.html`,
      contentHash,
      externalItemId: `e2e-ext-${runId}-${slice}`,
      publishedAt: new Date(),
      rawTitle: TITL,
      rawText:
        "Wakesurf camp program in Krasnodar, June 2030, schedule and program format for e2e proof. Training camp and coaching.",
    },
  });
  const norm = await prisma.normalizedItem.create({
    data: {
      rawItemId: raw.id,
      parseVersion: "e2e_fixture_v1",
      eventType: "camp",
      discipline: "Wakesurf",
      title: TITL,
      descriptionShort: "Wakesurf program in Krasnodar — e2e short.",
      descriptionFull: "Wakesurf camp in Krasnodar region, June 2030, full program text for eligibility.",
      country: "Russia",
      region: "Krasnodar",
      city: "Krasnodar",
      startDate: start,
      endDate: end,
      durationDays: 5,
      level: "intermediate",
      extractedJson: exJson(),
    },
  });
  const ec = await prisma.eventCandidate.create({
    data: {
      normalizedItemId: norm.id,
      status: "new",
      ...scoreBundle,
      duplicateScore: 0,
    },
  });
  return { raw, norm, ec, candidateId: ec.id } as const;
}

async function runDuplicate(runId: string) {
  const { org, source } = await createCoreRows(runId, { autoPublish: true } as Prisma.InputJsonValue);
  const a = await createRowNormCand(source.id, runId, "a", DATES.start, DATES.end);
  const b = await createRowNormCand(source.id, runId, "b", DATES.start, DATES.end);

  delete process.env.INGESTION_E2E_FORCE_GATE;

  const r1 = await publishCandidateToDraft(a.candidateId, "e2e-proof", "phase1", { autoPublishEnabled: false });
  const r2 = await publishCandidateToDraft(b.candidateId, "e2e-proof", "phase2", { autoPublishEnabled: true });

  const out = {
    event: "e2e_proof_duplicate_merged",
    runId,
    r1_published: r1,
    r2: {
      duplicateSkipped: r2.duplicateSkipped,
      path: r2.autopilot?.path,
      programPublishStatus: r2.autopilot?.programPublishStatus,
    },
    assertions: {
      duplicate_merged: {
        observed: Boolean(r2.duplicateSkipped && r2.autopilot?.path === "duplicate_merge"),
      },
    },
  };

  if (process.env.E2E_CLEANUP !== "0") {
    const pp = await prisma.publishedProgram.findFirst({ where: { candidateId: a.candidateId } });
    if (pp) {
      await prisma.publishedProgram.delete({ where: { id: pp.id } });
    }
    await prisma.program.deleteMany({ where: { id: r1.programId } }).catch(() => {});
    await prisma.eventCandidate.deleteMany({ where: { id: { in: [a.candidateId, b.candidateId] } } });
    await prisma.normalizedItem.deleteMany({ where: { id: { in: [a.norm.id, b.norm.id] } } });
    await prisma.rawItem.deleteMany({ where: { id: { in: [a.raw.id, b.raw.id] } } });
    await prisma.source.delete({ where: { id: source.id } });
    await prisma.organizer.delete({ where: { id: org.id } });
  }

  return out;
}

async function runGate(runId: string) {
  process.env.INGESTION_E2E_FORCE_GATE = "1";
  const { org, source } = await createCoreRows(runId, { autoPublish: true } as Prisma.InputJsonValue);
  const a = await createRowNormCand(source.id, runId, "a", DATES.start, DATES.end);

  const r1 = await publishCandidateToDraft(a.candidateId, "e2e-proof", "gate", { autoPublishEnabled: true });

  delete process.env.INGESTION_E2E_FORCE_GATE;

  const out = {
    event: "e2e_proof_gate_skipped",
    runId,
    r1: {
      autopilot: r1.autopilot,
      programPublishStatus: r1.autopilot?.programPublishStatus,
      gate: r1.autopilot?.gate,
      missing: (r1 as { autopilot?: { gateMissing?: string[] } }).autopilot?.gateMissing,
    },
    assertions: {
      autopublish_skipped_gate: {
        observed: r1.autopilot?.gate === "failed",
        missingField: (r1 as { autopilot?: { gateMissing?: string[] } }).autopilot?.gateMissing,
      },
    },
  };

  if (process.env.E2E_CLEANUP !== "0") {
    const pp = await prisma.publishedProgram.findFirst({ where: { candidateId: a.candidateId } });
    if (pp) await prisma.publishedProgram.delete({ where: { id: pp.id } });
    await prisma.program.deleteMany({ where: { id: r1.programId } });
    await prisma.eventCandidate.delete({ where: { id: a.candidateId } });
    await prisma.normalizedItem.delete({ where: { id: a.norm.id } });
    await prisma.rawItem.delete({ where: { id: a.raw.id } });
    await prisma.source.delete({ where: { id: source.id } });
    await prisma.organizer.delete({ where: { id: org.id } });
  }

  return out;
}

async function runOptOut(runId: string) {
  delete process.env.INGESTION_E2E_FORCE_GATE;
  const { org, source } = await createCoreRows(runId, { autoPublish: false } as Prisma.InputJsonValue);
  const a = await createRowNormCand(source.id, runId, "a", DATES.start, DATES.end);

  const before = await prisma.publishedProgram.findMany({ where: { candidateId: a.candidateId } });
  const batch = await autoPublishReadyCandidates("e2e-proof", { autoPublishEnabled: true });
  const after = await prisma.publishedProgram.findMany({ where: { candidateId: a.candidateId } });

  const out = {
    event: "e2e_proof_source_opt_out",
    runId,
    sourceId: source.id,
    candidateId: a.candidateId,
    batch: {
      checked: batch.checked,
      sourceOptOut: batch.sourceOptOut,
      published: batch.published,
    },
    assertions: {
      source_opt_out_not_published: {
        observed: after.length === 0 && before.length === 0,
        expectedBatchSourceOptOutAtLeast: 1,
        ourCandidateStillUnpublished: after.length === 0,
        queued: true,
      },
    },
  };

  if (process.env.E2E_CLEANUP !== "0") {
    await prisma.eventCandidate.delete({ where: { id: a.candidateId } });
    await prisma.normalizedItem.delete({ where: { id: a.norm.id } });
    await prisma.rawItem.delete({ where: { id: a.raw.id } });
    await prisma.source.delete({ where: { id: source.id } });
    await prisma.organizer.delete({ where: { id: org.id } });
  }

  return out;
}

async function main() {
  const mode = (process.env.MODE || "all").toLowerCase();
  const runBase = `proof-${Date.now()}`;

  const inProd = process.env.NODE_ENV === "production";
  if (inProd && mode === "gate") {
    // eslint-disable-next-line no-console
    console.error("Refusing MODE=gate in NODE_ENV=production (set staging/dev DB).");
    process.exit(1);
  }

  if (mode === "duplicate" || mode === "all") {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(await runDuplicate(`${runBase}-dup`), null, 2));
  }
  if (mode === "gate" || (mode === "all" && !inProd)) {
    process.env.INGESTION_E2E_FORCE_GATE = "1";
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(await runGate(`${runBase}-gate`), null, 2));
    delete process.env.INGESTION_E2E_FORCE_GATE;
  } else if (mode === "all" && inProd) {
    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify({
        event: "e2e_proof_skipped",
        reason: "gate fixture skipped in NODE_ENV=production (run MODE=gate on staging or duplicate/optout separately)",
      }),
    );
  }
  if (mode === "optout" || mode === "all") {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(await runOptOut(`${runBase}-out`), null, 2));
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
