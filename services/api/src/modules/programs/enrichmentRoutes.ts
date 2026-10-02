/**
 * Admin API OSINT-дополнений карточки. Создание — только черновик; публикация — только через approve владельцем.
 */
import type { Request, RequestHandler, Response, Router } from "express";
import type { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { writeAuditLog } from "../../lib/audit";
import { validateEnrichmentInput } from "./enrichment";

const REJECTION_REASON_MAX = 1000;
const CHECKED_AT_FUTURE_TOLERANCE_MS = 24 * 60 * 60 * 1000;

export function parseCheckedAt(value: unknown, now: Date = new Date()): Date | null {
  if (typeof value !== "string" && !(value instanceof Date)) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  if (date.getTime() > now.getTime() + CHECKED_AT_FUTURE_TOLERANCE_MS) return null;
  return date;
}

export function registerEnrichmentRoutes(router: Router, admin: RequestHandler): void {
  router.get("/:id/enrichments", admin, async (req: Request, res: Response) => {
    const program = await prisma.program.findUnique({ where: { id: req.params.id }, select: { id: true } });
    if (!program) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const rows = await prisma.programEnrichment.findMany({
      where: { programId: program.id },
      orderBy: [{ field: "asc" }, { createdAt: "desc" }],
    });
    res.json(rows);
  });

  router.post("/:id/enrichments", admin, async (req: Request, res: Response) => {
    const program = await prisma.program.findUnique({ where: { id: req.params.id }, select: { id: true } });
    if (!program) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const body = (req.body ?? {}) as Record<string, unknown>;
    const validation = validateEnrichmentInput(body.field, body.content, body.sources);
    if (!validation.ok) {
      res.status(400).json({ error: "invalid_enrichment", details: validation.errors });
      return;
    }
    const checkedAt = parseCheckedAt(body.checkedAt);
    if (!checkedAt) {
      res.status(400).json({ error: "invalid_enrichment", details: ["checkedAt: нужна дата проверки не в будущем"] });
      return;
    }
    const batchId = typeof body.batchId === "string" && body.batchId.trim() ? body.batchId.trim().slice(0, 120) : null;
    const row = await prisma.programEnrichment.create({
      data: {
        programId: program.id,
        field: validation.field,
        status: "draft",
        contentJson: validation.content as unknown as Prisma.InputJsonValue,
        sourcesJson: validation.sources as unknown as Prisma.InputJsonValue,
        batchId,
        createdBy: `admin:${req.adminUserId ?? "unknown"}`,
        checkedAt,
      },
    });
    await writeAuditLog({
      entityType: "program_enrichment",
      entityId: row.id,
      changedField: "created",
      oldValue: null,
      newValue: `${program.id}:${row.field}:draft`,
      changedBy: req.adminUserId ?? null,
    });
    res.status(201).json(row);
  });

  router.post("/enrichments/:eid/approve", admin, async (req: Request, res: Response) => {
    const reviewer = req.adminUserId ?? "admin";
    const outcome = await prisma.$transaction(async (tx) => {
      const row = await tx.programEnrichment.findUnique({ where: { id: req.params.eid } });
      if (!row) return { error: "not_found" as const };
      if (row.status !== "draft") return { error: "invalid_status" as const, status: row.status };
      const validation = validateEnrichmentInput(row.field, row.contentJson, row.sourcesJson);
      if (!validation.ok) return { error: "invalid_enrichment" as const, details: validation.errors };
      const retired = await tx.programEnrichment.updateMany({
        where: { programId: row.programId, field: row.field, status: "approved", id: { not: row.id } },
        data: { status: "retired" },
      });
      const approved = await tx.programEnrichment.update({
        where: { id: row.id },
        data: { status: "approved", reviewedByUserId: reviewer, reviewedAt: new Date(), rejectionReason: null },
      });
      return { row: approved, retiredCount: retired.count };
    });
    if ("error" in outcome) {
      if (outcome.error === "not_found") res.status(404).json({ error: "Not found" });
      else if (outcome.error === "invalid_status") res.status(409).json({ error: "invalid_status", status: outcome.status });
      else res.status(400).json({ error: "invalid_enrichment", details: outcome.details });
      return;
    }
    await writeAuditLog({
      entityType: "program_enrichment",
      entityId: outcome.row.id,
      changedField: "status",
      oldValue: "draft",
      newValue: "approved",
      changedBy: req.adminUserId ?? null,
      reason: `${outcome.row.programId}:${outcome.row.field}; retired=${outcome.retiredCount}`,
    });
    res.json({ ...outcome.row, retiredCount: outcome.retiredCount });
  });

  router.post("/enrichments/:eid/reject", admin, async (req: Request, res: Response) => {
    const reason = String((req.body as { reason?: unknown } | undefined)?.reason ?? "").trim();
    if (!reason) {
      res.status(400).json({ error: "reason required" });
      return;
    }
    const row = await prisma.programEnrichment.findUnique({ where: { id: req.params.eid } });
    if (!row) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    if (row.status !== "draft" && row.status !== "approved") {
      res.status(409).json({ error: "invalid_status", status: row.status });
      return;
    }
    const updated = await prisma.programEnrichment.update({
      where: { id: row.id },
      data: {
        status: "rejected",
        reviewedByUserId: req.adminUserId ?? "admin",
        reviewedAt: new Date(),
        rejectionReason: reason.slice(0, REJECTION_REASON_MAX),
      },
    });
    await writeAuditLog({
      entityType: "program_enrichment",
      entityId: row.id,
      changedField: "status",
      oldValue: row.status,
      newValue: "rejected",
      changedBy: req.adminUserId ?? null,
      reason: reason.slice(0, REJECTION_REASON_MAX),
    });
    res.json(updated);
  });
}
