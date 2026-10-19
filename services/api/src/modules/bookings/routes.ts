/**
 * Booking: assisted intake (POST public), admin queue (GET), status update (PATCH admin). Audit on status change.
 * Source: booking_data_contract.md, canonical_status_models. No payment flow, no revenue UI.
 */
import { createHash } from "node:crypto";
import { Router, Request, Response, NextFunction } from "express";
import { prisma } from "../../lib/prisma";
import { writeAuditLog } from "../../lib/audit";
import { requireAdmin } from "../../middleware/auth";
import { isBookingStatus, isValidTransition, getNextStatuses } from "./statusRules";
import type { Env } from "@mywave/config";
import { PUBLIC_VISIBILITY_SELECT, isProgramPubliclyVisible } from "../programs/publicVisibility";
import { emitBackendAnalyticsEventBestEffort } from "../analytics/service";
import { computeTravelerKeyHash } from "../../lib/travelerKey";
import { ensureReviewRequestForCompletedBooking } from "../reviews/reviewRequests";
import { createDealForBooking, resolveContentItemIdForAttribution, syncDealFromBooking } from "../deals/dealService";
import { addRevenueToContentMetrics } from "../content-pipeline/contentRevenue";
import { createPublicRateLimiter } from "../../middleware/security";
import { validateBookingIntake } from "./intakeValidation";

export function bookingsRoutes(env: Env): Router {
  const router = Router();
  const admin = requireAdmin(env);
  const publicRateLimiter = createPublicRateLimiter(env);

  // Assisted booking intake: public can create inquiry (new). organizer_id from program.
  router.post("/", publicRateLimiter, async (req: Request, res: Response, next: NextFunction) => {
    const validation = validateBookingIntake(req.body);
    if (!validation.ok) {
      res.status(400).json({ error: validation.error });
      return;
    }
    const body = validation.data;
    if (body.legalConsent !== true) {
      res.status(400).json({ error: "legal_consent_required" });
      return;
    }
    const legalVersion = (process.env.LEGAL_CONSENT_POLICY_VERSION || "").trim() || "pilot-v1";
    const program = await prisma.program.findUnique({
      where: { id: body.programId },
      select: {
        id: true,
        organizerId: true,
        ...PUBLIC_VISIBILITY_SELECT,
      },
    });
    if (!program || !isProgramPubliclyVisible(program)) {
      res.status(404).json({ error: "Program not found or unavailable" });
      return;
    }
    const travelerKeyHash = computeTravelerKeyHash(env, body.guestContact);
    const sourceCampaignParts = [
      body.sourceCampaign?.trim(),
      body.utmSource?.trim() ? `utm_source=${body.utmSource.trim()}` : "",
      body.utmMedium?.trim() ? `utm_medium=${body.utmMedium.trim()}` : "",
      body.entryType?.trim() ? `entry_type=${body.entryType.trim()}` : "",
      body.entryId?.trim() ? `entry_id=${body.entryId.trim()}` : "",
      body.exploreType?.trim() ? `explore_type=${body.exploreType.trim()}` : "",
      body.exploreSlug?.trim() ? `explore_slug=${body.exploreSlug.trim()}` : "",
    ].filter(Boolean);
    const sourceCampaign = sourceCampaignParts.join("|") || null;
    const trackingNote = [
      body.entryType?.trim() ? `entry_type=${body.entryType.trim()}` : "",
      body.entryId?.trim() ? `entry_id=${body.entryId.trim()}` : "",
      body.utmSource?.trim() ? `utm_source=${body.utmSource.trim()}` : "",
      body.utmMedium?.trim() ? `utm_medium=${body.utmMedium.trim()}` : "",
    ]
      .filter(Boolean)
      .join(", ");
    const mergedNotes = [body.notes?.trim() || "", trackingNote ? `[tracking] ${trackingNote}` : ""]
      .filter(Boolean)
      .join("\n\n");

    // The lock and lookup use the same validated, trimmed identity. Hashing keeps
    // contact text out of lock keys; PostgreSQL coordinates every API process.
    const lockKey = createHash("sha256").update(JSON.stringify([body.programId, body.guestContact])).digest();
    const intake = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${lockKey.readInt32BE(0)}::int, ${lockKey.readInt32BE(4)}::int)`;
      // Compute the rolling window after waiting for the preceding request.
      const duplicate = await tx.booking.findFirst({
        where: {
          programId: body.programId,
          guestContact: body.guestContact,
          createdAt: { gte: new Date(Date.now() - 2 * 60 * 1000) },
        },
        select: { id: true },
        orderBy: { createdAt: "desc" },
      });
      if (duplicate) return { duplicate: true as const, id: duplicate.id };

      let contentItemId: string | null = resolveContentItemIdForAttribution(body.entryType, body.entryId);
      if (contentItemId) {
        const ex = await tx.contentItem.findUnique({ where: { id: contentItemId }, select: { id: true } });
        if (!ex) contentItemId = null;
      }
      const consentAt = new Date();
      const booking = await tx.booking.create({
        data: {
          programId: program.id,
          organizerId: program.organizerId,
          guestContact: body.guestContact,
          travelerKeyHash: travelerKeyHash ?? undefined,
          sourceChannel: body.sourceChannel ?? null,
          sourceCampaign,
          notes: mergedNotes || null,
          bookingStatus: "new",
          contentItemId,
          entryType: body.entryType?.trim() || null,
          entryId: body.entryId?.trim() || null,
          exploreType: body.exploreType?.trim() || null,
          exploreSlug: body.exploreSlug?.trim() || null,
          utmSource: body.utmSource?.trim() || null,
          utmMedium: body.utmMedium?.trim() || null,
          legalConsentAt: consentAt,
          legalConsentPolicyVersion: legalVersion,
        },
        include: { program: { select: { title: true } }, organizer: { select: { displayName: true } } },
      });
      return { duplicate: false as const, booking, contentItemId, consentAt };
    }, { isolationLevel: "ReadCommitted", maxWait: 10_000, timeout: 10_000 }).catch((error: unknown) => {
      next(error);
      return null;
    });
    if (!intake) return;
    if (intake.duplicate) {
      res.status(409).json({ error: "Duplicate booking request", bookingId: intake.id });
      return;
    }
    const { booking: b, contentItemId, consentAt } = intake;

    try {
      await createDealForBooking(b.id, contentItemId);
    } catch {
      // идемпотентность / гонки
    }

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
        source_campaign: b.sourceCampaign ?? null,
        entry_type: body.entryType?.trim() ?? null,
        entry_id: body.entryId?.trim() ?? null,
        utm_source: body.utmSource?.trim() ?? null,
        utm_medium: body.utmMedium?.trim() ?? null,
        explore_type: body.exploreType?.trim() ?? null,
        explore_slug: body.exploreSlug?.trim() ?? null,
        legal_consent_policy: legalVersion,
        legal_consent_at: consentAt.toISOString(),
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

    const org = await prisma.organizer.findUnique({
      where: { id: b.organizerId },
      select: { verificationStatus: true },
    });
    if (org) {
      await syncDealFromBooking(
        {
          id: b.id,
          bookingStatus: b.bookingStatus,
          gmvRub: b.gmvRub,
          netAmountRub: b.netAmountRub,
          contentItemId: b.contentItemId,
        },
        org.verificationStatus,
      );
    }
    if (bookingStatus === "completed" && b.contentItemId) {
      const amt = Math.max(0, b.gmvRub ?? b.netAmountRub ?? 0);
      if (amt > 0) {
        await addRevenueToContentMetrics(b.contentItemId, amt);
      }
    }

    res.json({ ...b, nextStatuses });
  });

  return router;
}
