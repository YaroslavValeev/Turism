/**
 * Booking: assisted intake (POST public), admin queue (GET), status update (PATCH admin). Audit on status change.
 * Source: booking_data_contract.md, canonical_status_models. No payment flow, no revenue UI.
 */
import { Router, Request, Response } from "express";
import { prisma } from "../../lib/prisma";
import { writeAuditLog } from "../../lib/audit";
import { requireAdmin } from "../../middleware/auth";
import { isBookingStatus, isValidTransition, getNextStatuses } from "./statusRules";
import type { Env } from "@mywave/config";
import { isProgramPubliclyVisible } from "../programs/publicVisibility";
import { emitBackendAnalyticsEventBestEffort } from "../analytics/service";
import { computeTravelerKeyHash } from "../../lib/travelerKey";
import { ensureReviewRequestForCompletedBooking } from "../reviews/reviewRequests";

export function bookingsRoutes(env: Env): Router {
  const router = Router();
  const admin = requireAdmin(env);

  // Assisted booking intake: public can create inquiry (new). organizer_id from program.
  router.post("/", async (req: Request, res: Response) => {
    const body = req.body as { programId?: string; guestContact?: string; sourceChannel?: string; notes?: string };
    if (!body.programId || !body.guestContact) {
      res.status(400).json({ error: "programId and guestContact required" });
      return;
    }
    const program = await prisma.program.findUnique({
      where: { id: body.programId },
      select: { id: true, organizerId: true, publishStatus: true, endDate: true, spotsAvailable: true },
    });
    if (!program || !isProgramPubliclyVisible(program)) {
      res.status(404).json({ error: "Program not found or unavailable" });
      return;
    }
    const travelerKeyHash = computeTravelerKeyHash(env, body.guestContact);
    const b = await prisma.booking.create({
      data: {
        programId: program.id,
        organizerId: program.organizerId,
        guestContact: body.guestContact,
        travelerKeyHash: travelerKeyHash ?? undefined,
        sourceChannel: body.sourceChannel ?? null,
        notes: body.notes?.trim() ? body.notes.trim() : null,
        bookingStatus: "new",
      },
      include: { program: { select: { title: true } }, organizer: { select: { displayName: true } } },
    });

    emitBackendAnalyticsEventBestEffort({
      event_name: "booking_created",
      event_version: 1,
      event_source: "backend",
      event_time: new Date().toISOString(),
      idempotency_key: `booking_created:${b.id}`,
      organizer_id: b.organizerId,
      program_id: b.programId,
      booking_id: b.id,
      properties_json: {
        booking_status: b.bookingStatus,
        source_channel: b.sourceChannel ?? null,
      },
    });
    res.status(201).json(b);
  });

  // Admin queue only
  router.get("/", admin, async (req: Request, res: Response) => {
    const status = req.query.booking_status as string | undefined;
    const where = status && isBookingStatus(status) ? { bookingStatus: status } : {};
    const list = await prisma.booking.findMany({
      where,
      include: {
        program: { select: { id: true, title: true, discipline: true } },
        organizer: { select: { id: true, displayName: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    res.json(list);
  });

  router.get("/:id", admin, async (req: Request, res: Response) => {
    const b = await prisma.booking.findUnique({
      where: { id: req.params.id },
      include: { program: true, organizer: { select: { id: true, displayName: true, contactEmail: true } } },
    });
    if (!b) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const nextStatuses = getNextStatuses(b.bookingStatus);
    res.json({ ...b, nextStatuses });
  });

  router.patch("/:id/status", admin, async (req: Request, res: Response) => {
    const existing = await prisma.booking.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const { bookingStatus } = req.body as { bookingStatus?: string };
    if (!bookingStatus || !isBookingStatus(bookingStatus)) {
      res.status(400).json({
        error: "valid bookingStatus required",
        allowed: "new,reviewed,sent_to_organizer,contacted,offer_sent,booked,paid_off_platform,completed,cancelled_user,cancelled_organizer,refund_pending,refund_done",
      });
      return;
    }
    if (!isValidTransition(existing.bookingStatus, bookingStatus)) {
      res.status(400).json({ error: "Invalid status transition", from: existing.bookingStatus, to: bookingStatus });
      return;
    }
    const data: { bookingStatus: string; firstResponseAt?: Date; bookedAt?: Date; completedAt?: Date } = { bookingStatus };
    if (bookingStatus === "contacted" || bookingStatus === "sent_to_organizer") data.firstResponseAt = new Date();
    if (bookingStatus === "booked") data.bookedAt = new Date();
    if (bookingStatus === "completed") data.completedAt = new Date();
    const b = await prisma.booking.update({
      where: { id: req.params.id },
      data,
      include: { program: { select: { title: true } }, organizer: { select: { displayName: true } } },
    });
    const nextStatuses = getNextStatuses(b.bookingStatus);
    await writeAuditLog({
      entityType: "booking",
      entityId: b.id,
      changedField: "booking_status_change",
      oldValue: existing.bookingStatus,
      newValue: b.bookingStatus,
      changedBy: req.adminUserId ?? null,
      reason: "status update",
    });

    if (bookingStatus === "booked") {
      emitBackendAnalyticsEventBestEffort({
        event_name: "booking_confirmed",
        event_version: 1,
        event_source: "backend",
        event_time: new Date().toISOString(),
        idempotency_key: `booking_confirmed:${b.id}`,
        organizer_id: b.organizerId,
        program_id: b.programId,
        booking_id: b.id,
        properties_json: { from: existing.bookingStatus, to: bookingStatus },
      });
    }
    if (bookingStatus === "paid_partial" || bookingStatus === "paid_full" || bookingStatus === "paid_off_platform") {
      emitBackendAnalyticsEventBestEffort({
        event_name: "booking_confirmed",
        event_version: 1,
        event_source: "backend",
        event_time: new Date().toISOString(),
        idempotency_key: `booking_paid_state:${b.id}:${bookingStatus}`,
        organizer_id: b.organizerId,
        program_id: b.programId,
        booking_id: b.id,
        properties_json: { from: existing.bookingStatus, to: bookingStatus },
      });
    }
    if (bookingStatus === "cancelled_user" || bookingStatus === "cancelled_organizer") {
      emitBackendAnalyticsEventBestEffort({
        event_name: "booking_canceled",
        event_version: 1,
        event_source: "backend",
        event_time: new Date().toISOString(),
        idempotency_key: `booking_canceled:${b.id}:${bookingStatus}`,
        organizer_id: b.organizerId,
        program_id: b.programId,
        booking_id: b.id,
        properties_json: { from: existing.bookingStatus, to: bookingStatus },
      });
    }
    if (bookingStatus === "completed") {
      await ensureReviewRequestForCompletedBooking(b);
    }
    res.json({ ...b, nextStatuses });
  });

  return router;
}
