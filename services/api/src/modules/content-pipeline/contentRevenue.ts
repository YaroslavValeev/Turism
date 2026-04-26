import { prisma } from "../../lib/prisma";

function todayUtcDateOnly(): Date {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/**
 * Увеличивает revenueRub в последней метрике content_item (атрибуция «контент → деньги»).
 */
export async function addRevenueToContentMetrics(
  contentItemId: string,
  amountRub: number
): Promise<void> {
  if (amountRub <= 0) return;
  const latest = await prisma.contentMetric.findFirst({
    where: { contentItemId },
    orderBy: { asOfDate: "desc" },
    select: { id: true },
  });
  if (latest) {
    await prisma.contentMetric.update({
      where: { id: latest.id },
      data: { revenueRub: { increment: amountRub } },
    });
    return;
  }
  await prisma.contentMetric.create({
    data: {
      contentItemId,
      asOfDate: todayUtcDateOnly(),
      revenueRub: amountRub,
      views: 0,
      clicks: 0,
      leads: 0,
      applications: 0,
      siteSessions: 0,
      bookingCount: 0,
    },
  });
}
