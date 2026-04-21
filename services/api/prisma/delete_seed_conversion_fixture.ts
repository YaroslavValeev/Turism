/**
 * Удаляет программу-сид "[seed] E2E conversion draft fixture" и связанные строки.
 * Запуск: pnpm --filter api exec tsx prisma/delete_seed_conversion_fixture.ts
 */
import { PrismaClient } from "@prisma/client";

const FIXTURE_TITLE = "[seed] E2E conversion draft fixture";

const prisma = new PrismaClient();

async function main() {
  const program = await prisma.program.findFirst({
    where: { title: FIXTURE_TITLE },
    select: { id: true, organizerId: true },
  });
  if (!program) {
    console.log("Fixture program not found, nothing to delete.");
    return;
  }

  await prisma.$transaction(async (tx) => {
    await tx.publishedProgram.deleteMany({ where: { programId: program.id } });

    const bookings = await tx.booking.findMany({
      where: { programId: program.id },
      select: { id: true },
    });
    const bookingIds = bookings.map((b) => b.id);
    for (const bid of bookingIds) {
      await tx.review.deleteMany({ where: { bookingId: bid } });
      await tx.reviewRequest.deleteMany({ where: { bookingId: bid } });
      await tx.programUgcRequest.deleteMany({ where: { bookingId: bid } });
      await tx.commission.deleteMany({ where: { bookingId: bid } });
      await tx.payment.deleteMany({ where: { bookingId: bid } });
      await tx.refund.deleteMany({ where: { bookingId: bid } });
      await tx.incident.deleteMany({ where: { bookingId: bid } });
    }
    await tx.refund.deleteMany({ where: { programId: program.id } });
    await tx.booking.deleteMany({ where: { programId: program.id } });

    await tx.lead.deleteMany({ where: { programId: program.id } });
    await tx.programUgc.deleteMany({ where: { programId: program.id } });
    await tx.programScoreSnapshot.deleteMany({ where: { programId: program.id } });
    await tx.analyticsEvent.deleteMany({ where: { programId: program.id } });

    await tx.program.delete({ where: { id: program.id } });

    const otherPrograms = await tx.program.count({
      where: { organizerId: program.organizerId },
    });
    if (otherPrograms === 0) {
      await tx.organizer.delete({ where: { id: program.organizerId } });
      console.log("Removed fixture organizer (no other programs).");
    }
  });

  console.log("Removed fixture program:", FIXTURE_TITLE);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
