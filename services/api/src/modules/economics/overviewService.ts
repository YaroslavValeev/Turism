/**
 * MVP unit economics + growth funnel для admin overview.
 * Источники: Booking (Model A), Commission, UserReward, ProgramUgc, AnalyticsEvent (referral_landing).
 */
import type { Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";

export type EconomicsOverviewParams = {
  dateFrom: Date;
  dateTo: Date;
  programId?: string;
  organizerId?: string;
};

function pct(n: number, d: number): number {
  if (d <= 0 || !Number.isFinite(n) || !Number.isFinite(d)) return 0;
  return Math.round((n / d) * 1000) / 10;
}

function num(v: number | null | undefined): number {
  return v ?? 0;
}

function bookingDateWhere(p: EconomicsOverviewParams): Prisma.BookingWhereInput {
  return {
    createdAt: { gte: p.dateFrom, lte: p.dateTo },
    ...(p.programId ? { programId: p.programId } : {}),
    ...(p.organizerId ? { organizerId: p.organizerId } : {}),
  };
}

function ugcWhere(p: EconomicsOverviewParams): Prisma.ProgramUgcWhereInput {
  return {
    moderationStatus: "approved",
    reviewedAt: { gte: p.dateFrom, lte: p.dateTo },
    ...(p.programId ? { programId: p.programId } : {}),
    ...(p.organizerId ? { organizerId: p.organizerId } : {}),
  };
}

function rewardGrantedWhere(p: EconomicsOverviewParams): Prisma.ProgramUgcWhereInput {
  return {
    rewardStatus: "granted",
    rewardGrantedAt: { gte: p.dateFrom, lte: p.dateTo },
    ...(p.programId ? { programId: p.programId } : {}),
    ...(p.organizerId ? { organizerId: p.organizerId } : {}),
  };
}

async function ugcIdsForRewardFilter(db: PrismaClient, p: EconomicsOverviewParams): Promise<string[] | undefined> {
  if (!p.programId && !p.organizerId) return undefined;
  const rows = await db.programUgc.findMany({
    where: {
      ...(p.programId ? { programId: p.programId } : {}),
      ...(p.organizerId ? { organizerId: p.organizerId } : {}),
    },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

function userRewardScoped(
  ugcIds: string[] | undefined,
  base: Prisma.UserRewardWhereInput,
): Prisma.UserRewardWhereInput {
  if (ugcIds === undefined) return base;
  if (ugcIds.length === 0) return { ...base, id: { in: [] } };
  return { AND: [base, { source: "ugc", sourceRefId: { in: ugcIds } }] };
}

async function countRewardsExpiredInPeriod(
  db: PrismaClient,
  p: EconomicsOverviewParams,
  ugcIds: string[] | undefined,
): Promise<number> {
  if (ugcIds === undefined) {
    return db.auditLog.count({
      where: {
        entityType: "user_reward",
        changedField: "status",
        newValue: "expired",
        reason: "expires_at_reached",
        createdAt: { gte: p.dateFrom, lte: p.dateTo },
      },
    });
  }
  if (ugcIds.length === 0) return 0;
  const rwIds = await db.userReward.findMany({
    where: { source: "ugc", sourceRefId: { in: ugcIds } },
    select: { id: true },
  });
  const idList = rwIds.map((x) => x.id);
  if (idList.length === 0) return 0;
  return db.auditLog.count({
    where: {
      entityType: "user_reward",
      entityId: { in: idList },
      reason: "expires_at_reached",
      createdAt: { gte: p.dateFrom, lte: p.dateTo },
    },
  });
}

export async function buildEconomicsOverview(db: PrismaClient, p: EconomicsOverviewParams) {
  const bWhere = bookingDateWhere(p);
  const ugcIds = await ugcIdsForRewardFilter(db, p);

  const [
    totalBookings,
    bookingsWithReward,
    bookingsWithReferral,
    bookingSums,
    bookingsWithDiscount,
    completedWithDiscount,
    ugcApproved,
    rewardsGranted,
    referralVisits,
    rewardsUsed,
    rewardsRecovered,
    rewardsExpired,
    commissions,
  ] = await Promise.all([
    db.booking.count({ where: bWhere }),
    db.booking.count({ where: { ...bWhere, appliedRewardId: { not: null } } }),
    db.booking.count({ where: { ...bWhere, referralCode: { not: null } } }),
    db.booking.aggregate({
      where: bWhere,
      _sum: {
        originalAmountRub: true,
        discountAmountRub: true,
        finalAmountRub: true,
        refundedAmountRub: true,
      },
    }),
    db.booking.count({
      where: { ...bWhere, discountAmountRub: { gt: 0 } },
    }),
    db.booking.count({
      where: {
        ...bWhere,
        bookingStatus: "completed",
        discountAmountRub: { gt: 0 },
      },
    }),
    db.programUgc.count({ where: ugcWhere(p) }),
    db.programUgc.count({ where: rewardGrantedWhere(p) }),
    db.analyticsEvent.count({
      where: {
        eventName: "referral_landing",
        eventTime: { gte: p.dateFrom, lte: p.dateTo },
        ...(p.programId ? { programId: p.programId } : {}),
        ...(p.organizerId ? { organizerId: p.organizerId } : {}),
      },
    }),
    db.userReward.count({
      where: userRewardScoped(ugcIds, {
        status: "used",
        usedAt: { gte: p.dateFrom, lte: p.dateTo },
      }),
    }),
    db.userReward.count({
      where: userRewardScoped(ugcIds, {
        recoveredAt: { gte: p.dateFrom, lte: p.dateTo },
      }),
    }),
    countRewardsExpiredInPeriod(db, p, ugcIds),
    db.commission.findMany({
      where: { booking: bWhere },
      select: {
        commissionCollectedRub: true,
        commissionAmountRub: true,
        programId: true,
        organizerId: true,
      },
    }),
  ]);

  let totalCommissionRub = 0;
  const commissionByProgram = new Map<string, number>();
  for (const c of commissions) {
    const rowRub = num(c.commissionCollectedRub) || num(c.commissionAmountRub);
    totalCommissionRub += rowRub;
    commissionByProgram.set(c.programId, (commissionByProgram.get(c.programId) ?? 0) + rowRub);
  }

  const totalOriginalRub = num(bookingSums._sum.originalAmountRub);
  const totalDiscountRub = num(bookingSums._sum.discountAmountRub);
  const totalFinalRub = num(bookingSums._sum.finalAmountRub);
  const totalRefundedRub = num(bookingSums._sum.refundedAmountRub);

  const referralBookings = bookingsWithReferral;

  const approvedToRewardPct = pct(rewardsGranted, ugcApproved);
  const rewardToVisitPct = pct(referralVisits, rewardsGranted);
  const visitToBookingPct = pct(referralBookings, referralVisits);
  const discountToCompletedPct = pct(completedWithDiscount, bookingsWithDiscount);

  const avgOriginalCheckRub = totalBookings > 0 ? Math.round(totalOriginalRub / totalBookings) : 0;
  const avgDiscountRub = bookingsWithDiscount > 0 ? Math.round(totalDiscountRub / bookingsWithDiscount) : 0;
  const avgFinalCheckRub = totalBookings > 0 ? Math.round(totalFinalRub / totalBookings) : 0;
  const avgCommissionRub = commissions.length > 0 ? Math.round(totalCommissionRub / commissions.length) : 0;
  const avgDiscountSharePct =
    totalOriginalRub > 0 ? Math.round((totalDiscountRub / totalOriginalRub) * 1000) / 10 : 0;

  const platformShare =
    totalFinalRub > 0 && totalCommissionRub >= 0 ? totalCommissionRub / totalFinalRub : 0;
  const rewardCostPlatformEstimate = Math.round(totalDiscountRub * platformShare);
  const rewardCostOrganizerEstimate = Math.round(totalDiscountRub * (1 - platformShare));

  const [topProgramsDiscount, topReferralCodes, topOrganizersReward] = await Promise.all([
    db.booking.groupBy({
      by: ["programId"],
      where: bWhere,
      _sum: { discountAmountRub: true },
      orderBy: { _sum: { discountAmountRub: "desc" } },
      take: 10,
    }),
    db.booking.groupBy({
      by: ["referralCode"],
      where: { ...bWhere, referralCode: { not: null } },
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
      take: 10,
    }),
    db.booking.groupBy({
      by: ["organizerId"],
      where: { ...bWhere, appliedRewardId: { not: null } },
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
      take: 10,
    }),
  ]);

  const topProgramsByCommissionSorted = [...commissionByProgram.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([programId, commission_rub]) => ({ programId, commission_rub }));

  const programIdsForTitles = new Set<string>();
  for (const row of topProgramsDiscount) programIdsForTitles.add(row.programId);
  for (const row of topProgramsByCommissionSorted) programIdsForTitles.add(row.programId);

  const programTitles = await db.program.findMany({
    where: { id: { in: [...programIdsForTitles] } },
    select: { id: true, title: true },
  });
  const titleByProgram = new Map(programTitles.map((x) => [x.id, x.title]));

  const organizersForLabels = await db.organizer.findMany({
    where: {
      id: { in: topOrganizersReward.map((r) => r.organizerId) },
    },
    select: { id: true, displayName: true },
  });
  const orgName = new Map(organizersForLabels.map((o) => [o.id, o.displayName]));

  return {
    period: {
      date_from: p.dateFrom.toISOString(),
      date_to: p.dateTo.toISOString(),
    },
    filters: {
      programId: p.programId ?? null,
      organizerId: p.organizerId ?? null,
    },
    aggregates: {
      total_bookings: totalBookings,
      bookings_with_reward: bookingsWithReward,
      bookings_with_referral: bookingsWithReferral,
      total_original_rub: totalOriginalRub,
      total_discount_rub: totalDiscountRub,
      total_final_rub: totalFinalRub,
      total_commission_rub: totalCommissionRub,
      total_refunded_rub: totalRefundedRub,
      total_rewards_recovered: rewardsRecovered,
      total_rewards_expired: rewardsExpired,
      total_rewards_used: rewardsUsed,
    },
    funnel: {
      ugc_approved: ugcApproved,
      rewards_granted: rewardsGranted,
      referral_visits: referralVisits,
      referral_bookings: referralBookings,
      bookings_with_discount: bookingsWithDiscount,
      completed_bookings_with_discount: completedWithDiscount,
      derived: {
        approved_to_reward_pct: approvedToRewardPct,
        reward_to_visit_pct: rewardToVisitPct,
        visit_to_booking_pct: visitToBookingPct,
        discount_to_completed_pct: discountToCompletedPct,
      },
    },
    unit_economics: {
      avg_original_check_rub: avgOriginalCheckRub,
      avg_discount_rub: avgDiscountRub,
      avg_final_check_rub: avgFinalCheckRub,
      avg_commission_rub: avgCommissionRub,
      avg_discount_share_pct: avgDiscountSharePct,
      reward_cost_to_platform_estimate: rewardCostPlatformEstimate,
      reward_cost_to_organizer_estimate: rewardCostOrganizerEstimate,
      platform_commission_share_of_final: Math.round(platformShare * 1000) / 10,
    },
    top_lists: {
      top_programs_by_discount: topProgramsDiscount.map((row) => ({
        programId: row.programId,
        title: titleByProgram.get(row.programId) ?? null,
        discount_rub: num(row._sum.discountAmountRub),
      })),
      top_programs_by_commission: topProgramsByCommissionSorted.map((row) => ({
        ...row,
        title: titleByProgram.get(row.programId) ?? null,
      })),
      top_referral_codes_by_bookings: topReferralCodes.map((row) => ({
        referralCode: row.referralCode,
        bookings: row._count.id,
      })),
      top_organizers_by_reward_usage: topOrganizersReward.map((row) => ({
        organizerId: row.organizerId,
        displayName: orgName.get(row.organizerId) ?? null,
        bookings_with_reward: row._count.id,
      })),
    },
    methodology: {
      booking_time_field: "createdAt",
      commission_row:
        "sum per Commission: commissionCollectedRub if set else commissionAmountRub (строка commission на booking)",
      referral_visits:
        "count AnalyticsEvent eventName=referral_landing за период; фильтры programId/organizerId из события (данные с момента инструментирования)",
      rewards_expired:
        "audit user_reward expires_at_reached при фильтре — только по user_reward связанным с UGC выбранного scope",
      reward_cost_split:
        "оценка: total_discount_rub × (total_commission_rub / total_final_rub) → platform; остаток → organizer (Model A proxy, не налоговая себестоимость)",
    },
  };
}

export type EconomicsOverviewJson = Awaited<ReturnType<typeof buildEconomicsOverview>>;

function deltaRow(cur: number, base: number) {
  const delta = cur - base;
  const delta_pct =
    base === 0 ? (cur === 0 ? 0 : null) : Math.round(((cur - base) / base) * 10_000) / 100;
  return { current: cur, baseline: base, delta, delta_pct };
}

/** Два последовательных окна одинаковой длины: baseline заканчивается сразу перед `current.dateFrom`. */
export async function buildEconomicsOverviewComparison(db: PrismaClient, p: EconomicsOverviewParams) {
  const durationMs = p.dateTo.getTime() - p.dateFrom.getTime();
  const baselineTo = new Date(p.dateFrom.getTime() - 1);
  const baselineFrom = new Date(baselineTo.getTime() - durationMs);
  const baselineParams: EconomicsOverviewParams = {
    ...p,
    dateFrom: baselineFrom,
    dateTo: baselineTo,
  };
  const [current, baseline] = await Promise.all([
    buildEconomicsOverview(db, p),
    buildEconomicsOverview(db, baselineParams),
  ]);
  const a = current.aggregates;
  const b = baseline.aggregates;
  const fd = current.funnel.derived;
  const fb = baseline.funnel.derived;
  return {
    current_period: current.period,
    baseline_period: {
      date_from: baselineFrom.toISOString(),
      date_to: baselineTo.toISOString(),
    },
    window_ms: durationMs,
    current,
    baseline,
    deltas: {
      aggregates: {
        total_final_rub: deltaRow(a.total_final_rub, b.total_final_rub),
        total_commission_rub: deltaRow(a.total_commission_rub, b.total_commission_rub),
        total_discount_rub: deltaRow(a.total_discount_rub, b.total_discount_rub),
        total_bookings: deltaRow(a.total_bookings, b.total_bookings),
      },
      funnel_derived: {
        discount_to_completed_pct: deltaRow(fd.discount_to_completed_pct, fb.discount_to_completed_pct),
        visit_to_booking_pct: deltaRow(fd.visit_to_booking_pct, fb.visit_to_booking_pct),
      },
    },
  };
}

export function parseEconomicsDateRange(query: Record<string, unknown>): {
  ok: true;
  value: EconomicsOverviewParams;
} | { ok: false; error: string } {
  const now = new Date();
  const defaultTo = new Date(now);
  defaultTo.setUTCHours(23, 59, 59, 999);
  const defaultFrom = new Date(defaultTo);
  defaultFrom.setUTCDate(defaultFrom.getUTCDate() - 30);
  defaultFrom.setUTCHours(0, 0, 0, 0);

  const parseOne = (v: unknown): Date | null => {
    if (v === undefined || v === null || v === "") return null;
    const s = String(v).trim();
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d;
  };

  const rawFrom = parseOne(query.date_from);
  const rawTo = parseOne(query.date_to);
  const dateFrom = rawFrom ?? defaultFrom;
  const dateTo = rawTo ?? defaultTo;
  if (dateFrom > dateTo) {
    return { ok: false, error: "date_from must be <= date_to" };
  }

  const programId =
    typeof query.programId === "string" && query.programId.trim() ? query.programId.trim() : undefined;
  const organizerId =
    typeof query.organizerId === "string" && query.organizerId.trim() ? query.organizerId.trim() : undefined;

  return {
    ok: true,
    value: { dateFrom, dateTo, programId, organizerId },
  };
}
