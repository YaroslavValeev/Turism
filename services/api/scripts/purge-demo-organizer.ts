/**
 * Удаляет демо-организатора (по умолчанию displayName = "MyWave Demo Team") и все связанные программы.
 * Соблюдает onDelete: Restrict. Переменная окружения: DEMO_ORGANIZER_DISPLAY_NAME.
 */
import { prisma } from "../src/lib/prisma";

const DEFAULT_DEMO = "MyWave Demo Team";

async function main() {
  const name = (process.env.DEMO_ORGANIZER_DISPLAY_NAME ?? DEFAULT_DEMO).trim();
  const org = await prisma.organizer.findFirst({ where: { displayName: name } });
  if (!org) {
    console.log(JSON.stringify({ ok: true, message: "no_matching_organizer", displayName: name }, null, 2));
    return;
  }

  const programs = await prisma.program.findMany({ where: { organizerId: org.id }, select: { id: true, title: true } });
  const ids = programs.map((p) => p.id);
  if (ids.length === 0) {
    await prisma.organizer.delete({ where: { id: org.id } });
    console.log(JSON.stringify({ ok: true, deletedOrganizerId: org.id, programs: 0 }, null, 2));
    return;
  }

  await prisma.$transaction(async (tx) => {
    await tx.billingStatementLine.deleteMany({ where: { commission: { programId: { in: ids } } } });
    await tx.review.deleteMany({ where: { programId: { in: ids } } });
    await tx.refund.deleteMany({ where: { programId: { in: ids } } });
    await tx.payment.deleteMany({ where: { programId: { in: ids } } });
    await tx.commission.deleteMany({ where: { programId: { in: ids } } });
    await tx.reviewRequest.deleteMany({ where: { programId: { in: ids } } });
    await tx.incident.deleteMany({ where: { programId: { in: ids } } });
    await tx.booking.deleteMany({ where: { programId: { in: ids } } });
    await tx.lead.deleteMany({ where: { programId: { in: ids } } });
    await tx.publishedProgram.deleteMany({ where: { programId: { in: ids } } });
    await tx.program.deleteMany({ where: { id: { in: ids } } });
  });

  await prisma.organizer.delete({ where: { id: org.id } });

  console.log(
    JSON.stringify(
      {
        ok: true,
        deletedOrganizerId: org.id,
        displayName: name,
        deletedProgramCount: ids.length,
        sampleTitles: programs.slice(0, 5).map((p) => p.title),
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
  .finally(async () => {
    await prisma.$disconnect();
  });
