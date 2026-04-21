import type { PrismaClient } from "@prisma/client";

/** Согласовано с GET /organizers/:id/analytics/overview. */
export const CONVERSION_VIEW_EVENTS = ["page_view", "view_item", "view_item_list"] as const;
export const CONVERSION_CLICK_EVENTS = [
  "select_item",
  "share_program",
  "open_chat",
  "search",
  "apply_filter",
  "save_program",
] as const;

export const CONVERSION_DEAL_BOOKING_STATUSES = [
  "booked",
  "paid_partial",
  "paid_full",
  "paid_off_platform",
  "completed",
] as const;

export type ProgramConversionMetrics = {
  views: number;
  clicks: number;
  leads: number;
  deals: number;
  /** Просмотры за последние 7 суток (ingestedAt). */
  viewsThisWeek: number;
  /** Просмотры за предыдущие 7 суток (окно [now-14d, now-7d)). */
  viewsPrevWeek: number;
};

export async function buildProgramConversionMetrics(
  db: PrismaClient,
  params: { programId: string; organizerId: string; since: Date; now?: Date },
): Promise<ProgramConversionMetrics> {
  const now = params.now ?? new Date();
  const since = params.since;
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

  const baseWhere = {
    programId: params.programId,
    organizerId: params.organizerId,
  };

  const [
    views,
    clicks,
    leads,
    deals,
    viewsThisWeek,
    viewsPrevWeek,
  ] = await Promise.all([
    db.analyticsEvent.count({
      where: {
        ...baseWhere,
        ingestedAt: { gte: since },
        eventName: { in: [...CONVERSION_VIEW_EVENTS] },
      },
    }),
    db.analyticsEvent.count({
      where: {
        ...baseWhere,
        ingestedAt: { gte: since },
        eventName: { in: [...CONVERSION_CLICK_EVENTS] },
      },
    }),
    db.lead.count({
      where: { programId: params.programId, organizerId: params.organizerId, createdAt: { gte: since } },
    }),
    db.booking.count({
      where: {
        programId: params.programId,
        organizerId: params.organizerId,
        createdAt: { gte: since },
        bookingStatus: { in: [...CONVERSION_DEAL_BOOKING_STATUSES] },
      },
    }),
    db.analyticsEvent.count({
      where: {
        ...baseWhere,
        ingestedAt: { gte: weekAgo },
        eventName: { in: [...CONVERSION_VIEW_EVENTS] },
      },
    }),
    db.analyticsEvent.count({
      where: {
        ...baseWhere,
        ingestedAt: { gte: twoWeeksAgo, lt: weekAgo },
        eventName: { in: [...CONVERSION_VIEW_EVENTS] },
      },
    }),
  ]);

  return { views, clicks, leads, deals, viewsThisWeek, viewsPrevWeek };
}
