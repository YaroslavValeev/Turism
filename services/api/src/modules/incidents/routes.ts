/**
 * Incidents: admin-only CRUD, status transitions, audit on status change.
 * Source: db_schema_draft, canonical_status_models (incident_status).
 */
import { Router, Request, Response } from "express";
import { prisma } from "../../lib/prisma";
import { writeAuditLog } from "../../lib/audit";
import { requireAdmin } from "../../middleware/auth";
import { isIncidentStatus } from "@mywave/shared-types";
import type { Env } from "@mywave/config";

export function incidentsRoutes(env: Env): Router {
  const router = Router();
  const admin = requireAdmin(env);

  router.get("/", admin, async (req: Request, res: Response) => {
    const status = req.query.incident_status as string | undefined;
    const where = status && isIncidentStatus(status) ? { incidentStatus: status } : {};
    const list = await prisma.incident.findMany({
      where,
      include: {
        booking: { select: { id: true, guestContact: true, bookingStatus: true } },
        organizer: { select: { id: true, displayName: true } },
        program: { select: { id: true, title: true } },
        governanceAlert: { select: { id: true, alertType: true, title: true, fingerprint: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    res.json(list);
  });

  router.get("/:id", admin, async (req: Request, res: Response) => {
    const inc = await prisma.incident.findUnique({
      where: { id: req.params.id },
      include: {
        booking: true,
        organizer: { select: { id: true, displayName: true, contactEmail: true } },
        program: { select: { id: true, title: true } },
        governanceAlert: { select: { id: true, alertType: true, title: true, fingerprint: true, severity: true, status: true } },
      },
    });
    if (!inc) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json(inc);
  });

  router.post("/", admin, async (req: Request, res: Response) => {
    const body = req.body as {
      bookingId?: string;
      organizerId: string;
      programId?: string;
      type: string;
      severity: string;
      summary: string;
      incidentStatus?: string;
      governanceAlertId?: string | null;
      slaDueAt?: string | null;
    };
    if (!body.organizerId || !body.type || !body.severity || !body.summary) {
      res.status(400).json({ error: "organizerId, type, severity, summary required" });
      return;
    }
    let governanceAlertId: string | null = null;
    if (body.governanceAlertId != null && String(body.governanceAlertId).trim() !== "") {
      const ga = await prisma.governanceAlert.findUnique({
        where: { id: String(body.governanceAlertId).trim() },
        select: { id: true },
      });
      if (!ga) {
        res.status(400).json({ error: "governance_alert_not_found" });
        return;
      }
      governanceAlertId = ga.id;
    }
    let slaDueAt: Date | null = null;
    if (body.slaDueAt != null && String(body.slaDueAt).trim() !== "") {
      const d = new Date(String(body.slaDueAt));
      if (Number.isNaN(d.getTime())) {
        res.status(400).json({ error: "invalid_sla_due_at" });
        return;
      }
      slaDueAt = d;
    }
    const status = body.incidentStatus && isIncidentStatus(body.incidentStatus) ? body.incidentStatus : "open";
    const inc = await prisma.incident.create({
      data: {
        bookingId: body.bookingId ?? null,
        organizerId: body.organizerId,
        programId: body.programId ?? null,
        type: body.type,
        severity: body.severity,
        summary: body.summary,
        incidentStatus: status,
        governanceAlertId,
        slaDueAt,
      },
      include: {
        organizer: { select: { displayName: true } },
        program: { select: { title: true } },
        booking: { select: { id: true } },
        governanceAlert: { select: { id: true, alertType: true, title: true, fingerprint: true } },
      },
    });
    await writeAuditLog({
      entityType: "incident",
      entityId: inc.id,
      changedField: "incident_created",
      oldValue: null,
      newValue: status,
      changedBy: req.adminUserId ?? null,
      reason: "incident created",
    });
    res.status(201).json(inc);
  });

  router.patch("/:id/status", admin, async (req: Request, res: Response) => {
    const existing = await prisma.incident.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const { incidentStatus } = req.body as { incidentStatus?: string };
    if (!incidentStatus || !isIncidentStatus(incidentStatus)) {
      res.status(400).json({
        error: "valid incidentStatus required",
        allowed: "open,triaged,investigating,waiting_on_organizer,waiting_on_user,resolved,escalated,closed",
      });
      return;
    }
    const inc = await prisma.incident.update({
      where: { id: req.params.id },
      data: { incidentStatus },
      include: { organizer: { select: { displayName: true } }, program: { select: { title: true } }, booking: { select: { id: true } } },
    });
    await writeAuditLog({
      entityType: "incident",
      entityId: inc.id,
      changedField: "incident_status_change",
      oldValue: existing.incidentStatus,
      newValue: inc.incidentStatus,
      changedBy: req.adminUserId ?? null,
      reason: "status update",
    });
    res.json(inc);
  });

  return router;
}
