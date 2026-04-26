import { prisma } from "../../lib/prisma";

export type OutreachMetrics = {
  viewsCount: number;
  clicksCount: number;
  leadsCount: number;
  dealsCount: number;
  dealAmountTotal: number;
};

const VIEW_EVENTS = ["view_item", "view_item_list", "page_view"] as const;
const CLICK_EVENTS = ["select_item", "open_chat", "share_program"] as const;

const DEAL_STATUSES = ["completed", "paid_full", "booked", "paid_partial"] as const;

/**
 * Агрегаты за период: AnalyticsEvent (views/clicks), Lead, Booking.
 * Цифры только из БД — не выдумывать.
 */
export async function computeOutreachMetrics(
  organizerId: string,
  periodStart: Date,
  periodEnd: Date
): Promise<OutreachMetrics> {
  const programs = await prisma.program.findMany({
    where: { organizerId },
    select: { id: true },
  });
  const programIds = programs.map((p) => p.id);
  const orPrograms =
    programIds.length > 0 ? ({ programId: { in: programIds } } as const) : null;
  const orOrg = { organizerId } as const;
  const orCond = orPrograms ? { OR: [orOrg, orPrograms] } : { OR: [orOrg] };

  const [views, clicks, leads, bookings] = await prisma.$transaction([
    prisma.analyticsEvent.count({
      where: {
        eventTime: { gte: periodStart, lte: periodEnd },
        eventName: { in: [...VIEW_EVENTS] },
        ...orCond,
      },
    }),
    prisma.analyticsEvent.count({
      where: {
        eventTime: { gte: periodStart, lte: periodEnd },
        eventName: { in: [...CLICK_EVENTS] },
        ...orCond,
      },
    }),
    prisma.lead.count({
      where: {
        organizerId,
        createdAt: { gte: periodStart, lte: periodEnd },
      },
    }),
    prisma.booking.findMany({
      where: {
        organizerId,
        createdAt: { gte: periodStart, lte: periodEnd },
        bookingStatus: { in: [...DEAL_STATUSES] },
      },
      select: { gmvRub: true, netAmountRub: true, paidAmountRub: true },
    }),
  ]);

  const dealsCount = bookings.length;
  const dealAmountTotal = bookings.reduce((s, b) => {
    const gmv = b.gmvRub ?? 0;
    if (gmv > 0) return s + gmv;
    const net = b.netAmountRub ?? 0;
    if (net > 0) return s + net;
    return s + (b.paidAmountRub ?? 0);
  }, 0);

  return {
    viewsCount: views,
    clicksCount: clicks,
    leadsCount: leads,
    dealsCount,
    dealAmountTotal,
  };
}

export function hasOutreachActivity(m: OutreachMetrics): boolean {
  return (
    m.viewsCount > 0 || m.clicksCount > 0 || m.leadsCount > 0 || m.dealsCount > 0
  );
}

export function pickTemplateType(m: OutreachMetrics): "A_soft" | "B_leads" | "C_deals" {
  if (m.dealsCount > 0) return "C_deals";
  if (m.leadsCount > 0) return "B_leads";
  return "A_soft";
}
