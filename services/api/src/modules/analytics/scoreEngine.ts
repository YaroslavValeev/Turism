import type { Env } from "@mywave/config";
import { prisma } from "../../lib/prisma";

const MS_DAY = 24 * 60 * 60 * 1000;

function bandFromScore(score: number, sample: number, minSample: number): string {
  if (sample < minSample) return "unknown";
  if (score < 45) return "low";
  if (score < 72) return "medium";
  return "high";
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/** Скользящее окно для v1 (дней). */
const ORG_WINDOW_DAYS = 90;
const PROG_WINDOW_DAYS = 90;

function minBookingsForOrgScore(env: Env): number {
  const n = env.SCORE_MIN_BOOKINGS_FOR_BAND;
  return typeof n === "number" && n > 0 ? Math.floor(n) : 2;
}

function minViewsForProgramPerf(env: Env): number {
  const n = env.SCORE_MIN_VIEWS_FOR_PROGRAM_PERF;
  return typeof n === "number" && n > 0 ? Math.floor(n) : 8;
}

export async function recalculateOrganizerScores(env: Env, periodEnd: Date): Promise<{ upserted: number }> {
  const minBookings = minBookingsForOrgScore(env);
  const periodStart = new Date(periodEnd.getTime() - ORG_WINDOW_DAYS * MS_DAY);
  const organizers = await prisma.organizer.findMany({
    select: {
      id: true,
      displayName: true,
      contactEmail: true,
      contactPhone: true,
      legalStatus: true,
      responseScore: true,
      verificationStatus: true,
      onboardingStatus: true,
      billingStatus: true,
    },
  });

  let upserted = 0;
  for (const org of organizers) {
    const bookings = await prisma.booking.findMany({
      where: { organizerId: org.id, createdAt: { gte: periodStart, lte: periodEnd } },
      select: {
        id: true,
        bookingStatus: true,
        bookedAt: true,
        paidAmountRub: true,
        gmvRub: true,
        refundedAmountRub: true,
      },
    });
    const incidents = await prisma.incident.count({
      where: { organizerId: org.id, createdAt: { gte: periodStart, lte: periodEnd } },
    });
    const reviewAgg = await prisma.review.aggregate({
      where: { organizerId: org.id, createdAt: { gte: periodStart, lte: periodEnd } },
      _avg: { rating: true },
      _count: { id: true },
    });

    const n = bookings.length;
    const booked = bookings.filter((b) => b.bookedAt != null || ["booked", "paid_partial", "paid_full", "completed"].includes(b.bookingStatus)).length;
    const paid = bookings.filter((b) => (b.paidAmountRub ?? 0) > 0 || b.bookingStatus === "paid_full" || b.bookingStatus === "completed").length;
    const completed = bookings.filter((b) => b.bookingStatus === "completed").length;
    const sumGmv = bookings.reduce((s, b) => s + (b.gmvRub ?? b.paidAmountRub ?? 0), 0);
    const sumRef = bookings.reduce((s, b) => s + (b.refundedAmountRub ?? 0), 0);

    const responseTimeScore = clamp(org.responseScore ?? 60, 0, 100);
    const leadToBookedScore = n ? clamp((booked / n) * 100, 0, 100) : 50;
    const bookedToPaidScore = booked ? clamp((paid / booked) * 100, 0, 100) : 50;
    const paidToCompletedScore = paid ? clamp((completed / paid) * 100, 0, 100) : 50;
    const refundPenalty = clamp(sumGmv > 0 ? (sumRef / sumGmv) * 80 : 0, 0, 40);
    const complaintPenalty = clamp(n ? (incidents / n) * 35 : 0, 0, 40);
    const reviewScore =
      reviewAgg._count.id > 0 && reviewAgg._avg.rating != null
        ? clamp((Number(reviewAgg._avg.rating) / 5) * 100, 0, 100)
        : 65;
    let profileBits = 0;
    const profileTotal = 4;
    if (org.displayName?.trim()) profileBits++;
    if (org.contactEmail?.trim()) profileBits++;
    if (org.contactPhone?.trim()) profileBits++;
    if (org.legalStatus?.trim()) profileBits++;
    const profileCompletenessScore = (profileBits / profileTotal) * 100;
    const contractStatusBonus = (org.onboardingStatus ?? "").includes("contract_signed") ? 5 : 0;
    const billingStatusBonus = org.billingStatus === "billing_connected" ? 5 : 0;

    const base =
      responseTimeScore * 0.12 +
      leadToBookedScore * 0.14 +
      bookedToPaidScore * 0.14 +
      paidToCompletedScore * 0.12 +
      reviewScore * 0.12 +
      profileCompletenessScore * 0.16 +
      contractStatusBonus +
      billingStatusBonus;

    const organizerScore = clamp(base - refundPenalty - complaintPenalty, 0, 100);
    const scoreBand = bandFromScore(organizerScore, n, minBookings);

    const componentsJson = {
      response_time_score: responseTimeScore,
      lead_to_booked_score: leadToBookedScore,
      booked_to_paid_score: bookedToPaidScore,
      paid_to_completed_score: paidToCompletedScore,
      refund_penalty: refundPenalty,
      complaint_penalty: complaintPenalty,
      review_score: reviewScore,
      profile_completeness_score: profileCompletenessScore,
      contract_status_bonus: contractStatusBonus,
      billing_status_bonus: billingStatusBonus,
    };

    await prisma.organizerScoreSnapshot.upsert({
      where: {
        organizerId_periodEnd: { organizerId: org.id, periodEnd },
      },
      create: {
        organizerId: org.id,
        periodStart,
        periodEnd,
        organizerScore,
        scoreBand,
        componentsJson,
        sampleBookings: n,
      },
      update: {
        periodStart,
        organizerScore,
        scoreBand,
        componentsJson,
        sampleBookings: n,
        recalculatedAt: new Date(),
      },
    });
    upserted++;
  }

  return { upserted };
}

export async function recalculateProgramScores(env: Env, periodEnd: Date): Promise<{ upserted: number }> {
  const minViews = minViewsForProgramPerf(env);
  const periodStart = new Date(periodEnd.getTime() - PROG_WINDOW_DAYS * MS_DAY);
  const programs = await prisma.program.findMany({
    include: {
      media: { select: { id: true } },
      reviews: { select: { id: true } },
    },
  });

  let upserted = 0;
  for (const p of programs) {
    const hasMedia = p.media.length > 0 ? 100 : 0;
    const hasReviews = p.reviews.length > 0 ? 100 : 25;
    const hasSchedule = p.itineraryDayByDay?.trim() ? 100 : 0;
    const hasSafety =
      (p.medicalLimitations?.trim() ? 1 : 0) + (p.riskLevel?.trim() ? 1 : 0) > 0 ? 100 : 40;
    const hasCancellation = p.cancellationRules?.trim() ? 100 : 0;

    const textFields = [
      p.title,
      p.discipline,
      p.region,
      p.audienceFit,
      p.inclusions,
      p.exclusions,
      p.gearRequirements,
      p.whatHappensAfterBooking,
    ];
    const filled = textFields.filter((x) => (x ?? "").trim().length > 0).length;
    const contentCompletenessScore = clamp((filled / textFields.length) * 100, 0, 100);

    const contentScore =
      (contentCompletenessScore +
        hasMedia +
        hasReviews +
        hasSchedule +
        hasSafety +
        hasCancellation) /
      6;

    const views = await prisma.analyticsEvent.count({
      where: {
        programId: p.id,
        eventName: { in: ["view_item", "view_item_list", "page_view"] },
        ingestedAt: { gte: periodStart, lte: periodEnd },
      },
    });
    const leads = await prisma.analyticsEvent.count({
      where: {
        programId: p.id,
        eventName: "lead_created",
        ingestedAt: { gte: periodStart, lte: periodEnd },
      },
    });
    const bookingsN = await prisma.booking.count({
      where: { programId: p.id, createdAt: { gte: periodStart, lte: periodEnd } },
    });
    const paidN = await prisma.booking.count({
      where: {
        programId: p.id,
        createdAt: { gte: periodStart, lte: periodEnd },
        OR: [{ paidAmountRub: { gt: 0 } }, { bookingStatus: { in: ["paid_full", "completed"] } }],
      },
    });

    let performanceScore: number | null = null;
    if (views >= minViews) {
      const v2l = clamp((leads / Math.max(views, 1)) * 400, 0, 100);
      const l2b = clamp((bookingsN / Math.max(leads, 1)) * 100, 0, 100);
      const b2p = clamp((paidN / Math.max(bookingsN, 1)) * 100, 0, 100);
      performanceScore = (v2l + l2b + b2p) / 3;
    }

    const total =
      performanceScore != null ? contentScore * 0.55 + performanceScore * 0.45 : contentScore;
    const scoreBand = views < minViews ? "insufficient_data" : bandFromScore(total, views, minViews);

    const componentsJson = {
      content_completeness_score: contentCompletenessScore,
      has_media_score: hasMedia,
      has_reviews_score: hasReviews,
      has_schedule_score: hasSchedule,
      has_safety_score: hasSafety,
      has_cancellation_policy_score: hasCancellation,
      view_to_lead_score: views >= minViews ? clamp((leads / Math.max(views, 1)) * 400, 0, 100) : null,
      lead_to_booking_score: views >= minViews ? clamp((bookingsN / Math.max(leads, 1)) * 100, 0, 100) : null,
      booking_to_paid_score: views >= minViews ? clamp((paidN / Math.max(bookingsN, 1)) * 100, 0, 100) : null,
    };

    await prisma.programScoreSnapshot.upsert({
      where: {
        programId_periodEnd: { programId: p.id, periodEnd },
      },
      create: {
        programId: p.id,
        periodStart,
        periodEnd,
        programContentScore: contentScore,
        programPerformanceScore: performanceScore,
        totalProgramScore: total,
        scoreBand,
        componentsJson,
        sampleViews: views,
      },
      update: {
        periodStart,
        programContentScore: contentScore,
        programPerformanceScore: performanceScore,
        totalProgramScore: total,
        scoreBand,
        componentsJson,
        sampleViews: views,
        recalculatedAt: new Date(),
      },
    });
    upserted++;
  }

  return { upserted };
}
