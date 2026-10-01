import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { rollWindowForward } from "./onRequestSchedule";

const reason = "AUTO_ARCHIVED: program endDate is in the past";
const actor = "system:expired-program-archiver";

function startOfUtcDay(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

export type ExpiredPublishedProgram = {
  id: string;
  title: string;
  endDate: Date;
  publishStatus: string;
  updatedAt: Date;
  publishedPrograms: { id: string; publishStatus: string; candidate: { id: string; status: string } }[];
};

export async function findExpiredPublishedPrograms(now = new Date()): Promise<ExpiredPublishedProgram[]> {
  const cutoff = startOfUtcDay(now);
  return prisma.program.findMany({
    where: { publishStatus: "published", scheduleType: { not: "on_request" }, endDate: { lt: cutoff } },
    select: {
      id: true,
      title: true,
      endDate: true,
      publishStatus: true,
      updatedAt: true,
      publishedPrograms: { select: { id: true, publishStatus: true, candidate: { select: { id: true, status: true } } } },
    },
    orderBy: [{ endDate: "asc" }, { id: "asc" }],
  });
}

async function archiveOne(program: ExpiredPublishedProgram, now: Date): Promise<number> {
  const cutoff = startOfUtcDay(now);
  return prisma.$transaction(async (tx) => {
    if (program.publishedPrograms.length > 1) throw new Error(`Program ${program.id} has more than one publication link`);
    const link = program.publishedPrograms[0] ?? null;
    const changed = await tx.program.updateMany({
      where: { id: program.id, publishStatus: "published", updatedAt: program.updatedAt, endDate: { lt: cutoff } },
      data: { publishStatus: "archived" },
    });
    if (changed.count !== 1) throw new Error(`Concurrent change detected for program ${program.id}`);

    const audit: Prisma.AuditLogCreateManyInput[] = [{
      entityType: "program", entityId: program.id, changedField: "publish_status_change",
      oldValue: program.publishStatus, newValue: "archived", changedBy: actor, reason,
    }];
    if (link) {
      await tx.publishedProgram.update({ where: { id: link.id }, data: { publishStatus: "archived", editorNotes: reason } });
      audit.push({
        entityType: "published_program", entityId: link.id, changedField: "publish_status_change",
        oldValue: link.publishStatus, newValue: "archived", changedBy: actor, reason,
      });
      if (link.candidate.status !== "archived") {
        await tx.eventCandidate.update({
          where: { id: link.candidate.id },
          data: { status: "archived", reviewedBy: actor, reviewedAt: now, decisionNotes: reason },
        });
        audit.push({
          entityType: "event_candidate", entityId: link.candidate.id, changedField: "publish_status_change",
          oldValue: link.candidate.status, newValue: "archived", changedBy: actor, reason,
        });
      }
    }
    await tx.auditLog.createMany({ data: audit });
    return audit.length;
  });
}

/** Тур по запросу не заканчивается: окно прошедшего сезона переносится на следующий год. */
export async function rollOnRequestWindows(now = new Date()): Promise<number> {
  const cutoff = startOfUtcDay(now);
  const programs = await prisma.program.findMany({
    where: { scheduleType: "on_request", publishStatus: { not: "archived" }, endDate: { lt: cutoff } },
    select: { id: true, startDate: true, endDate: true },
  });
  let rolled = 0;
  for (const program of programs) {
    const next = rollWindowForward(program.startDate, program.endDate, now);
    if (!next) continue;
    await prisma.$transaction([
      prisma.program.update({ where: { id: program.id }, data: next }),
      prisma.auditLog.create({
        data: {
          entityType: "program",
          entityId: program.id,
          changedField: "season_window",
          oldValue: `${program.startDate.toISOString()}..${program.endDate.toISOString()}`,
          newValue: `${next.startDate.toISOString()}..${next.endDate.toISOString()}`,
          changedBy: actor,
          reason: "on_request season window rolled forward",
        },
      }),
    ]);
    rolled += 1;
  }
  return rolled;
}

/** Canonical lifecycle transition for every completed public program. */
export async function archiveExpiredPublishedPrograms(now = new Date()) {
  const rolledWindows = await rollOnRequestWindows(now);
  const programs = await findExpiredPublishedPrograms(now);
  let auditEntriesCreated = 0;
  for (const program of programs) auditEntriesCreated += await archiveOne(program, now);
  return { archivedPrograms: programs.length, auditEntriesCreated, rolledWindows };
}
