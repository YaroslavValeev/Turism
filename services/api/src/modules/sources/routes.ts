import { Router, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import type { Env } from "@mywave/config";
import { requireAdmin } from "../../middleware/auth";
import { prisma } from "../../lib/prisma";
import { writeAuditLog } from "../../lib/audit";
import { isSourceType } from "../ingestion/constants";
import { runDedupJob, runIngestionJob, runNormalizationJob, runSourceCollection } from "../ingestion/service";
import { runSourceImportFile, runXlsxSourceImport } from "./importService";
import {
  SOURCE_LIFECYCLE,
  SOURCE_ORIGIN,
  detectSourceType,
  normalizeSourceUrlOrHandle,
  upsertSourceByTypeAndHandle,
} from "./sourceRegistry";
import { syncOrganizerContractAutoSources } from "./autoOnboardingService";
import { tryAcquireManualRunSlot } from "./manualRunRateLimit";

export function sourcesRoutes(env: Env): Router {
  const router = Router();
  const admin = requireAdmin(env);

  /** Явная пересборка contract-auto sources из каналов организатора (owner ops). */
  router.post("/contract-auto-sync", admin, async (req: Request, res: Response) => {
    const organizerId = typeof req.body?.organizerId === "string" ? req.body.organizerId.trim() : "";
    if (!organizerId) {
      res.status(400).json({ error: "organizerId required" });
      return;
    }
    const org = await prisma.organizer.findUnique({ where: { id: organizerId }, select: { id: true } });
    if (!org) {
      res.status(404).json({ error: "organizer_not_found" });
      return;
    }
    const result = await syncOrganizerContractAutoSources(prisma, organizerId, {
      adminUserId: req.adminUserId ?? null,
      reason: "manual_contract_auto_sync",
    });
    await writeAuditLog({
      entityType: "organizer",
      entityId: organizerId,
      changedField: "contract_auto_sources_manual_sync",
      oldValue: null,
      newValue: JSON.stringify(result),
      changedBy: req.adminUserId ?? null,
      reason: "POST /sources/contract-auto-sync",
    });
    res.json(result);
  });

  router.get("/", admin, async (req: Request, res: Response) => {
    const type = typeof req.query.type === "string" ? req.query.type.trim() : "";
    const parserProfile = typeof req.query.parserProfile === "string" ? req.query.parserProfile.trim() : "";
    const sourceOrigin = typeof req.query.sourceOrigin === "string" ? req.query.sourceOrigin.trim() : "";
    const organizerId = typeof req.query.organizerId === "string" ? req.query.organizerId.trim() : "";
    const isActiveRaw = typeof req.query.isActive === "string" ? req.query.isActive.trim() : "";
    const needsAttentionRaw = typeof req.query.needs_attention === "string" ? req.query.needs_attention.trim() : "";
    const lifecycleStateQ = typeof req.query.lifecycleState === "string" ? req.query.lifecycleState.trim() : "";
    const takeRaw = Number(req.query.limit);
    const skipRaw = Number(req.query.offset);
    const take = Number.isFinite(takeRaw) ? Math.min(200, Math.max(1, Math.floor(takeRaw))) : 100;
    const skip = Number.isFinite(skipRaw) ? Math.max(0, Math.floor(skipRaw)) : 0;
    const where: Prisma.SourceWhereInput = {};
    if (type) where.type = type;
    if (parserProfile) where.parserProfile = parserProfile;
    if (sourceOrigin) where.sourceOrigin = sourceOrigin;
    if (organizerId) where.organizerId = organizerId;
    if (lifecycleStateQ) where.lifecycleState = lifecycleStateQ;
    if (isActiveRaw) where.isActive = isActiveRaw === "1" || isActiveRaw === "true";
    if (needsAttentionRaw === "1" || needsAttentionRaw === "true") {
      where.OR = [{ lastErrorSnippet: { not: null } }, { lifecycleState: SOURCE_LIFECYCLE.PAUSED_BY_POLICY }];
    }

    const includeChannel = String(req.query.includeExternalChannel ?? "") === "1";
    const list = await prisma.source.findMany({
      where,
      take,
      skip,
      include: {
        organizer: { select: { id: true, displayName: true } },
        ...(includeChannel
          ? {
              externalChannel: {
                select: { id: true, type: true, urlOrHandle: true, isActive: true, lifecycleState: true },
              },
            }
          : {}),
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
      orderBy: [{ isActive: "desc" }, { sourceOrigin: "asc" }, { priority: "asc" }, { updatedAt: "desc" }],
    });
    const total = await prisma.source.count({ where });
    const withMeta = String(req.query.withMeta ?? "") === "1";
    if (withMeta) {
      res.json({ items: list, total, limit: take, offset: skip });
      return;
    }
    res.json(list);
  });

  router.post("/", admin, async (req: Request, res: Response) => {
    const body = req.body as Record<string, unknown>;
    const type = body.type as string | undefined;
    if (!isSourceType(type)) {
      res.status(400).json({ error: "type must be one of instagram | telegram | vk | rss | site | other" });
      return;
    }
    if (!body.name || !body.urlOrHandle) {
      res.status(400).json({ error: "name and urlOrHandle are required" });
      return;
    }
    const source = await upsertSourceByTypeAndHandle(prisma, {
      type,
      name: String(body.name),
      urlOrHandle: String(body.urlOrHandle),
      discipline: typeof body.discipline === "string" ? body.discipline.trim() || null : null,
      country: typeof body.country === "string" ? body.country.trim() || null : null,
      region: typeof body.region === "string" ? body.region.trim() || null : null,
      parserProfile: typeof body.parserProfile === "string" ? body.parserProfile.trim() || null : null,
      fetchIntervalMinutes:
        typeof body.fetchIntervalMinutes === "number"
          ? body.fetchIntervalMinutes
          : body.fetchIntervalMinutes
            ? Number(body.fetchIntervalMinutes)
            : 1440,
      isActive: body.isActive !== false,
      organizerId: typeof body.organizerId === "string" && body.organizerId ? body.organizerId : null,
      sourceOrigin:
        typeof body.sourceOrigin === "string" && body.sourceOrigin.trim()
          ? body.sourceOrigin.trim()
          : SOURCE_ORIGIN.MANUAL,
      lifecycleState:
        typeof body.lifecycleState === "string" && body.lifecycleState.trim()
          ? body.lifecycleState.trim()
          : SOURCE_LIFECYCLE.ACTIVE,
      autoPublish: Boolean((body.metaJson as Record<string, unknown> | undefined)?.autoPublish),
      metaJson: (body.metaJson ?? {}) as Prisma.InputJsonValue,
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
    if (body.sourceOrigin !== undefined) data.sourceOrigin = String(body.sourceOrigin);
    if (body.lifecycleState !== undefined) data.lifecycleState = String(body.lifecycleState);
    if (body.lastErrorSnippet !== undefined) data.lastErrorSnippet = body.lastErrorSnippet ? String(body.lastErrorSnippet) : null;
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

  router.post("/:id/deactivate", admin, async (req: Request, res: Response) => {
    const source = await prisma.source.findUnique({ where: { id: req.params.id } });
    if (!source) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const lifecycleState =
      typeof req.body?.lifecycleState === "string" && req.body.lifecycleState.trim()
        ? req.body.lifecycleState.trim()
        : SOURCE_LIFECYCLE.INACTIVE;
    const updated = await prisma.source.update({
      where: { id: source.id },
      data: {
        isActive: false,
        lifecycleState,
      },
    });
    await writeAuditLog({
      entityType: "source",
      entityId: source.id,
      changedField: "deactivated",
      oldValue: source.lifecycleState,
      newValue: lifecycleState,
      changedBy: req.adminUserId ?? null,
      reason: "source deactivated",
    });
    res.json(updated);
  });

  router.delete("/:id", admin, async (req: Request, res: Response) => {
    const source = await prisma.source.findUnique({ where: { id: req.params.id } });
    if (!source) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const deleted = await prisma.source.delete({ where: { id: source.id } });
    await writeAuditLog({
      entityType: "source",
      entityId: source.id,
      changedField: "deleted",
      oldValue: source.id,
      newValue: null,
      changedBy: req.adminUserId ?? null,
      reason: "source hard deleted",
    });
    res.json({ ok: true, id: deleted.id });
  });

  router.post("/:id/run", admin, async (req: Request, res: Response) => {
    const source = await prisma.source.findUnique({ where: { id: req.params.id } });
    if (!source) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const actor = req.adminUserId ?? "anon";
    const singleGate = tryAcquireManualRunSlot(
      `manual:${actor}:${source.id}`,
      env.INGESTION_MANUAL_RUN_MIN_INTERVAL_MS,
    );
    if (!singleGate.ok) {
      const sec = Math.max(1, Math.ceil(singleGate.retryAfterMs / 1000));
      res.status(429).json({
        error: `Слишком частый ручной запуск этого источника. Повтор через ${sec} с.`,
        code: "rate_limited",
        retry_after_ms: singleGate.retryAfterMs,
        scope: "single_source",
      });
      return;
    }
    try {
      const collect = await runSourceCollection(source.id, req.adminUserId ?? null);
      const normalize = await runNormalizationJob(req.adminUserId ?? null, [source.id]);
      const dedup = await runDedupJob(req.adminUserId ?? null, [source.id]);
      res.json({ collect, normalize, dedup });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "Source run failed" });
    }
  });

  router.post("/run", admin, async (req: Request, res: Response) => {
    try {
      const maxSources = Math.max(1, Math.min(500, env.INGESTION_MANUAL_BULK_MAX_SOURCES));
      const actor = req.adminUserId ?? "anon";

      const mode = typeof req.body?.mode === "string" ? req.body.mode : "all";
      const sourceIds = Array.isArray(req.body?.sourceIds)
        ? req.body.sourceIds.filter((v: unknown): v is string => typeof v === "string" && v.length > 0)
        : [];
      const type = typeof req.body?.type === "string" ? req.body.type.trim() : "";
      const importSessionId = typeof req.body?.importSessionId === "string" ? req.body.importSessionId.trim() : "";
      let selectedIds: string[] = sourceIds;
      if (mode === "by_type" && type) {
        const rows = await prisma.source.findMany({ where: { type, isActive: true }, select: { id: true } });
        selectedIds = rows.map((r) => r.id);
      }
      if (mode === "by_import_session" && importSessionId) {
        const rows = await prisma.source.findMany({ where: { importSessionId, isActive: true }, select: { id: true } });
        selectedIds = rows.map((r) => r.id);
      }

      if (mode === "all") {
        const activeCount = await prisma.source.count({ where: { isActive: true } });
        if (activeCount > maxSources) {
          res.status(400).json({
            error: "too_many_active_sources_for_manual_run",
            active_count: activeCount,
            max: maxSources,
            hint: "Сузьте выборку (sourceIds, by_type, by_import_session) или увеличьте INGESTION_MANUAL_BULK_MAX_SOURCES.",
          });
          return;
        }
      } else if (selectedIds.length > maxSources) {
        res.status(400).json({
          error: "too_many_sources_in_request",
          count: selectedIds.length,
          max: maxSources,
        });
        return;
      }

      const bulkGate = tryAcquireManualRunSlot(`bulk:${actor}`, env.INGESTION_MANUAL_BULK_MIN_INTERVAL_MS);
      if (!bulkGate.ok) {
        const sec = Math.max(1, Math.ceil(bulkGate.retryAfterMs / 1000));
        res.status(429).json({
          error: `Слишком частый массовый запуск ingestion. Повтор через ${sec} с.`,
          code: "rate_limited",
          retry_after_ms: bulkGate.retryAfterMs,
          scope: "bulk_run",
        });
        return;
      }

      const collect = await runIngestionJob(req.adminUserId ?? null, mode === "all" ? undefined : selectedIds);
      const normalize = await runNormalizationJob(req.adminUserId ?? null, mode === "all" ? undefined : selectedIds);
      const dedup = await runDedupJob(req.adminUserId ?? null, mode === "all" ? undefined : selectedIds);
      res.json({ mode, sourceIds: selectedIds, collect, normalize, dedup });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "run_failed" });
    }
  });

  router.post("/import/xlsx", admin, async (req: Request, res: Response) => {
    const filePath = typeof req.body?.filePath === "string" ? req.body.filePath.trim() : "";
    if (!filePath) {
      res.status(400).json({ error: "filePath required" });
      return;
    }
    try {
      const result = await runXlsxSourceImport(prisma, {
        filePath,
        startedBy: req.adminUserId ?? null,
        dryRun: req.body?.dryRun === true,
      });
      res.json(result);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "import_failed" });
    }
  });

  router.post("/import", admin, async (req: Request, res: Response) => {
    const filePath = typeof req.body?.filePath === "string" ? req.body.filePath.trim() : "";
    if (!filePath) {
      res.status(400).json({ error: "filePath required" });
      return;
    }
    try {
      const result = await runSourceImportFile(prisma, {
        filePath,
        startedBy: req.adminUserId ?? null,
        dryRun: req.body?.dryRun === true,
      });
      res.json(result);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "import_failed" });
    }
  });

  router.get("/import/sessions", admin, async (_req: Request, res: Response) => {
    const list = await prisma.sourceImportSession.findMany({
      include: {
        rows: {
          take: 20,
          orderBy: { createdAt: "desc" },
        },
      },
      orderBy: { startedAt: "desc" },
      take: 30,
    });
    res.json(list);
  });

  router.post("/detect-type", admin, async (req: Request, res: Response) => {
    const value = typeof req.body?.urlOrHandle === "string" ? req.body.urlOrHandle : "";
    if (!value) {
      res.status(400).json({ error: "urlOrHandle required" });
      return;
    }
    const type = detectSourceType(value);
    const normalized = normalizeSourceUrlOrHandle(type, value);
    res.json({ type, normalized });
  });

  return router;
}
