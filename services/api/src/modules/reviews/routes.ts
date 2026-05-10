/**
 * Reviews: only after completed booking. Admin queue, moderation status, audit.
 * No public review submission until moderation rules. Source: db_schema_draft.
 */
import { Router, Request, Response } from "express";
import { prisma } from "../../lib/prisma";
import { writeAuditLog } from "../../lib/audit";
import { requireAdmin } from "../../middleware/auth";
import type { Env } from "@mywave/config";
import { processReviewRequestQueue } from "./reviewRequests";

const MODERATION_STATUSES = ["pending", "approved", "rejected"] as const;

function isModerationStatus(s: string): boolean {
  return MODERATION_STATUSES.includes(s as (typeof MODERATION_STATUSES)[number]);
}

export function reviewsRoutes(env: Env): Router {
  const router = Router();
  const admin = requireAdmin(env);

  router.get("/request/:token", async (req: Request, res: Response) => {
    const token = String(req.params.token ?? "").trim();
    if (!token) {
      res.status(400).json({ error: "token required" });
      return;
    }
    const rr = await prisma.reviewRequest.findUnique({
      where: { requestToken: token },
      select: {
        id: true,
        bookingId: true,
        status: true,
        booking: {
          select: {
            id: true,
            bookingStatus: true,
            program: { select: { id: true, title: true } },
            organizer: { select: { id: true, displayName: true } },
          },
        },
      },
    });
    if (!rr) {
      res.status(404).json({ error: "Request not found" });
      return;
    }
    if (rr.booking.bookingStatus !== "completed") {
      res.status(400).json({ error: "Booking is not completed" });
      return;
    }
    const review = await prisma.review.findUnique({
      where: { bookingId: rr.bookingId },
      select: { id: true, rating: true, moderationStatus: true, createdAt: true },
    });
    res.json({ ok: true, request: rr, review });
  });

  router.post("/request/:token/submit", async (req: Request, res: Response) => {
    const token = String(req.params.token ?? "").trim();
    const rating = Number(req.body?.rating);
    const comment = typeof req.body?.comment === "string" ? req.body.comment.trim() : "";
    if (!token) {
      res.status(400).json({ error: "token required" });
      return;
    }
    if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
      res.status(400).json({ error: "rating must be 1..5" });
      return;
    }
    const rr = await prisma.reviewRequest.findUnique({
      where: { requestToken: token },
      include: { booking: { select: { id: true, bookingStatus: true, programId: true, organizerId: true } } },
    });
    if (!rr) {
      res.status(404).json({ error: "Request not found" });
      return;
    }
    if (rr.booking.bookingStatus !== "completed") {
      res.status(400).json({ error: "Review allowed only for completed bookings" });
      return;
    }
    const existing = await prisma.review.findUnique({ where: { bookingId: rr.bookingId } });
    if (existing) {
      res.status(409).json({ error: "Review already exists for this booking" });
      return;
    }
    const review = await prisma.review.create({
      data: {
        bookingId: rr.booking.id,
        programId: rr.booking.programId,
        organizerId: rr.booking.organizerId,
        rating,
        comment: comment || null,
        moderationStatus: "pending",
      },
      select: { id: true, bookingId: true, rating: true, moderationStatus: true, createdAt: true },
    });
    await prisma.reviewRequest.update({
      where: { id: rr.id },
      data: {
        status: "skipped_review_exists",
        nextReminderAt: null,
        lastError: null,
      },
    });
    await writeAuditLog({
      entityType: "review_request",
      entityId: rr.id,
      changedField: "review_submitted_by_request",
      oldValue: "sent",
      newValue: "review_created",
      changedBy: null,
      reason: "public review request token submit",
    });
    res.status(201).json({ ok: true, review });
  });

  /** Public: approved reviews for a published program (no PII). Must be registered before `/:id`. */
  router.get("/public", async (req: Request, res: Response) => {
    const programId = req.query.programId as string | undefined;
    if (!programId?.trim()) {
      res.status(400).json({ error: "programId query required" });
      return;
    }
    const program = await prisma.program.findFirst({
      where: { id: programId, publishStatus: "published" },
      select: { id: true },
    });
    if (!program) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const list = await prisma.review.findMany({
      where: { programId, moderationStatus: "approved" },
      select: { id: true, rating: true, comment: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    });
    res.json(list);
  });

  router.get("/", admin, async (req: Request, res: Response) => {
    const status = req.query.moderation_status as string | undefined;
    const where = status && isModerationStatus(status) ? { moderationStatus: status } : {};
    const list = await prisma.review.findMany({
      where,
      include: {
        booking: { select: { id: true, guestContact: true, bookingStatus: true } },
        program: { select: { id: true, title: true } },
        organizer: { select: { id: true, displayName: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    res.json(list);
  });

  router.get("/:id", admin, async (req: Request, res: Response) => {
    const r = await prisma.review.findUnique({
      where: { id: req.params.id },
      include: { booking: true, program: { select: { id: true, title: true } }, organizer: { select: { id: true, displayName: true } } },
    });
    if (!r) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json(r);
  });

  // Create review only when booking is completed (canonical rule).
  router.post("/", admin, async (req: Request, res: Response) => {
    const body = req.body as { bookingId: string; rating: number; comment?: string; moderationStatus?: string };
    if (!body.bookingId || body.rating == null) {
      res.status(400).json({ error: "bookingId and rating required" });
      return;
    }
    const booking = await prisma.booking.findUnique({
      where: { id: body.bookingId },
      select: { id: true, bookingStatus: true, programId: true, organizerId: true },
    });
    if (!booking) {
      res.status(404).json({ error: "Booking not found" });
      return;
    }
    if (booking.bookingStatus !== "completed") {
      res.status(400).json({ error: "Review allowed only for completed bookings" });
      return;
    }
    const existing = await prisma.review.findUnique({ where: { bookingId: body.bookingId } });
    if (existing) {
      res.status(409).json({ error: "Review already exists for this booking" });
      return;
    }
    const modStatus = body.moderationStatus && isModerationStatus(body.moderationStatus) ? body.moderationStatus : "pending";
    const r = await prisma.review.create({
      data: {
        bookingId: booking.id,
        programId: booking.programId,
        organizerId: booking.organizerId,
        rating: Number(body.rating),
        comment: body.comment ?? null,
        moderationStatus: modStatus,
      },
      include: { booking: { select: { id: true } }, program: { select: { title: true } }, organizer: { select: { displayName: true } } },
    });
    await writeAuditLog({
      entityType: "review",
      entityId: r.id,
      changedField: "review_created",
      oldValue: null,
      newValue: modStatus,
      changedBy: req.adminUserId ?? null,
      reason: "review created",
    });
    res.status(201).json(r);
  });

  router.patch("/:id/moderation", admin, async (req: Request, res: Response) => {
    const existing = await prisma.review.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const { moderationStatus } = req.body as { moderationStatus?: string };
    if (!moderationStatus || !isModerationStatus(moderationStatus)) {
      res.status(400).json({ error: "valid moderationStatus required", allowed: MODERATION_STATUSES.join(",") });
      return;
    }
    const r = await prisma.review.update({
      where: { id: req.params.id },
      data: { moderationStatus },
      include: { booking: { select: { id: true } }, program: { select: { title: true } }, organizer: { select: { displayName: true } } },
    });
    await writeAuditLog({
      entityType: "review",
      entityId: r.id,
      changedField: "review_moderation_change",
      oldValue: existing.moderationStatus,
      newValue: r.moderationStatus,
      changedBy: req.adminUserId ?? null,
      reason: "moderation update",
    });
    res.json(r);
  });

  router.get("/requests/list", admin, async (req: Request, res: Response) => {
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const rows = await prisma.reviewRequest.findMany({
      where: status ? { status } : {},
      orderBy: { requestedAt: "desc" },
      take: 200,
      include: {
        booking: { select: { id: true, bookingStatus: true, completedAt: true } },
        organizer: { select: { id: true, displayName: true } },
        program: { select: { id: true, title: true } },
      },
    });
    res.json({ rows });
  });

  router.post("/requests/process", admin, async (_req: Request, res: Response) => {
    const out = await processReviewRequestQueue(env);
    res.json({ ok: true, ...out });
  });

  return router;
}
