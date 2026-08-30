import { Prisma } from "@prisma/client";
import { prisma } from "../src/lib/prisma";

const confirmation = "archive-expired-programs-v1";
const apply = process.argv.includes("--apply") && process.env.ARCHIVE_CONFIRM === confirmation;
const reason = "AUTO_ARCHIVED: program endDate is in the past";

type ExpiredProgram = {
  id: string;
  title: string;
  endDate: Date;
  publishStatus: string;
  updatedAt: Date;
  publishedProgram: { id: string; publishStatus: string; candidate: { id: string; status: string } } | null;
};

async function expiredPrograms(now: Date): Promise<ExpiredProgram[]> {
  return prisma.program.findMany({
    where: { publishStatus: "published", endDate: { lt: now } },
    select: {
      id: true,
      title: true,
      endDate: true,
      publishStatus: true,
      updatedAt: true,
      publishedProgram: { select: { id: true, publishStatus: true, candidate: { select: { id: true, status: true } } } },
    },
    orderBy: [{ endDate: "asc" }, { id: "asc" }],
  });
}

async function archiveProgram(program: ExpiredProgram, now: Date) {
  return prisma.$transaction(async (tx) => {
    const changed = await tx.program.updateMany({
      where: { id: program.id, publishStatus: "published", updatedAt: program.updatedAt, endDate: { lt: now } },
      data: { publishStatus: "archived" },
    });
    if (changed.count !== 1) throw new Error(`Concurrent change detected for program ${program.id}`);

    const audit: Prisma.AuditLogCreateManyInput[] = [{
      entityType: "program",
      entityId: program.id,
      changedField: "publish_status_change",
      oldValue: program.publishStatus,
      newValue: "archived",
      changedBy: "system:expired-program-archiver",
      reason,
    }];

    if (program.publishedProgram) {
      await tx.publishedProgram.update({
        where: { id: program.publishedProgram.id },
        data: { publishStatus: "archived", editorNotes: reason },
      });
      audit.push({
        entityType: "published_program",
        entityId: program.publishedProgram.id,
        changedField: "publish_status_change",
        oldValue: program.publishedProgram.publishStatus,
        newValue: "archived",
        changedBy: "system:expired-program-archiver",
        reason,
      });
      if (program.publishedProgram.candidate.status !== "archived") {
        await tx.eventCandidate.update({
          where: { id: program.publishedProgram.candidate.id },
          data: { status: "archived", reviewedBy: "system:expired-program-archiver", reviewedAt: now, decisionNotes: reason },
        });
        audit.push({
          entityType: "event_candidate",
          entityId: program.publishedProgram.candidate.id,
          changedField: "publish_status_change",
          oldValue: program.publishedProgram.candidate.status,
          newValue: "archived",
          changedBy: "system:expired-program-archiver",
          reason,
        });
      }
    }
    await tx.auditLog.createMany({ data: audit });
    return audit.length;
  });
}

async function main() {
  const now = new Date();
  const programs = await expiredPrograms(now);
  console.log(JSON.stringify({
    apply,
    cutoff: now.toISOString(),
    matched: programs.map((program) => ({ id: program.id, title: program.title, endDate: program.endDate.toISOString() })),
  }, null, 2));
  if (!apply) {
    console.log(`Dry run only. To apply, run: ARCHIVE_CONFIRM=${confirmation} pnpm --filter api archive:expired-programs -- --apply`);
    return;
  }

  let auditEntriesCreated = 0;
  for (const program of programs) auditEntriesCreated += await archiveProgram(program, now);
  console.log(JSON.stringify({ ok: true, archivedPrograms: programs.length, auditEntriesCreated }, null, 2));
}

main()
  .catch((error) => {
    console.error("expired program archive failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
