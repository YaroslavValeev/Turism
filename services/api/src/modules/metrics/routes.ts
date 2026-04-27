/**
 * Admin funnel metrics: operational aggregates only. No revenue dashboard.
 * Source: METRICS_FOUNDATION.md
 */
import { Router, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { requireAdmin } from "../../middleware/auth";
import { requireAdminOrInternalAnalytics } from "../../middleware/metricsInternalAccess";
import type { Env } from "@mywave/config";
import { computeDqMetrics } from "../analytics/dqMetrics";
import { buildFounderSummary } from "./founderSummary";
import { aggregateContentEntryBookings } from "../../lib/bookingEntryTracking";
import { getPilotKpiSnapshot } from "../../lib/pilotKpiSnapshot";

function parseDay(value: string | undefined): Date | null {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    return new Date(Date.UTC(y, mo - 1, d));
  }
  const d = new Date(value);
  if (Number.isNaN(d.valueOf())) return null;
  return d;
}

function isMissingAnalyticsMartError(error: unknown, martName: string): boolean {
  const text = error instanceof Error ? `${error.message}\n${error.stack ?? ""}` : String(error);
  return text.includes(martName) && (text.includes("does not exist") || text.includes("UndefinedTable"));
}

export function metricsRoutes(env: Env): Router {
  const router = Router();
  const admin = requireAdmin(env);
  const adminOrInternal = requireAdminOrInternalAnalytics(env);

  router.get("/admin/funnel", admin, async (_req: Request, res: Response) => {
    try {
      const [bookingsByStatus, incidentsByStatus, reviewsByStatus, commissionsByStatus, organizersByStatus] =
        await Promise.all([
          prisma.booking.groupBy({ by: ["bookingStatus"], _count: { id: true } }),
          prisma.incident.groupBy({ by: ["incidentStatus"], _count: { id: true } }),
          prisma.review.groupBy({ by: ["moderationStatus"], _count: { id: true } }),
          prisma.commission.groupBy({ by: ["reconciliationStatus"], _count: { id: true } }),
          prisma.organizer.groupBy({ by: ["verificationStatus"], _count: { id: true } }),
        ]);

      const toMap = <T extends { _count: { id: number } }>(
        rows: T[],
        key: keyof Omit<T, "_count">
      ) => {
        const map: Record<string, number> = {};
        for (const row of rows) {
          const bucket = row[key];
          if (typeof bucket === "string") {
            map[bucket] = row._count.id;
          }
        }
        return map;
      };

      res.json({
        bookings: toMap(bookingsByStatus, "bookingStatus"),
        incidents: toMap(incidentsByStatus, "incidentStatus"),
        reviews: toMap(reviewsByStatus, "moderationStatus"),
        commissions: toMap(commissionsByStatus, "reconciliationStatus"),
        organizers: toMap(organizersByStatus, "verificationStatus"),
      });
    } catch (e) {
      console.error("metrics admin/funnel error", e);
      res.status(500).json({ error: "Failed to compute funnel metrics" });
    }
  });

  router.get("/founder/daily", admin, async (req: Request, res: Response) => {
    const to = parseDay(req.query.to as string | undefined) ?? new Date();
    const from = parseDay(req.query.from as string | undefined) ?? new Date(to.getTime() - 29 * 24 * 60 * 60 * 1000);
    try {
      const founderRows = await prisma.$queryRaw<
        {
          day: Date;
          nsm_core: number;
          nsm_extended: number;
          leads_created: number;
          new_organizers_created: number;
          verified_organizers_updated_day: number;
          trusted_organizers_updated_day: number;
          bookings_booked: number;
          bookings_paid_any: number;
          bookings_completed: number;
          net_gmv_rub: bigint;
          commission_paid_rub: bigint;
        }[]
      >(Prisma.sql`
        SELECT
          day,
          nsm_core,
          nsm_extended,
          leads_created,
          new_organizers_created,
          verified_organizers_updated_day,
          trusted_organizers_updated_day,
          bookings_booked,
          bookings_paid_any,
          bookings_completed,
          net_gmv_rub,
          commission_paid_rub
        FROM mv_founder_daily
        WHERE day >= ${from}::date AND day <= ${to}::date
        ORDER BY day ASC
      `);
      const rows = founderRows.map((r) => ({
        ...r,
        net_gmv_rub: Number(r.net_gmv_rub),
        commission_paid_rub: Number(r.commission_paid_rub),
      }));
      res.json({ from: from.toISOString(), to: to.toISOString(), rows });
    } catch (e) {
      if (isMissingAnalyticsMartError(e, "mv_founder_daily")) {
        res.status(200).json({
          from: from.toISOString(),
          to: to.toISOString(),
          rows: [],
          warning: "analytics_marts_missing",
          hint: "Apply prisma migrations (mv_founder_daily) or run POST /internal/analytics/refresh after migrate.",
        });
        return;
      }
      console.error("metrics founder/daily error", e);
      res.status(500).json({ error: "Failed to load founder daily metrics" });
    }
  });

  router.get("/analytics/dq", admin, async (req: Request, res: Response) => {
    const hours = Math.min(168, Math.max(1, Number(req.query.hours ?? 24) || 24));
    try {
      const m = await computeDqMetrics(hours, env);
      const body = {
        windowHours: m.windowHours,
        ingestionSuccessCount: Number(m.ingestionSuccessCount),
        ingestionErrorCount: Number(m.ingestionErrorCount),
        invalidPayloadCount: Number(m.invalidPayloadCount),
        missingRequiredParamsCount: Number(m.missingRequiredParamsCount),
        duplicateEventCount: Number(m.duplicateEventCount),
        lateEventCount: Number(m.lateEventCount),
        orphanBookingEventCount: Number(m.orphanBookingEventCount),
        orphanPaymentEventCount: Number(m.orphanPaymentEventCount),
        orphanRefundEventCount: Number(m.orphanRefundEventCount),
        martRefreshSuccessCount: Number(m.martRefreshSuccessCount),
        martRefreshFailureCount: Number(m.martRefreshFailureCount),
        dataFreshnessLagSeconds: Number(m.dataFreshnessLagSeconds),
        martFreshnessLagSeconds: Number(m.martFreshnessLagSeconds),
        criticalBackendEventCount: Number(m.criticalBackendEventCount),
        overallGrade: m.overallGrade,
        issues: m.issues,
      };
      res.json(body);
    } catch (e) {
      console.error("metrics analytics/dq error", e);
      res.status(500).json({ error: "Failed to compute DQ metrics" });
    }
  });

  router.get("/founder/summary", admin, async (_req: Request, res: Response) => {
    try {
      const summary = await buildFounderSummary();
      res.json(summary);
    } catch (e) {
      console.error("metrics founder/summary error", e);
      res.status(500).json({ error: "Failed to build founder summary" });
    }
  });

  router.get("/organizers/scores/latest", admin, async (_req: Request, res: Response) => {
    try {
      const rows = await prisma.organizerScoreSnapshot.findMany({
        orderBy: { recalculatedAt: "desc" },
        take: 500,
        include: { organizer: { select: { id: true, displayName: true } } },
      });
      const seen = new Set<string>();
      const latest: typeof rows = [];
      for (const r of rows) {
        if (!seen.has(r.organizerId)) {
          seen.add(r.organizerId);
          latest.push(r);
        }
      }
      res.json({ rows: latest });
    } catch (e) {
      console.error("metrics organizers/scores/latest error", e);
      res.status(500).json({ error: "Failed to load organizer scores" });
    }
  });

  router.get("/programs/scores/latest", admin, async (_req: Request, res: Response) => {
    try {
      const rows = await prisma.programScoreSnapshot.findMany({
        orderBy: { recalculatedAt: "desc" },
        take: 800,
        include: { program: { select: { id: true, title: true, organizerId: true } } },
      });
      const seen = new Set<string>();
      const latest: typeof rows = [];
      for (const r of rows) {
        if (!seen.has(r.programId)) {
          seen.add(r.programId);
          latest.push(r);
        }
      }
      res.json({ rows: latest });
    } catch (e) {
      console.error("metrics programs/scores/latest error", e);
      res.status(500).json({ error: "Failed to load program scores" });
    }
  });

  router.get("/ops/score-actions", admin, async (_req: Request, res: Response) => {
    try {
      const [orgRows, progRows] = await Promise.all([
        prisma.organizerScoreSnapshot.findMany({
          orderBy: { recalculatedAt: "desc" },
          take: 300,
          include: { organizer: { select: { id: true, displayName: true, verificationStatus: true, billingStatus: true } } },
        }),
        prisma.programScoreSnapshot.findMany({
          orderBy: { recalculatedAt: "desc" },
          take: 500,
          include: { program: { select: { id: true, title: true, organizerId: true } } },
        }),
      ]);

      const seenOrg = new Set<string>();
      const weakOrganizers: Array<Record<string, unknown>> = [];
      for (const row of orgRows) {
        if (seenOrg.has(row.organizerId)) continue;
        seenOrg.add(row.organizerId);
        if (row.scoreBand !== "low" && row.scoreBand !== "unknown") continue;
        const action =
          row.scoreBand === "low"
            ? "P1 moderation follow-up: response time, refunds, complaints."
            : "P2 data follow-up: insufficient sample for stable band.";
        weakOrganizers.push({
          organizerId: row.organizerId,
          displayName: row.organizer.displayName,
          score: row.organizerScore,
          scoreBand: row.scoreBand,
          verificationStatus: row.organizer.verificationStatus,
          billingStatus: row.organizer.billingStatus,
          recommendedAction: action,
          recalculatedAt: row.recalculatedAt,
        });
      }

      const seenProgram = new Set<string>();
      const weakPrograms: Array<Record<string, unknown>> = [];
      for (const row of progRows) {
        if (seenProgram.has(row.programId)) continue;
        seenProgram.add(row.programId);
        if (!["low", "insufficient_data", "unknown"].includes(row.scoreBand)) continue;
        const action =
          row.scoreBand === "low"
            ? "P1 content fix: media/safety/cancellation + funnel conversion check."
            : "P2 traffic/data check: increase valid views/leads for reliable score.";
        weakPrograms.push({
          programId: row.programId,
          title: row.program.title,
          organizerId: row.program.organizerId,
          score: row.totalProgramScore,
          scoreBand: row.scoreBand,
          recommendedAction: action,
          recalculatedAt: row.recalculatedAt,
        });
      }

      res.json({
        generatedAt: new Date().toISOString(),
        weakOrganizers: weakOrganizers.slice(0, 50),
        weakPrograms: weakPrograms.slice(0, 80),
      });
    } catch (e) {
      console.error("metrics ops/score-actions error", e);
      res.status(500).json({ error: "Failed to build score-driven ops actions" });
    }
  });

  /**
   * G4.1: заявки (bookings) по паре `entry_type` + `entry_id`, сырые данные из `sourceCampaign` + fallback в `notes`.
   * Пример: `GET /metrics/content-entries?from=2026-01-01&to=2026-04-30` (даты UTC YYYY-MM-DD, конец `to` включён).
   */
  router.get("/content-entries", adminOrInternal, async (req: Request, res: Response) => {
    const toDay = parseDay(req.query.to as string | undefined) ?? new Date();
    const fromDay =
      parseDay(req.query.from as string | undefined) ??
      new Date(toDay.getTime() - 29 * 24 * 60 * 60 * 1000);
    const rangeEnd = new Date(toDay);
    rangeEnd.setUTCDate(rangeEnd.getUTCDate() + 1);
    try {
      const bookings = await prisma.booking.findMany({
        where: {
          createdAt: { gte: fromDay, lt: rangeEnd },
        },
        select: {
          id: true,
          sourceCampaign: true,
          notes: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
        take: 20_000,
      });
      const { totals, rows } = aggregateContentEntryBookings(bookings);
      res.json({
        from: fromDay.toISOString(),
        toInclusive: toDay.toISOString(),
        note: "Одна заявка учитывается в строке, если в разборе есть и entry_type, и entry_id (см. G4.1).",
        totals,
        rows,
        truncated: bookings.length >= 20_000,
      });
    } catch (e) {
      console.error("metrics content-entries error", e);
      res.status(500).json({ error: "Failed to aggregate content entry bookings" });
    }
  });

  /** Сводка content_items: трафик + лиды + выручка (revenueRub в content_metrics). */
  /**
   * Пилот: shadow GMV/комиссия, счётчики броней (счета/инвойсы не ведутся в пилоте).
   * Реальные деньги на MyWave: только после снятия пилот-режима и договорённостей.
   */
  router.get("/pilot-kpi", admin, async (_req: Request, res: Response) => {
    try {
      const pilotMode = env.PILOT_MODE_ENABLED === true;
      const body = await getPilotKpiSnapshot(pilotMode);
      res.json(body);
    } catch (e) {
      console.error("metrics pilot-kpi error", e);
      res.status(500).json({ error: "Failed to load pilot KPI" });
    }
  });

  router.get("/content-performance", admin, async (req: Request, res: Response) => {
    try {
      const take = Math.min(
        500,
        Math.max(1, parseInt(String(req.query.limit || "100"), 10) || 100),
      );
      const rows = await prisma.contentMetric.groupBy({
        by: ["contentItemId"],
        _sum: {
          views: true,
          clicks: true,
          leads: true,
          bookingCount: true,
          revenueRub: true,
        },
      });
      const scored = rows
        .map((r) => ({
          r,
          revenueRub: r._sum.revenueRub ?? 0,
        }))
        .sort((a, b) => b.revenueRub - a.revenueRub);
      const top = scored.slice(0, take);
      const withMeta = await Promise.all(
        top.map(async ({ r }) => {
          const item = await prisma.contentItem.findUnique({
            where: { id: r.contentItemId },
            select: { id: true, workflowStatus: true, programId: true, rawItem: { select: { rawTitle: true } } },
          });
          return {
            contentItemId: r.contentItemId,
            workflowStatus: item?.workflowStatus,
            programId: item?.programId,
            titleHint: item?.rawItem?.rawTitle ?? null,
            views: r._sum.views ?? 0,
            clicks: r._sum.clicks ?? 0,
            leads: r._sum.leads ?? 0,
            bookingCount: r._sum.bookingCount ?? 0,
            revenueRub: r._sum.revenueRub ?? 0,
          };
        }),
      );
      res.json({ items: withMeta, note: "revenueRub накапливается при completed booking с contentItemId." });
    } catch (e) {
      console.error("metrics content-performance error", e);
      res.status(500).json({ error: "Failed to aggregate content performance" });
    }
  });

  router.get("/billing/daily", admin, async (req: Request, res: Response) => {
    const to = parseDay(req.query.to as string | undefined) ?? new Date();
    const from = parseDay(req.query.from as string | undefined) ?? new Date(to.getTime() - 29 * 24 * 60 * 60 * 1000);
    try {
      const billingRows = await prisma.$queryRaw<
        {
          day: Date;
          organizerId: string;
          payments_amount_rub: bigint;
          payments_count: number;
          refunds_amount_rub: bigint;
          refunds_count: number;
          commissions_accrued_rub: bigint;
          commissions_approved_rub: bigint;
          commissions_invoiced_rub: bigint;
          commissions_paid_rub: bigint;
          commissions_reversed_rub: bigint;
          commissions_disputed_rub: bigint;
        }[]
      >(Prisma.sql`
        SELECT
          day,
          "organizerId",
          payments_amount_rub,
          payments_count,
          refunds_amount_rub,
          refunds_count,
          commissions_accrued_rub,
          commissions_approved_rub,
          commissions_invoiced_rub,
          commissions_paid_rub,
          commissions_reversed_rub,
          commissions_disputed_rub
        FROM mv_billing_daily
        WHERE day >= ${from}::date AND day <= ${to}::date
        ORDER BY day ASC, "organizerId" ASC
      `);
      const rows = billingRows.map((r) => ({
        ...r,
        payments_amount_rub: Number(r.payments_amount_rub),
        refunds_amount_rub: Number(r.refunds_amount_rub),
        commissions_accrued_rub: Number(r.commissions_accrued_rub),
        commissions_approved_rub: Number(r.commissions_approved_rub),
        commissions_invoiced_rub: Number(r.commissions_invoiced_rub),
        commissions_paid_rub: Number(r.commissions_paid_rub),
        commissions_reversed_rub: Number(r.commissions_reversed_rub),
        commissions_disputed_rub: Number(r.commissions_disputed_rub),
      }));
      res.json({ from: from.toISOString(), to: to.toISOString(), rows });
    } catch (e) {
      if (isMissingAnalyticsMartError(e, "mv_billing_daily")) {
        res.status(200).json({
          from: from.toISOString(),
          to: to.toISOString(),
          rows: [],
          warning: "analytics_marts_missing",
          hint: "Apply prisma migrations (mv_billing_daily) or run POST /internal/analytics/refresh after migrate.",
        });
        return;
      }
      console.error("metrics billing/daily error", e);
      res.status(500).json({ error: "Failed to load billing daily metrics" });
    }
  });

  return router;
}
