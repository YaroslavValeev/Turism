/**
 * Booking: assisted intake (POST public), admin queue (GET), status update (PATCH admin). Audit on status change.
 * Source: booking_data_contract.md, canonical_status_models. No payment flow, no revenue UI.
 */
import { Router, Request, Response } from "express";
import { prisma } from "../../lib/prisma";
import { writeAuditLog } from "../../lib/audit";
import { requireAdmin } from "../../middleware/auth";
import { isBookingStatus, getNextBookingStatuses } from "@mywave/shared-policy";
import { applyBookingStatusTransition } from "../status-engine/applyBookingStatusTransition";
import { recordDomainStatusEvent } from "../status-engine/recordDomainStatusEvent";
import type { Env } from "@mywave/config";
import { isProgramPubliclyVisible } from "../programs/publicVisibility";
import { emitBackendAnalyticsEventBestEffort } from "../analytics/service";
import { computeTravelerKeyHash } from "../../lib/travelerKey";
import {
  deliverBookingLeadBestEffort,
  findExistingBookingIntakeByClientIdempotencyKey,
  findExistingBookingIntakeByStableKey,
  findExistingDeliveryByIdempotencyKey,
} from "./delivery";
import { createHash, randomUUID } from "crypto";
import { canUseReferralCode, recordReferralAbuse } from "../ugc/abuseService";
import { applyAvailableReward } from "../ugc/rewardService";
import { extractEmailFromGuestContact } from "../ugc/ugcService";
import { computeRewardDiscount } from "../billing/rewardDiscount";

async function maybeRetryDeliveryForNewBooking(
  env: Env,
  bookingId: string,
  deliveryKey: string,
): Promise<{ booking: Awaited<ReturnType<typeof prisma.booking.findUnique>>; delivery: Awaited<ReturnType<typeof deliverBookingLeadBestEffort>> } | null> {
  const existingFull = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      program: {
        select: {
          id: true,
          title: true,
          discipline: true,
          region: true,
          exactLocation: true,
          publishStatus: true,
          endDate: true,
          spotsAvailable: true,
        },
      },
      organizer: { select: { id: true, displayName: true, verificationStatus: true, contactEmail: true } },
    },
  });
  if (!existingFull?.program || !existingFull.organizer) return null;
  if (existingFull.bookingStatus !== "new") {
    return { booking: existingFull, delivery: { channel: "none", ok: false, detail: "not_retryable_status" } };
  }
  if (!isProgramPubliclyVisible(existingFull.program)) {
    return { booking: existingFull, delivery: { channel: "none", ok: false, detail: "program_not_public" } };
  }

  const guestLines = String(existingFull.guestContact ?? "").split("\n");
  const guestName = guestLines.find((l) => l.startsWith("Имя:"))?.replace(/^Имя:\s*/u, "").trim() ?? "";
  const guestContactRaw = guestLines.find((l) => l.startsWith("Контакт:"))?.replace(/^Контакт:\s*/u, "").trim() ?? "";

  const delivery = await deliverBookingLeadBestEffort(
    env,
    {
      bookingId: existingFull.id,
      programId: existingFull.program.id,
      programTitle: existingFull.program.title,
      discipline: existingFull.program.discipline,
      region: existingFull.program.region,
      exactLocation: existingFull.program.exactLocation,
      organizerId: existingFull.organizer.id,
      organizerName: existingFull.organizer.displayName,
      organizerVerificationStatus: existingFull.organizer.verificationStatus,
      organizerContactEmail: existingFull.organizer.contactEmail,
      guestName: guestName || "—",
      guestContact: guestContactRaw || "—",
      notes: existingFull.notes,
      sourceChannel: existingFull.sourceChannel,
    },
    deliveryKey,
  );

  let updated = existingFull;
  if (delivery.ok) {
    const tr = await applyBookingStatusTransition({
      prisma,
      bookingId: existingFull.id,
      toStatus: "sent_to_organizer",
      actor: { actorId: null, actorMarker: "system:booking-delivery-replay" },
      triggerMode: "auto",
      reason: JSON.stringify({ channel: delivery.channel, ok: delivery.ok, detail: delivery.detail, replay: true }),
      source: "maybeRetryDeliveryForNewBooking",
      idempotencyKey: `booking_auto_delivery:${existingFull.id}`,
    });
    if (tr.ok) {
      updated = tr.booking as typeof existingFull;
    }
  }

  await writeAuditLog({
    entityType: "booking",
    entityId: updated.id,
    changedField: "booking_delivery",
    oldValue: existingFull.bookingStatus,
    newValue: JSON.stringify({ to: updated.bookingStatus, channel: delivery.channel, ok: delivery.ok, detail: delivery.detail, replay: true }),
    changedBy: null,
    reason: "public booking intake delivery replay",
  });

  if (delivery.ok) {
    emitBackendAnalyticsEventBestEffort({
      event_name: "lead_delivered",
      event_version: 1,
      event_source: "backend",
      event_time: new Date().toISOString(),
      idempotency_key: `lead_delivered:${updated.id}:${delivery.channel}`,
      organizer_id: updated.organizerId,
      program_id: updated.programId,
      booking_id: updated.id,
      properties_json: {
        channel: delivery.channel,
        idempotency_key: deliveryKey,
        replay: true,
      },
    });
  }

  return { booking: updated, delivery };
}

export function bookingsRoutes(env: Env): Router {
  const router = Router();
  const admin = requireAdmin(env);

  // Assisted booking intake: public can create inquiry (new). organizer_id from program.
  router.post("/", async (req: Request, res: Response) => {
    const body = req.body as {
      programId?: string;
      guestName?: string;
      guestContact?: string;
      confirmInterest?: boolean;
      sourceChannel?: string;
      notes?: string;
      idempotencyKey?: string;
      referralCode?: string;
      originalAmountRub?: number;
    };
    const guestName = String(body.guestName ?? "").trim();
    const guestContactRaw = String(body.guestContact ?? "").trim();
    const confirmInterest = body.confirmInterest === true;
    if (!body.programId || !guestContactRaw || !guestName) {
      res.status(400).json({ error: "programId, guestName and guestContact required" });
      return;
    }
    if (!confirmInterest) {
      res.status(400).json({ error: "confirmInterest must be true" });
      return;
    }

    const headerKey = typeof req.headers["x-idempotency-key"] === "string" ? String(req.headers["x-idempotency-key"]).trim() : "";
    const idempotencyKey = (String(body.idempotencyKey ?? "").trim() || headerKey || "").trim();
    const stableIntakeKey = `booking_intake:${createHash("sha256")
      .update(`${body.programId}|${guestName}|${guestContactRaw}`, "utf8")
      .digest("hex")}`;
    if (idempotencyKey) {
      const existingBookingId =
        (await findExistingDeliveryByIdempotencyKey(idempotencyKey)) ??
        (await findExistingBookingIntakeByClientIdempotencyKey(idempotencyKey));
      if (existingBookingId) {
        const replayed = await maybeRetryDeliveryForNewBooking(env, existingBookingId, idempotencyKey);
        if (replayed?.booking) {
          res.status(200).json({ ...replayed.booking, idempotentReplay: true, idempotencyKey, delivery: replayed.delivery });
          return;
        }
        const existing = await prisma.booking.findUnique({
          where: { id: existingBookingId },
          include: { program: { select: { title: true, discipline: true, region: true } }, organizer: { select: { displayName: true } } },
        });
        res.status(200).json({ ...existing, idempotentReplay: true, idempotencyKey });
        return;
      }
    } else {
      const existingBookingId = await findExistingBookingIntakeByStableKey(stableIntakeKey);
      if (existingBookingId) {
        const replayed = await maybeRetryDeliveryForNewBooking(env, existingBookingId, stableIntakeKey);
        if (replayed?.booking) {
          res.status(200).json({ ...replayed.booking, idempotentReplay: true, idempotencyKey: stableIntakeKey, delivery: replayed.delivery });
          return;
        }
        const existing = await prisma.booking.findUnique({
          where: { id: existingBookingId },
          include: { program: { select: { title: true, discipline: true, region: true } }, organizer: { select: { displayName: true } } },
        });
        res.status(200).json({ ...existing, idempotentReplay: true, idempotencyKey: stableIntakeKey });
        return;
      }
    }

    const program = await prisma.program.findUnique({
      where: { id: body.programId },
      select: {
        id: true,
        title: true,
        discipline: true,
        region: true,
        exactLocation: true,
        organizerId: true,
        publishStatus: true,
        endDate: true,
        spotsAvailable: true,
        priceFromRub: true,
      },
    });
    if (!program || !isProgramPubliclyVisible(program)) {
      res.status(404).json({ error: "Program not found or unavailable" });
      return;
    }

    const organizer = await prisma.organizer.findUnique({
      where: { id: program.organizerId },
      select: { id: true, displayName: true, verificationStatus: true, contactEmail: true },
    });
    if (!organizer) {
      res.status(400).json({ error: "Organizer not found for program" });
      return;
    }

    const guestContact = [`Имя: ${guestName}`, `Контакт: ${guestContactRaw}`].join("\n");
    const notes = [
      body.notes?.trim() ? body.notes.trim() : null,
      "Подтверждение: клиент подтвердил интерес к программе (checkbox).",
    ]
      .filter(Boolean)
      .join("\n\n");

    // Attribution: приоритет body > cookie > nothing. Если body содержит код — cookie игнорируется.
    const cookieHeader = typeof req.headers.cookie === "string" ? req.headers.cookie : "";
    const cookieRef = (() => {
      const m = cookieHeader.match(/(?:^|;\s*)mw_ref=([^;]+)/);
      return m ? decodeURIComponent(m[1]!) : "";
    })();
    const bodyRef = String(body.referralCode ?? "").trim();
    const rawRef = bodyRef || cookieRef.trim();
    const refSource = bodyRef ? "body" : cookieRef ? "cookie" : null;
    const normalizedRef = rawRef ? rawRef.toUpperCase() : "";

    let attributedReferralCode: string | null = null;
    let refBlockReason: string | null = null;
    const guardEmail = extractEmailFromGuestContact(guestContactRaw);

    if (normalizedRef && /^[A-Z0-9-]{4,40}$/.test(normalizedRef)) {
      const decision = await canUseReferralCode(prisma, env, {
        code: normalizedRef,
        email: guardEmail,
        userId: null,
        programId: program.id,
      });
      if (decision.ok) {
        attributedReferralCode = decision.code;
      } else {
        refBlockReason = decision.reason;
        await recordReferralAbuse(prisma, {
          code: normalizedRef,
          reason: decision.reason,
          email: guardEmail,
          userId: null,
          programId: program.id,
          detail: `source=${refSource ?? "none"}; ${decision.detail ?? ""}`.slice(0, 500),
        });
      }
    }

    const travelerKeyHash = computeTravelerKeyHash(env, guestContactRaw);
    // ADR-007: bootstrap create — единственное начальное значение `bookingStatus` на публичном intake (не третий «тихий» контур).
    const b = await prisma.booking.create({
      data: {
        programId: program.id,
        organizerId: program.organizerId,
        guestContact,
        travelerKeyHash: travelerKeyHash ?? undefined,
        sourceChannel: body.sourceChannel ?? null,
        notes,
        bookingStatus: "new",
        referralCode: attributedReferralCode,
      },
      include: { program: { select: { title: true, discipline: true, region: true, exactLocation: true } }, organizer: { select: { displayName: true, verificationStatus: true, contactEmail: true } } },
    });

    await recordDomainStatusEvent(prisma, {
      eventType: "lead_created",
      entityType: "booking",
      entityId: b.id,
      fromStatus: null,
      toStatus: "new",
      triggerMode: "auto",
      actorId: null,
      actorMarker: "system:public-booking-intake",
      source: "POST /bookings",
      payloadJson: {
        programId: program.id,
        sourceChannel: body.sourceChannel ?? null,
        referralCode: attributedReferralCode,
      },
      idempotencyKey: `lead_created:${b.id}`,
    });

    if (attributedReferralCode) {
      await prisma.referralCode.update({
        where: { code: attributedReferralCode },
        data: { bookings: { increment: 1 } },
      });
    }

    const rewardApply = await applyAvailableReward(prisma, env, {
      bookingId: b.id,
      userId: null,
      email: guardEmail,
    });
    if (rewardApply.appliedRewardId) {
      await writeAuditLog({
        entityType: "booking",
        entityId: b.id,
        changedField: "appliedRewardId",
        oldValue: null,
        newValue: rewardApply.appliedRewardId,
        changedBy: null,
        reason: `reward applied type=${rewardApply.valueType} value=${rewardApply.value}`,
      });

      // Если известна исходная цена (из body или program.priceFromRub) — сразу фиксируем
      // originalAmount/discountAmount/finalAmount. Иначе админ укажет цену позже через
      // PATCH /bookings/:id/pricing.
      const bodyOriginal = typeof body.originalAmountRub === "number" && body.originalAmountRub > 0
        ? Math.floor(body.originalAmountRub)
        : null;
      const basePrice = bodyOriginal ?? program.priceFromRub ?? null;
      if (basePrice && basePrice > 0 && rewardApply.valueType && typeof rewardApply.value === "number") {
        const disc = computeRewardDiscount({
          originalAmountRub: basePrice,
          reward: { valueType: rewardApply.valueType, value: rewardApply.value },
          minOrderRub: env.REFERRAL_REWARD_MIN_ORDER_RUB,
        });
        if (disc.applied) {
          // ADR-007: не меняем bookingStatus — только суммы после apply reward.
          await prisma.booking.update({
            where: { id: b.id },
            data: {
              originalAmountRub: disc.originalAmountRub,
              discountAmountRub: disc.discountAmountRub,
              finalAmountRub: disc.finalAmountRub,
            },
          });
          await writeAuditLog({
            entityType: "booking",
            entityId: b.id,
            changedField: "discountAmountRub",
            oldValue: null,
            newValue: JSON.stringify({
              originalAmountRub: disc.originalAmountRub,
              discountAmountRub: disc.discountAmountRub,
              finalAmountRub: disc.finalAmountRub,
              source: bodyOriginal ? "body" : "program.priceFromRub",
            }),
            changedBy: null,
            reason: `reward discount applied (${rewardApply.valueType}=${rewardApply.value})`,
          });
        }
      }
    }
    if (refBlockReason) {
      await writeAuditLog({
        entityType: "booking",
        entityId: b.id,
        changedField: "referralCode",
        oldValue: normalizedRef,
        newValue: null,
        changedBy: null,
        reason: `referral blocked: ${refBlockReason}`,
      });
    }

    await writeAuditLog({
      entityType: "booking_intake",
      entityId: b.id,
      changedField: "intake_idempotency_key",
      oldValue: stableIntakeKey,
      newValue: JSON.stringify({ bookingId: b.id, programId: program.id }),
      changedBy: null,
      reason: "public booking intake stable key",
    });
    if (idempotencyKey) {
      await writeAuditLog({
        entityType: "booking_intake",
        entityId: b.id,
        changedField: "client_idempotency_key",
        oldValue: idempotencyKey,
        newValue: JSON.stringify({ bookingId: b.id, programId: program.id }),
        changedBy: null,
        reason: "public booking intake client idempotency key",
      });
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
      },
    });

    const deliveryKey = idempotencyKey || stableIntakeKey || `booking_delivery:${b.id}:${randomUUID()}`;
    const delivery = await deliverBookingLeadBestEffort(
      env,
      {
        bookingId: b.id,
        programId: program.id,
        programTitle: program.title,
        discipline: program.discipline,
        region: program.region,
        exactLocation: program.exactLocation,
        organizerId: organizer.id,
        organizerName: organizer.displayName,
        organizerVerificationStatus: organizer.verificationStatus,
        organizerContactEmail: organizer.contactEmail,
        guestName,
        guestContact: guestContactRaw,
        notes: body.notes?.trim() ? body.notes.trim() : null,
        sourceChannel: body.sourceChannel ?? null,
      },
      deliveryKey,
    );

    let updated = b;
    if (delivery.ok) {
      const tr = await applyBookingStatusTransition({
        prisma,
        bookingId: b.id,
        toStatus: "sent_to_organizer",
        actor: { actorId: null, actorMarker: "system:booking-delivery" },
        triggerMode: "auto",
        reason: JSON.stringify({ channel: delivery.channel, ok: delivery.ok, detail: delivery.detail }),
        source: "POST /bookings",
        idempotencyKey: `booking_auto_delivery:${b.id}`,
      });
      if (tr.ok) {
        updated = tr.booking as typeof b;
      }
    }

    await writeAuditLog({
      entityType: "booking",
      entityId: updated.id,
      changedField: "booking_delivery",
      oldValue: b.bookingStatus,
      newValue: JSON.stringify({ to: updated.bookingStatus, channel: delivery.channel, ok: delivery.ok, detail: delivery.detail }),
      changedBy: null,
      reason: "public booking intake delivery",
    });

    if (delivery.ok) {
      emitBackendAnalyticsEventBestEffort({
        event_name: "lead_delivered",
        event_version: 1,
        event_source: "backend",
        event_time: new Date().toISOString(),
        idempotency_key: `lead_delivered:${updated.id}:${delivery.channel}`,
        organizer_id: updated.organizerId,
        program_id: updated.programId,
        booking_id: updated.id,
        properties_json: {
          channel: delivery.channel,
          idempotency_key: deliveryKey,
        },
      });
    }

    res.status(201).json({ ...updated, delivery });
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
    const nextStatuses = getNextBookingStatuses(b.bookingStatus);
    res.json({ ...b, nextStatuses });
  });

  router.patch("/:id/status", admin, async (req: Request, res: Response) => {
    const { bookingStatus, idempotencyKey, reason, cancellationKind, cancellationReason } = req.body as {
      bookingStatus?: string;
      idempotencyKey?: string;
      reason?: string;
      cancellationKind?: string;
      cancellationReason?: string;
    };
    if (!bookingStatus || !isBookingStatus(bookingStatus)) {
      res.status(400).json({
        error: "valid bookingStatus required",
        allowed: "new,reviewed,sent_to_organizer,contacted,offer_sent,booked,paid_off_platform,completed,cancelled_user,cancelled_organizer,refund_pending,refund_done",
      });
      return;
    }
    const tr = await applyBookingStatusTransition({
      prisma,
      bookingId: req.params.id,
      toStatus: bookingStatus,
      actor: { actorId: req.adminUserId ?? null },
      triggerMode: "manual",
      reason: reason ?? "status update",
      source: "PATCH /bookings/:id/status",
      idempotencyKey: typeof idempotencyKey === "string" && idempotencyKey.trim() ? idempotencyKey.trim() : null,
      cancellationKind: cancellationKind ?? null,
      cancellationReason: cancellationReason ?? null,
    });
    if (!tr.ok) {
      if (tr.error === "not_found") {
        res.status(404).json({ error: "Not found" });
        return;
      }
      res.status(400).json({ error: "Invalid status transition", from: tr.from, to: tr.to });
      return;
    }
    res.json({ ...tr.booking, nextStatuses: tr.nextStatuses });
  });

  // Admin: зафиксировать исходную цену booking и пересчитать reward discount + commission.
  // Применяет тот же Model A: finalAmountRub = originalAmountRub - discountAmountRub.
  router.patch("/:id/pricing", admin, async (req: Request, res: Response) => {
    const { originalAmountRub, reason } = req.body as {
      originalAmountRub?: number;
      reason?: string;
    };
    const original = Math.floor(Number(originalAmountRub) || 0);
    if (!Number.isFinite(original) || original <= 0) {
      res.status(400).json({ error: "originalAmountRub must be positive integer rubles" });
      return;
    }
    const booking = await prisma.booking.findUnique({ where: { id: req.params.id } });
    if (!booking) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    let discountAmountRub: number | null = null;
    let finalAmountRub = original;
    let rewardSnapshot: { valueType: string; value: number } | null = null;

    if (booking.appliedRewardId) {
      const reward = await prisma.userReward.findUnique({ where: { id: booking.appliedRewardId } });
      if (reward) {
        const disc = computeRewardDiscount({
          originalAmountRub: original,
          reward: { valueType: reward.valueType, value: reward.value },
          minOrderRub: env.REFERRAL_REWARD_MIN_ORDER_RUB,
        });
        if (disc.applied) {
          discountAmountRub = disc.discountAmountRub;
          finalAmountRub = disc.finalAmountRub;
          rewardSnapshot = { valueType: reward.valueType, value: reward.value };
        }
      }
    }

    const prev = {
      originalAmountRub: booking.originalAmountRub,
      discountAmountRub: booking.discountAmountRub,
      finalAmountRub: booking.finalAmountRub,
    };

    // ADR-007: не меняем bookingStatus — только денежные поля (admin pricing).
    const updated = await prisma.booking.update({
      where: { id: booking.id },
      data: {
        originalAmountRub: original,
        discountAmountRub,
        finalAmountRub,
      },
    });

    await writeAuditLog({
      entityType: "booking",
      entityId: updated.id,
      changedField: "pricing",
      oldValue: JSON.stringify(prev),
      newValue: JSON.stringify({
        originalAmountRub: original,
        discountAmountRub,
        finalAmountRub,
        reward: rewardSnapshot,
      }),
      changedBy: req.adminUserId ?? null,
      reason: reason ?? "admin set pricing",
    });

    // Пересчёт commission: она считается от paidAmountRub - refundedAmountRub; сами
    // поля платежей не меняются, но calculationJson обогащается discount-снимком.
    try {
      const { recalculateCommissionForBooking } = await import("../billing/service");
      await recalculateCommissionForBooking(updated.id, req.adminUserId ?? null);
    } catch (e) {
      // Если commission ещё не создавался (payment не записан), это допустимо.
    }

    res.json({
      id: updated.id,
      originalAmountRub: updated.originalAmountRub,
      discountAmountRub: updated.discountAmountRub,
      finalAmountRub: updated.finalAmountRub,
      appliedRewardId: updated.appliedRewardId,
    });
  });

  return router;
}
