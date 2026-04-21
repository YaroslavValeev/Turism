/**
 * Programs CRUD + publish workflow. Source: endpoint_contracts, program_card_schema, canonical_status_models.
 * GET public (catalog: only published); admin with ?all=1 + Bearer sees all. POST/PATCH/publish-status admin. Publish gate enforced.
 */
import { Router, Request, Response } from "express";
import jwt from "jsonwebtoken";
import {
  inclusiveDurationDaysUTC,
  isProgramIntakeSource,
  isProgramPublishStatus,
  type ProgramPublishStatus,
} from "@mywave/shared-types";
import { getNextProgramPublishStatuses } from "@mywave/shared-policy";
import { prisma } from "../../lib/prisma";
import { writeAuditLog } from "../../lib/audit";
import { requireAdmin } from "../../middleware/auth";
import {
  DURATION_DAYS_READ_ONLY_MESSAGE,
  evaluateDurationDaysInPatchBody,
  mergeDatesAndComputeDurationDays,
} from "./patchProgramDates";
import type { Env } from "@mywave/config";
import type { AdminPayload } from "../../middleware/auth";
import { getProgramVisibilityThresholdDate, isProgramPubliclyVisible } from "./publicVisibility";
import { dedupeProgramsByEventKey } from "./dedup";
import { maybeEnqueueProgramDatesUpdatedFromPatch } from "../notifications/enqueueProgramJobs";
import { applyProgramPublishTransition } from "../status-engine/applyProgramPublishTransition";

function isAdminRequest(req: Request, env: Env): boolean {
  const token = req.headers.authorization?.replace(/^Bearer\s+/, "");
  if (!token) return false;
  try {
    const payload = jwt.verify(token, env.ADMIN_JWT_SECRET) as AdminPayload;
    return payload.role === "admin";
  } catch {
    return false;
  }
}

/** Public catalog must not expose operator-only intake source (see docs/INGESTION_POLICY.md). */
function toPublicProgram<P extends { intakeSource?: string | null }>(p: P): Omit<P, "intakeSource"> {
  const { intakeSource: _omit, ...rest } = p;
  return rest;
}

function formatOrganizerVerificationBadge(status: string | null | undefined): string | null {
  switch (status) {
    case "trusted_by_platform":
      return "Платформа: trusted";
    case "verified":
      return "Платформа: verified";
    case "checked":
      return "Платформа: checked";
    default:
      return null;
  }
}

export function programsRoutes(env: Env): Router {
  const router = Router();
  const admin = requireAdmin(env);

  function parseOptionalNonNegativeInt(value: unknown): number | null | undefined {
    if (value === undefined) return undefined;
    if (value === null || value === "") return null;
    const normalized = typeof value === "string" ? Number(value.trim()) : value;
    if (!Number.isInteger(normalized) || Number(normalized) < 0) {
      throw new Error("capacity fields must be non-negative integers");
    }
    return Number(normalized);
  }

  function ensureCapacityConsistency(
    capacityTotal: number | null | undefined,
    spotsAvailable: number | null | undefined,
  ) {
    if (capacityTotal != null && spotsAvailable != null && spotsAvailable > capacityTotal) {
      throw new Error("spotsAvailable cannot exceed capacityTotal");
    }
  }

  // Catalog: published only for public; admin with ?all=1 + Bearer sees all
  router.get("/", async (req: Request, res: Response) => {
    const { discipline, region, level, risk, all: adminAll, publish_status } = req.query as Record<string, string | undefined>;
    const allowAll = adminAll === "1" && isAdminRequest(req, env);
    if (adminAll === "1" && !allowAll) {
      res.status(403).json({ error: "Forbidden: admin only" });
      return;
    }
    const where: Record<string, unknown> = {};
    if (!allowAll) {
      where.publishStatus = "published";
      where.endDate = { gte: getProgramVisibilityThresholdDate() };
      where.OR = [{ spotsAvailable: null }, { spotsAvailable: { gt: 0 } }];
    }
    else if (publish_status && isProgramPublishStatus(publish_status)) where.publishStatus = publish_status;
    if (discipline) where.discipline = discipline;
    if (region) where.region = region;
    if (level) where.levelRequired = level;
    if (risk) where.riskLevel = risk;
    const list = await prisma.program.findMany({
      where,
      include: { media: true, organizer: { select: { id: true, displayName: true, verificationStatus: true } } },
      orderBy: { startDate: "asc" },
    });
    const organizerIds = [...new Set(list.map((program) => program.organizer?.id).filter((id): id is string => Boolean(id)))];
    const approvedReviewStats =
      organizerIds.length > 0
        ? await prisma.review.groupBy({
            by: ["organizerId"],
            where: { organizerId: { in: organizerIds }, moderationStatus: "approved" },
            _avg: { rating: true },
            _count: { _all: true },
          })
        : [];
    const reviewStatsByOrganizer = new Map(
      approvedReviewStats.map((item) => [
        item.organizerId,
        {
          reviewCount: item._count._all,
          ratingAvg: item._avg.rating != null ? Number(item._avg.rating) : null,
        },
      ]),
    );
    const enriched = list.map((program) => {
      const stats = reviewStatsByOrganizer.get(program.organizer.id) ?? { reviewCount: 0, ratingAvg: null };
      return {
        ...program,
        nextPublishStatuses: allowAll ? getNextProgramPublishStatuses(program.publishStatus) : undefined,
        organizer: {
          ...program.organizer,
          reviewCount: stats.reviewCount,
          ratingAvg: stats.ratingAvg,
          verificationBadge: formatOrganizerVerificationBadge(program.organizer.verificationStatus),
        },
      };
    });
    if (allowAll) {
      res.json(enriched);
      return;
    }
    res.json(dedupeProgramsByEventKey(enriched).map((p) => toPublicProgram(p)));
  });

  router.get("/:id", async (req: Request, res: Response) => {
    const p = await prisma.program.findUnique({
      where: { id: req.params.id },
      include: {
        media: true,
        organizer: {
          select: {
            id: true,
            displayName: true,
            verificationStatus: true,
            certificatesSummary: true,
            insuranceSummary: true,
            emergencyPlanSummary: true,
            equipmentSummary: true,
          },
        },
      },
    });
    if (!p) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    if (!isProgramPubliclyVisible(p)) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json(toPublicProgram(p));
  });

  router.post("/", admin, async (req: Request, res: Response) => {
    const body = req.body as Record<string, unknown>;
    const organizerId = body.organizerId as string;
    if (!organizerId || !body.title || !body.discipline || !body.region || !body.startDate || !body.endDate) {
      res.status(400).json({ error: "organizerId, title, discipline, region, startDate, endDate required" });
      return;
    }
    if (body.durationDays !== undefined) {
      console.debug("programs POST: ignoring client durationDays (derived from dates)", { organizerId });
    }
    const publishStatus = (body.publishStatus && isProgramPublishStatus(body.publishStatus as string))
      ? (body.publishStatus as ProgramPublishStatus)
      : "draft";
    const isStarred = body.isStarred === true;
    const rawIntake = body.intakeSource as string | null | undefined;
    let intakeSource: string | null = null;
    if (rawIntake != null && rawIntake !== "") {
      if (!isProgramIntakeSource(rawIntake)) {
        res.status(400).json({
          error: "invalid intakeSource",
          allowed: "organizer_form, admin_manual, email, telegram, sheets_csv, seed",
        });
        return;
      }
      intakeSource = rawIntake;
    }
    let capacityTotal: number | null | undefined;
    let spotsAvailable: number | null | undefined;
    try {
      capacityTotal = parseOptionalNonNegativeInt(body.capacityTotal);
      spotsAvailable = parseOptionalNonNegativeInt(body.spotsAvailable);
      if (spotsAvailable === undefined && capacityTotal != null) {
        spotsAvailable = capacityTotal;
      }
      ensureCapacityConsistency(capacityTotal, spotsAvailable);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "invalid capacity fields" });
      return;
    }
    const startDate = new Date(body.startDate as string);
    const endDate = new Date(body.endDate as string);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      res.status(400).json({ error: "invalid startDate or endDate" });
      return;
    }
    let durationDays: number;
    try {
      durationDays = inclusiveDurationDaysUTC(startDate, endDate);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "invalid date range" });
      return;
    }
    const p = await prisma.program.create({
      data: {
        organizerId,
        title: body.title as string,
        discipline: body.discipline as string,
        region: body.region as string,
        exactLocation: (body.exactLocation as string) ?? null,
        startDate,
        endDate,
        durationDays,
        formatType: (body.formatType as string) ?? null,
        audienceFit: (body.audienceFit as string) ?? null,
        levelRequired: (body.levelRequired as string) ?? null,
        riskLevel: (body.riskLevel as string) ?? null,
        priceFromRub: body.priceFromRub != null ? Number(body.priceFromRub) : null,
        capacityTotal: capacityTotal ?? null,
        spotsAvailable: spotsAvailable ?? null,
        isStarred,
        currency: (body.currency as string) ?? "RUB",
        inclusions: (body.inclusions as string) ?? null,
        exclusions: (body.exclusions as string) ?? null,
        gearRequirements: (body.gearRequirements as string) ?? null,
        medicalLimitations: (body.medicalLimitations as string) ?? null,
        itineraryDayByDay: (body.itineraryDayByDay as string) ?? null,
        organizerName: (body.organizerName as string) ?? null,
        trustReason: (body.trustReason as string) ?? null,
        reviewsSummary: (body.reviewsSummary as string) ?? null,
        cancellationRules: (body.cancellationRules as string) ?? null,
        whatHappensAfterBooking: (body.whatHappensAfterBooking as string) ?? null,
        cta: (body.cta as string) ?? null,
        packingListNotes: (body.packingListNotes as string) ?? null,
        accommodationNotes: (body.accommodationNotes as string) ?? null,
        transportNotes: (body.transportNotes as string) ?? null,
        sightsNotes: (body.sightsNotes as string) ?? null,
        planBWeatherNotes: (body.planBWeatherNotes as string) ?? null,
        platformTravelTips: (body.platformTravelTips as string) ?? null,
        intakeSource,
        publishStatus,
      },
      include: { media: true },
    });
    await writeAuditLog({
      entityType: "program",
      entityId: p.id,
      changedField: "created",
      oldValue: null,
      newValue: p.id,
      changedBy: req.adminUserId ?? null,
      reason: "program created",
    });
    res.status(201).json(p);
  });

  router.patch("/:id", admin, async (req: Request, res: Response) => {
    const existing = await prisma.program.findUnique({
      where: { id: req.params.id },
      include: { media: true },
    });
    if (!existing) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const body = req.body as Record<string, unknown>;
    const durationPolicy = evaluateDurationDaysInPatchBody(body);
    if (durationPolicy.kind === "reject_only_duration") {
      res.status(400).json({ error: DURATION_DAYS_READ_ONLY_MESSAGE, code: "DURATION_READ_ONLY" });
      return;
    }
    if (durationPolicy.kind === "ignore_client_duration") {
      console.debug("programs PATCH: ignoring client durationDays (server recalculates from dates)", {
        id: req.params.id,
      });
    }
    const allowed = [
      "title", "discipline", "region", "exactLocation", "startDate", "endDate",
      "formatType", "audienceFit", "levelRequired", "riskLevel", "priceFromRub", "capacityTotal", "spotsAvailable", "currency",
      "inclusions", "exclusions", "gearRequirements", "medicalLimitations", "itineraryDayByDay",
      "organizerName", "trustReason", "reviewsSummary", "cancellationRules", "whatHappensAfterBooking", "cta",
      "packingListNotes", "accommodationNotes", "transportNotes", "sightsNotes", "planBWeatherNotes", "platformTravelTips",
      "intakeSource", "isStarred",
    ];
    const data: Record<string, unknown> = {};
    let nextCapacityTotal = existing.capacityTotal;
    let nextSpotsAvailable = existing.spotsAvailable;
    for (const key of allowed) {
      if (body[key] !== undefined) {
        if (key === "intakeSource") {
          const v = body[key] as string | null;
          if (v === null || v === "") {
            data[key] = null;
          } else if (!isProgramIntakeSource(v)) {
            res.status(400).json({ error: "invalid intakeSource" });
            return;
          } else {
            data[key] = v;
          }
          continue;
        }
        if (key === "capacityTotal" || key === "spotsAvailable") {
          try {
            const parsed = parseOptionalNonNegativeInt(body[key]);
            if (key === "capacityTotal") nextCapacityTotal = parsed ?? null;
            if (key === "spotsAvailable") nextSpotsAvailable = parsed ?? null;
            data[key] = parsed ?? null;
          } catch (error) {
            res.status(400).json({ error: error instanceof Error ? error.message : "invalid capacity fields" });
            return;
          }
          continue;
        }
        if (key === "isStarred") {
          data[key] = body[key] === true;
          continue;
        }
        if (key === "startDate" || key === "endDate") {
          const parsed = new Date(body[key] as string);
          if (Number.isNaN(parsed.getTime())) {
            res.status(400).json({ error: `invalid ${key}` });
            return;
          }
          data[key] = parsed;
        } else if (key === "priceFromRub") data[key] = Number(body[key]);
        else data[key] = body[key];
      }
    }
    if (data.startDate !== undefined || data.endDate !== undefined) {
      const merged = mergeDatesAndComputeDurationDays(
        { startDate: existing.startDate, endDate: existing.endDate },
        { startDate: data.startDate as Date | undefined, endDate: data.endDate as Date | undefined },
      );
      if ("error" in merged) {
        res.status(400).json({ error: merged.error });
        return;
      }
      data.durationDays = merged.durationDays;
    }
    if (Object.keys(data).length === 0) {
      res.status(400).json({ error: "no valid fields to update" });
      return;
    }
    try {
      ensureCapacityConsistency(nextCapacityTotal, nextSpotsAvailable);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "invalid capacity fields" });
      return;
    }
    const p = await prisma.program.update({
      where: { id: req.params.id },
      data,
      include: { media: true },
    });
    for (const [field, newVal] of Object.entries(data)) {
      const oldVal = existing[field as keyof typeof existing];
      await writeAuditLog({
        entityType: "program",
        entityId: p.id,
        changedField: field,
        oldValue: oldVal != null ? String(oldVal) : null,
        newValue: newVal != null ? String(newVal) : null,
        changedBy: req.adminUserId ?? null,
      });
    }
    if (env.NOTIFICATIONS_ENABLED) {
      try {
        await maybeEnqueueProgramDatesUpdatedFromPatch(
          prisma,
          existing,
          p,
          data,
          env.NOTIFICATIONS_ANTI_FLIP_WINDOW_HOURS,
        );
      } catch (error) {
        console.error("[notifications] enqueue program_dates_updated failed", error instanceof Error ? error.message : error);
      }
    }
    res.json(p);
  });

  router.patch("/:id/publish-status", admin, async (req: Request, res: Response) => {
    const { publishStatus, idempotencyKey, reason } = req.body as {
      publishStatus?: string;
      idempotencyKey?: string;
      reason?: string;
    };
    if (!publishStatus || !isProgramPublishStatus(publishStatus)) {
      res.status(400).json({
        error: "valid publishStatus required",
        allowed: "draft,internal_review,needs_fix,approved,published,paused,archived",
      });
      return;
    }
    const result = await applyProgramPublishTransition({
      db: prisma,
      programId: req.params.id,
      toStatus: publishStatus,
      actor: { actorId: req.adminUserId ?? null },
      triggerMode: "manual",
      reason: reason ?? "publish workflow",
      source: "PATCH /programs/:id/publish-status",
      idempotencyKey: typeof idempotencyKey === "string" && idempotencyKey.trim() ? idempotencyKey.trim() : null,
    });
    if (!result.ok) {
      if (result.error === "not_found") {
        res.status(404).json({ error: "Not found" });
        return;
      }
      if (result.error === "publish_gate_not_passed") {
        res.status(400).json({
          error: "Publish gate not passed",
          missing: result.missing,
          missingFields: result.missingFields,
        });
        return;
      }
      if (result.error === "invalid_transition") {
        res.status(400).json({
          error: "Invalid status transition",
          from: result.from,
          to: result.to,
        });
        return;
      }
      res.status(400).json({ error: result.error });
      return;
    }
    res.json(result.program);
  });

  router.post("/:id/media", admin, async (req: Request, res: Response) => {
    const program = await prisma.program.findUnique({ where: { id: req.params.id } });
    if (!program) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const { mediaType, url, caption } = req.body as { mediaType?: string; url?: string; caption?: string };
    if (!mediaType || !url) {
      res.status(400).json({ error: "mediaType and url required" });
      return;
    }
    const media = await prisma.programMedia.create({
      data: { programId: program.id, mediaType, url, caption: caption ?? null },
    });
    await writeAuditLog({
      entityType: "program_media",
      entityId: media.id,
      changedField: "created",
      oldValue: null,
      newValue: url,
      changedBy: req.adminUserId ?? null,
    });
    res.status(201).json(media);
  });

  return router;
}
