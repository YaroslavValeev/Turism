import type { Prisma } from "@prisma/client";
import type { Env } from "@mywave/config";
import { Router, Request, Response } from "express";
import { prisma } from "../../../lib/prisma";
import { requireAdmin } from "../../../middleware/auth";
import { writeAuditLog } from "../../../lib/audit";
import { CONVERSION_DRAFT_STATUS } from "./constants";
import {
  adminDeferDraft,
  adminReopenDraft,
  adminRejectDraft,
  adminRetryOwnerNotifyForDraft,
  applyOwnerApprovedSend,
} from "./draftService";
import { buildOwnerNotifyUi } from "./ownerNotifyUi";

function enrichDraftJson<T extends { ownerNotifiedAt: Date | null; ownerNotifyLastAttemptAt: Date | null; ownerNotifyLastError: string | null }>(
  d: T,
): T & ReturnType<typeof buildOwnerNotifyUi> {
  return { ...d, ...buildOwnerNotifyUi(d) };
}

export function conversionDraftAdminRoutes(env: Env): Router {
  const router = Router();
  const admin = requireAdmin(env);

  router.get("/stats/summary", admin, async (_req: Request, res: Response) => {
    const startOfUtcDay = new Date();
    startOfUtcDay.setUTCHours(0, 0, 0, 0);
    const [awaitingOwner, deferred, rejected, sentToday, ownerNotifyFailed] = await Promise.all([
      prisma.conversionMessageDraft.count({ where: { status: CONVERSION_DRAFT_STATUS.AWAITING_OWNER } }),
      prisma.conversionMessageDraft.count({ where: { status: CONVERSION_DRAFT_STATUS.DEFERRED } }),
      prisma.conversionMessageDraft.count({ where: { status: CONVERSION_DRAFT_STATUS.REJECTED } }),
      prisma.conversionMessageDraft.count({
        where: {
          status: CONVERSION_DRAFT_STATUS.SENT,
          sentAt: { gte: startOfUtcDay },
        },
      }),
      prisma.conversionMessageDraft.count({
        where: {
          ownerNotifiedAt: null,
          ownerNotifyLastError: { not: null },
        },
      }),
    ]);
    res.json({
      awaitingOwner,
      deferred,
      rejected,
      sentToday,
      ownerNotifyFailed,
      sentTodayStartsAt: startOfUtcDay.toISOString(),
    });
  });

  /** Распределение черновиков по status (наблюдаемость v2). */
  router.get("/metrics/observability", admin, async (_req: Request, res: Response) => {
    const grouped = await prisma.conversionMessageDraft.groupBy({
      by: ["status"],
      _count: { _all: true },
    });
    const byStatus = Object.fromEntries(grouped.map((g) => [g.status, g._count._all]));
    res.setHeader("Cache-Control", "no-store");
    res.json({ by_status: byStatus, total: grouped.reduce((s, g) => s + g._count._all, 0) });
  });

  /** Массовый defer (owner batch-actions). */
  router.post("/batch-defer", admin, async (req: Request, res: Response) => {
    const body = req.body as { ids?: unknown; deferHours?: unknown };
    const ids = Array.isArray(body.ids) ? body.ids.filter((x): x is string => typeof x === "string") : [];
    const deferHours = typeof body.deferHours === "number" && Number.isFinite(body.deferHours) ? body.deferHours : Number(body.deferHours);
    if (ids.length === 0 || !Number.isFinite(deferHours) || deferHours <= 0) {
      res.status(400).json({ error: "ids_and_deferHours_required" });
      return;
    }
    const reviewedBy = `admin:${req.adminUserId ?? "unknown"}`;
    const results: Array<{ id: string; ok: boolean; error?: string }> = [];
    for (const id of ids.slice(0, 100)) {
      // eslint-disable-next-line no-await-in-loop
      const r = await adminDeferDraft(prisma, id, reviewedBy, deferHours);
      results.push({ id, ok: r.ok, error: r.error });
    }
    res.json({ ok: true, results });
  });

  router.get("/", admin, async (req: Request, res: Response) => {
    const q = req.query;
    const status = typeof q.status === "string" && q.status.trim() ? q.status.trim() : undefined;
    const programId = typeof q.programId === "string" && q.programId.trim() ? q.programId.trim() : undefined;
    const organizerId = typeof q.organizerId === "string" && q.organizerId.trim() ? q.organizerId.trim() : undefined;
    const stageRaw = q.stage;
    let stage: number | undefined;
    if (typeof stageRaw === "string" && stageRaw.trim() !== "") {
      const n = Number(stageRaw);
      if (Number.isFinite(n)) stage = n;
    }

    const limitRaw = typeof q.limit === "string" ? Number(q.limit) : Number.NaN;
    const offsetRaw = typeof q.offset === "string" ? Number(q.offset) : Number.NaN;
    const limit = Number.isFinite(limitRaw) ? Math.min(100, Math.max(1, Math.floor(limitRaw))) : 50;
    const offset = Number.isFinite(offsetRaw) ? Math.max(0, Math.floor(offsetRaw)) : 0;

    const where: Prisma.ConversionMessageDraftWhereInput = {};
    if (status) where.status = status;
    if (programId) where.programId = programId;
    if (organizerId) where.organizerId = organizerId;
    if (stage !== undefined) where.stage = stage;

    const [total, rows] = await Promise.all([
      prisma.conversionMessageDraft.count({ where }),
      prisma.conversionMessageDraft.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: offset,
        take: limit,
        include: {
          organizer: { select: { id: true, displayName: true, contactEmail: true } },
          program: { select: { id: true, title: true, publishStatus: true } },
        },
      }),
    ]);
    const items = rows.map((row) => enrichDraftJson(row));
    res.json({ items, total, limit, offset });
  });

  router.post("/:id/send", admin, async (req: Request, res: Response) => {
    const reviewedBy = `admin:${req.adminUserId ?? "unknown"}`;
    const r = await applyOwnerApprovedSend(prisma, env, req.params.id, reviewedBy);
    if (!r.ok) {
      res.status(400).json({ error: r.error ?? "send_failed" });
      return;
    }
    res.json({ ok: true });
  });

  router.post("/:id/reject", admin, async (req: Request, res: Response) => {
    const reviewedBy = `admin:${req.adminUserId ?? "unknown"}`;
    const r = await adminRejectDraft(prisma, req.params.id, reviewedBy);
    if (!r.ok) {
      res.status(400).json({ error: r.error ?? "reject_failed" });
      return;
    }
    res.json({ ok: true });
  });

  router.post("/:id/retry-owner-notify", admin, async (req: Request, res: Response) => {
    const r = await adminRetryOwnerNotifyForDraft(env, prisma, req.params.id);
    if (!r.ok) {
      res.status(400).json({ error: r.error ?? "retry_failed" });
      return;
    }
    res.json({ ok: true });
  });

  router.post("/:id/defer", admin, async (req: Request, res: Response) => {
    const body = req.body as { deferHours?: unknown };
    const raw = body.deferHours;
    const deferHours = typeof raw === "number" && Number.isFinite(raw) ? raw : Number(raw);
    if (!Number.isFinite(deferHours) || deferHours <= 0) {
      res.status(400).json({ error: "deferHours_required" });
      return;
    }
    const reviewedBy = `admin:${req.adminUserId ?? "unknown"}`;
    const r = await adminDeferDraft(prisma, req.params.id, reviewedBy, deferHours);
    if (!r.ok) {
      res.status(400).json({ error: r.error ?? "defer_failed" });
      return;
    }
    res.json({ ok: true, deferredUntil: r.deferredUntil });
  });

  router.post("/:id/reopen", admin, async (req: Request, res: Response) => {
    const reviewedBy = `admin:${req.adminUserId ?? "unknown"}`;
    const r = await adminReopenDraft(prisma, env, req.params.id, reviewedBy);
    if (!r.ok) {
      res.status(400).json({ error: r.error ?? "reopen_failed" });
      return;
    }
    res.json({ ok: true });
  });

  router.get("/:id", admin, async (req: Request, res: Response) => {
    const d = await prisma.conversionMessageDraft.findUnique({
      where: { id: req.params.id },
      include: {
        organizer: { select: { id: true, displayName: true, contactEmail: true, telegramChatId: true } },
        program: { select: { id: true, title: true, publishStatus: true } },
      },
    });
    if (!d) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    const deliveryDedupe = `conversion:${d.programId}:stage:${d.stage}`;
    const [delivery, auditHistory] = await Promise.all([
      prisma.programConversionDelivery.findUnique({ where: { dedupeKey: deliveryDedupe } }),
      prisma.auditLog.findMany({
        where: { entityType: "ConversionMessageDraft", entityId: d.id },
        orderBy: { createdAt: "desc" },
        take: 40,
        select: {
          id: true,
          changedField: true,
          oldValue: true,
          newValue: true,
          changedBy: true,
          reason: true,
          createdAt: true,
        },
      }),
    ]);
    res.json({ ...enrichDraftJson(d), delivery, auditHistory });
  });

  router.patch("/:id", admin, async (req: Request, res: Response) => {
    const messageText = (req.body as { messageText?: unknown }).messageText;
    if (typeof messageText !== "string" || !messageText.trim()) {
      res.status(400).json({ error: "messageText_required" });
      return;
    }
    const d = await prisma.conversionMessageDraft.findUnique({ where: { id: req.params.id } });
    if (!d) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    if (
      d.status !== CONVERSION_DRAFT_STATUS.AWAITING_OWNER &&
      d.status !== CONVERSION_DRAFT_STATUS.EDITED
    ) {
      res.status(400).json({ error: "invalid_status_for_edit", status: d.status });
      return;
    }
    await prisma.conversionMessageDraft.update({
      where: { id: d.id },
      data: {
        messageText: messageText.trim(),
        status: CONVERSION_DRAFT_STATUS.EDITED,
      },
    });
    await writeAuditLog({
      entityType: "ConversionMessageDraft",
      entityId: d.id,
      changedField: "admin_edit_messageText",
      oldValue: d.status,
      newValue: CONVERSION_DRAFT_STATUS.EDITED,
      changedBy: req.adminUserId ?? "admin",
    });
    res.json({ ok: true });
  });

  return router;
}
