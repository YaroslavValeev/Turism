import { prisma } from "../../lib/prisma";

export type TraceAudit = {
  rawItemsTotal: number;
  rawItemsWithoutSourceRun: number;
  normalizedItemsTotal: number;
  eventCandidatesTotal: number;
  publishedProgramsTotal: number;
  publishedProgramsWithoutFullTrace: number;
};

export function strictEnabled(value = process.env.INGESTION_TRACE_AUDIT_STRICT): boolean {
  return /^(1|true|yes|on)$/i.test(value ?? "");
}

export function traceAuditFailsStrict(audit: Pick<TraceAudit, "publishedProgramsWithoutFullTrace">): boolean {
  return audit.publishedProgramsWithoutFullTrace > 0;
}

export async function collectTraceAudit(): Promise<TraceAudit> {
  const [
    rawItemsTotal,
    rawItemsWithoutSourceRun,
    normalizedItemsTotal,
    eventCandidatesTotal,
    publishedProgramsTotal,
    publishedProgramsWithoutFullTrace,
  ] = await Promise.all([
    prisma.rawItem.count(),
    prisma.rawItem.count({ where: { sourceRunId: null } }),
    prisma.normalizedItem.count(),
    prisma.eventCandidate.count(),
    prisma.publishedProgram.count(),
    prisma.publishedProgram.count({
      where: {
        candidate: {
          normalizedItem: {
            rawItem: {
              sourceRunId: null,
            },
          },
        },
      },
    }),
  ]);

  return {
    rawItemsTotal,
    rawItemsWithoutSourceRun,
    normalizedItemsTotal,
    eventCandidatesTotal,
    publishedProgramsTotal,
    publishedProgramsWithoutFullTrace,
  };
}
