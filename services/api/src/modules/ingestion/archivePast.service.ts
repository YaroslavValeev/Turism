/**
 * Архивация просроченных по датам кандидатов и программ.
 * endDate < сегодня (начало суток UTC/сервер) → archived.
 */
import { prisma } from "../../lib/prisma";
import { writeAuditLog } from "../../lib/audit";

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export type ArchivePastResult = {
  candidatesArchived: number;
  programsArchived: number;
};

export async function archivePastByDates(actorId: string | null): Promise<ArchivePastResult> {
  const today = startOfToday();
  let candidatesArchived = 0;
  let programsArchived = 0;

  // Пачками, пока есть прошедшие (раньше take:2000 мог не дочистить).
  for (let round = 0; round < 20; round += 1) {
    const pastCandidates = await prisma.eventCandidate.findMany({
      where: {
        status: { notIn: ["archived", "rejected"] },
        normalizedItem: {
          OR: [
            { endDate: { lt: today } },
            {
              AND: [{ endDate: null }, { startDate: { lt: today } }],
            },
          ],
        },
      },
      select: { id: true, status: true },
      take: 500,
    });
    if (pastCandidates.length === 0) break;

    for (const c of pastCandidates) {
      await prisma.eventCandidate.update({
        where: { id: c.id },
        data: {
          status: "archived",
          reviewedBy: actorId ?? undefined,
          reviewedAt: new Date(),
          decisionNotes: "auto-archive: past end/start date",
        },
      });
      await writeAuditLog({
        entityType: "event_candidate",
        entityId: c.id,
        changedField: "status",
        oldValue: c.status,
        newValue: "archived",
        changedBy: actorId,
        reason: "past dates → archived",
      });
      candidatesArchived += 1;
    }
  }

  for (let round = 0; round < 20; round += 1) {
    const pastPrograms = await prisma.program.findMany({
      where: {
        publishStatus: { not: "archived" },
        endDate: { lt: today },
      },
      select: { id: true, publishStatus: true },
      take: 500,
    });
    if (pastPrograms.length === 0) break;

    for (const p of pastPrograms) {
      await prisma.program.update({
        where: { id: p.id },
        data: { publishStatus: "archived" },
      });
      await writeAuditLog({
        entityType: "program",
        entityId: p.id,
        changedField: "publish_status_change",
        oldValue: p.publishStatus,
        newValue: "archived",
        changedBy: actorId,
        reason: "past endDate → archived",
      });
      programsArchived += 1;
    }
  }

  return { candidatesArchived, programsArchived };
}

export function isPastByDates(startDate: Date | null | undefined, endDate: Date | null | undefined): boolean {
  const today = startOfToday();
  if (endDate && endDate < today) return true;
  if (!endDate && startDate && startDate < today) return true;
  return false;
}
