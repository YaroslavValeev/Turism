import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const VIRTUAL_ORGANIZER_BASES = [
  "WaveLine Krasnodar",
  "SouthCrew Wakesurf",
  "Kuban Wake Camp",
] as const;

const PROGRAM_MEDIA_BY_BASE: Record<string, string> = {
  "WaveLine Weekend Progress Camp": "/media/filmstrip/wakesurf/wasurf_1.jpg",
  "SouthCrew Technique Reset": "/media/filmstrip/wakesurf/wasurf_2.jpg",
  "Kuban Wake Family Days": "/media/filmstrip/wakesurf/wasurf_3.jpg",
};

function baseName(value: string): string {
  return value.replace(/\s+BR-\d+$/, "").trim();
}

function daysFromNow(days: number): Date {
  const value = new Date();
  value.setHours(10, 0, 0, 0);
  value.setDate(value.getDate() + days);
  return value;
}

async function deleteAuditLogs(entityType: string, ids: string[]) {
  if (!ids.length) return;
  await prisma.auditLog.deleteMany({
    where: {
      entityType,
      entityId: { in: ids },
    },
  });
}

async function main() {
  const organizers = await prisma.organizer.findMany({
    include: {
      programs: {
        include: {
          media: true,
          bookings: {
            include: {
              reviews: true,
              incidents: true,
              commissions: true,
            },
          },
          reviews: true,
          incidents: true,
          commissions: true,
        },
      },
      bookings: {
        include: {
          reviews: true,
          incidents: true,
          commissions: true,
        },
      },
      verificationEvidence: true,
      incidents: true,
      reviews: true,
      commissions: true,
    },
    orderBy: { createdAt: "desc" },
  });

  const keepOrganizerIds = new Set<string>();

  for (const base of VIRTUAL_ORGANIZER_BASES) {
    const candidate = organizers.find((organizer) => baseName(organizer.displayName) === base);
    if (candidate) keepOrganizerIds.add(candidate.id);
  }

  const organizersToDelete = organizers.filter((organizer) => {
    const isBaseVirtual = VIRTUAL_ORGANIZER_BASES.includes(baseName(organizer.displayName) as (typeof VIRTUAL_ORGANIZER_BASES)[number]);
    const isE2E = organizer.displayName === "E2E Pilot Org";
    return (isBaseVirtual && !keepOrganizerIds.has(organizer.id)) || isE2E;
  });

  const deleteOrganizerIds = organizersToDelete.map((organizer) => organizer.id);
  const deleteProgramIds = organizersToDelete.flatMap((organizer) => organizer.programs.map((program) => program.id));
  const deleteMediaIds = organizersToDelete.flatMap((organizer) => organizer.programs.flatMap((program) => program.media.map((media) => media.id)));
  const deleteBookingIds = organizersToDelete.flatMap((organizer) => organizer.bookings.map((booking) => booking.id));
  const deleteReviewIds = organizersToDelete.flatMap((organizer) => [
    ...organizer.reviews.map((review) => review.id),
    ...organizer.bookings.flatMap((booking) => booking.reviews.map((review) => review.id)),
    ...organizer.programs.flatMap((program) => program.reviews.map((review) => review.id)),
  ]);
  const deleteIncidentIds = organizersToDelete.flatMap((organizer) => [
    ...organizer.incidents.map((incident) => incident.id),
    ...organizer.bookings.flatMap((booking) => booking.incidents.map((incident) => incident.id)),
    ...organizer.programs.flatMap((program) => program.incidents.map((incident) => incident.id)),
  ]);
  const deleteCommissionIds = organizersToDelete.flatMap((organizer) => [
    ...organizer.commissions.map((commission) => commission.id),
    ...organizer.bookings.flatMap((booking) => booking.commissions.map((commission) => commission.id)),
    ...organizer.programs.flatMap((program) => program.commissions.map((commission) => commission.id)),
  ]);
  const deleteEvidenceIds = organizersToDelete.flatMap((organizer) => organizer.verificationEvidence.map((evidence) => evidence.id));

  await prisma.$transaction(async (tx) => {
    if (deleteReviewIds.length) {
      await tx.review.deleteMany({ where: { id: { in: deleteReviewIds } } });
    }
    if (deleteIncidentIds.length) {
      await tx.incident.deleteMany({ where: { id: { in: deleteIncidentIds } } });
    }
    if (deleteCommissionIds.length) {
      await tx.commission.deleteMany({ where: { id: { in: deleteCommissionIds } } });
    }
    if (deleteMediaIds.length) {
      await tx.programMedia.deleteMany({ where: { id: { in: deleteMediaIds } } });
    }
    if (deleteEvidenceIds.length) {
      await tx.organizerVerificationEvidence.deleteMany({ where: { id: { in: deleteEvidenceIds } } });
    }
    if (deleteBookingIds.length) {
      await tx.booking.deleteMany({ where: { id: { in: deleteBookingIds } } });
    }
    if (deleteProgramIds.length) {
      await tx.program.deleteMany({ where: { id: { in: deleteProgramIds } } });
    }
    if (deleteOrganizerIds.length) {
      await tx.organizer.deleteMany({ where: { id: { in: deleteOrganizerIds } } });
    }
  });

  await deleteAuditLogs("review", deleteReviewIds);
  await deleteAuditLogs("incident", deleteIncidentIds);
  await deleteAuditLogs("commission", deleteCommissionIds);
  await deleteAuditLogs("program_media", deleteMediaIds);
  await deleteAuditLogs("booking", deleteBookingIds);
  await deleteAuditLogs("program", deleteProgramIds);
  await deleteAuditLogs("organizer", deleteOrganizerIds);
  await deleteAuditLogs("organizer_verification_evidence", deleteEvidenceIds);

  const staleBrowserBookings = await prisma.booking.findMany({
    where: {
      guestContact: { startsWith: "browser.demo+guest@" },
    },
    include: {
      reviews: true,
      incidents: true,
      commissions: true,
    },
  });

  const staleBrowserBookingIds = staleBrowserBookings.map((booking) => booking.id);
  const staleBrowserReviewIds = staleBrowserBookings.flatMap((booking) => booking.reviews.map((review) => review.id));
  const staleBrowserIncidentIds = staleBrowserBookings.flatMap((booking) => booking.incidents.map((incident) => incident.id));
  const staleBrowserCommissionIds = staleBrowserBookings.flatMap((booking) => booking.commissions.map((commission) => commission.id));

  await prisma.$transaction(async (tx) => {
    if (staleBrowserReviewIds.length) await tx.review.deleteMany({ where: { id: { in: staleBrowserReviewIds } } });
    if (staleBrowserIncidentIds.length) await tx.incident.deleteMany({ where: { id: { in: staleBrowserIncidentIds } } });
    if (staleBrowserCommissionIds.length) await tx.commission.deleteMany({ where: { id: { in: staleBrowserCommissionIds } } });
    if (staleBrowserBookingIds.length) await tx.booking.deleteMany({ where: { id: { in: staleBrowserBookingIds } } });
  });

  await deleteAuditLogs("review", staleBrowserReviewIds);
  await deleteAuditLogs("incident", staleBrowserIncidentIds);
  await deleteAuditLogs("commission", staleBrowserCommissionIds);
  await deleteAuditLogs("booking", staleBrowserBookingIds);

  const keptPrograms = await prisma.program.findMany({
    where: {
      organizerId: { in: [...keepOrganizerIds] },
    },
    include: { media: true },
  });

  for (const program of keptPrograms) {
    const mediaUrl = PROGRAM_MEDIA_BY_BASE[baseName(program.title)];
    if (!mediaUrl) continue;
    if (program.media.length === 0) {
      await prisma.programMedia.create({
        data: {
          programId: program.id,
          mediaType: "image",
          url: mediaUrl,
          caption: "Локальное медиа пилота",
        },
      });
      continue;
    }
    await prisma.programMedia.updateMany({
      where: { programId: program.id },
      data: {
        url: mediaUrl,
        caption: "Локальное медиа пилота",
      },
    });
  }

  await prisma.program.updateMany({
    where: {
      organizerId: { in: [...keepOrganizerIds] },
    },
    data: {
      inclusions: "Координация, тренировки, сопровождение при бронировании.",
      itineraryDayByDay: "День 1: брифинг и вода. День 2: техника. День 3: закрепление и видеоразбор.",
      cancellationRules: "Бесплатная отмена за 14 дней.",
    },
  });

  const keptProgramsFresh = await prisma.program.findMany({
    where: {
      organizerId: { in: [...keepOrganizerIds] },
    },
    orderBy: { startDate: "asc" },
  });

  for (const program of keptProgramsFresh) {
    let capacityTotal = 8;
    let spotsAvailable = 3;
    let isStarred = false;
    let startDate = daysFromNow(4);
    let endDate = daysFromNow(6);
    if (/SouthCrew/i.test(program.title)) {
      capacityTotal = 6;
      spotsAvailable = 2;
      isStarred = true;
      startDate = daysFromNow(6);
      endDate = daysFromNow(8);
    } else if (/Kuban/i.test(program.title)) {
      capacityTotal = 10;
      spotsAvailable = 4;
      startDate = daysFromNow(12);
      endDate = daysFromNow(14);
    } else {
      isStarred = true;
    }
    await prisma.program.update({
      where: { id: program.id },
      data: {
        capacityTotal,
        spotsAvailable,
        isStarred,
        startDate,
        endDate,
      },
    });
  }

  await prisma.organizerVerificationEvidence.updateMany({
    where: {
      organizerId: { in: [...keepOrganizerIds] },
      evidenceType: "media_report",
    },
    data: {
      evidenceType: "document",
    },
  });

  await prisma.organizerVerificationEvidence.updateMany({
    where: {
      organizerId: { in: [...keepOrganizerIds] },
    },
    data: {
      notes: "Виртуальный организатор для проверки браузерного сценария",
    },
  });

  await prisma.booking.updateMany({
    where: {
      guestContact: { contains: "browser.demo+guest." },
    },
    data: {
      notes: "Виртуальная заявка для браузерной проверки. Уровень: средний.",
    },
  });

  await prisma.review.updateMany({
    where: {
      booking: {
        guestContact: { contains: "browser.demo+guest." },
      },
    },
    data: {
      comment: "Виртуальный позитивный отзыв для проверки потока модерации.",
    },
  });

  await prisma.incident.updateMany({
    where: {
      booking: {
        guestContact: { contains: "browser.demo+guest." },
      },
    },
    data: {
      summary: "Виртуальный инцидент для проверки очереди и триажа.",
    },
  });

  await prisma.commission.updateMany({
    where: {
      booking: {
        guestContact: { contains: "browser.demo+guest." },
      },
    },
    data: {
      invoiceStatus: "оплачено виртуально",
    },
  });

  const summary = {
    deleted: {
      organizers: deleteOrganizerIds.length,
      programs: deleteProgramIds.length,
      bookings: deleteBookingIds.length + staleBrowserBookingIds.length,
      reviews: deleteReviewIds.length + staleBrowserReviewIds.length,
      incidents: deleteIncidentIds.length + staleBrowserIncidentIds.length,
      commissions: deleteCommissionIds.length + staleBrowserCommissionIds.length,
      evidence: deleteEvidenceIds.length,
      media: deleteMediaIds.length,
    },
    keptOrganizerIds: [...keepOrganizerIds],
    updatedMediaPrograms: keptPrograms.map((program) => ({
      title: program.title,
      mediaUrl: PROGRAM_MEDIA_BY_BASE[baseName(program.title)] ?? null,
    })),
  };

  console.log(JSON.stringify(summary, null, 2));
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
