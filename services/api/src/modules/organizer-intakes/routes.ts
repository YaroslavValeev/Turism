/**
 * Очередь публичных заявок организаторов (оператор / admin).
 */
import { Router, Request, Response } from "express";
import type { Prisma } from "@prisma/client";
import { getNextIntakeProcessingStatuses, INTAKE_MANUAL_PATCH_STATUSES, isIntakeProcessingStatus } from "@mywave/shared-policy";
import { prisma } from "../../lib/prisma";
import { writeAuditLog } from "../../lib/audit";
import { requireAdmin } from "../../middleware/auth";
import type { Env } from "@mywave/config";
import { parseStoredProgramIntakeMeta } from "../public-intake/programSubmissionDraft";
import { createDraftProgramFromIntake } from "./draftProgramFromIntake";
import { applyIntakeProcessingTransition } from "../status-engine/applyIntakeProcessingTransition";

const PROCESSING_STATUSES = new Set(["new", "in_review", "draft_created", "dismissed"]);

export function organizerIntakesRoutes(env: Env): Router {
  const router = Router();
  const admin = requireAdmin(env);

  router.get("/", admin, async (req: Request, res: Response) => {
    const intakeType = typeof req.query.intake_type === "string" ? req.query.intake_type.trim() : "";
    const processingStatus = typeof req.query.processing_status === "string" ? req.query.processing_status.trim() : "";
    const limitRaw = Number(req.query.limit);
    const offsetRaw = Number(req.query.offset);
    const limit = Number.isFinite(limitRaw) ? Math.min(100, Math.max(1, limitRaw)) : 50;
    const offset = Number.isFinite(offsetRaw) && offsetRaw >= 0 ? offsetRaw : 0;

    const where: Prisma.PublicOrganizerIntakeWhereInput = {};
    if (intakeType) where.intakeType = intakeType;
    if (processingStatus && PROCESSING_STATUSES.has(processingStatus)) {
      where.processingStatus = processingStatus;
    }

    const [items, total] = await Promise.all([
      prisma.publicOrganizerIntake.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
      prisma.publicOrganizerIntake.count({ where }),
    ]);

    res.json({ items, total, limit, offset });
  });

  router.get("/:id", admin, async (req: Request, res: Response) => {
    const row = await prisma.publicOrganizerIntake.findUnique({ where: { id: req.params.id } });
    if (!row) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    let linkedProgram: { id: string; title: string; publishStatus: string; organizerId: string } | null = null;
    if (row.linkedProgramId) {
      linkedProgram = await prisma.program.findUnique({
        where: { id: row.linkedProgramId },
        select: { id: true, title: true, publishStatus: true, organizerId: true },
      });
    }
    res.json({
      ...row,
      linkedProgram,
      nextProcessingStatuses: getNextIntakeProcessingStatuses(row.processingStatus),
    });
  });

  router.patch("/:id/status", admin, async (req: Request, res: Response) => {
    const { processingStatus, note, idempotencyKey } = req.body as {
      processingStatus?: string;
      note?: string;
      idempotencyKey?: string;
    };
    if (!processingStatus || !isIntakeProcessingStatus(processingStatus)) {
      res.status(400).json({ error: "processingStatus required", allowed: [...INTAKE_MANUAL_PATCH_STATUSES] });
      return;
    }
    if (!INTAKE_MANUAL_PATCH_STATUSES.includes(processingStatus as (typeof INTAKE_MANUAL_PATCH_STATUSES)[number])) {
      res.status(400).json({
        error: "draft_created is only set via draft-program endpoint",
        allowed: [...INTAKE_MANUAL_PATCH_STATUSES],
      });
      return;
    }
    const result = await applyIntakeProcessingTransition({
      prisma,
      intakeId: req.params.id,
      toStatus: processingStatus,
      actor: { actorId: req.adminUserId ?? null },
      triggerMode: "manual",
      note: note ?? null,
      source: "PATCH /admin/organizer-intakes/:id/status",
      idempotencyKey: typeof idempotencyKey === "string" && idempotencyKey.trim() ? idempotencyKey.trim() : null,
    });
    if (!result.ok) {
      if (result.error === "not_found") {
        res.status(404).json({ error: "Not found" });
        return;
      }
      res.status(400).json({ error: "Invalid status transition", from: result.from, to: result.to });
      return;
    }
    let linkedProgram: { id: string; title: string; publishStatus: string; organizerId: string } | null = null;
    if (result.row.linkedProgramId) {
      linkedProgram = await prisma.program.findUnique({
        where: { id: result.row.linkedProgramId },
        select: { id: true, title: true, publishStatus: true, organizerId: true },
      });
    }
    res.json({
      ...result.row,
      linkedProgram,
      nextProcessingStatuses: getNextIntakeProcessingStatuses(result.row.processingStatus),
    });
  });

  router.post("/:id/draft-program", admin, async (req: Request, res: Response) => {
    const intake = await prisma.publicOrganizerIntake.findUnique({ where: { id: req.params.id } });
    if (!intake) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    if (intake.intakeType !== "program_submission") {
      res.status(400).json({ error: "only program_submission can create draft program" });
      return;
    }

    if (intake.linkedProgramId) {
      const existingProgram = await prisma.program.findUnique({
        where: { id: intake.linkedProgramId },
        include: { media: true },
      });
      if (existingProgram) {
        res.status(200).json({ program: existingProgram, idempotentReplay: true });
        return;
      }
      res.status(409).json({
        error: "intake.linkedProgramId points to missing program; fix data or clear link in DB",
        linkedProgramId: intake.linkedProgramId,
      });
      return;
    }

    const meta = parseStoredProgramIntakeMeta(intake.meta);
    if (!meta) {
      res.status(400).json({
        error: "wizard meta v2 required on intake.meta to auto-create program",
      });
      return;
    }

    const organizerId = String((req.body as { organizerId?: string }).organizerId ?? "").trim();
    if (!organizerId) {
      res.status(400).json({ error: "organizerId required" });
      return;
    }

    try {
      const { programId } = await createDraftProgramFromIntake({
        intake,
        meta,
        organizerId,
        adminUserId: req.adminUserId ?? null,
      });

      const program = await prisma.program.findUnique({
        where: { id: programId },
        include: { media: true },
      });

      await writeAuditLog({
        entityType: "program",
        entityId: programId,
        changedField: "created_from_intake",
        oldValue: null,
        newValue: intake.id,
        changedBy: req.adminUserId ?? null,
        reason: "draft program created from public organizer intake (wizard v2)",
      });

      await writeAuditLog({
        entityType: "public_organizer_intake",
        entityId: intake.id,
        changedField: "draft_program_created",
        oldValue: intake.processingStatus,
        newValue: programId,
        changedBy: req.adminUserId ?? null,
        reason: "linked draft program",
      });

      res.status(201).json({ program, idempotentReplay: false });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "create_failed";
      if (msg === "organizer_not_found") {
        res.status(400).json({ error: "organizer not found" });
        return;
      }
      res.status(400).json({ error: msg });
    }
  });

  return router;
}
