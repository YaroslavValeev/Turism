/**
 * Organizers CRUD. Source of truth: canonical_entity_model, canonical_status_models.
 * GET public; POST/PATCH admin only. verification-status change → audit log.
 */
import { Router, Request, Response } from "express";
import { isOrganizerVerificationStatus, type OrganizerVerificationStatus } from "@mywave/shared-types";
import { prisma } from "../../lib/prisma";
import { writeAuditLog } from "../../lib/audit";
import { requireAdmin } from "../../middleware/auth";
import type { Env } from "@mywave/config";
import {
  isOrganizerBillingStatus,
  isOrganizerContractStatus,
  isOrganizerOnboardingStatus,
  isOrganizerPrivilegeStatus,
} from "@mywave/shared-types";
import { deriveOrganizerPrivileges } from "../billing/service";
import { emitBackendAnalyticsEventBestEffort } from "../analytics/service";

export function organizersRoutes(env: Env): Router {
  const router = Router();
  const admin = requireAdmin(env);

  router.get("/", async (_req: Request, res: Response) => {
    const verificationStatus = _req.query.verification_status as string | undefined;
    const where = verificationStatus && isOrganizerVerificationStatus(verificationStatus)
      ? { verificationStatus: verificationStatus as OrganizerVerificationStatus }
      : {};
    const list = await prisma.organizer.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });
    res.json(list);
  });

  router.get("/:id", async (req: Request, res: Response) => {
    const o = await prisma.organizer.findUnique({ where: { id: req.params.id } });
    if (!o) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json(o);
  });

  router.post("/", admin, async (req: Request, res: Response) => {
    const { displayName, legalStatus, contactEmail, contactPhone, responseScore, verificationStatus } = req.body;
    if (!displayName || !contactEmail) {
      res.status(400).json({ error: "displayName and contactEmail required" });
      return;
    }
    const status = verificationStatus && isOrganizerVerificationStatus(verificationStatus)
      ? (verificationStatus as OrganizerVerificationStatus)
      : "listed";
    const o = await prisma.organizer.create({
      data: {
        displayName,
        legalStatus: legalStatus ?? null,
        contactEmail,
        contactPhone: contactPhone ?? null,
        responseScore: responseScore != null ? Number(responseScore) : null,
        verificationStatus: status,
      },
    });
    await writeAuditLog({
      entityType: "organizer",
      entityId: o.id,
      changedField: "created",
      oldValue: null,
      newValue: o.id,
      changedBy: req.adminUserId ?? null,
      reason: "organizer created",
    });
    res.status(201).json(o);
  });

  router.patch("/:id", admin, async (req: Request, res: Response) => {
    const existing = await prisma.organizer.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const { displayName, legalStatus, contactEmail, contactPhone, responseScore } = req.body;
    const data: Record<string, unknown> = {};
    if (displayName !== undefined) data.displayName = displayName;
    if (legalStatus !== undefined) data.legalStatus = legalStatus;
    if (contactEmail !== undefined) data.contactEmail = contactEmail;
    if (contactPhone !== undefined) data.contactPhone = contactPhone;
    if (responseScore !== undefined) data.responseScore = Number(responseScore);
    const o = await prisma.organizer.update({
      where: { id: req.params.id },
      data,
    });
    for (const [field, newVal] of Object.entries(data)) {
      const oldVal = existing[field as keyof typeof existing];
      await writeAuditLog({
        entityType: "organizer",
        entityId: o.id,
        changedField: field,
        oldValue: oldVal != null ? String(oldVal) : null,
        newValue: newVal != null ? String(newVal) : null,
        changedBy: req.adminUserId ?? null,
      });
    }
    res.json(o);
  });

  router.get("/:id/evidence", admin, async (req: Request, res: Response) => {
    const list = await prisma.organizerVerificationEvidence.findMany({
      where: { organizerId: req.params.id },
      orderBy: { createdAt: "desc" },
    });
    res.json(list);
  });

  router.post("/:id/evidence", admin, async (req: Request, res: Response) => {
    const organizer = await prisma.organizer.findUnique({ where: { id: req.params.id } });
    if (!organizer) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const { evidenceType, evidenceUrl, notes } = req.body as { evidenceType?: string; evidenceUrl?: string; notes?: string };
    if (!evidenceType) {
      res.status(400).json({ error: "evidenceType required" });
      return;
    }
    const e = await prisma.organizerVerificationEvidence.create({
      data: {
        organizerId: req.params.id,
        evidenceType,
        evidenceUrl: evidenceUrl ?? null,
        notes: notes ?? null,
      },
    });
    res.status(201).json(e);
  });

  router.patch("/:id/verification-status", admin, async (req: Request, res: Response) => {
    const existing = await prisma.organizer.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const { verificationStatus } = req.body as { verificationStatus?: string };
    if (!verificationStatus || !isOrganizerVerificationStatus(verificationStatus)) {
      res.status(400).json({ error: "valid verificationStatus required", allowed: "listed,checked,verified,trusted_by_platform,paused,rejected" });
      return;
    }
    const o = await prisma.organizer.update({
      where: { id: req.params.id },
      data: { verificationStatus: verificationStatus as OrganizerVerificationStatus },
    });
    await writeAuditLog({
      entityType: "organizer",
      entityId: o.id,
      changedField: "verification_status",
      oldValue: existing.verificationStatus,
      newValue: o.verificationStatus,
      changedBy: req.adminUserId ?? null,
      reason: "verification status change",
    });

    if (o.verificationStatus === "verified") {
      emitBackendAnalyticsEventBestEffort({
        event_name: "organizer_verified",
        event_version: 1,
        event_source: "backend",
        event_time: new Date().toISOString(),
        idempotency_key: `organizer_verified:${o.id}`,
        organizer_id: o.id,
        verified_status: o.verificationStatus,
        properties_json: { from: existing.verificationStatus, to: o.verificationStatus },
      });
    }
    if (o.verificationStatus === "trusted_by_platform") {
      emitBackendAnalyticsEventBestEffort({
        event_name: "organizer_trusted",
        event_version: 1,
        event_source: "backend",
        event_time: new Date().toISOString(),
        idempotency_key: `organizer_trusted:${o.id}`,
        organizer_id: o.id,
        verified_status: o.verificationStatus,
        properties_json: { from: existing.verificationStatus, to: o.verificationStatus },
      });
    }
    res.json(o);
  });

  router.get("/:id/billing-profile", async (req: Request, res: Response) => {
    const profile = await prisma.organizerBillingProfile.findUnique({
      where: { organizerId: req.params.id },
    });
    if (!profile) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json(profile);
  });

  router.patch("/:id/billing-profile", admin, async (req: Request, res: Response) => {
    const existing = await prisma.organizerBillingProfile.findUnique({
      where: { organizerId: req.params.id },
    });
    const data = req.body as {
      legalType?: string;
      legalName?: string;
      inn?: string;
      bankName?: string;
      bankBik?: string;
      bankAccount?: string;
      correspondentAccount?: string;
      contactEmail?: string;
      contactPhone?: string;
      cancellationPolicy?: string;
      refundPolicy?: string;
      commissionRateBps?: number;
      billingStatus?: string;
    };
    if (data.billingStatus && !isOrganizerBillingStatus(data.billingStatus)) {
      res.status(400).json({ error: "Invalid billingStatus" });
      return;
    }
    const profile = await prisma.organizerBillingProfile.upsert({
      where: { organizerId: req.params.id },
      create: {
        organizerId: req.params.id,
        legalType: data.legalType ?? null,
        legalName: data.legalName ?? null,
        inn: data.inn ?? null,
        bankName: data.bankName ?? null,
        bankBik: data.bankBik ?? null,
        bankAccount: data.bankAccount ?? null,
        correspondentAccount: data.correspondentAccount ?? null,
        contactEmail: data.contactEmail ?? null,
        contactPhone: data.contactPhone ?? null,
        cancellationPolicy: data.cancellationPolicy ?? null,
        refundPolicy: data.refundPolicy ?? null,
        commissionRateBps: data.commissionRateBps ?? 300,
        billingStatus: data.billingStatus ?? "not_connected",
      },
      update: {
        legalType: data.legalType,
        legalName: data.legalName,
        inn: data.inn,
        bankName: data.bankName,
        bankBik: data.bankBik,
        bankAccount: data.bankAccount,
        correspondentAccount: data.correspondentAccount,
        contactEmail: data.contactEmail,
        contactPhone: data.contactPhone,
        cancellationPolicy: data.cancellationPolicy,
        refundPolicy: data.refundPolicy,
        commissionRateBps: data.commissionRateBps,
        billingStatus: data.billingStatus,
      },
    });
    await prisma.organizer.update({
      where: { id: req.params.id },
      data: {
        billingStatus: profile.billingStatus,
        commissionRateBps: profile.commissionRateBps,
      },
    });
    await writeAuditLog({
      entityType: "organizer",
      entityId: req.params.id,
      changedField: "billing_profile_change",
      oldValue: existing ? "updated" : null,
      newValue: "updated",
      changedBy: req.adminUserId ?? null,
      reason: "billing profile updated",
    });

    const prevBilling = existing?.billingStatus;
    if (profile.billingStatus === "billing_connected" && prevBilling !== "billing_connected") {
      emitBackendAnalyticsEventBestEffort({
        event_name: "billing_connected",
        event_version: 1,
        event_source: "backend",
        event_time: new Date().toISOString(),
        idempotency_key: `billing_connected:${req.params.id}`,
        organizer_id: req.params.id,
        properties_json: { billing_status: profile.billingStatus, prev: prevBilling ?? null },
      });
    }
    res.json(profile);
  });

  router.get("/:id/contracts", async (req: Request, res: Response) => {
    const list = await prisma.organizerContract.findMany({
      where: { organizerId: req.params.id },
      orderBy: { createdAt: "desc" },
    });
    res.json(list);
  });

  router.post("/:id/contracts", admin, async (req: Request, res: Response) => {
    const body = req.body as {
      status?: string;
      documentUrl?: string;
      generatedAt?: string;
      sentAt?: string;
      signedAt?: string;
      expiresAt?: string;
      rejectedAt?: string;
      notes?: string;
    };
    if (body.status && !isOrganizerContractStatus(body.status)) {
      res.status(400).json({ error: "Invalid contract status" });
      return;
    }
    const contract = await prisma.organizerContract.create({
      data: {
        organizerId: req.params.id,
        status: body.status ?? "generated",
        documentUrl: body.documentUrl ?? null,
        generatedAt: body.generatedAt ? new Date(body.generatedAt) : null,
        sentAt: body.sentAt ? new Date(body.sentAt) : null,
        signedAt: body.signedAt ? new Date(body.signedAt) : null,
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
        rejectedAt: body.rejectedAt ? new Date(body.rejectedAt) : null,
        notes: body.notes ?? null,
      },
    });
    await writeAuditLog({
      entityType: "organizer_contract",
      entityId: contract.id,
      changedField: "contract_created",
      oldValue: null,
      newValue: contract.status,
      changedBy: req.adminUserId ?? null,
      reason: "contract created",
    });
    res.status(201).json(contract);
  });

  router.patch("/:id/contracts/:contractId", admin, async (req: Request, res: Response) => {
    const body = req.body as {
      status?: string;
      documentUrl?: string;
      generatedAt?: string;
      sentAt?: string;
      signedAt?: string;
      expiresAt?: string;
      rejectedAt?: string;
      notes?: string;
    };
    if (body.status && !isOrganizerContractStatus(body.status)) {
      res.status(400).json({ error: "Invalid contract status" });
      return;
    }
    const existing = await prisma.organizerContract.findUnique({ where: { id: req.params.contractId } });
    if (!existing) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const contract = await prisma.organizerContract.update({
      where: { id: req.params.contractId },
      data: {
        status: body.status,
        documentUrl: body.documentUrl,
        generatedAt: body.generatedAt ? new Date(body.generatedAt) : undefined,
        sentAt: body.sentAt ? new Date(body.sentAt) : undefined,
        signedAt: body.signedAt ? new Date(body.signedAt) : undefined,
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined,
        rejectedAt: body.rejectedAt ? new Date(body.rejectedAt) : undefined,
        notes: body.notes,
      },
    });
    await writeAuditLog({
      entityType: "organizer_contract",
      entityId: contract.id,
      changedField: "contract_updated",
      oldValue: existing.status,
      newValue: contract.status,
      changedBy: req.adminUserId ?? null,
      reason: "contract updated",
    });

    if (contract.status === "signed" && existing.status !== "signed") {
      emitBackendAnalyticsEventBestEffort({
        event_name: "contract_signed",
        event_version: 1,
        event_source: "backend",
        event_time: new Date().toISOString(),
        idempotency_key: `contract_signed:${contract.id}`,
        organizer_id: contract.organizerId,
        contract_version: "v1",
        properties_json: { contract_id: contract.id, from: existing.status, to: contract.status },
      });
    }
    res.json(contract);
  });

  router.get("/:id/privileges", async (req: Request, res: Response) => {
    try {
      const derived = await deriveOrganizerPrivileges(req.params.id);
      const organizer = await prisma.organizer.update({
        where: { id: req.params.id },
        data: {
          onboardingStatus: derived.onboardingStatus,
          billingStatus: derived.billingStatus,
          privilegeStatus: derived.privilegeStatus,
        },
      });
      res.json({
        organizerId: organizer.id,
        onboardingStatus: organizer.onboardingStatus,
        billingStatus: organizer.billingStatus,
        privilegeStatus: organizer.privilegeStatus,
        contractStatus: derived.contractStatus,
      });
    } catch (error) {
      res.status(404).json({ error: error instanceof Error ? error.message : "Not found" });
    }
  });

  router.patch("/:id/privileges", admin, async (req: Request, res: Response) => {
    const body = req.body as {
      onboardingStatus?: string;
      billingStatus?: string;
      privilegeStatus?: string;
    };
    if (body.onboardingStatus && !isOrganizerOnboardingStatus(body.onboardingStatus)) {
      res.status(400).json({ error: "Invalid onboardingStatus" });
      return;
    }
    if (body.billingStatus && !isOrganizerBillingStatus(body.billingStatus)) {
      res.status(400).json({ error: "Invalid billingStatus" });
      return;
    }
    if (body.privilegeStatus && !isOrganizerPrivilegeStatus(body.privilegeStatus)) {
      res.status(400).json({ error: "Invalid privilegeStatus" });
      return;
    }
    const organizer = await prisma.organizer.update({
      where: { id: req.params.id },
      data: {
        onboardingStatus: body.onboardingStatus,
        billingStatus: body.billingStatus,
        privilegeStatus: body.privilegeStatus,
      },
    });
    await writeAuditLog({
      entityType: "organizer",
      entityId: organizer.id,
      changedField: "privilege_state_change",
      oldValue: null,
      newValue: JSON.stringify({
        onboardingStatus: organizer.onboardingStatus,
        billingStatus: organizer.billingStatus,
        privilegeStatus: organizer.privilegeStatus,
      }),
      changedBy: req.adminUserId ?? null,
      reason: "manual privilege status update",
    });
    res.json(organizer);
  });

  router.get("/:id/analytics/overview", async (req: Request, res: Response) => {
    const organizerId = req.params.id;
    const days = Math.min(180, Math.max(7, Number(req.query.days ?? 30) || 30));
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const organizer = await prisma.organizer.findUnique({
      where: { id: organizerId },
      select: {
        id: true,
        displayName: true,
        verificationStatus: true,
        onboardingStatus: true,
        billingStatus: true,
        privilegeStatus: true,
      },
    });
    if (!organizer) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    const [
      views,
      leads,
      booked,
      paid,
      completed,
      reviewsCount,
      avgRating,
      latestScore,
      weakPrograms,
    ] = await Promise.all([
      prisma.analyticsEvent.count({
        where: {
          organizerId,
          ingestedAt: { gte: since },
          eventName: { in: ["page_view", "view_item", "view_item_list"] },
        },
      }),
      prisma.lead.count({ where: { organizerId, createdAt: { gte: since } } }),
      prisma.booking.count({
        where: {
          organizerId,
          createdAt: { gte: since },
          bookingStatus: { in: ["booked", "paid_partial", "paid_full", "paid_off_platform", "completed"] },
        },
      }),
      prisma.booking.count({
        where: {
          organizerId,
          createdAt: { gte: since },
          OR: [{ paidAmountRub: { gt: 0 } }, { bookingStatus: { in: ["paid_partial", "paid_full", "completed"] } }],
        },
      }),
      prisma.booking.count({ where: { organizerId, createdAt: { gte: since }, bookingStatus: "completed" } }),
      prisma.review.count({ where: { organizerId, moderationStatus: "approved", createdAt: { gte: since } } }),
      prisma.review.aggregate({
        where: { organizerId, moderationStatus: "approved", createdAt: { gte: since } },
        _avg: { rating: true },
      }),
      prisma.organizerScoreSnapshot.findFirst({
        where: { organizerId },
        orderBy: { recalculatedAt: "desc" },
        select: { organizerScore: true, scoreBand: true, sampleBookings: true, componentsJson: true, recalculatedAt: true },
      }),
      prisma.programScoreSnapshot.findMany({
        where: { program: { organizerId } },
        orderBy: { recalculatedAt: "desc" },
        take: 100,
        select: { programId: true, totalProgramScore: true, scoreBand: true, recalculatedAt: true },
      }),
    ]);

    const latestByProgram = new Map<string, { programId: string; totalProgramScore: number; scoreBand: string; recalculatedAt: Date }>();
    for (const row of weakPrograms) {
      if (!latestByProgram.has(row.programId)) {
        latestByProgram.set(row.programId, row);
      }
    }
    const weakSignals = Array.from(latestByProgram.values())
      .filter((r) => r.scoreBand === "low" || r.scoreBand === "insufficient_data" || r.scoreBand === "unknown")
      .slice(0, 5);

    const nextActions: string[] = [];
    if (organizer.verificationStatus !== "verified" && organizer.verificationStatus !== "trusted_by_platform") {
      nextActions.push("Завершить verification: подтвердить документы и evidence.");
    }
    if (organizer.billingStatus !== "billing_connected") {
      nextActions.push("Подключить billing profile и реквизиты для paid->completed потока.");
    }
    if ((latestScore?.scoreBand ?? "unknown") === "low") {
      nextActions.push("Low organizer score: ускорить first response и разобрать refund/complaint причины.");
    }
    if ((latestScore?.scoreBand ?? "unknown") === "unknown") {
      nextActions.push("Недостаточно данных для устойчивого score: нарастить конверсию до booked/completed.");
    }
    if (weakSignals.some((w) => w.scoreBand === "low")) {
      nextActions.push("Есть слабые программы: обновить карточки (медиа, itinerary, safety, cancellation).");
    }

    res.json({
      organizer,
      windowDays: days,
      funnel: { views, leads, booked, paid, completed, reviewsApproved: reviewsCount },
      reviews: { approvedCount: reviewsCount, averageRating: avgRating._avg.rating != null ? Number(avgRating._avg.rating) : null },
      score: latestScore ?? null,
      weakSignals,
      nextActions,
    });
  });

  return router;
}
