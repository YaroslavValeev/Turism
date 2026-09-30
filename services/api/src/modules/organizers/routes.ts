/**
 * Organizers CRUD. Source of truth: canonical_entity_model, canonical_status_models.
 * Public list returns an allowlisted catalog DTO; sensitive reads and all writes are admin-only.
 * verification-status change → audit log.
 */
import { Router, Request, Response, NextFunction } from "express";
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
import { isOrganizerHiddenFromStorefront } from "../programs/publicVisibility";
import {
  AUTOPUBLISH_ELIGIBLE_STATUSES,
  checkVerificationTransition,
  describeMergeBlockers,
  findSimilarOrganizers,
  isIngestionStubOrganizer,
} from "./workflow";

export function organizersRoutes(env: Env): Router {
  const router = Router();
  const admin = requireAdmin(env);
  const publicOrAdmin = (req: Request, res: Response, next: NextFunction) => {
    if (!req.headers.authorization) {
      next();
      return;
    }
    admin(req, res, next);
  };

  router.get("/", publicOrAdmin, async (req: Request, res: Response) => {
    const verificationStatus = req.query.verification_status as string | undefined;
    const where = verificationStatus && isOrganizerVerificationStatus(verificationStatus)
      ? { verificationStatus: verificationStatus as OrganizerVerificationStatus }
      : {};
    if (req.headers.authorization) {
      const list = await prisma.organizer.findMany({
        where,
        orderBy: { createdAt: "desc" },
        include: {
          _count: { select: { programs: true, sources: true, verificationEvidence: true } },
          programs: { where: { publishStatus: "published" }, select: { id: true } },
        },
      });
      res.json(list.map(({ programs, ...organizer }) => ({
        ...organizer,
        publishedProgramCount: programs?.length ?? 0,
        isIngestionStub: isIngestionStubOrganizer(organizer.contactEmail),
      })));
      return;
    }
    const list = await prisma.organizer.findMany({
      where,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        displayName: true,
        verificationStatus: true,
      },
    });
    res.json(list.map((organizer) => ({
      id: organizer.id,
      displayName: organizer.displayName,
      verificationStatus: organizer.verificationStatus,
    })));
  });

  router.get("/:id", admin, async (req: Request, res: Response) => {
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
    if (displayName !== undefined) {
      const trimmed = String(displayName ?? "").trim();
      if (!trimmed) {
        res.status(400).json({ error: "Название организатора не может быть пустым" });
        return;
      }
      data.displayName = trimmed;
    }
    if (legalStatus !== undefined) data.legalStatus = legalStatus || null;
    if (contactEmail !== undefined) {
      const email = String(contactEmail ?? "").trim();
      if (!email) {
        res.status(400).json({ error: "Email организатора не может быть пустым" });
        return;
      }
      data.contactEmail = email;
    }
    if (contactPhone !== undefined) data.contactPhone = contactPhone || null;
    if (responseScore !== undefined) data.responseScore = responseScore === null || responseScore === "" ? null : Number(responseScore);
    for (const key of Object.keys(data)) {
      if (String(data[key] ?? "") === String(existing[key as keyof typeof existing] ?? "")) delete data[key];
    }
    const renamed = typeof data.displayName === "string" ? data.displayName : null;
    const o = await prisma.$transaction(async (tx) => {
      const updated = await tx.organizer.update({ where: { id: req.params.id }, data });
      if (renamed) {
        // Program.organizerName is a display copy; keep copies that still mirror the old name in sync.
        await tx.program.updateMany({
          where: { organizerId: updated.id, OR: [{ organizerName: null }, { organizerName: existing.displayName }] },
          data: { organizerName: renamed },
        });
      }
      return updated;
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
    const { verificationStatus, evidence } = req.body as {
      verificationStatus?: string;
      evidence?: { evidenceType?: string; evidenceUrl?: string; notes?: string } | null;
    };
    if (!verificationStatus || !isOrganizerVerificationStatus(verificationStatus)) {
      res.status(400).json({ error: "valid verificationStatus required", allowed: "listed,checked,verified,trusted_by_platform,paused,rejected" });
      return;
    }
    const newEvidence = evidence && (evidence.evidenceUrl?.trim() || evidence.notes?.trim())
      ? {
          evidenceType: evidence.evidenceType?.trim() || "operator_check",
          evidenceUrl: evidence.evidenceUrl?.trim() || null,
          notes: evidence.notes?.trim() || null,
        }
      : null;
    const evidenceCount = await prisma.organizerVerificationEvidence.count({ where: { organizerId: existing.id } });
    const transitionError = checkVerificationTransition(
      existing.verificationStatus,
      verificationStatus,
      evidenceCount > 0 || newEvidence !== null,
    );
    if (transitionError) {
      res.status(400).json({ error: transitionError });
      return;
    }
    const grantsAutoPublish = AUTOPUBLISH_ELIGIBLE_STATUSES.includes(verificationStatus);
    const revokesAutoPublish = isOrganizerHiddenFromStorefront(verificationStatus);
    const o = await prisma.$transaction(async (tx) => {
      if (newEvidence) {
        await tx.organizerVerificationEvidence.create({ data: { organizerId: existing.id, ...newEvidence } });
      }
      return tx.organizer.update({
        where: { id: req.params.id },
        data: {
          verificationStatus: verificationStatus as OrganizerVerificationStatus,
          ...(grantsAutoPublish && !existing.autoPublishApprovedAt
            ? { autoPublishApprovedAt: new Date(), autoPublishApprovedBy: req.adminUserId ?? "system:organizer-verification" }
            : {}),
          ...(revokesAutoPublish ? { autoPublishApprovedAt: null, autoPublishApprovedBy: null } : {}),
        },
      });
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

  /** One-screen organizer workspace: profile, verification evidence, sources, programs, merge candidates. */
  router.get("/:id/overview", admin, async (req: Request, res: Response) => {
    const organizer = await prisma.organizer.findUnique({
      where: { id: req.params.id },
      include: {
        verificationEvidence: { orderBy: { createdAt: "desc" } },
        sources: {
          select: { id: true, name: true, type: true, urlOrHandle: true, isActive: true, lastSuccessAt: true, metaJson: true },
          orderBy: { name: "asc" },
        },
        programs: {
          select: {
            id: true, title: true, publishStatus: true, reviewStatus: true, autoPublished: true,
            startDate: true, endDate: true, discipline: true, region: true, organizerName: true,
          },
          orderBy: [{ startDate: "desc" }],
        },
      },
    });
    if (!organizer) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const all = await prisma.organizer.findMany({
      select: { id: true, displayName: true, verificationStatus: true, contactEmail: true, _count: { select: { programs: true } } },
    });
    const similar = findSimilarOrganizers(organizer, all).map((other) => ({
      id: other.id,
      displayName: other.displayName,
      verificationStatus: other.verificationStatus,
      isIngestionStub: isIngestionStubOrganizer(other.contactEmail),
      programCount: other._count.programs,
    }));
    const { verificationEvidence, sources, programs, ...profile } = organizer;
    res.json({
      organizer: { ...profile, isIngestionStub: isIngestionStubOrganizer(profile.contactEmail) },
      evidence: verificationEvidence,
      sources: sources.map(({ metaJson, ...source }) => ({
        ...source,
        autoPublishOptOut: Boolean(metaJson && typeof metaJson === "object" && (metaJson as Record<string, unknown>).autoPublish === false),
      })),
      programs,
      similar,
      storefrontHidden: isOrganizerHiddenFromStorefront(profile.verificationStatus),
    });
  });

  router.put("/:id/autopublish", admin, async (req: Request, res: Response) => {
    const existing = await prisma.organizer.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const enabled = (req.body as { enabled?: unknown }).enabled === true;
    if (enabled && !AUTOPUBLISH_ELIGIBLE_STATUSES.includes(existing.verificationStatus)) {
      res.status(400).json({ error: "Автопубликацию можно разрешить только организатору со статусом «Верифицирован» или «Доверенный»." });
      return;
    }
    const o = await prisma.organizer.update({
      where: { id: existing.id },
      data: enabled
        ? { autoPublishApprovedAt: existing.autoPublishApprovedAt ?? new Date(), autoPublishApprovedBy: existing.autoPublishApprovedBy ?? req.adminUserId ?? "admin" }
        : { autoPublishApprovedAt: null, autoPublishApprovedBy: null },
    });
    await writeAuditLog({
      entityType: "organizer",
      entityId: o.id,
      changedField: "auto_publish_approval",
      oldValue: existing.autoPublishApprovedAt ? "approved" : "none",
      newValue: enabled ? "approved" : "none",
      changedBy: req.adminUserId ?? null,
      reason: enabled ? "autopublish approved in admin" : "autopublish revoked in admin",
    });
    res.json(o);
  });

  /** Moves programs, sources and operational links of a duplicate (usually an ingestion stub) to the target organizer. */
  router.post("/:id/merge-into", admin, async (req: Request, res: Response) => {
    const targetId = String((req.body as { targetId?: unknown }).targetId ?? "");
    if (!targetId || targetId === req.params.id) {
      res.status(400).json({ error: "Укажите другого организатора, с которым объединить" });
      return;
    }
    const [from, target] = await Promise.all([
      prisma.organizer.findUnique({
        where: { id: req.params.id },
        include: {
          billingProfile: { select: { id: true } },
          _count: {
            select: {
              bookings: true, payments: true, refunds: true, commissions: true, contracts: true,
              billingStatements: true, telegramAccounts: true, outreachCampaigns: true,
            },
          },
        },
      }),
      prisma.organizer.findUnique({ where: { id: targetId } }),
    ]);
    if (!from || !target) {
      res.status(404).json({ error: "Организатор не найден" });
      return;
    }
    const blockers = describeMergeBlockers({ ...from._count, billingProfile: from.billingProfile ? 1 : 0 });
    if (blockers) {
      res.status(409).json({ error: blockers });
      return;
    }
    const moved = await prisma.$transaction(async (tx) => {
      const where = { organizerId: from.id };
      const data = { organizerId: target.id };
      const programs = await tx.program.updateMany({ where, data: { ...data, organizerName: target.displayName } });
      const sources = await tx.source.updateMany({ where, data });
      await tx.organizerVerificationEvidence.updateMany({ where, data });
      await tx.lead.updateMany({ where, data });
      await tx.review.updateMany({ where, data });
      await tx.reviewRequest.updateMany({ where, data });
      await tx.incident.updateMany({ where, data });
      await tx.telegramLeadAttempt.updateMany({ where, data });
      await tx.organizerContactChannel.updateMany({ where, data });
      await tx.organizerLeadStatusEvent.updateMany({ where, data });
      await tx.telegramReconciliationTask.updateMany({ where, data });
      await tx.spot.updateMany({ where, data });
      await tx.organizerScoreSnapshot.deleteMany({ where });
      await tx.organizer.update({
        where: { id: from.id },
        data: { verificationStatus: "rejected", autoPublishApprovedAt: null, autoPublishApprovedBy: null },
      });
      return { programs: programs.count, sources: sources.count };
    });
    await writeAuditLog({
      entityType: "organizer",
      entityId: from.id,
      changedField: "merged_into",
      oldValue: from.displayName,
      newValue: target.id,
      changedBy: req.adminUserId ?? null,
      reason: `merged into ${target.displayName}: programs ${moved.programs}, sources ${moved.sources}`,
    });
    res.json({ ok: true, targetId: target.id, moved });
  });

  router.get("/:id/billing-profile", admin, async (req: Request, res: Response) => {
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

  router.get("/:id/contracts", admin, async (req: Request, res: Response) => {
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

  router.get("/:id/privileges", admin, async (req: Request, res: Response) => {
    try {
      const derived = await deriveOrganizerPrivileges(req.params.id);
      res.json({
        organizerId: req.params.id,
        onboardingStatus: derived.onboardingStatus,
        billingStatus: derived.billingStatus,
        privilegeStatus: derived.privilegeStatus,
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

  router.get("/:id/analytics/overview", admin, async (req: Request, res: Response) => {
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
