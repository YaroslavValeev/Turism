import { Router, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import type { Env } from "@mywave/config";
import { requireAdmin } from "../../middleware/auth";
import { prisma } from "../../lib/prisma";
import { writeAuditLog } from "../../lib/audit";
import { isSourceType } from "../ingestion/constants";
import { runDedupJob, runNormalizationJob, runSourceCollection } from "../ingestion/service";
import { runLinkageBackfillReport } from "./sourceLinkageBackfill";
import { approveSourceProposal, rejectSourceProposal, submitSourceProposal } from "./sourceProposal";
import { safeError } from "../../lib/safeLogger";

export function sourcesRoutes(env: Env): Router {
  const router = Router();
  const admin = requireAdmin(env);

  router.get("/", admin, async (_req: Request, res: Response) => {
    const list = await prisma.source.findMany({
      include: {
        organizer: { select: { id: true, displayName: true } },
        runs: {
          take: 5,
          orderBy: { startedAt: "desc" },
        },
        _count: {
          select: {
            rawItems: true,
          },
        },
      },
      orderBy: [{ isActive: "desc" }, { priority: "asc" }, { updatedAt: "desc" }],
    });
    res.json(list);
  });

  // Intake queue only: proposals never become active sources in this route.
  router.get("/proposals", admin, async (_req: Request, res: Response) => {
    const proposals = await prisma.sourceProposal.findMany({
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      take: 200,
    });
    res.json(proposals);
  });

  router.post("/proposals", admin, async (req: Request, res: Response) => {
    try {
      const body = req.body as Record<string, unknown>;
      const result = await submitSourceProposal({
        url: body.url,
        displayName: body.displayName,
        organizerName: body.organizerName,
        notes: body.notes,
        submittedVia: "admin",
        submittedBy: req.adminUserId ?? null,
      });
      if (result.kind === "existing_source") {
        res.status(409).json({ error: "source_already_exists", sourceId: result.sourceId });
        return;
      }
      res.status(result.kind === "created" ? 201 : 200).json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "invalid_source_proposal";
      res.status(400).json({ error: message });
    }
  });

  router.patch("/proposals/:id/reject", admin, async (req: Request, res: Response) => {
    try {
      const proposal = await rejectSourceProposal(req.params.id, req.adminUserId ?? null, (req.body as Record<string, unknown>).reason);
      if (!proposal) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      res.json(proposal);
    } catch (error) {
      const message = error instanceof Error ? error.message : "source_proposal_reject_failed";
      res.status(message === "proposal_not_pending" ? 409 : 400).json({ error: message });
    }
  });

  router.patch("/proposals/:id/approve", admin, async (req: Request, res: Response) => {
    try {
      const result = await approveSourceProposal(req.params.id, req.adminUserId ?? null);
      if (!result) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      if (result.kind === "existing_source") {
        res.status(409).json({ error: "source_already_exists", sourceId: result.sourceId });
        return;
      }
      res.status(201).json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "source_proposal_approve_failed";
      res.status(message === "proposal_not_pending" ? 409 : 400).json({ error: message });
    }
  });

  router.post("/", admin, async (req: Request, res: Response) => {
    const body = req.body as Record<string, unknown>;
    const type = body.type as string | undefined;
    if (!isSourceType(type)) {
      res.status(400).json({ error: "type must be one of instagram | telegram | rss | site" });
      return;
    }
    if (!body.name || !body.urlOrHandle) {
      res.status(400).json({ error: "name and urlOrHandle are required" });
      return;
    }
    const source = await prisma.source.create({
      data: {
        type,
        name: String(body.name).trim(),
        urlOrHandle: String(body.urlOrHandle).trim(),
        discipline: typeof body.discipline === "string" ? body.discipline.trim() || null : null,
        country: typeof body.country === "string" ? body.country.trim() || null : null,
        region: typeof body.region === "string" ? body.region.trim() || null : null,
        language: typeof body.language === "string" ? body.language.trim() || null : null,
        priority: typeof body.priority === "number" ? body.priority : body.priority ? Number(body.priority) : 100,
        trustScore:
          typeof body.trustScore === "number"
            ? body.trustScore
            : body.trustScore
              ? Number(body.trustScore)
              : 0.5,
        parserProfile: typeof body.parserProfile === "string" ? body.parserProfile.trim() || null : null,
        fetchIntervalMinutes:
          typeof body.fetchIntervalMinutes === "number"
            ? body.fetchIntervalMinutes
            : body.fetchIntervalMinutes
              ? Number(body.fetchIntervalMinutes)
              : 1440,
        isActive: body.isActive !== false,
        organizerId: typeof body.organizerId === "string" && body.organizerId ? body.organizerId : null,
        metaJson: (body.metaJson ?? {}) as Prisma.InputJsonValue,
      },
    });
    await writeAuditLog({
      entityType: "source",
      entityId: source.id,
      changedField: "created",
      oldValue: null,
      newValue: source.id,
      changedBy: req.adminUserId ?? null,
      reason: "ingestion source created",
    });
    res.status(201).json(source);
  });

  router.patch("/:id", admin, async (req: Request, res: Response) => {
    const existing = await prisma.source.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const body = req.body as Record<string, unknown>;
    if (body.type !== undefined && !isSourceType(String(body.type))) {
      res.status(400).json({ error: "invalid source type" });
      return;
    }
    const data: Prisma.SourceUpdateInput = {};
    const requiredStringFields = ["name", "urlOrHandle"] as const;
    for (const field of requiredStringFields) {
      if (body[field] !== undefined) {
        const value = typeof body[field] === "string" ? String(body[field]).trim() : "";
        if (!value) {
          res.status(400).json({ error: `${field} cannot be empty` });
          return;
        }
        data[field] = value;
      }
    }
    const nullableStringFields = ["discipline", "country", "region", "language", "parserProfile"] as const;
    for (const field of nullableStringFields) {
      if (body[field] !== undefined) {
        data[field] = typeof body[field] === "string" ? String(body[field]).trim() || null : null;
      }
    }
    if (body.type !== undefined) data.type = String(body.type);
    if (body.priority !== undefined) data.priority = Number(body.priority);
    if (body.trustScore !== undefined) data.trustScore = Number(body.trustScore);
    if (body.fetchIntervalMinutes !== undefined) data.fetchIntervalMinutes = Number(body.fetchIntervalMinutes);
    if (body.isActive !== undefined) data.isActive = Boolean(body.isActive);
    if (body.organizerId !== undefined) data.organizer = body.organizerId ? { connect: { id: String(body.organizerId) } } : { disconnect: true };
    if (body.metaJson !== undefined) data.metaJson = body.metaJson as Prisma.InputJsonValue;

    const source = await prisma.source.update({
      where: { id: req.params.id },
      data,
    });
    await writeAuditLog({
      entityType: "source",
      entityId: source.id,
      changedField: "updated",
      oldValue: null,
      newValue: JSON.stringify(data),
      changedBy: req.adminUserId ?? null,
      reason: "ingestion source updated",
    });
    res.json(source);
  });

  /**
   * PR2: dry-run / apply backfill metaJson.channelId → externalChannelId.
   * Body: `{ "mode": "dry_run" | "apply", "organizerId"?: string }`
   * Apply требует `SOURCES_LINKAGE_BACKFILL_WRITE_ENABLED=1` в окружении API.
   */
  router.post("/linkage-backfill", admin, async (req: Request, res: Response) => {
    const body = req.body as Record<string, unknown>;
    const modeRaw = body.mode;
    const mode = modeRaw === "apply" ? "apply" : "dry_run";
    const organizerId = typeof body.organizerId === "string" && body.organizerId.trim() ? body.organizerId.trim() : null;

    if (mode === "apply" && !env.SOURCES_LINKAGE_BACKFILL_WRITE_ENABLED) {
      res.status(403).json({
        error: "apply_disabled",
        message: "Установите SOURCES_LINKAGE_BACKFILL_WRITE_ENABLED=1 для режима apply",
      });
      return;
    }

    try {
      const report = await runLinkageBackfillReport(prisma, env, {
        mode,
        organizerId,
        changedBy: req.adminUserId ?? null,
      });
      res.json(report);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (msg.includes("apply_requires_SOURCES_LINKAGE_BACKFILL_WRITE_ENABLED")) {
        res.status(403).json({ error: "apply_disabled" });
        return;
      }
      safeError("sources.linkage-backfill failed", e);
      res.status(500).json({ error: "linkage_backfill_failed" });
    }
  });

  router.post("/:id/run", admin, async (req: Request, res: Response) => {
    const source = await prisma.source.findUnique({ where: { id: req.params.id } });
    if (!source) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    try {
      const collect = await runSourceCollection(source.id, req.adminUserId ?? null);
      const normalize = await runNormalizationJob(req.adminUserId ?? null, [source.id]);
      const dedup = await runDedupJob(req.adminUserId ?? null, [source.id]);
      res.json({ collect, normalize, dedup });
    } catch (error) {
      safeError("sources.run failed", error);
      res.status(400).json({ error: "Source run failed" });
    }
  });

  return router;
}
