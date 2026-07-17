import { prisma } from "../../lib/prisma";
import { isProgramPubliclyVisible } from "../programs/publicVisibility";

export async function getProgramCardForTelegram(programId: string) {
  const program = await prisma.program.findUnique({
    where: { id: programId },
    include: {
      organizer: { select: { id: true, displayName: true, verificationStatus: true } },
      media: { take: 1, orderBy: { id: "asc" } },
    },
  });
  if (!program || !isProgramPubliclyVisible(program)) {
    return null;
  }
  return {
    id: program.id,
    title: program.title,
    discipline: program.discipline,
    region: program.region,
    exactLocation: program.exactLocation,
    startDate: program.startDate.toISOString(),
    endDate: program.endDate.toISOString(),
    durationDays: program.durationDays,
    priceFromRub: program.priceFromRub,
    levelRequired: program.levelRequired,
    riskLevel: program.riskLevel,
    inclusions: program.inclusions,
    exclusions: program.exclusions,
    organizer: {
      id: program.organizer.id,
      displayName: program.organizer.displayName,
      verificationStatus: program.organizer.verificationStatus,
    },
    imageUrl: program.media[0]?.url ?? null,
    isKids: (program.audienceFit ?? "").toLowerCase().includes("дет") || (program.audienceFit ?? "").toLowerCase().includes("kids"),
    disclaimer:
      "MyWave Tour — агрегатор и посредник заявок. Организатор предоставил данные о программе, рисках и условиях участия.",
  };
}

export function formatProgramCardText(card: Awaited<ReturnType<typeof getProgramCardForTelegram>>): string {
  if (!card) return "Программа недоступна.";
  const price = card.priceFromRub != null ? `${card.priceFromRub} ₽` : "уточняйте у организатора";
  const lines = [
    `*${card.title}*`,
    `${card.discipline} · ${card.region}`,
    `Даты: ${card.startDate.slice(0, 10)} — ${card.endDate.slice(0, 10)} (${card.durationDays} дн.)`,
    `Цена от: ${price}`,
    card.levelRequired ? `Уровень: ${card.levelRequired}` : "",
    card.riskLevel ? `Риск: ${card.riskLevel}` : "",
    `Организатор: ${card.organizer.displayName} (${card.organizer.verificationStatus})`,
    "",
    card.disclaimer,
  ];
  return lines.filter(Boolean).join("\n");
}
