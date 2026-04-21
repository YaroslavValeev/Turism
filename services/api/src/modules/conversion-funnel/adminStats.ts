import type { PrismaClient } from "@prisma/client";

export async function getConversionFunnelAdminStats(db: PrismaClient, windowHours: number) {
  const since = new Date(Date.now() - windowHours * 3600 * 1000);

  const [deliveredRows, failedCount, optInFlips] = await Promise.all([
    db.programConversionDelivery.groupBy({
      by: ["channel"],
      where: {
        sentAt: { gte: since },
        outcome: { startsWith: "delivered" },
      },
      _count: { _all: true },
    }),
    db.programConversionDelivery.count({
      where: {
        sentAt: { gte: since },
        outcome: { startsWith: "failed" },
      },
    }),
    db.programConversionState.count({
      where: {
        serviceCommsOptIn: false,
        updatedAt: { gte: since },
      },
    }),
  ]);

  const deliveredTotal = deliveredRows.reduce((a, r) => a + r._count._all, 0);
  const deliveredByChannel = Object.fromEntries(
    deliveredRows.map((r) => [r.channel || "unknown", r._count._all]),
  );

  return {
    windowHours,
    since: since.toISOString(),
    deliveredTotal,
    deliveredByChannel,
    failedCount,
    /** Приближение: строки state с отпиской и updatedAt в окне (не идеальный «unsub event»). */
    serviceCommsOptOutApprox: optInFlips,
  };
}
