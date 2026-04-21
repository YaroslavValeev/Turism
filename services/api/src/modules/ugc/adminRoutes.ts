import type { Env } from "@mywave/config";
import { Router, Request, Response } from "express";
import { prisma } from "../../lib/prisma";
import { requireAdmin } from "../../middleware/auth";
import { writeAuditLog } from "../../lib/audit";
import { processUgcRequestQueue } from "./ugcService";
import { maybeGrantRewardForApprovedUgc } from "./rewardService";

const STATUSES = ["pending", "approved", "rejected"] as const;
type Status = (typeof STATUSES)[number];

function isStatus(s: string): s is Status {
  return (STATUSES as readonly string[]).includes(s);
}

export function ugcAdminRoutes(env: Env): Router {
  const router = Router();
  const admin = requireAdmin(env);

  /**
   * Агрегированный обзор UGC для оперативного мониторинга.
   */
  router.get("/overview", admin, async (_req: Request, res: Response) => {
    const now = new Date();
    const reminderWindowDays = Math.max(1, Math.floor(env.REFERRAL_REWARD_EXPIRY_REMINDER_WINDOW_DAYS || 7));
    const expiringSoonUntil = new Date(now.getTime() + reminderWindowDays * 24 * 60 * 60 * 1000);
    const [
      pending, approved, rejected,
      pendingReq, sentReq, submittedReq, failedReq,
      rewardGranted, rewardsIssued, rewardsUsed, rewardsExpired, rewardsExpiringSoon, remindersSent,
      selfUseBlocked, duplicateBlocked, rateLimited,
    ] = await Promise.all([
      prisma.programUgc.count({ where: { moderationStatus: "pending" } }),
      prisma.programUgc.count({ where: { moderationStatus: "approved" } }),
      prisma.programUgc.count({ where: { moderationStatus: "rejected" } }),
      prisma.programUgcRequest.count({ where: { status: "queued" } }),
      prisma.programUgcRequest.count({ where: { status: "sent" } }),
      prisma.programUgcRequest.count({ where: { status: "submitted" } }),
      prisma.programUgcRequest.count({ where: { status: "delivery_failed" } }),
      prisma.programUgc.count({ where: { rewardStatus: "granted" } }),
      prisma.userReward.count(),
      prisma.userReward.count({ where: { status: "used" } }),
      prisma.userReward.count({ where: { status: "expired" } }),
      prisma.userReward.count({
        where: {
          status: "available",
          expiresAt: { not: null, gt: now, lte: expiringSoonUntil },
        },
      }),
      prisma.userReward.count({ where: { expiryReminderSentAt: { not: null } } }),
      prisma.referralAbuseEvent.count({ where: { reason: "self_use_blocked" } }),
      prisma.referralAbuseEvent.count({ where: { reason: "duplicate_use_blocked" } }),
      prisma.referralAbuseEvent.count({ where: { reason: "rate_limited" } }),
    ]);

    const byProgramRaw = await prisma.programUgc.groupBy({
      by: ["programId", "moderationStatus"],
      _count: { _all: true },
    });

    // Reward recovery: сколько возвратов и по каким причинам.
    const [rewardsRecovered, recoveryByReasonRaw, rewardsNotRecovered] = await Promise.all([
      prisma.userReward.count({ where: { recoveredAt: { not: null } } }),
      prisma.userReward.groupBy({
        by: ["recoveredCancellationKind"],
        where: { recoveredAt: { not: null } },
        _count: { _all: true },
      }),
      // booking, который в terminal non-completed со своим reward, но reward всё ещё used
      // (recovery не сработал — либо policy (no_show/fraud), либо был completed, либо bound_to_other).
      prisma.booking.count({
        where: {
          appliedRewardId: { not: null },
          bookingStatus: { in: ["cancelled_user", "cancelled_organizer", "refund_done"] },
          appliedReward: { is: { status: "used" } },
        },
      }),
    ]);

    // Billing-агрегаты по reward-скидкам (Model A: discount реально уменьшил цену гостя).
    const [discountTotalAgg, discountByProgram, discountByCode] = await Promise.all([
      prisma.booking.aggregate({
        _sum: { discountAmountRub: true, originalAmountRub: true, finalAmountRub: true },
        _count: { _all: true },
        where: { discountAmountRub: { gt: 0 } },
      }),
      prisma.booking.groupBy({
        by: ["programId"],
        where: { discountAmountRub: { gt: 0 } },
        _sum: { discountAmountRub: true },
        _count: { _all: true },
        orderBy: { _sum: { discountAmountRub: "desc" } },
        take: 10,
      }),
      prisma.booking.groupBy({
        by: ["referralCode"],
        where: { discountAmountRub: { gt: 0 }, referralCode: { not: null } },
        _sum: { discountAmountRub: true },
        _count: { _all: true },
        orderBy: { _sum: { discountAmountRub: "desc" } },
        take: 10,
      }),
    ]);

    type ProgramAgg = { programId: string; pending: number; approved: number; rejected: number };
    const byProgramMap = new Map<string, ProgramAgg>();
    for (const row of byProgramRaw) {
      const agg = byProgramMap.get(row.programId) ?? {
        programId: row.programId,
        pending: 0,
        approved: 0,
        rejected: 0,
      };
      if (row.moderationStatus === "pending") agg.pending += row._count._all;
      if (row.moderationStatus === "approved") agg.approved += row._count._all;
      if (row.moderationStatus === "rejected") agg.rejected += row._count._all;
      byProgramMap.set(row.programId, agg);
    }

    res.json({
      ugc: { pending, approved, rejected, total: pending + approved + rejected },
      requests: {
        queued: pendingReq,
        sent: sentReq,
        submitted: submittedReq,
        delivery_failed: failedReq,
      },
      reward: {
        granted: rewardGranted,
        issued: rewardsIssued,
        used: rewardsUsed,
        rewards_expired: rewardsExpired,
        expiring_soon: rewardsExpiringSoon,
        rewards_expiring_soon: rewardsExpiringSoon,
        reminders_sent: remindersSent,
      },
      abuse: {
        self_use_blocked: selfUseBlocked,
        duplicate_use_blocked: duplicateBlocked,
        rate_limited: rateLimited,
      },
      recovery: {
        rewards_recovered: rewardsRecovered,
        rewards_not_recovered: rewardsNotRecovered,
        by_reason: recoveryByReasonRaw.map((r) => ({
          kind: r.recoveredCancellationKind ?? "unknown",
          count: r._count._all,
        })),
      },
      discount: {
        total_discount_rub: discountTotalAgg._sum.discountAmountRub ?? 0,
        total_original_rub: discountTotalAgg._sum.originalAmountRub ?? 0,
        total_final_rub: discountTotalAgg._sum.finalAmountRub ?? 0,
        bookings_with_discount: discountTotalAgg._count._all ?? 0,
        top_programs: discountByProgram.map((r) => ({
          programId: r.programId,
          discount_rub: r._sum.discountAmountRub ?? 0,
          bookings: r._count._all,
        })),
        top_referral_codes: discountByCode.map((r) => ({
          referralCode: r.referralCode,
          discount_rub: r._sum.discountAmountRub ?? 0,
          bookings: r._count._all,
        })),
      },
      by_program: Array.from(byProgramMap.values()).sort((a, b) => b.pending - a.pending),
    });
  });

  /**
   * Список UGC по статусу (по умолчанию pending). Пагинация limit/offset.
   */
  router.get("/", admin, async (req: Request, res: Response) => {
    const statusRaw = typeof req.query.status === "string" ? req.query.status.trim() : "pending";
    const status = isStatus(statusRaw) ? statusRaw : "pending";
    const programId = typeof req.query.programId === "string" ? req.query.programId.trim() : "";
    const limit = Math.min(Math.max(Number(req.query.limit ?? 50) || 50, 1), 200);
    const offset = Math.max(Number(req.query.offset ?? 0) || 0, 0);

    const where = {
      moderationStatus: status,
      ...(programId ? { programId } : {}),
    };
    const [rows, total] = await Promise.all([
      prisma.programUgc.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: offset,
        take: limit,
        include: {
          program: { select: { id: true, title: true } },
          organizer: { select: { id: true, displayName: true } },
        },
      }),
      prisma.programUgc.count({ where }),
    ]);
    res.json({ rows, total, limit, offset });
  });

  /**
   * Approve UGC. Только после явной модерации попадает в публичный список карточки.
   */
  router.post("/:id/approve", admin, async (req: Request, res: Response) => {
    const id = String(req.params.id ?? "").trim();
    if (!id) {
      res.status(400).json({ error: "id required" });
      return;
    }
    const row = await prisma.programUgc.findUnique({ where: { id } });
    if (!row) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    if (!row.consentToPublish) {
      res.status(400).json({ error: "consent_missing" });
      return;
    }
    const updated = await prisma.programUgc.update({
      where: { id },
      data: {
        moderationStatus: "approved",
        reviewedAt: new Date(),
        moderationNotes: typeof req.body?.notes === "string" ? req.body.notes.slice(0, 1000) : null,
      },
    });
    await writeAuditLog({
      entityType: "program_ugc",
      entityId: id,
      changedField: "moderationStatus",
      oldValue: row.moderationStatus,
      newValue: "approved",
      changedBy: req.adminUserId ?? null,
      reason: "ugc moderation approve",
    });

    const reward = await maybeGrantRewardForApprovedUgc(prisma, env, updated);
    if (reward.granted) {
      await writeAuditLog({
        entityType: "program_ugc",
        entityId: id,
        changedField: "rewardStatus",
        oldValue: "none",
        newValue: "granted",
        changedBy: req.adminUserId ?? null,
        reason: `reward granted + referralCode=${reward.referralCode}`,
      });
    }

    const final = await prisma.programUgc.findUnique({ where: { id } });
    res.json({ ok: true, ugc: final, reward });
  });

  /**
   * Reject UGC — не попадает на карточку.
   */
  router.post("/:id/reject", admin, async (req: Request, res: Response) => {
    const id = String(req.params.id ?? "").trim();
    if (!id) {
      res.status(400).json({ error: "id required" });
      return;
    }
    const row = await prisma.programUgc.findUnique({ where: { id } });
    if (!row) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    const updated = await prisma.programUgc.update({
      where: { id },
      data: {
        moderationStatus: "rejected",
        reviewedAt: new Date(),
        moderationNotes: typeof req.body?.notes === "string" ? req.body.notes.slice(0, 1000) : null,
      },
    });
    await writeAuditLog({
      entityType: "program_ugc",
      entityId: id,
      changedField: "moderationStatus",
      oldValue: row.moderationStatus,
      newValue: "rejected",
      changedBy: req.adminUserId ?? null,
      reason: typeof req.body?.notes === "string" ? req.body.notes.slice(0, 500) : "ugc moderation reject",
    });
    res.json({ ok: true, ugc: updated });
  });

  /**
   * Ручной прогон очереди UGC-запросов (аналогично /jobs/run-review-reminders).
   */
  router.post("/run-requests", admin, async (_req: Request, res: Response) => {
    try {
      const out = await processUgcRequestQueue(prisma, env);
      res.json({ ok: true, ...out });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "Job failed" });
    }
  });

  /** Нативные медиа (S3 key); human-gate модерация. */
  router.get("/media-assets", admin, async (_req: Request, res: Response) => {
    const rows = await prisma.programUgcMediaAsset.findMany({
      take: 100,
      orderBy: { createdAt: "desc" },
      include: {
        programUgc: { select: { id: true, bookingId: true, programId: true, moderationStatus: true } },
      },
    });
    res.setHeader("Cache-Control", "no-store");
    res.json({ items: rows });
  });

  router.post("/media-assets/register", admin, async (req: Request, res: Response) => {
    const body = req.body as {
      programUgcId?: unknown;
      storageKey?: unknown;
      mimeType?: unknown;
      byteSize?: unknown;
    };
    const programUgcId = typeof body.programUgcId === "string" ? body.programUgcId.trim() : "";
    const storageKey = typeof body.storageKey === "string" ? body.storageKey.trim() : "";
    const mimeType = typeof body.mimeType === "string" ? body.mimeType.trim() : "application/octet-stream";
    const byteSize = typeof body.byteSize === "number" && Number.isFinite(body.byteSize) ? Math.floor(body.byteSize) : 0;
    if (!programUgcId || !storageKey) {
      res.status(400).json({ error: "programUgcId_and_storageKey_required" });
      return;
    }
    const ugc = await prisma.programUgc.findUnique({ where: { id: programUgcId }, select: { id: true } });
    if (!ugc) {
      res.status(404).json({ error: "ugc_not_found" });
      return;
    }
    const row = await prisma.programUgcMediaAsset.create({
      data: {
        programUgcId,
        storageKey,
        mimeType,
        byteSize,
        moderationStatus: "pending",
      },
    });
    await writeAuditLog({
      entityType: "program_ugc_media_asset",
      entityId: row.id,
      changedField: "created",
      oldValue: null,
      newValue: storageKey,
      changedBy: req.adminUserId ?? null,
      reason: "register_native_media",
    });
    res.json({ ok: true, asset: row });
  });

  return router;
}
