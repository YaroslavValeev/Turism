const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const [
    organizersByStatus,
    programsByStatus,
    publishedPrograms,
    pilotFocusPrograms,
    bookingsByStatus,
    bookingsTotal,
    approvedReviews,
    reviewsTotal,
    incidentsTotal,
    commissionsTotal,
  ] = await Promise.all([
    prisma.organizer.groupBy({ by: ['verificationStatus'], _count: { _all: true } }),
    prisma.program.groupBy({ by: ['publishStatus'], _count: { _all: true } }),
    prisma.program.count({ where: { publishStatus: 'published' } }),
    prisma.program.count({ where: { publishStatus: 'published', discipline: 'Wakesurf', region: 'Krasnodar' } }),
    prisma.booking.groupBy({ by: ['bookingStatus'], _count: { _all: true } }),
    prisma.booking.count(),
    prisma.review.count({ where: { moderationStatus: 'approved' } }),
    prisma.review.count(),
    prisma.incident.count(),
    prisma.commission.count(),
  ]);

  const latestBooking = await prisma.booking.findFirst({
    orderBy: { createdAt: 'desc' },
    select: { id: true, bookingStatus: true, createdAt: true, updatedAt: true, sourceChannel: true },
  });

  const latestProgram = await prisma.program.findFirst({
    where: { publishStatus: 'published' },
    orderBy: { createdAt: 'desc' },
    select: { id: true, title: true, discipline: true, region: true, publishStatus: true },
  });

  const nonPilotPublished = await prisma.program.count({
    where: {
      publishStatus: 'published',
      OR: [
        { discipline: { not: 'Wakesurf' } },
        { region: { notIn: ['Krasnodar', 'Dubai', 'Bodrum'] } },
      ],
    },
  });

  const bookings = await prisma.booking.findMany({
    select: {
      id: true,
      bookingStatus: true,
      sourceChannel: true,
      createdAt: true,
      updatedAt: true,
      firstResponseAt: true,
      leadOwner: true,
      program: { select: { id: true, title: true, discipline: true, region: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  const approvedPublicReviewProgramIds = await prisma.review.findMany({
    where: { moderationStatus: 'approved' },
    select: { programId: true },
  });

  console.log(JSON.stringify({
    snapshotAt: new Date().toISOString(),
    organizersByStatus,
    programsByStatus,
    publishedPrograms,
    pilotFocusPrograms,
    nonPilotPublished,
    bookingsTotal,
    bookingsByStatus,
    approvedReviews,
    reviewsTotal,
    incidentsTotal,
    commissionsTotal,
    latestBooking,
    latestProgram,
    bookings,
    approvedPublicReviewProgramIds: approvedPublicReviewProgramIds.map((r) => r.programId),
  }, null, 2));
}

main()
  .catch((e) => {
    console.error('SNAPSHOT_ERR', e.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
