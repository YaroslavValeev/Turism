import { prisma } from "./prisma";

export type PilotReadinessThresholds = {
  minPublishedPrograms: number;
  maxPublishedPrograms: number;
  minActiveOrganizers: number;
  minCompletedBookings: number;
  minApprovedReviews: number;
};

export type PilotReadinessMetrics = {
  publishedPrograms: number;
  activeOrganizers: number;
  completedBookings: number;
  approvedReviews: number;
};

export type PilotReadinessCheck = {
  key: string;
  pass: boolean;
  actual: number;
  expected: string;
  comment: string;
};

export type PilotReadinessAudit = {
  ready: boolean;
  thresholds: PilotReadinessThresholds;
  metrics: PilotReadinessMetrics;
  checks: PilotReadinessCheck[];
};

export const DEFAULT_PILOT_READINESS_THRESHOLDS: PilotReadinessThresholds = {
  minPublishedPrograms: 10,
  maxPublishedPrograms: 20,
  minActiveOrganizers: 3,
  minCompletedBookings: 5,
  minApprovedReviews: 1,
};

export function strictPilotReadinessEnabled(value = process.env.PILOT_READINESS_AUDIT_STRICT): boolean {
  return /^(1|true|yes|on)$/i.test(value ?? "");
}

export function evaluatePilotReadiness(
  metrics: PilotReadinessMetrics,
  thresholds: PilotReadinessThresholds = DEFAULT_PILOT_READINESS_THRESHOLDS,
): PilotReadinessAudit {
  const checks: PilotReadinessCheck[] = [
    {
      key: "published_programs_min",
      pass: metrics.publishedPrograms >= thresholds.minPublishedPrograms,
      actual: metrics.publishedPrograms,
      expected: `>= ${thresholds.minPublishedPrograms}`,
      comment: "Controlled pilot needs enough real programs before v1.",
    },
    {
      key: "published_programs_max",
      pass: metrics.publishedPrograms <= thresholds.maxPublishedPrograms,
      actual: metrics.publishedPrograms,
      expected: `<= ${thresholds.maxPublishedPrograms}`,
      comment: "Keep the pilot catalog curated; do not expand into marketplace mode before proof.",
    },
    {
      key: "active_organizers_min",
      pass: metrics.activeOrganizers >= thresholds.minActiveOrganizers,
      actual: metrics.activeOrganizers,
      expected: `>= ${thresholds.minActiveOrganizers}`,
      comment: "At least three organizers must have published programs.",
    },
    {
      key: "completed_bookings_min",
      pass: metrics.completedBookings >= thresholds.minCompletedBookings,
      actual: metrics.completedBookings,
      expected: `>= ${thresholds.minCompletedBookings}`,
      comment: "Business E2E is not proven until completed bookings exist.",
    },
    {
      key: "approved_reviews_present",
      pass: metrics.approvedReviews >= thresholds.minApprovedReviews,
      actual: metrics.approvedReviews,
      expected: `>= ${thresholds.minApprovedReviews}`,
      comment: "Real public trust proof requires at least one approved review.",
    },
  ];

  return {
    ready: checks.every((check) => check.pass),
    thresholds,
    metrics,
    checks,
  };
}

export function pilotReadinessFailsStrict(audit: Pick<PilotReadinessAudit, "ready">): boolean {
  return !audit.ready;
}

export async function collectPilotReadinessMetrics(): Promise<PilotReadinessMetrics> {
  const [publishedPrograms, organizersWithPublishedPrograms, completedBookings, approvedReviews] = await Promise.all([
    prisma.program.count({ where: { publishStatus: "published" } }),
    prisma.program.groupBy({
      by: ["organizerId"],
      where: { publishStatus: "published" },
    }),
    prisma.booking.count({ where: { bookingStatus: "completed" } }),
    prisma.review.count({ where: { moderationStatus: "approved" } }),
  ]);

  return {
    publishedPrograms,
    activeOrganizers: organizersWithPublishedPrograms.length,
    completedBookings,
    approvedReviews,
  };
}

export async function collectPilotReadinessAudit(
  thresholds: PilotReadinessThresholds = DEFAULT_PILOT_READINESS_THRESHOLDS,
): Promise<PilotReadinessAudit> {
  return evaluatePilotReadiness(await collectPilotReadinessMetrics(), thresholds);
}
