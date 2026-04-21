import type { PrismaClient } from "@prisma/client";

export function num(v: number | null | undefined): number {
  return v ?? 0;
}

export type ProgramEconomicsWindowMetrics = {
  totalDiscount: number;
  totalComm: number;
  withDisc: number;
  completedDisc: number;
};

export async function computeProgramEconomicsMetrics(
  db: PrismaClient,
  programId: string,
  from: Date,
): Promise<ProgramEconomicsWindowMetrics> {
  const [discAgg, commRows, withDisc, completedDisc] = await Promise.all([
    db.booking.aggregate({
      where: { programId, createdAt: { gte: from } },
      _sum: { discountAmountRub: true },
    }),
    db.commission.findMany({
      where: { programId, booking: { createdAt: { gte: from } } },
      select: { commissionCollectedRub: true, commissionAmountRub: true },
    }),
    db.booking.count({
      where: { programId, createdAt: { gte: from }, discountAmountRub: { gt: 0 } },
    }),
    db.booking.count({
      where: {
        programId,
        createdAt: { gte: from },
        discountAmountRub: { gt: 0 },
        bookingStatus: "completed",
      },
    }),
  ]);
  let totalComm = 0;
  for (const c of commRows) {
    totalComm += num(c.commissionCollectedRub) || num(c.commissionAmountRub);
  }
  return {
    totalDiscount: num(discAgg._sum.discountAmountRub),
    totalComm,
    withDisc,
    completedDisc,
  };
}
