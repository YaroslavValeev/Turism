import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "../src/lib/prisma";
import { canPublish, programIncludeForPublishGate } from "../src/modules/programs/publishGate";

export const MVP_CAMP_IDS = {
  organizer: "org_mywave_camp_api_mvp_v1",
  source: "source_mywave_camp_api_mvp_v1",
  program: "camp_api_mvp_wakesurf_v1",
  media: "media_mywave_camp_api_mvp_v1",
} as const;

export function buildMvpDateWindow(now = new Date()): { startDate: Date; endDate: Date } {
  const startDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  startDate.setUTCDate(startDate.getUTCDate() + 45);
  const endDate = new Date(startDate);
  endDate.setUTCDate(endDate.getUTCDate() + 6);
  return { startDate, endDate };
}

function programData(now = new Date()): Prisma.ProgramUncheckedCreateInput {
  const { startDate, endDate } = buildMvpDateWindow(now);
  return {
    id: MVP_CAMP_IDS.program,
    organizerId: MVP_CAMP_IDS.organizer,
    sourceId: MVP_CAMP_IDS.source,
    title: "Пилотный вейксерф-кемп MyWave Tour",
    discipline: "wakesurf",
    region: "Краснодарский край",
    exactLocation: "Краснодарский край, площадка подтверждается после заявки",
    startDate,
    endDate,
    durationDays: 7,
    formatType: "camp",
    audienceFit: "Вейксерф-кемп для начинающих и продолжающих взрослых.",
    levelRequired: "beginner, intermediate",
    riskLevel: "medium",
    priceFromRub: 75_000,
    capacityTotal: 12,
    spotsAvailable: 8,
    currency: "RUB",
    inclusions: "Тренировки с инструктором; аренда доски и жилета; разбор техники",
    exclusions: "Проезд до площадки; проживание; питание",
    gearRequirements: "Купальные принадлежности и спортивная одежда; специальное снаряжение предоставляется.",
    medicalLimitations: "Перед участием требуется самостоятельно оценить состояние здоровья и сообщить организатору об ограничениях.",
    itineraryDayByDay: "День 1: вводный брифинг. Дни 2-6: тренировки и разбор техники. День 7: итоговая сессия.",
    organizerName: "MyWave Tour",
    cancellationRules: "Условия отмены и возврата подтверждаются до оплаты после согласования заявки.",
    whatHappensAfterBooking: "Команда MyWave Tour связывается с участником и подтверждает даты, состав пакета и условия оплаты.",
    cta: "Оставить заявку",
    intakeSource: null,
    sourceType: "site",
    sourceUrl: `https://mywavetour.ru/program/${MVP_CAMP_IDS.program}`,
    updatedFromSourceAt: now,
    reviewStatus: "ok",
    publishStatus: "draft",
  };
}

async function ensureMvpCamp(client: PrismaClient): Promise<Record<string, unknown>> {
  return client.$transaction(async (tx) => {
    await tx.organizer.upsert({
      where: { id: MVP_CAMP_IDS.organizer },
      create: {
        id: MVP_CAMP_IDS.organizer,
        displayName: "MyWave Tour",
        contactEmail: "camp-api@mywave.local",
        contactPhone: null,
        verificationStatus: "listed",
        onboardingStatus: "active",
        privilegeStatus: "limited",
      },
      update: {
        displayName: "MyWave Tour",
        contactEmail: "camp-api@mywave.local",
        contactPhone: null,
        verificationStatus: "listed",
        onboardingStatus: "active",
        privilegeStatus: "limited",
      },
    });

    await tx.source.upsert({
      where: { id: MVP_CAMP_IDS.source },
      create: {
        id: MVP_CAMP_IDS.source,
        type: "site",
        name: "MyWave Tour",
        urlOrHandle: "https://mywavetour.ru",
        discipline: "wakesurf",
        country: "Россия",
        region: "Краснодарский край",
        language: "ru",
        isActive: false,
        organizerId: MVP_CAMP_IDS.organizer,
      },
      update: {
        type: "site",
        name: "MyWave Tour",
        urlOrHandle: "https://mywavetour.ru",
        discipline: "wakesurf",
        country: "Россия",
        region: "Краснодарский край",
        language: "ru",
        isActive: false,
        organizerId: MVP_CAMP_IDS.organizer,
      },
    });

    const data = programData();
    const { id: _id, ...update } = data;
    await tx.program.upsert({
      where: { id: MVP_CAMP_IDS.program },
      create: data,
      update,
    });

    await tx.programMedia.upsert({
      where: { id: MVP_CAMP_IDS.media },
      create: {
        id: MVP_CAMP_IDS.media,
        programId: MVP_CAMP_IDS.program,
        mediaType: "image",
        url: "/media/filmstrip/wakesurf/wasurf_1.jpg",
        caption: "Вейксерф-тренировка",
      },
      update: {
        programId: MVP_CAMP_IDS.program,
        mediaType: "image",
        url: "/media/filmstrip/wakesurf/wasurf_1.jpg",
        caption: "Вейксерф-тренировка",
      },
    });

    const staged = await tx.program.findUniqueOrThrow({
      where: { id: MVP_CAMP_IDS.program },
      include: programIncludeForPublishGate,
    });
    const gate = canPublish(staged);
    if (!gate.ok) {
      throw new Error(`MVP camp publish gate failed: ${gate.missing.join(", ")}`);
    }

    const published = await tx.program.update({
      where: { id: MVP_CAMP_IDS.program },
      data: { publishStatus: "published" },
      select: {
        id: true,
        title: true,
        publishStatus: true,
        startDate: true,
        endDate: true,
        updatedAt: true,
      },
    });

    return {
      ok: true,
      action: "upserted",
      camp_id: `tour_${published.id}`,
      title: published.title,
      publication_status: published.publishStatus,
      start_date: published.startDate.toISOString().slice(0, 10),
      end_date: published.endDate.toISOString().slice(0, 10),
      content_rights_status: "unknown",
      updated_at: published.updatedAt.toISOString(),
    };
  });
}

async function rollbackMvpCamp(client: PrismaClient): Promise<Record<string, unknown>> {
  return client.$transaction(async (tx) => {
    const programs = await tx.program.deleteMany({ where: { id: MVP_CAMP_IDS.program } });
    const sources = await tx.source.deleteMany({ where: { id: MVP_CAMP_IDS.source } });
    const organizers = await tx.organizer.deleteMany({ where: { id: MVP_CAMP_IDS.organizer } });
    return {
      ok: true,
      action: "rolled_back",
      deleted: {
        programs: programs.count,
        sources: sources.count,
        organizers: organizers.count,
      },
    };
  });
}

async function main(): Promise<void> {
  const result = process.argv.includes("--rollback")
    ? await rollbackMvpCamp(prisma)
    : await ensureMvpCamp(prisma);
  console.log(JSON.stringify(result, null, 2));
}

if (require.main === module) {
  main()
    .catch((error) => {
      console.error(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : "unknown error" }));
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
